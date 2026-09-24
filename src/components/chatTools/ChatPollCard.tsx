import { useState, useEffect } from "react";
import type { ChatPollData } from "../../lib/chatTools";

export default function ChatPollCard({
  data,
  currentMemberId,
  currentMemberName,
  onVote,
  onClose,
}: {
  data: ChatPollData;
  currentMemberId: string;
  currentMemberName: string;
  onVote: (optionIds: number[]) => void;
  onClose: () => void;
}) {
  // My voted options
  const myVotedOptionIds = data.options
    .filter((opt) => opt.voterMemberIds.includes(currentMemberId))
    .map((opt) => opt.id);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!data.expiresAt || data.closed) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [data.expiresAt, data.closed]);

  const isExpired = Boolean(
    data.expiresAt && new Date(data.expiresAt).getTime() <= now
  );
  const isClosed = data.closed || isExpired;

  const hasVoted = myVotedOptionIds.length > 0;
  const [selectedIds, setSelectedIds] = useState<number[]>(myVotedOptionIds);
  const [isEditing, setIsEditing] = useState(!hasVoted && !isClosed);

  const isCreator = data.creatorId === currentMemberId;
  const showResults = (hasVoted && !isEditing) || isClosed;
  const maxVotes = Math.max(...data.options.map((o) => o.votesCount), 0);

  function getRemainingTimeText(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - now;
    if (diff <= 0) return "마감됨";
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 ${hours % 24}시간 남음`;
    if (hours > 0) return `${hours}시간 ${minutes % 60}분 남음`;
    if (minutes > 0) return `${minutes}분 ${seconds % 60}초 남음`;
    return `${seconds}초 남음`;
  }

  function toggleOption(optId: number) {
    if (isClosed) return;
    if (data.allowMultiple) {
      setSelectedIds((prev) =>
        prev.includes(optId)
          ? prev.filter((id) => id !== optId)
          : [...prev, optId]
      );
    } else {
      setSelectedIds([optId]);
    }
  }

  function handleVote() {
    if (selectedIds.length === 0 || isClosed) return;
    onVote(selectedIds);
    setIsEditing(false);
  }

  return (
    <div
      className="p-4 md:p-5 my-1.5 rounded-2xl border transition-all text-left max-w-xl w-full"
      style={{
        background: "var(--card-glass)",
        borderColor: "rgba(168, 85, 247, 0.35)",
        boxShadow: "0 8px 30px rgba(168, 85, 247, 0.08)",
        backdropFilter: "var(--panel-blur)",
        WebkitBackdropFilter: "var(--panel-blur)",
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-bold flex-wrap">
          <span
            className="px-2.5 py-0.5 rounded-full flex items-center gap-1"
            style={{
              background: isClosed
                ? "var(--muted)"
                : "rgba(34, 197, 94, 0.15)",
              color: isClosed ? "var(--muted-foreground)" : "#22c55e",
            }}
          >
            <span>{isClosed ? "🔒 마감됨" : "🟢 진행 중"}</span>
          </span>
          {data.expiresAt && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1"
              style={{
                background: isExpired
                  ? "var(--muted)"
                  : "rgba(234, 179, 8, 0.15)",
                color: isExpired ? "var(--muted-foreground)" : "#ca8a04",
              }}
              title={
                data.expiresAt
                  ? `마감 시간: ${new Date(data.expiresAt).toLocaleString()}`
                  : undefined
              }
            >
              <span>{isExpired ? "⏰ 시간 마감" : "⏳ " + getRemainingTimeText(data.expiresAt)}</span>
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded-full text-[11px]"
            style={{ background: "rgba(168, 85, 247, 0.12)", color: "#a855f7" }}
          >
            📊 채팅 투표
          </span>
          {data.allowMultiple && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{
                background: "rgba(59, 130, 246, 0.12)",
                color: "#3b82f6",
              }}
            >
              복수 선택
            </span>
          )}
          {data.isAnonymous && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{
                background: "var(--muted)",
                color: "var(--muted-foreground)",
              }}
            >
              익명
            </span>
          )}
        </div>

        {isCreator && !isClosed && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-2 py-0.5 rounded font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            투표 마감
          </button>
        )}
      </div>

      {/* 질문 */}
      <h4
        className="text-base font-bold mb-3.5"
        style={{ color: "var(--foreground)" }}
      >
        {data.question}
      </h4>

      {/* 옵션 목록 */}
      <div className="space-y-2 mb-3.5">
        {data.options.map((opt) => {
          const isSelected = selectedIds.includes(opt.id);
          const isMyVoted = myVotedOptionIds.includes(opt.id);
          const percent =
            data.totalVotes > 0
              ? Math.round((opt.votesCount / data.totalVotes) * 100)
              : 0;
          const isLeading = maxVotes > 0 && opt.votesCount === maxVotes;

          if (showResults) {
            return (
              <div
                key={opt.id}
                className="relative overflow-hidden rounded-xl border p-2.5 md:p-3 transition-all"
                style={{
                  borderColor: isMyVoted ? "var(--primary)" : "var(--border)",
                  background: "var(--card)",
                }}
              >
                {/* 득표율 게이지 바 */}
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none"
                  style={{
                    width: `${percent}%`,
                    background: isLeading
                      ? "linear-gradient(90deg, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2))"
                      : "var(--muted)",
                    opacity: 0.6,
                  }}
                />

                <div className="relative flex items-center justify-between gap-2 text-xs font-semibold">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMyVoted && (
                      <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                    <span
                      className="truncate"
                      style={{ color: "var(--foreground)" }}
                    >
                      {opt.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ color: "var(--muted-foreground)" }}>
                      {opt.votesCount}표
                    </span>
                    <span
                      className="font-bold min-w-8 text-right"
                      style={{ color: "var(--foreground)" }}
                    >
                      {percent}%
                    </span>
                  </div>
                </div>

                {!data.isAnonymous && opt.voterNames.length > 0 && (
                  <div
                    className="relative mt-1 text-[10px] truncate"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {opt.voterNames.join(", ")}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleOption(opt.id)}
              className="w-full flex items-center gap-2.5 p-2.5 md:p-3 rounded-xl border text-left transition-all hover:border-[var(--primary)]"
              style={{
                borderColor: isSelected ? "var(--primary)" : "var(--border)",
                background: isSelected
                  ? "rgba(168, 85, 247, 0.08)"
                  : "var(--card)",
              }}
            >
              <div
                className={`w-4 h-4 rounded-${
                  data.allowMultiple ? "md" : "full"
                } border flex items-center justify-center`}
                style={{
                  borderColor: isSelected ? "var(--primary)" : "var(--border)",
                  background: isSelected ? "var(--primary)" : "transparent",
                }}
              >
                {isSelected && (
                  <span className="text-white text-[10px] font-bold">✓</span>
                )}
              </div>
              <span
                className="text-xs font-medium truncate flex-1"
                style={{ color: "var(--foreground)" }}
              >
                {opt.text}
              </span>
            </button>
          );
        })}
      </div>

      {/* 하단 총 참여자 및 액션 */}
      <div
        className="flex items-center justify-between gap-2 pt-2.5 border-t text-xs flex-wrap"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--muted-foreground)" }}>
            총{" "}
            <strong style={{ color: "var(--foreground)" }}>
              {data.totalVotes}
            </strong>
            명 참여
          </span>
          {isClosed && (
            <span className="text-[11px] font-semibold text-purple-500">
              (투표가 종료되었습니다)
            </span>
          )}
        </div>

        {!isClosed ? (
          <div className="flex items-center gap-2">
            {showResults ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 rounded-lg border font-medium transition-all hover:bg-[var(--muted)]"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                다시 투표하기
              </button>
            ) : (
              <>
                {hasVoted && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-2.5 py-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    결과 보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleVote}
                  disabled={selectedIds.length === 0}
                  className="px-3.5 py-1 rounded-lg font-bold transition-all shadow-sm disabled:opacity-40"
                  style={{
                    background: "linear-gradient(135deg, #a855f7, #6366f1)",
                    color: "#ffffff",
                  }}
                >
                  투표하기
                </button>
              </>
            )}
          </div>
        ) : (
          data.expiresAt && isExpired && (
            <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              마감 일시: {new Date(data.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )
        )}
      </div>
    </div>
  );
}
