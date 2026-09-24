import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useProjectManagement } from "../context/ProjectContext";
import { dataRepository } from "../api";
import CreatePostView from "./CreatePostView";
import PostDetailView from "./PostDetailView";
import { BOARD_CATEGORIES } from "../lib/boardData";
import { useAccountBackground } from "../lib/useAccountBackground";
import type { BoardCategory, BoardPost, NewBoardPostInput } from "../api/types";

const POSTS_PER_PAGE = 10;
type SearchTarget = "title_content" | "title" | "content" | "author";

interface HoveredImagePreview {
  postId: number;
  url: string;
  title: string;
  imageCount: number;
  isBlurred?: boolean;
  x: number;
  y: number;
}

function isImageAttachment(a: { kind: string; mimeType?: string; name?: string; url?: string }): boolean {
  if (a.kind === "image") return true;
  if (a.mimeType?.startsWith("image/")) return true;
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(a.name || a.url || "")) return true;
  return false;
}

function getPostImages(post: BoardPost): string[] {
  const images: string[] = [];
  if (post.attachments) {
    for (const a of post.attachments) {
      if (isImageAttachment(a) && a.url && !images.includes(a.url)) {
        images.push(a.url);
      }
    }
  }
  if (post.content) {
    const htmlMatches = Array.from(post.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi));
    for (const m of htmlMatches) {
      if (m[1] && !images.includes(m[1])) {
        images.push(m[1]);
      }
    }
    const mdMatches = Array.from(post.content.matchAll(/!\[.*?\]\((https?:\/\/[^\s\)]+|\/[^\s\)]+|data:image\/[^\s\)]+)\)/gi));
    for (const m of mdMatches) {
      if (m[1] && !images.includes(m[1])) {
        images.push(m[1]);
      }
    }
  }
  return images;
}

function errorMessage(error: unknown): string {
  // Supabase's PostgrestError (RLS violations, check-constraint failures…) is
  // a plain object, not an Error instance — read .message off it directly or
  // the real reason gets swallowed into this generic fallback.
  if (error instanceof Error) return error.message;
  const message = (error as { message?: string } | null)?.message;
  return message || "요청을 처리하지 못했습니다.";
}

export default function BoardView() {
  const { user } = useAuth();
  const { isAdmin, isOperator } = useProjectManagement();
  const { lineSafeStyle } = useAccountBackground();

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<"all" | BoardCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<SearchTarget>("title_content");
  const [currentPage, setCurrentPage] = useState(1);

  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null);
  const [selectedPost, setSelectedPost] = useState<BoardPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [hoveredPreview, setHoveredPreview] = useState<HoveredImagePreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dataRepository
      .listBoardPosts()
      .then((list) => { if (!cancelled) { setPosts(list); setError(null); } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setHoveredPreview(null);
  }, [selectedCategory, searchQuery, searchTarget]);

  useEffect(() => {
    const handleScroll = () => setHoveredPreview(null);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleCreatePost(input: NewBoardPostInput) {
    setBusy(true);
    setError(null);
    try {
      const created = await dataRepository.createBoardPost(input);
      setPosts((prev) => [created, ...prev]);
      setIsCreatingPost(false);
      setCurrentPage(1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePost(postId: number, patch: Partial<NewBoardPostInput>) {
    setBusy(true);
    setError(null);
    try {
      // 투표는 게시글 수정으로 바꿀 수 없다(작성 시에만 만든다).
      const { poll: _poll, ...postPatch } = patch;
      await dataRepository.updateBoardPost(postId, postPatch);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...postPatch } : p)));
      setSelectedPost((prev) => (prev && prev.id === postId ? { ...prev, ...postPatch } : prev));
      setEditingPost(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openPostDetail(post: BoardPost) {
    setHoveredPreview(null);
    setIsCreatingPost(false);
    setEditingPost(null);
    setSelectedPost({ ...post, views: post.views + 1 });
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, views: p.views + 1 } : p)));
    void dataRepository.incrementBoardPostViews(post.id).catch(() => {});
    try {
      const comments = await dataRepository.getBoardPostComments(post.id);
      setSelectedPost((prev) => (prev && prev.id === post.id ? { ...prev, comments } : prev));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function refreshComments(postId: number) {
    const comments = await dataRepository.getBoardPostComments(postId);
    setSelectedPost((prev) => (prev && prev.id === postId ? { ...prev, comments } : prev));
    const commentsCount = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentsCount } : p)));
  }

  async function handleAddComment(postId: number, content: string) {
    setError(null);
    try {
      await dataRepository.addBoardComment(postId, content);
      await refreshComments(postId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleAddReply(postId: number, commentId: number, content: string, targetAuthor?: string) {
    const formatted = targetAuthor && !content.startsWith("@") ? `@${targetAuthor} ${content}` : content;
    setError(null);
    try {
      await dataRepository.addBoardComment(postId, formatted, commentId);
      await refreshComments(postId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleDeleteComment(postId: number, commentId: number) {
    setError(null);
    try {
      await dataRepository.deleteBoardComment(commentId);
      await refreshComments(postId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleToggleLike(postId: number) {
    const target = posts.find((p) => p.id === postId) ?? selectedPost;
    if (!target) return;
    const nextLiked = !target.likedByMe;
    const apply = (p: BoardPost) => ({ ...p, likedByMe: nextLiked, likes: nextLiked ? p.likes + 1 : Math.max(0, p.likes - 1) });
    setPosts((prev) => prev.map((p) => (p.id === postId ? apply(p) : p)));
    setSelectedPost((prev) => (prev && prev.id === postId ? apply(prev) : prev));
    try {
      await dataRepository.setBoardPostLike(postId, nextLiked);
    } catch (e) {
      const revert = (p: BoardPost) => ({ ...p, likedByMe: !nextLiked, likes: nextLiked ? Math.max(0, p.likes - 1) : p.likes + 1 });
      setPosts((prev) => prev.map((p) => (p.id === postId ? revert(p) : p)));
      setSelectedPost((prev) => (prev && prev.id === postId ? revert(prev) : prev));
      setError(errorMessage(e));
    }
  }

  async function handleDeletePost(postId: number) {
    setBusy(true);
    setError(null);
    try {
      await dataRepository.deleteBoardPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setSelectedPost(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleVotePoll(pollId: number, optionIds: number[]) {
    try {
      const updatedPoll = await dataRepository.castBoardPollVote(pollId, optionIds);
      setPosts((prev) => prev.map((p) => (p.poll?.id === pollId ? { ...p, poll: updatedPoll } : p)));
      setSelectedPost((prev) => (prev && prev.poll?.id === pollId ? { ...prev, poll: updatedPoll } : prev));
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  }

  async function handleClosePoll(pollId: number) {
    try {
      await dataRepository.closeBoardPoll(pollId);
      setPosts((prev) =>
        prev.map((p) => (p.poll?.id === pollId && p.poll ? { ...p, poll: { ...p.poll, closed: true } } : p))
      );
      setSelectedPost((prev) =>
        prev && prev.poll?.id === pollId && prev.poll ? { ...prev, poll: { ...prev.poll, closed: true } } : prev
      );
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  }

  const categoryPosts = selectedCategory === "all" ? posts : posts.filter((p) => p.category === selectedCategory);

  const filteredPosts = categoryPosts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    switch (searchTarget) {
      case "title":
        return p.title.toLowerCase().includes(q);
      case "content":
        return p.content.toLowerCase().includes(q);
      case "author":
        return p.author.toLowerCase().includes(q);
      default:
        return p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q);
    }
  });

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE) || 1;
  const paginatedPosts = filteredPosts.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE);

  if (editingPost) {
    return (
      <CreatePostView
        initialPost={editingPost}
        defaultCategory={editingPost.category}
        busy={busy}
        onCancel={() => setEditingPost(null)}
        onCreate={handleCreatePost}
        onUpdate={handleUpdatePost}
      />
    );
  }

  if (isCreatingPost) {
    return (
      <CreatePostView
        defaultCategory={selectedCategory === "all" ? "free" : selectedCategory}
        busy={busy}
        onCancel={() => setIsCreatingPost(false)}
        onCreate={handleCreatePost}
      />
    );
  }

  if (selectedPost) {
    return (
      <PostDetailView
        post={selectedPost}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
        isOperator={isOperator}
        busy={busy}
        error={error}
        onBack={() => setSelectedPost(null)}
        onEditPost={(post) => setEditingPost(post)}
        onAddComment={handleAddComment}
        onAddReply={handleAddReply}
        onDeleteComment={handleDeleteComment}
        onToggleLike={handleToggleLike}
        onDeletePost={handleDeletePost}
        onVotePoll={handleVotePoll}
        onClosePoll={handleClosePoll}
        onReported={(postId) => {
          setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reportedByMe: true } : p)));
          setSelectedPost((prev) => (prev && prev.id === postId ? { ...prev, reportedByMe: true } : prev));
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-800 flex items-center gap-2">
            <span>💬</span> 게시판
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            공지사항 확인, 소통 및 팀원을 모집할 수 있는 공간입니다.
          </p>
        </div>
        <button
          onClick={() => { setIsCreatingPost(true); setSelectedPost(null); setEditingPost(null); }}
          className="text-xs font-700 px-4 py-2.5 transition-all flex items-center gap-1.5 shrink-0"
          style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px", boxShadow: "0 4px 12px rgba(37,99,235,0.25)" }}
        >
          <span>✏️</span>
          <span>글쓰기</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 text-xs rounded-xl" style={{ background: "#ef444418", color: "#ef4444" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory("all")}
          className="px-4 py-2 text-xs font-700 shrink-0 transition-all"
          style={{
            background: selectedCategory === "all" ? "var(--primary)" : "var(--card)",
            color: selectedCategory === "all" ? "#fff" : "var(--foreground)",
            borderRadius: "20px",
            boxShadow: selectedCategory === "all" ? "0 4px 12px rgba(37,99,235,0.2)" : "var(--shadow-card)",
          }}
        >
          전체 ({posts.length})
        </button>
        {BOARD_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          const count = posts.filter((p) => p.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className="px-4 py-2 text-xs font-700 shrink-0 transition-all flex items-center gap-1.5"
              style={{
                background: active ? cat.badgeColor : "var(--card)",
                color: active ? "#fff" : "var(--foreground)",
                borderRadius: "20px",
                boxShadow: active ? `0 4px 12px ${cat.badgeColor}40` : "var(--shadow-card)",
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              <span
                className="text-[10px] px-1.5 py-0.2 font-700 rounded-full"
                style={{ background: active ? "rgba(255,255,255,0.25)" : "var(--muted)", color: active ? "#fff" : "var(--muted-foreground)" }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 mb-4" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <select
            value={searchTarget}
            onChange={(e) => setSearchTarget(e.target.value as SearchTarget)}
            className="text-xs font-700 px-3 py-2 outline-none cursor-pointer border shrink-0"
            style={{ background: "var(--muted)", color: "var(--foreground)", borderColor: "var(--border)", borderRadius: "8px" }}
          >
            <option value="title_content">제목+내용</option>
            <option value="title">제목</option>
            <option value="content">내용</option>
            <option value="author">글쓴이</option>
          </select>
          <div className="flex-1 flex items-center gap-2 px-3 py-2 border min-w-0" style={{ background: "var(--background)", borderColor: "var(--border)", borderRadius: "8px" }}>
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어를 입력하세요..."
              className="flex-1 bg-transparent text-xs outline-none min-w-0"
              style={{ color: "var(--foreground)" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-xs px-2 py-0.5" style={{ color: "var(--muted-foreground)" }}>
                초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p role="status" className="p-12 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>게시글을 불러오는 중…</p>
      ) : paginatedPosts.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}>
          등록된 게시글이 없습니다. 첫 번째 글을 작성해 보세요!
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedPosts.map((post) => {
            const catInfo = BOARD_CATEGORIES.find((c) => c.id === post.category);
            const postImages = getPostImages(post);
            const isPreviewDisabled = Boolean(post.hideImagePreview);
            const firstImageUrl = postImages[0] ?? null;
            const imageCount = postImages.length;
            const fileCount = post.attachments.filter((a) => !isImageAttachment(a)).length;
            return (
              <button
                key={post.id}
                onClick={() => {
                  setHoveredPreview(null);
                  void openPostDetail(post);
                }}
                onMouseEnter={(e) => {
                  if (firstImageUrl) {
                    setHoveredPreview({
                      postId: post.id,
                      url: firstImageUrl,
                      title: post.title,
                      imageCount,
                      isBlurred: isPreviewDisabled,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }
                }}
                onMouseMove={(e) => {
                  if (firstImageUrl) {
                    setHoveredPreview((prev) =>
                      prev && prev.postId === post.id
                        ? { ...prev, x: e.clientX, y: e.clientY }
                        : {
                            postId: post.id,
                            url: firstImageUrl,
                            title: post.title,
                            imageCount,
                            isBlurred: isPreviewDisabled,
                            x: e.clientX,
                            y: e.clientY,
                          }
                    );
                  }
                }}
                onMouseLeave={() => {
                  setHoveredPreview((prev) => (prev?.postId === post.id ? null : prev));
                }}
                className="w-full text-left px-4 py-3 transition-all hover:translate-y-[-1px] flex items-center justify-between gap-3 cursor-pointer"
                style={{
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  boxShadow: "var(--shadow-card)",
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  backgroundClip: "padding-box",
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {post.pinned && (
                    <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "6px" }}>
                      📌 필독
                    </span>
                  )}
                  {catInfo && (
                    <span className="text-[11px] font-700 px-2 py-0.5 shrink-0" style={{ background: catInfo.badgeBg, color: catInfo.badgeColor, borderRadius: "10px" }}>
                      {catInfo.icon} {catInfo.name}
                    </span>
                  )}
                  <span className="text-sm font-700 truncate hover:text-blue-500 transition-colors">{post.title}</span>
                  {post.poll && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 shrink-0 rounded flex items-center gap-1"
                      style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}
                      title="투표 진행/마감"
                    >
                      <span>📊</span>
                      <span>투표</span>
                    </span>
                  )}
                  {(imageCount > 0 || fileCount > 0) && (
                    <span
                      className="text-[10px] shrink-0 font-600 flex items-center gap-1.5"
                      style={{ color: "var(--muted-foreground)" }}
                      title="마우스를 올리면 첫 이미지를 미리 볼 수 있습니다"
                    >
                      {imageCount > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded font-700 flex items-center transition-all"
                          style={{
                            background: "rgba(59, 130, 246, 0.12)",
                            color: "#3b82f6",
                          }}
                          title="이미지 첨부됨 (마우스를 올리면 미리보기)"
                        >
                          <span>📷</span>
                        </span>
                      )}
                      {fileCount > 0 && <span>📎 {fileCount}</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-600 hidden sm:inline-block w-20 truncate text-right" style={{ color: "var(--foreground)" }}>
                    {post.author}
                  </span>
                  <span className="text-[11px] hidden md:inline-block w-28 text-center shrink-0 tabular-nums">
                    {new Date(post.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="flex items-center gap-3 pl-2.5 border-l" style={{ borderColor: "var(--border)" }}>
                    <span title="조회수" className="inline-flex items-center justify-between w-12 tabular-nums">
                      <span className="w-4 text-center shrink-0">👁️</span>
                      <span className="text-right font-600 flex-1">{post.views}</span>
                    </span>
                    <span title="좋아요" className="inline-flex items-center justify-between w-11 tabular-nums">
                      <span className="w-4 text-center shrink-0">❤️</span>
                      <span className="text-right font-600 flex-1">{post.likes}</span>
                    </span>
                    <span title="댓글수" className="inline-flex items-center justify-between w-11 tabular-nums">
                      <span className="w-4 text-center shrink-0">💬</span>
                      <span className="text-right font-600 flex-1">{post.commentsCount}</span>
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-6 mt-4 border-t flex-wrap gap-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            총 {filteredPosts.length}개 중 {(currentPage - 1) * POSTS_PER_PAGE + 1} - {Math.min(currentPage * POSTS_PER_PAGE, filteredPosts.length)}개 표시 (페이지 {currentPage} / {totalPages})
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-700 transition-all disabled:opacity-40"
              style={{ background: "var(--card)", borderRadius: "8px", boxShadow: "var(--shadow-card)" }}
            >
              ← 이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className="w-8 h-8 text-xs font-700 transition-all"
                style={{
                  background: page === currentPage ? "var(--primary)" : "var(--card)",
                  color: page === currentPage ? "#fff" : "var(--foreground)",
                  borderRadius: "8px",
                  boxShadow: page === currentPage ? "0 4px 12px rgba(37,99,235,0.25)" : "var(--shadow-card)",
                }}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-700 transition-all disabled:opacity-40"
              style={{ background: "var(--card)", borderRadius: "8px", boxShadow: "var(--shadow-card)" }}
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {hoveredPreview && (() => {
        const PREVIEW_WIDTH = 280;
        const PREVIEW_HEIGHT = 220;
        let previewLeft = hoveredPreview.x + 18;
        let previewTop = hoveredPreview.y - 60;

        if (typeof window !== "undefined") {
          if (previewLeft + PREVIEW_WIDTH > window.innerWidth - 16) {
            previewLeft = Math.max(16, hoveredPreview.x - PREVIEW_WIDTH - 18);
          }
          if (previewTop < 16) {
            previewTop = 16;
          } else if (previewTop + PREVIEW_HEIGHT > window.innerHeight - 16) {
            previewTop = Math.max(16, window.innerHeight - PREVIEW_HEIGHT - 16);
          }
        }

        return (
          <div
            className="fixed z-50 pointer-events-none transition-transform duration-75 ease-out select-none"
            style={{
              left: `${previewLeft}px`,
              top: `${previewTop}px`,
              width: `${PREVIEW_WIDTH}px`,
            }}
          >
            <div
              className="overflow-hidden border backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
                borderRadius: "14px",
                boxShadow: "0 16px 36px -4px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08)",
              }}
            >
              <div className="relative bg-black/10 dark:bg-black/30 flex items-center justify-center min-h-[140px] max-h-[190px] overflow-hidden">
                <img
                  src={hoveredPreview.url}
                  alt={hoveredPreview.title}
                  className={`w-full h-full object-cover max-h-[190px] transition-all duration-200 ${
                    hoveredPreview.isBlurred ? "filter blur-xl brightness-75 scale-110" : ""
                  }`}
                  loading="eager"
                />
                {hoveredPreview.isBlurred && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-black/40 backdrop-blur-[1px]">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-lg mb-1.5 shadow-lg border border-white/20">
                      🔒
                    </div>
                    <span className="text-xs font-bold text-white drop-shadow-md">
                      미리보기 방지 적용됨
                    </span>
                    <span className="text-[10px] text-white/80 mt-0.5 drop-shadow">
                      클릭하여 게시글에서 원본 확인
                    </span>
                  </div>
                )}
              </div>
              <div
                className="px-3 py-2 border-t flex items-center justify-between gap-2"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs">🖼️</span>
                  <span className="text-[11px] font-700 truncate" style={{ color: "var(--foreground)" }}>
                    {hoveredPreview.title}
                  </span>
                </div>
                <span
                  className="text-[10px] font-700 shrink-0 px-1.5 py-0.5 rounded"
                  style={{
                    background: hoveredPreview.isBlurred ? "rgba(239, 68, 68, 0.12)" : "rgba(59, 130, 246, 0.12)",
                    color: hoveredPreview.isBlurred ? "#ef4444" : "#3b82f6",
                  }}
                >
                  {hoveredPreview.isBlurred ? "블러 미리보기" : "이미지 미리보기"}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
