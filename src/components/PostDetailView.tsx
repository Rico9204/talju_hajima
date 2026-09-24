import { useState } from "react";
import { BOARD_CATEGORIES } from "../lib/boardData";
import BoardPollView from "./BoardPollView";
import { PostReportButton, PostReportList } from "./PostReport";
import type { BoardPost } from "../api/types";

export default function PostDetailView({
  post,
  currentUserId,
  isAdmin,
  busy,
  error,
  onBack,
  onEditPost,
  onAddComment,
  onAddReply,
  onDeleteComment,
  onToggleLike,
  onDeletePost,
  onVotePoll,
  onClosePoll,
  onReported,
}: {
  post: BoardPost;
  currentUserId: string | null;
  isAdmin: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onEditPost?: (post: BoardPost) => void;
  onAddComment: (postId: number, content: string) => void;
  onAddReply: (postId: number, commentId: number, content: string, targetAuthor?: string) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
  onToggleLike: (postId: number) => void;
  onDeletePost: (postId: number) => void;
  onVotePoll?: (pollId: number, optionIds: number[]) => Promise<void>;
  onClosePoll?: (pollId: number) => Promise<void>;
  onReported?: (postId: number) => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [replyingTarget, setReplyingTarget] = useState<{ commentId: number; targetAuthor: string; replyId?: number } | null>(null);
  const [replyText, setReplyText] = useState("");

  const catInfo = BOARD_CATEGORIES.find((c) => c.id === post.category) ?? BOARD_CATEGORIES[1];
  const isAuthor = !!currentUserId && post.authorUserId === currentUserId;
  const commentsDisabled = post.category === "notice";
  function canDeleteComment(authorUserId: string): boolean {
    return isAdmin || (!!currentUserId && authorUserId === currentUserId);
  }
  function confirmDeleteComment(commentId: number) {
    if (confirm("이 댓글을 삭제하시겠습니까?")) onDeleteComment(post.id, commentId);
  }

  const files = post.attachments.filter((a) => a.kind === "file");
  const isHtml = post.content.includes("<") && post.content.includes(">");

  function getCleanedHtml(raw: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "text/html");
      doc.querySelectorAll(".img-delete-btn, button").forEach((btn) => btn.remove());
      return doc.body.innerHTML;
    } catch {
      return raw;
    }
  }

  const totalCommentsCount = post.comments.reduce((acc, c) => acc + 1 + c.replies.length, 0);

  function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(post.id, commentText.trim());
    setCommentText("");
  }

  function handleReplySubmit() {
    if (!replyingTarget || !replyText.trim()) return;
    onAddReply(post.id, replyingTarget.commentId, replyText.trim(), replyingTarget.targetAuthor);
    setReplyText("");
    setReplyingTarget(null);
  }

  function handleReport(target: string) {
    alert(`${target} 신고가 접수되었습니다. (관리자 검토 예정)`);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="px-3.5 py-2 text-xs font-700 transition-all flex items-center gap-1.5"
          style={{ background: "var(--card)", color: "var(--foreground)", borderRadius: "20px", boxShadow: "var(--shadow-card)" }}
        >
          <span>←</span>
          <span>목록으로 돌아가기</span>
        </button>

        {!isAuthor && currentUserId && <PostReportButton key={post.id} post={post} onReported={() => onReported?.(post.id)} />}
        {isAuthor && (
          <div className="flex gap-2">
            {onEditPost && (
              <button
                onClick={() => onEditPost(post)}
                className="text-xs font-700 px-3.5 py-2 transition-all"
                style={{ background: "#2563eb18", color: "var(--primary)", borderRadius: "20px" }}
              >
                ✏️ 게시글 수정
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => { if (confirm("이 게시글을 삭제하시겠습니까?")) onDeletePost(post.id); }}
              className="text-xs font-700 px-3.5 py-2 transition-all disabled:opacity-50"
              style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}
            >
              🗑️ 게시글 삭제
            </button>
          </div>
        )}
      </div>

      {isAdmin && <PostReportList postId={post.id} />}

      {error && (
        <div role="alert" className="p-3 text-xs rounded-xl" style={{ background: "#ef444418", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {/* Main Post Content Card */}
      <div
        className="p-6 md:p-8 space-y-6"
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
        <div className="space-y-2 border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-700 px-3 py-1" style={{ background: catInfo.badgeBg, color: catInfo.badgeColor, borderRadius: "20px" }}>
              {catInfo.icon} {catInfo.name}
            </span>
            {post.pinned && (
              <span className="text-xs font-700 px-2.5 py-1" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>
                📌 필독 공지
              </span>
            )}
            {post.hideImagePreview && (
              <span
                className="text-xs font-700 px-2.5 py-1 flex items-center gap-1"
                style={{ background: "rgba(100, 116, 139, 0.12)", color: "var(--muted-foreground)", borderRadius: "20px" }}
                title="목록에서 이미지 미리보기가 방지된 게시글입니다"
              >
                <span>🔒</span>
                <span>미리보기 방지</span>
              </span>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-800 leading-snug break-words">{post.title}</h1>

          <div className="flex items-center gap-3 text-xs pt-1" style={{ color: "var(--muted-foreground)" }}>
            <span className="font-700" style={{ color: "var(--foreground)" }}>{post.author}</span>
            <span>•</span>
            <span>{formatDate(post.createdAt)}</span>
            <span>•</span>
            <span>조회 {post.views}</span>
          </div>
        </div>

        {isHtml ? (
          <div
            className="text-sm md:text-base leading-relaxed p-5 space-y-2 overflow-x-auto"
            style={{ background: "var(--muted)", borderRadius: "12px", color: "var(--foreground)", backgroundClip: "padding-box" }}
            dangerouslySetInnerHTML={{ __html: getCleanedHtml(post.content) }}
          />
        ) : (
          <div className="text-sm md:text-base whitespace-pre-wrap leading-relaxed p-5" style={{ background: "var(--muted)", borderRadius: "12px", color: "var(--foreground)", backgroundClip: "padding-box" }}>
            {post.content}
          </div>
        )}

        {post.poll && (
          <div className="pt-2">
            <BoardPollView
              poll={post.poll}
              postAuthorId={post.authorUserId}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onVote={async (pollId, optionIds) => {
                if (onVotePoll) await onVotePoll(pollId, optionIds);
              }}
              onClosePoll={async (pollId) => {
                if (onClosePoll) await onClosePoll(pollId);
              }}
            />
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="text-xs font-700 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
              <span>📎</span>
              <span>첨부 파일 ({files.length})</span>
            </div>
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3.5 text-xs border" style={{ background: "var(--muted)", borderColor: "var(--border)", borderRadius: "12px" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">📄</span>
                    <div className="min-w-0">
                      <div className="font-700 truncate text-sm">{file.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{file.size}</div>
                    </div>
                  </div>
                  <a
                    href={file.url}
                    download={file.name}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 text-xs font-700 shrink-0 transition-all flex items-center gap-1.5"
                    style={{ background: "var(--primary)", color: "#fff", borderRadius: "10px" }}
                  >
                    <span>⬇️</span>
                    <span>다운로드</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 flex-wrap pt-2">
          <button
            onClick={() => onToggleLike(post.id)}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-700 transition-all"
            style={{
              background: post.likedByMe ? "#ef444418" : "var(--muted)",
              color: post.likedByMe ? "#ef4444" : "var(--foreground)",
              borderRadius: "20px",
              border: post.likedByMe ? "1px solid #ef444444" : "1px solid transparent",
            }}
          >
            <span className="text-sm">{post.likedByMe ? "❤️" : "🤍"}</span>
            <span>좋아요 {post.likes}</span>
          </button>
        </div>

        {!commentsDisabled && (
        <div className="border-t pt-6" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-base font-800 mb-4 flex items-center gap-2">
            <span>💬 댓글</span>
            <span className="text-xs px-2.5 py-0.5 font-700" style={{ background: "var(--muted)", borderRadius: "10px" }}>{totalCommentsCount}</span>
          </h3>

          <form onSubmit={handleCommentSubmit} className="mb-6 space-y-2.5">
            <textarea
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={2000}
              placeholder="댓글을 남겨보세요..."
              className="w-full px-4 py-3 text-xs md:text-sm outline-none resize-none"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "12px", color: "var(--foreground)" }}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="px-5 py-2 text-xs font-700 transition-all disabled:opacity-40"
                style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
              >
                댓글 작성
              </button>
            </div>
          </form>

          {post.comments.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>
              아직 작성된 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!
            </p>
          ) : (
            <div className="space-y-4">
              {post.comments.map((c) => {
                const isReplyingToParent = replyingTarget?.commentId === c.id && !replyingTarget.replyId;
                return (
                  <div key={c.id} className="p-4 text-xs md:text-sm space-y-3" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-700">{c.author}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{formatDate(c.createdAt)}</span>
                        {!commentsDisabled && (
                          <button
                            onClick={() => {
                              if (isReplyingToParent) setReplyingTarget(null);
                              else { setReplyingTarget({ commentId: c.id, targetAuthor: c.author }); setReplyText(""); }
                            }}
                            className="text-[11px] font-600 px-2 py-0.5 transition-all hover:bg-blue-500/10"
                            style={{ color: "var(--primary)", borderRadius: "6px" }}
                          >
                            💬 답글
                          </button>
                        )}
                        <button
                          onClick={() => handleReport("댓글")}
                          className="text-[11px] font-600 px-2 py-0.5 transition-all hover:bg-red-500/10"
                          style={{ color: "#ef4444", borderRadius: "6px" }}
                          title="댓글 신고하기"
                        >
                          🚨 신고
                        </button>
                        {canDeleteComment(c.authorUserId) && (
                          <button
                            onClick={() => confirmDeleteComment(c.id)}
                            className="text-[11px] font-600 px-2 py-0.5 transition-all hover:bg-red-500/10"
                            style={{ color: "#ef4444", borderRadius: "6px" }}
                            title="댓글 삭제하기"
                          >
                            🗑️ 삭제
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed">{c.content}</p>

                    {isReplyingToParent && (
                      <div className="mt-3 p-3 border-l-2 space-y-2" style={{ borderColor: "var(--primary)", background: "var(--card)", borderRadius: "8px" }}>
                        <div className="text-[11px] font-700 flex items-center gap-1" style={{ color: "var(--primary)" }}>
                          <span>↳</span>
                          <span>@{c.author}님에게 답글 작성</span>
                        </div>
                        <textarea
                          rows={2}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          maxLength={2000}
                          placeholder="대댓글을 작성하세요..."
                          className="w-full px-3 py-2 text-xs outline-none resize-none"
                          style={{ background: "var(--muted)", borderRadius: "8px", color: "var(--foreground)" }}
                        />
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setReplyingTarget(null)} className="px-3 py-1 text-xs font-600" style={{ background: "var(--muted)", borderRadius: "12px", color: "var(--muted-foreground)" }}>취소</button>
                          <button type="button" onClick={handleReplySubmit} disabled={!replyText.trim()} className="px-3.5 py-1 text-xs font-700 disabled:opacity-40" style={{ background: "var(--primary)", color: "#fff", borderRadius: "12px" }}>답글 등록</button>
                        </div>
                      </div>
                    )}

                    {c.replies.length > 0 && (
                      <div className="space-y-3 mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                        {c.replies.map((r) => {
                          const isReplyingToThisReply = replyingTarget?.replyId === r.id;
                          return (
                            <div key={r.id} className="space-y-2">
                              <div className="pl-3.5 border-l-2 space-y-1 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-700">
                                    <span style={{ color: "var(--primary)" }}>↳</span>
                                    <span>{r.author}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{formatDate(r.createdAt)}</span>
                                    {!commentsDisabled && (
                                      <button
                                        onClick={() => {
                                          if (isReplyingToThisReply) setReplyingTarget(null);
                                          else { setReplyingTarget({ commentId: c.id, targetAuthor: r.author, replyId: r.id }); setReplyText(""); }
                                        }}
                                        className="text-[10px] font-600 px-1.5 py-0.5 transition-all hover:bg-blue-500/10"
                                        style={{ color: "var(--primary)", borderRadius: "6px" }}
                                      >
                                        💬 답글
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleReport("대댓글")}
                                      className="text-[10px] font-600 px-1.5 py-0.5 transition-all hover:bg-red-500/10"
                                      style={{ color: "#ef4444", borderRadius: "6px" }}
                                      title="대댓글 신고하기"
                                    >
                                      🚨 신고
                                    </button>
                                    {canDeleteComment(r.authorUserId) && (
                                      <button
                                        onClick={() => confirmDeleteComment(r.id)}
                                        className="text-[10px] font-600 px-1.5 py-0.5 transition-all hover:bg-red-500/10"
                                        style={{ color: "#ef4444", borderRadius: "6px" }}
                                        title="대댓글 삭제하기"
                                      >
                                        🗑️ 삭제
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed text-[13px] pl-3.5">{r.content}</p>
                              </div>

                              {isReplyingToThisReply && (
                                <div className="ml-4 p-3 border-l-2 space-y-2" style={{ borderColor: "var(--primary)", background: "var(--card)", borderRadius: "8px" }}>
                                  <div className="text-[11px] font-700 flex items-center gap-1" style={{ color: "var(--primary)" }}>
                                    <span>↳</span>
                                    <span>@{r.author}님에게 답글 작성</span>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    maxLength={2000}
                                    placeholder={`@${r.author}님에게 답글 작성...`}
                                    className="w-full px-3 py-2 text-xs outline-none resize-none"
                                    style={{ background: "var(--muted)", borderRadius: "8px", color: "var(--foreground)" }}
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button type="button" onClick={() => setReplyingTarget(null)} className="px-3 py-1 text-xs font-600" style={{ background: "var(--muted)", borderRadius: "12px", color: "var(--muted-foreground)" }}>취소</button>
                                    <button type="button" onClick={handleReplySubmit} disabled={!replyText.trim()} className="px-3.5 py-1 text-xs font-700 disabled:opacity-40" style={{ background: "var(--primary)", color: "#fff", borderRadius: "12px" }}>답글 등록</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
