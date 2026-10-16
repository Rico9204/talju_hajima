import type { ChatToolPayload } from "../../lib/chatTools";
import LadderIcon from "./LadderIcon"

export default function ChatToolPreviewBubble({
  payload,
  onOpenOverlay,
}: {
  payload: ChatToolPayload;
  onOpenOverlay: () => void;
}) {
  if (payload.type === "draw") {
    const data = payload.data;
    const items = data?.items || [];
    const total = items.length;
    const openedCount = items.filter((it) => it.openedByMemberId || data?.allRevealed).length;
    const isFinished = Boolean(data?.allRevealed || (total > 0 && openedCount === total));
    const winnerCount = data.winnerCount ?? items.filter((i) => i.isWinner).length;

    return (
      <div
        className="w-72 sm:w-80 p-3.5 rounded-2xl border transition-all text-left shadow-sm"
        style={{
          background: "var(--card)",
          borderColor: "rgba(244, 63, 94, 0.3)",
          boxShadow: "0 4px 16px rgba(244, 63, 94, 0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "rgba(244, 63, 94, 0.15)", color: "#f43f5e" }}
            >
              <span>🎯</span>
              <span>제비뽑기</span>
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: isFinished ? "var(--muted)" : "rgba(34, 197, 94, 0.15)",
                color: isFinished ? "var(--muted-foreground)" : "#22c55e",
              }}
            >
              {isFinished ? "종료됨" : `${openedCount}/${total} 개봉`}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            {data?.creatorName || ""}
          </span>
        </div>

        <h4 className="text-sm font-bold truncate mb-1" style={{ color: "var(--foreground)" }}>
          {data?.title || "제비뽑기"}
        </h4>
        <p className="text-[11px] mb-3 truncate" style={{ color: "var(--muted-foreground)" }}>
          총 {total}명 (당첨 {winnerCount}명)
        </p>

        <button
          type="button"
          onClick={onOpenOverlay}
          className="w-full py-2 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
          style={{ background: "linear-gradient(135deg, #f43f5e, #fb7185)" }}
        >
          <span>🎯</span>
          <span>제비뽑기 열기</span>
          <span className="text-white/80">➔</span>
        </button>
      </div>
    );
  }

  if (payload.type === "ladder") {
    const data = payload.data;
    const participants = data?.participants || [];
    return (
      <div
        className="w-72 sm:w-80 p-3.5 rounded-2xl border transition-all text-left shadow-sm"
        style={{
          background: "var(--card)",
          borderColor: "rgba(59, 130, 246, 0.3)",
          boxShadow: "0 4px 16px rgba(59, 130, 246, 0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}
            >
              <LadderIcon />
              <span>사다리타기</span>
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: data?.revealed ? "var(--muted)" : "rgba(34, 197, 94, 0.15)",
                color: data?.revealed ? "var(--muted-foreground)" : "#22c55e",
              }}
            >
              {data?.revealed ? "발표 완료" : "준비 완료"}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            {data?.creatorName || ""}
          </span>
        </div>

        <h4 className="text-sm font-bold truncate mb-1" style={{ color: "var(--foreground)" }}>
          {data?.title || "사다리타기"}
        </h4>
        <p className="text-[11px] mb-3 truncate" style={{ color: "var(--muted-foreground)" }}>
          참가: {participants.map((p) => p.name).join(", ")}
        </p>

        <button
          type="button"
          onClick={onOpenOverlay}
          className="w-full py-2 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
        >
          <LadderIcon />
          <span>사다리타기 열기</span>
          <span className="text-white/80">➔</span>
        </button>
      </div>
    );
  }

  if (payload.type === "poll") {
    const data = payload.data;
    const isExpired = Boolean(
      data?.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()
    );
    const isClosed = data?.closed || isExpired;
    const options = data?.options || [];

    return (
      <div
        className="w-72 sm:w-80 p-3.5 rounded-2xl border transition-all text-left shadow-sm"
        style={{
          background: "var(--card)",
          borderColor: "rgba(168, 85, 247, 0.3)",
          boxShadow: "0 4px 16px rgba(168, 85, 247, 0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "rgba(168, 85, 247, 0.15)", color: "#a855f7" }}
            >
              <span>📊</span>
              <span>채팅 투표</span>
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: isClosed ? "var(--muted)" : "rgba(34, 197, 94, 0.15)",
                color: isClosed ? "var(--muted-foreground)" : "#22c55e",
              }}
            >
              {isClosed ? "마감됨" : "진행 중"}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            {data?.totalVotes ?? 0}명 참여
          </span>
        </div>

        <h4 className="text-sm font-bold truncate mb-1" style={{ color: "var(--foreground)" }}>
          {data?.question || "투표"}
        </h4>
        <p className="text-[11px] mb-3 truncate" style={{ color: "var(--muted-foreground)" }}>
          보기: {options.map((o) => o.text).join(", ")}
        </p>

        <button
          type="button"
          onClick={onOpenOverlay}
          className="w-full py-2 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
          style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
        >
          <span>📊</span>
          <span>{isClosed ? "투표 결과 확인하기" : "투표 참여 / 결과 보기"}</span>
          <span className="text-white/80">➔</span>
        </button>
      </div>
    );
  }

  if (payload.type === "roulette") {
    const data = payload.data;
    const isFinished = Boolean(data?.spinned);
    const options = data?.options || [];
    const winner = options.find((o) => o.id === data?.winnerOptionId);

    return (
      <div
        className="w-72 sm:w-80 p-3.5 rounded-2xl border transition-all text-left shadow-sm"
        style={{
          background: "var(--card)",
          borderColor: "rgba(245, 158, 11, 0.3)",
          boxShadow: "0 4px 16px rgba(245, 158, 11, 0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "rgba(245, 158, 11, 0.15)", color: "#d97706" }}
            >
              <span>🎡</span>
              <span>돌림판</span>
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: isFinished ? "var(--muted)" : "rgba(34, 197, 94, 0.15)",
                color: isFinished ? "var(--muted-foreground)" : "#22c55e",
              }}
            >
              {isFinished ? "결과 발표 완료" : "준비 완료"}
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            {data?.creatorName || ""}
          </span>
        </div>

        <h4 className="text-sm font-bold truncate mb-1" style={{ color: "var(--foreground)" }}>
          {data?.title || "돌림판"}
        </h4>
        <p className="text-[11px] mb-3 truncate" style={{ color: "var(--muted-foreground)" }}>
          {isFinished && winner
            ? `🎉 당첨: [${winner.text}]`
            : `항목: ${options.map((o) => o.text).join(", ")}`}
        </p>

        <button
          type="button"
          onClick={onOpenOverlay}
          className="w-full py-2 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
          style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)" }}
        >
          <span>🎡</span>
          <span>{isFinished ? "돌림판 결과 보기" : "돌림판 돌리기"}</span>
          <span className="text-white/80">➔</span>
        </button>
      </div>
    );
  }

  return null;
}
