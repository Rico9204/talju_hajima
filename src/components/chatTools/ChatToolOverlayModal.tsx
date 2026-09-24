import { useEffect } from "react";
import type { ChatToolPayload, ChatToolActionPayload } from "../../lib/chatTools";
import ChatLuckyDrawCard from "./ChatLuckyDrawCard";
import ChatLadderCard from "./ChatLadderCard";
import ChatPollCard from "./ChatPollCard";
import ChatRouletteCard from "./ChatRouletteCard";

export default function ChatToolOverlayModal({
  isOpen,
  onClose,
  toolPayload,
  messageId,
  currentMemberId,
  currentMemberName,
  onSendAction,
}: {
  isOpen: boolean;
  onClose: () => void;
  toolPayload: ChatToolPayload | null;
  messageId: number | null;
  currentMemberId: string;
  currentMemberName: string;
  onSendAction: (action: ChatToolActionPayload) => void;
}) {
  // ESC 키로 닫기
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !toolPayload || messageId === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      style={{
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 닫기 플로팅 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-30 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
          title="닫기"
        >
          ✕
        </button>

        {toolPayload.type === "draw" && (
          <ChatLuckyDrawCard
            data={toolPayload.data}
            currentMemberId={currentMemberId}
            currentMemberName={currentMemberName}
            onPick={(itemId) =>
              onSendAction({
                targetMessageId: messageId,
                action: "draw_pick",
                memberId: currentMemberId,
                memberName: currentMemberName,
                itemId,
              })
            }
            onRevealAll={() =>
              onSendAction({
                targetMessageId: messageId,
                action: "draw_reveal_all",
                memberId: currentMemberId,
                memberName: currentMemberName,
              })
            }
          />
        )}

        {toolPayload.type === "ladder" && (
          <ChatLadderCard
            data={toolPayload.data}
            onReveal={() =>
              onSendAction({
                targetMessageId: messageId,
                action: "ladder_reveal",
                memberId: currentMemberId,
                memberName: currentMemberName,
              })
            }
          />
        )}

        {toolPayload.type === "poll" && (
          <ChatPollCard
            data={toolPayload.data}
            currentMemberId={currentMemberId}
            currentMemberName={currentMemberName}
            onVote={(optionIds) =>
              onSendAction({
                targetMessageId: messageId,
                action: "poll_vote",
                memberId: currentMemberId,
                memberName: currentMemberName,
                optionIds,
              })
            }
            onClose={() =>
              onSendAction({
                targetMessageId: messageId,
                action: "poll_close",
                memberId: currentMemberId,
                memberName: currentMemberName,
              })
            }
          />
        )}

        {toolPayload.type === "roulette" && (
          <ChatRouletteCard
            data={toolPayload.data}
            currentMemberId={currentMemberId}
            currentMemberName={currentMemberName}
            onSpin={(winnerOptionId, targetAngle) =>
              onSendAction({
                targetMessageId: messageId,
                action: "roulette_spin",
                memberId: currentMemberId,
                memberName: currentMemberName,
                winnerOptionId,
                targetAngle,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
