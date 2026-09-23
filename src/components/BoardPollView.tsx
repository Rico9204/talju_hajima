import { useState } from "react";
import { calculatePollPercentage, getLeadingOptionIds, isPollClosed } from "../lib/boardPoll";
import type { BoardPoll } from "../api/types";

export default function BoardPollView({
  poll,
  postAuthorId,
  currentUserId,
  isAdmin,
  onVote,
  onClosePoll,
}: {
  poll: BoardPoll;
  postAuthorId: string;
  currentUserId: string | null;
  isAdmin: boolean;
  onVote: (pollId: number, optionIds: number[]) => Promise<void>;
  onClosePoll: (pollId: number) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(poll.myOptionIds);
  const [isEditingVote, setIsEditingVote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOptionVoters, setExpandedOptionVoters] = useState<number | null>(null);

  const canManage = (!!currentUserId && currentUserId === postAuthorId) || isAdmin;
  const isClosed = isPollClosed(poll);
  const showResults = poll.hasVoted && !isEditingVote;

  const leadingOptionIds = getLeadingOptionIds(poll.options);
  const totalVotesCount = poll.totalVotes;

  function toggleOption(optId: number) {
    if (poll.allowMultiple) {
      setSelectedIds((prev) =>
        prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
      );
    } else {
      setSelectedIds([optId]);
    }
  }

  async function handleVoteSubmit() {
    if (!currentUserId) {
      alert("투표하려면 로그인이 필요합니다.");
      return;
    }
    if (selectedIds.length === 0) {
      alert("하나 이상의 항목을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onVote(poll.id, selectedIds);
      setIsEditingVote(false);
    } catch (e: any) {
      setError(e?.message || "투표 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelVote() {
    if (!currentUserId) return;
    if (!confirm("투표를 취소하시겠습니까?")) return;
    setBusy(true);
    setError(null);
    try {
      await onVote(poll.id, []);
      setSelectedIds([]);
      setIsEditingVote(true);
    } catch (e: any) {
      setError(e?.message || "투표 취소에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClosePoll() {
    if (!confirm("정말 이 투표를 마감하시겠습니까? 마감 후에는 다시 열 수 없습니다.")) return;
    setBusy(true);
    setError(null);
    try {
      await onClosePoll(poll.id);
    } catch (e: any) {
      setError(e?.message || "투표 마감에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function formatDeadline(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} 마감`;
  }

  return (
    <div
      className="p-5 md:p-6 transition-all relative overflow-hidden"
      style={{
        background: "var(--card-glass)",
        border: "1px solid var(--border)",
        borderRadius: "18px",
        boxShadow: "var(--shadow-card)",
        backdropFilter: "var(--panel-blur)",
        WebkitBackdropFilter: "var(--panel-blur)",
      }}
    >
      {/* 상단 뱃지 및 메타 정보 */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span
            className="px-2.5 py-0.5 rounded-full flex items-center gap-1"
            style={{
              background: isClosed ? "var(--muted)" : "rgba(34, 197, 94, 0.15)",
              color: isClosed ? "var(--muted-foreground)" : "#22c55e",
            }}
          >
            <span>{isClosed ? "🔒 마감됨" : "🟢 진행 중"}</span>
          </span>
          {poll.allowMultiple && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}
            >
              복수 선택
            </span>
          )}
          {poll.isAnonymous ? (
            <span
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{ background: "rgba(168, 85, 247, 0.12)", color: "#a855f7" }}
            >
              익명 투표
            </span>
          ) : (
            <span
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              기명 투표
            </span>
          )}
          {poll.closesAt && (
            <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              ⏱️ {formatDeadline(poll.closesAt)}
            </span>
          )}
        </div>

        {/* 작성자/관리자 전용 마감 버튼 */}
        {canManage && !isClosed && (
          <button
            type="button"
            disabled={busy}
            onClick={handleClosePoll}
            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-opacity hover:opacity-80"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            투표 조기 마감
          </button>
        )}
      </div>

      {/* 투표 제목 / 질문 */}
      <h3 className="text-base md:text-lg font-bold mb-4 flex items-center gap-2" style={{ color: "var(--foreground)" }}>
        <span className="text-xl">📊</span>
        <span>{poll.question}</span>
      </h3>

      {error && (
        <div className="mb-4 text-xs p-2.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 font-medium">
          {error}
        </div>
      )}

      {/* 옵션 목록 */}
      <div className="space-y-2.5 mb-4">
        {poll.options.map((opt) => {
          const isSelected = selectedIds.includes(opt.id);
          const isMyVotedOption = poll.myOptionIds.includes(opt.id);
          const isLeading = leadingOptionIds.includes(opt.id);
          const percent = calculatePollPercentage(opt.votesCount, totalVotesCount);

          if (showResults || isClosed) {
            // 결과 보기 모드
            return (
              <div key={opt.id} className="group relative">
                <div
                  className="relative overflow-hidden rounded-xl border p-3 md:p-3.5 transition-all"
                  style={{
                    borderColor: isMyVotedOption ? "var(--primary)" : "var(--border)",
                    background: "var(--card)",
                  }}
                >
                  {/* 투표율 프로그레스 바 */}
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-700 pointer-events-none"
                    style={{
                      width: `${percent}%`,
                      background: isLeading
                        ? "linear-gradient(90deg, rgba(59, 130, 246, 0.22), rgba(147, 51, 234, 0.22))"
                        : "var(--muted)",
                      opacity: 0.6,
                    }}
                  />

                  <div className="relative flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isMyVotedOption && (
                        <span
                          className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                          style={{ background: "var(--primary)" }}
                          title="내가 투표한 항목"
                        >
                          ✓
                        </span>
                      )}
                      <span className={`font-semibold truncate ${isLeading ? "text-blue-500" : ""}`} style={{ color: "var(--foreground)" }}>
                        {opt.text}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
                      <span>{opt.votesCount}표</span>
                      <span className="min-w-10 text-right font-bold" style={{ color: "var(--foreground)" }}>
                        {percent}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* 기명 투표 시 참여자 명단 토글 */}
                {!poll.isAnonymous && opt.voters && opt.voters.length > 0 && (
                  <div className="mt-1 px-2">
                    <button
                      type="button"
                      onClick={() => setExpandedOptionVoters((prev) => (prev === opt.id ? null : opt.id))}
                      className="text-[11px] hover:underline"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {expandedOptionVoters === opt.id ? "▲ 참여자 접기" : `▼ 참여자 (${opt.voters.length}명) 보기`}
                    </button>
                    {expandedOptionVoters === opt.id && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 p-2 rounded-lg bg-[var(--muted)]/50">
                        {opt.voters.map((v) => (
                          <div
                            key={v.userId}
                            className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                          >
                            {v.avatarUrl ? (
                              <img src={v.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-500 text-[10px] flex items-center justify-center font-bold">
                                {v.name[0] || "?"}
                              </span>
                            )}
                            <span className="text-[11px]" style={{ color: "var(--foreground)" }}>{v.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // 선택 투표 모드
          return (
            <label
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              className="flex items-center gap-3 p-3 md:p-3.5 rounded-xl border cursor-pointer transition-all hover:border-[var(--primary)]"
              style={{
                borderColor: isSelected ? "var(--primary)" : "var(--border)",
                background: isSelected ? "rgba(59, 130, 246, 0.06)" : "var(--card)",
              }}
            >
              <div
                className={`w-4 h-4 rounded-${poll.allowMultiple ? "md" : "full"} flex items-center justify-center border transition-all`}
                style={{
                  borderColor: isSelected ? "var(--primary)" : "var(--border)",
                  background: isSelected ? "var(--primary)" : "transparent",
                }}
              >
                {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
              <span className="text-sm font-medium flex-1 truncate" style={{ color: "var(--foreground)" }}>
                {opt.text}
              </span>
            </label>
          );
        })}
      </div>

      {/* 하단 총 투표수 및 액션 버튼들 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          총 <strong style={{ color: "var(--foreground)" }}>{totalVotesCount}</strong>명 참여
        </div>

        <div className="flex items-center gap-2">
          {showResults && !isClosed && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsEditingVote(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all hover:bg-[var(--muted)]"
                style={{
                  background: "var(--card)",
                  color: "var(--foreground)",
                  borderColor: "var(--border)",
                }}
              >
                다시 투표하기
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCancelVote}
                className="px-3 py-1.5 text-xs font-medium rounded-xl text-red-500 hover:bg-red-500/10 transition-all"
              >
                투표 취소
              </button>
            </>
          )}

          {!showResults && !isClosed && (
            <>
              {poll.hasVoted && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelectedIds(poll.myOptionIds);
                    setIsEditingVote(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl transition-all"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  결과 보기
                </button>
              )}
              <button
                type="button"
                disabled={busy || selectedIds.length === 0}
                onClick={handleVoteSubmit}
                className="px-4 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm hover:opacity-95 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "#ffffff",
                }}
              >
                {busy ? "처리 중…" : "투표하기"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
