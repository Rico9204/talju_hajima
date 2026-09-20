import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import {
  acceptBoardApplication,
  applyToBoardPost,
  createBoardPost,
  deleteBoardPost,
  listBoardApplications,
  listBoardPosts,
  rejectBoardApplication,
  setBoardPostRecruiting,
  type BoardApplication,
  type BoardPost,
} from "../api/backend/board";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// "메인화면"의 게시판 — 일반 글 + 프로젝트 팀원 모집 공고(지원/수락 흐름 포함). update.txt의
// "게시판 기능 / 프로젝트 개설 시 팀원 모집 기능" 요청 중, 모집 공고 자체는 CreateProjectModal에서
// 프로젝트 만들 때 같이 올릴 수 있고(MyProjects.tsx), 여기서는 목록 조회 + 직접 글쓰기 + 지원을 다룬다.
export default function Board() {
  const { session } = useAuth();
  const { projects } = useProject();
  const navigate = useNavigate();
  const myId = session?.user.id;

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [attachProjectId, setAttachProjectId] = useState("");
  const [postTags, setPostTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [applyDraftByPost, setApplyDraftByPost] = useState<Record<string, string>>({});
  const [applicationsByPost, setApplicationsByPost] = useState<Record<string, BoardApplication[]>>({});
  const [expandedApplicantsId, setExpandedApplicantsId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const { data } = await listBoardPosts({ tag: activeTag ?? undefined, q: search.trim() || undefined });
      setPosts(data);
    } catch {
      setError("게시판을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 검색어는 타이핑할 때마다 바로 요청하지 않고 잠깐 멈췄을 때만(디바운스) — SchoolMajorPicker와
  // 같은 방식. 태그 필터는 클릭 즉시 바뀌는 값이라 디바운스 없이 바로 반영.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      refresh();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeTag]);

  function addTag() {
    const t = tagDraft.trim().replace(/^#/, "");
    if (!t || postTags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagDraft("");
      return;
    }
    if (postTags.length >= 10) return;
    setPostTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  async function submitPost() {
    if (!title.trim() || !content.trim()) return;
    setError(null);
    try {
      await createBoardPost({
        title: title.trim(),
        content: content.trim(),
        projectId: attachProjectId || undefined,
        tags: postTags,
      });
      setTitle("");
      setContent("");
      setAttachProjectId("");
      setPostTags([]);
      setTagDraft("");
      setComposerOpen(false);
      await refresh();
    } catch {
      setError("글을 올리지 못했습니다.");
    }
  }

  async function handleDelete(postId: string) {
    setBusyId(postId);
    try {
      await deleteBoardPost(postId);
      await refresh();
    } catch {
      setError("삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleRecruiting(post: BoardPost) {
    setBusyId(post.id);
    try {
      await setBoardPostRecruiting(post.id, !post.recruiting);
      await refresh();
    } catch {
      setError("모집 상태를 바꾸지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApply(postId: string) {
    setBusyId(postId);
    setError(null);
    try {
      await applyToBoardPost(postId, applyDraftByPost[postId]?.trim() || undefined);
      setApplyDraftByPost((prev) => ({ ...prev, [postId]: "" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "지원하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleApplicants(postId: string) {
    if (expandedApplicantsId === postId) {
      setExpandedApplicantsId(null);
      return;
    }
    setExpandedApplicantsId(postId);
    try {
      const { data } = await listBoardApplications(postId);
      setApplicationsByPost((prev) => ({ ...prev, [postId]: data }));
    } catch {
      setError("지원자 목록을 불러오지 못했습니다.");
    }
  }

  async function respond(postId: string, applicationId: string, accept: boolean) {
    setBusyId(applicationId);
    try {
      await (accept ? acceptBoardApplication(applicationId) : rejectBoardApplication(applicationId));
      const { data } = await listBoardApplications(postId);
      setApplicationsByPost((prev) => ({ ...prev, [postId]: data }));
    } catch {
      setError("처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const myProjectIds = new Set(projects.map((p) => p.id));

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목·내용 검색"
          className="flex-1 min-w-[160px] text-sm px-3.5 py-2.5 outline-none"
          style={{ border: "2px solid var(--border)", borderRadius: "20px", background: "var(--card)" }}
        />
        <button
          onClick={() => setComposerOpen((v) => !v)}
          className="text-sm font-700 px-4 py-2.5 shrink-0"
          style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px" }}
        >
          {composerOpen ? "취소" : "+ 글쓰기"}
        </button>
      </div>

      {activeTag && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>태그 필터:</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-700 px-2.5 py-1" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
            #{activeTag}
            <button onClick={() => setActiveTag(null)}>×</button>
          </span>
        </div>
      )}

      {error && (
        <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      {composerOpen && (
        <div className="p-5 mb-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full text-sm px-3 py-2.5 outline-none mb-2"
            style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용"
            rows={4}
            className="w-full text-sm px-3 py-2.5 outline-none mb-2 resize-none"
            style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
          />
          <label className="text-xs font-600 block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
            팀원 모집 공고로 올릴 프로젝트 (선택 — 고르지 않으면 일반 글)
          </label>
          <select
            value={attachProjectId}
            onChange={(e) => setAttachProjectId(e.target.value)}
            className="w-full text-sm px-3 py-2.5 outline-none mb-3"
            style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
          >
            <option value="">일반 글</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <label className="text-xs font-600 block mb-1.5" style={{ color: "var(--muted-foreground)" }}>태그 (선택, 최대 10개)</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {postTags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-xs font-600 px-2.5 py-1" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                #{t}
                <button onClick={() => setPostTags((prev) => prev.filter((x) => x !== t))}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="예: React (엔터로 추가)"
              className="flex-1 min-w-0 text-sm px-3 py-2 outline-none"
              style={{ border: "1px solid var(--border)", borderRadius: "20px", background: "var(--muted)" }}
            />
            <button onClick={addTag} className="text-xs font-700 px-3.5 py-2 shrink-0" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "20px" }}>
              추가
            </button>
          </div>
          <button
            onClick={submitPost}
            disabled={!title.trim() || !content.trim()}
            className="w-full py-2.5 text-sm font-700"
            style={{ background: title.trim() && content.trim() ? "var(--primary)" : "var(--muted)", color: title.trim() && content.trim() ? "#fff" : "var(--muted-foreground)", borderRadius: "40px" }}
          >
            올리기
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>불러오는 중...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
            const isAuthor = post.authorId === myId;
            const isRecruitment = !!post.projectId;
            const iAmMember = post.projectId ? myProjectIds.has(post.projectId) : false;
            const applications = applicationsByPost[post.id] ?? [];

            return (
              <div key={post.id} className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {isRecruitment && (
                        <span
                          className="text-xs font-700 px-2 py-0.5 shrink-0"
                          style={{ borderRadius: "20px", background: post.recruiting ? "#22c55e18" : "var(--muted)", color: post.recruiting ? "#22c55e" : "var(--muted-foreground)" }}
                        >
                          {post.recruiting ? "팀원 모집중" : "모집 마감"}
                        </span>
                      )}
                      <h3 className="text-sm font-700 truncate">{post.title}</h3>
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {post.author?.name ?? "알 수 없음"} · {formatDate(post.createdAt)}
                      {post.project && (
                        <>
                          {" · "}
                          <button onClick={() => navigate(`/dashboard`)} className="underline" style={{ color: "var(--primary)" }}>
                            {post.project.name}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isAuthor && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isRecruitment && (
                        <button
                          onClick={() => handleToggleRecruiting(post)}
                          disabled={busyId === post.id}
                          className="text-xs font-600 px-2.5 py-1"
                          style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "20px" }}
                        >
                          {post.recruiting ? "마감하기" : "다시 열기"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(post.id)}
                        disabled={busyId === post.id}
                        className="w-6 h-6 flex items-center justify-center text-xs"
                        style={{ background: "var(--muted)", color: "#ef4444", borderRadius: "50%" }}
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {post.tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTag((cur) => (cur?.toLowerCase() === t.toLowerCase() ? null : t))}
                        className="text-xs font-600 px-2.5 py-0.5"
                        style={{
                          borderRadius: "20px",
                          background: activeTag?.toLowerCase() === t.toLowerCase() ? "var(--primary)" : "var(--muted)",
                          color: activeTag?.toLowerCase() === t.toLowerCase() ? "#fff" : "var(--muted-foreground)",
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3" style={{ color: "var(--foreground)" }}>{post.content}</p>

                {isRecruitment && isAuthor && (
                  <div>
                    <button onClick={() => toggleApplicants(post.id)} className="text-xs font-600" style={{ color: "var(--primary)" }}>
                      {expandedApplicantsId === post.id ? "지원자 숨기기" : "지원자 보기"}
                    </button>
                    {expandedApplicantsId === post.id && (
                      <div className="flex flex-col gap-2 mt-2">
                        {applications.length === 0 && (
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>아직 지원자가 없어요.</div>
                        )}
                        {applications.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2 p-2.5" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                            <div className="min-w-0">
                              <div className="text-xs font-700">{a.applicant?.name ?? "알 수 없음"}</div>
                              {a.message && <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{a.message}</div>}
                            </div>
                            {a.status === "pending" ? (
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  onClick={() => respond(post.id, a.id, true)}
                                  disabled={busyId === a.id}
                                  className="text-xs font-700 px-2.5 py-1"
                                  style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
                                >
                                  수락
                                </button>
                                <button
                                  onClick={() => respond(post.id, a.id, false)}
                                  disabled={busyId === a.id}
                                  className="text-xs font-600 px-2.5 py-1"
                                  style={{ background: "var(--card)", color: "var(--muted-foreground)", borderRadius: "20px" }}
                                >
                                  거절
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-600 shrink-0" style={{ color: a.status === "accepted" ? "#22c55e" : "#ef4444" }}>
                                {a.status === "accepted" ? "수락됨" : "거절됨"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isRecruitment && !isAuthor && !iAmMember && post.recruiting && (
                  <div className="flex gap-2">
                    <input
                      value={applyDraftByPost[post.id] ?? ""}
                      onChange={(e) => setApplyDraftByPost((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      placeholder="지원 메시지 (선택)"
                      className="flex-1 min-w-0 text-xs px-3 py-2 outline-none"
                      style={{ border: "1px solid var(--border)", borderRadius: "20px", background: "var(--muted)" }}
                    />
                    <button
                      onClick={() => handleApply(post.id)}
                      disabled={busyId === post.id}
                      className="text-xs font-700 px-3.5 py-2 shrink-0"
                      style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
                    >
                      지원하기
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {posts.length === 0 && (
            <div className="p-8 text-center text-sm border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              아직 게시글이 없어요
            </div>
          )}
        </div>
      )}
    </div>
  );
}
