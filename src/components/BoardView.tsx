import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useProjectManagement } from "../context/ProjectContext";
import { dataRepository } from "../api";
import CreatePostView from "./CreatePostView";
import PostDetailView from "./PostDetailView";
import { BOARD_CATEGORIES } from "../lib/boardData";
import { useAccountBackground } from "../lib/useAccountBackground";
import WindowPanel from "./WindowPanel";
import type { BoardCategory, BoardPost, NewBoardPostInput } from "../api/types";
import { previewOpensAbove } from "../lib/boardPreview";

const POSTS_PER_PAGE = 10;
// 카테고리 칩 톤(팔레트 기준으로 낮춘 색): 공지 = 빨강, 자유 = 파랑, 모집 = 초록.
const CATEGORY_TONE: Record<BoardCategory, { bg: string; color: string }> = {
  notice: { bg: "rgba(201,98,91,.12)", color: "#8f3a35" },
  free: { bg: "rgba(74,116,181,.12)", color: "#2f4e80" },
  recruit: { bg: "rgba(91,154,116,.14)", color: "#2f6b4a" },
};
type SearchTarget = "title_content" | "title" | "content" | "author" | "tag";

interface HoveredImagePreview {
  postId: number;
  url: string;
  title: string;
  imageCount: number;
  isBlurred?: boolean;
  above: boolean;
  left: number;
  rowTop: number;
  rowBottom: number;
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

export interface BoardViewProps {
  initialCategory?: "all" | BoardCategory;
  initialCreating?: boolean;
  initialPostTitle?: string;
  initialPostContent?: string;
  onResetInitialState?: () => void;
}

export default function BoardView({
  initialCategory,
  initialCreating = false,
  initialPostTitle,
  initialPostContent,
  onResetInitialState,
}: BoardViewProps = {}) {
  const { user } = useAuth();
  const { isAdmin, isOperator } = useProjectManagement();
  const { lineSafeStyle } = useAccountBackground();

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<"all" | BoardCategory>(
    initialCategory || "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<SearchTarget>("title_content");
  const [currentPage, setCurrentPage] = useState(1);
  // 태그를 누르면 그 태그가 달린 글만(대소문자 무시). null = 전체.
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [isCreatingPost, setIsCreatingPost] = useState(initialCreating);
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null);
  const [selectedPost, setSelectedPost] = useState<BoardPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [hoveredPreview, setHoveredPreview] = useState<HoveredImagePreview | null>(null);

  useEffect(() => {
    if (initialCategory) setSelectedCategory(initialCategory);
    if (initialCreating) setIsCreatingPost(true);
  }, [initialCategory, initialCreating]);

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
  }, [selectedCategory, searchQuery, searchTarget, activeTag]);

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

  async function handleTogglePinned(post: BoardPost) {
    try {
      await dataRepository.setBoardPostPinned(post.id, !post.pinned);
      const pinned = !post.pinned;
      // 목록은 서버처럼 필독이 위로 오게 다시 정렬한다.
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, pinned } : p)).sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.createdAt.localeCompare(x.createdAt)));
      setSelectedPost((prev) => (prev && prev.id === post.id ? { ...prev, pinned } : prev));
    } catch (e) {
      setError(errorMessage(e));
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

  const categoryPosts = (selectedCategory === "all" ? posts : posts.filter((p) => p.category === selectedCategory))
    .filter((p) => !activeTag || p.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase()));

  function showTag(tag: string) {
    setActiveTag(tag);
    setSelectedPost(null);
  }

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
      case "tag":
        return p.tags.some((t) => t.toLowerCase().includes(q.replace(/^#/, "")));
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
        initialTitle={initialPostTitle}
        initialContent={initialPostContent}
        busy={busy}
        onCancel={() => {
          setIsCreatingPost(false);
          onResetInitialState?.();
        }}
        onCreate={async (post) => {
          await handleCreatePost(post);
          onResetInitialState?.();
        }}
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
        onTagClick={showTag}
        onEditPost={(post) => setEditingPost(post)}
        onAddComment={handleAddComment}
        onAddReply={handleAddReply}
        onDeleteComment={handleDeleteComment}
        onToggleLike={handleToggleLike}
        onDeletePost={handleDeletePost}
        onTogglePinned={handleTogglePinned}
        onVotePoll={handleVotePoll}
        onClosePoll={handleClosePoll}
        onReported={(postId) => {
          setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reportedByMe: true } : p)));
          setSelectedPost((prev) => (prev && prev.id === postId ? { ...prev, reportedByMe: true } : prev));
        }}
      />
    );
  }

  const pinnedPosts = posts.filter((p) => p.pinned).slice(0, 3);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const hotPosts = posts
    .filter((p) => new Date(p.createdAt).getTime() >= weekAgo && p.likes * 2 + p.commentsCount > 0)
    .sort((x, y) => (y.likes * 2 + y.commentsCount) - (x.likes * 2 + x.commentsCount))
    .slice(0, 3);
  const tagCounts = new Map<string, number>();
  for (const p of posts) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const popularTags = [...tagCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([t]) => t);
  const cardStyle = { background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" } as const;
  const tagChip = { background: "rgba(74,116,181,.12)", color: "#2f4e80", borderRadius: "10px" } as const;
  const chipOff = { background: "rgba(15,18,53,.05)", color: "var(--foreground)" } as const;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-800 flex items-center gap-2"><span>💬</span> 게시판</h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            공지사항 확인, 소통 및 팀원을 모집할 수 있는 공간입니다.
          </p>
        </div>
        <button
          onClick={() => { setIsCreatingPost(true); setSelectedPost(null); setEditingPost(null); }}
          className="text-xs font-700 px-4 py-2.5 transition-all flex items-center gap-1.5 shrink-0"
          style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px", boxShadow: "0 4px 12px var(--primary-glow)" }}
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <WindowPanel id="board-posts" title="게시글" style={cardStyle} bodyClassName="p-4">
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
          {[{ id: "all" as const, name: "전체", icon: "", count: posts.length },
            ...BOARD_CATEGORIES.map((cat) => ({ id: cat.id, name: cat.name, icon: cat.icon, count: posts.filter((p) => p.category === cat.id).length }))].map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="px-3.5 py-1.5 text-xs font-700 shrink-0 transition-all"
                style={{ ...(active ? { background: "var(--primary)", color: "#fff" } : chipOff), borderRadius: "20px" }}
              >
                {cat.icon && <span>{cat.icon} </span>}{cat.name} {cat.count}
              </button>
            );
          })}
        </div>

        <div className="mb-3">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={searchTarget}
              onChange={(e) => setSearchTarget(e.target.value as SearchTarget)}
              className="text-xs font-700 px-3 py-2 outline-none cursor-pointer shrink-0"
              style={{ ...chipOff, borderRadius: "20px" }}
            >
              <option value="title_content">제목+내용</option>
              <option value="title">제목</option>
              <option value="content">내용</option>
              <option value="author">글쓴이</option>
              <option value="tag">태그</option>
            </select>
            <div className="flex-1 flex items-center gap-2 px-3.5 py-2 border min-w-0" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "20px" }}>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색어를 입력하세요..."
                aria-label="게시글 검색"
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
          {activeTag && (
            <div className="flex items-center gap-2 mt-3 text-xs">
              <span style={{ color: "var(--muted-foreground)" }}>태그</span>
              <span className="font-700 px-2 py-0.5" style={tagChip}>#{activeTag}</span>
              <span style={{ color: "var(--muted-foreground)" }}>글만 보는 중</span>
              <button onClick={() => setActiveTag(null)} className="ml-auto px-2 py-0.5" style={{ color: "var(--muted-foreground)" }}>전체 보기 ✕</button>
            </div>
          )}
        </div>

        {loading ? (
          <p role="status" className="p-12 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>게시글을 불러오는 중…</p>
        ) : paginatedPosts.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}>
            등록된 게시글이 없습니다. 첫 번째 글을 작성해 보세요!
          </div>
        ) : (
          <div className="border overflow-hidden" style={{ borderColor: "var(--border)", borderRadius: "12px", background: "var(--card)" }}>
            {paginatedPosts.map((post, idx) => {
              const catInfo = BOARD_CATEGORIES.find((c) => c.id === post.category);
              const tone = CATEGORY_TONE[post.category];
              const postImages = getPostImages(post);
              const isPreviewDisabled = Boolean(post.hideImagePreview);
              const firstImageUrl = postImages[0] ?? null;
              const imageCount = postImages.length;
              const fileCount = post.attachments.filter((a) => !isImageAttachment(a)).length;
              const previewOf = (e: React.MouseEvent) => {
                const row = e.currentTarget.getBoundingClientRect();
                return { postId: post.id, url: firstImageUrl as string, title: post.title, imageCount, isBlurred: isPreviewDisabled, above: previewOpensAbove(row, window.innerHeight), left: row.left + 16, rowTop: row.top, rowBottom: row.bottom };
              };
              return (
                <button
                  key={post.id}
                  onClick={() => {
                    setHoveredPreview(null);
                    void openPostDetail(post);
                  }}
                  onMouseEnter={(e) => { if (firstImageUrl) setHoveredPreview(previewOf(e)); }}
                  onMouseLeave={() => { setHoveredPreview((prev) => (prev?.postId === post.id ? null : prev)); }}
                  className="w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-[rgba(74,116,181,.06)]"
                  style={{ borderTop: idx ? "1px solid var(--border)" : "none", background: post.pinned ? "rgba(201,98,91,.06)" : undefined }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {post.pinned && (
                      <span className="text-[10px] font-700 px-2 py-0.5 shrink-0" style={{ background: "rgba(201,98,91,.12)", color: "#8f3a35", borderRadius: "10px" }}>📌 필독</span>
                    )}
                    {catInfo && (
                      <span className="text-[11px] font-700 px-2 py-0.5 shrink-0" style={{ background: tone.bg, color: tone.color, borderRadius: "10px" }}>
                        {catInfo.icon} {catInfo.name}
                      </span>
                    )}
                    <span className="text-sm font-700 truncate">{post.title}</span>
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); showTag(tag); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); showTag(tag); } }}
                        className="text-[10px] font-600 px-1.5 py-0.5 shrink-0 hover:opacity-80 hidden sm:inline-block"
                        style={tagChip}
                        title={`#${tag} 글만 보기`}
                      >
                        #{tag}
                      </span>
                    ))}
                    {post.tags.length > 3 && <span className="text-[10px] shrink-0 hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>+{post.tags.length - 3}</span>}
                    {post.poll && (
                      <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: "rgba(214,154,78,.16)", color: "#7a4f12", borderRadius: "10px" }} title="투표 진행/마감">📊 투표</span>
                    )}
                    {imageCount > 0 && (
                      <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: "rgba(15,18,53,.06)", color: "var(--muted-foreground)", borderRadius: "10px" }} title="이미지 첨부됨 (마우스를 올리면 미리보기)">📷</span>
                    )}
                    {fileCount > 0 && (
                      <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: "rgba(15,18,53,.06)", color: "var(--muted-foreground)", borderRadius: "10px" }}>📎 {fileCount}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    <span className="font-600 hidden sm:inline-block w-16 truncate text-right" style={{ color: "var(--foreground)" }}>{post.author}</span>
                    <span className="text-[11px] hidden md:inline-block w-24 text-center shrink-0 tabular-nums">
                      {new Date(post.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[11px] tabular-nums whitespace-nowrap hidden sm:inline-flex items-center gap-2.5 pl-2.5 border-l" style={{ borderColor: "var(--border)" }}>
                      <span title="조회수">👁️ {post.views}</span>
                      <span title="좋아요">❤️ {post.likes}</span>
                      <span title="댓글수">💬 {post.commentsCount}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 flex-wrap gap-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              총 {filteredPosts.length}개 중 {(currentPage - 1) * POSTS_PER_PAGE + 1} - {Math.min(currentPage * POSTS_PER_PAGE, filteredPosts.length)}개 표시 (페이지 {currentPage} / {totalPages})
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-700 transition-all disabled:opacity-40"
                style={{ ...chipOff, borderRadius: "20px" }}
              >
                ← 이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className="w-8 h-8 text-xs font-700 transition-all"
                  style={{ ...(page === currentPage ? { background: "var(--primary)", color: "#fff" } : chipOff), borderRadius: "20px" }}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs font-700 transition-all disabled:opacity-40"
                style={{ ...chipOff, borderRadius: "20px" }}
              >
                다음 →
              </button>
            </div>
          </div>
        )}
      </WindowPanel>

      <div className="flex flex-col gap-4">
        {pinnedPosts.length > 0 && (
          <WindowPanel id="board-pinned" title="필독 공지" style={cardStyle} bodyClassName="px-4 py-2">
            {pinnedPosts.map((post, i) => (
              <button key={post.id} onClick={() => void openPostDetail(post)} className="block w-full text-left py-2.5 text-[13px]" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span className="text-[10px] font-700 px-2 py-0.5 mr-1.5" style={{ background: "rgba(201,98,91,.12)", color: "#8f3a35", borderRadius: "10px" }}>📌 필독</span>
                <span className="font-700">{post.title}</span>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{post.author} · {new Date(post.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</div>
              </button>
            ))}
          </WindowPanel>
        )}
        {hotPosts.length > 0 && (
          <WindowPanel id="board-hot" title="이번 주 인기 글" style={cardStyle} bodyClassName="px-4 py-2">
            {hotPosts.map((post, i) => (
              <button key={post.id} onClick={() => void openPostDetail(post)} className="block w-full text-left py-2.5 text-[13px]" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span className="font-800 mr-1.5" style={{ color: "var(--primary)" }}>{i + 1}</span>
                <span className="font-600">{post.title}</span>
                <div className="text-[11px] mt-0.5 pl-3.5" style={{ color: "var(--muted-foreground)" }}>❤️ {post.likes} · 💬 {post.commentsCount}</div>
              </button>
            ))}
          </WindowPanel>
        )}
        {popularTags.length > 0 && (
          <WindowPanel id="board-tags" title="인기 태그" style={cardStyle} bodyClassName="p-4 flex flex-wrap gap-1.5">
            {popularTags.map((tag) => (
              <button key={tag} onClick={() => showTag(tag)} className="text-[11px] font-600 px-2 py-0.5 hover:opacity-80" style={tagChip}>#{tag}</button>
            ))}
          </WindowPanel>
        )}
      </div>
      </div>

      {hoveredPreview && (
        <div
          className="fixed z-50 pointer-events-none select-none w-[280px] max-w-[calc(100vw-2rem)]"
          style={{ left: hoveredPreview.left, ...(hoveredPreview.above ? { bottom: window.innerHeight - hoveredPreview.rowTop + 6 } : { top: hoveredPreview.rowBottom + 6 }) }}
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
                    background: hoveredPreview.isBlurred ? "rgba(239, 68, 68, 0.12)" : "rgba(74, 116, 181, 0.12)",
                    color: hoveredPreview.isBlurred ? "#ef4444" : "#4a74b5",
                  }}
                >
                  {hoveredPreview.isBlurred ? "블러 미리보기" : hoveredPreview.imageCount > 1 ? `이미지 1/${hoveredPreview.imageCount}` : "이미지 미리보기"}
                </span>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}
