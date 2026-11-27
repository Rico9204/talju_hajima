import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * 게시판 게시글·댓글 작성 시 금지어(비속어)가 감지되면 화면 위에 표시하는 경고 오버레이.
 */
export default function ProfanityAlertOverlay({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [message, onClose]);

  if (!message) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[70] p-4"
      style={{ background: "rgba(15,18,53,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="금지어 사용 알림"
        className="w-96 max-w-full p-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          boxShadow: "0 24px 64px rgba(15,18,53,0.22)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        <div
          className="w-11 h-11 flex items-center justify-center text-lg font-800 mb-3"
          style={{ background: "#ef444418", color: "#ef4444", borderRadius: "12px" }}
          aria-hidden="true"
        >
          !
        </div>
        <h3 className="text-base font-800 mb-1.5" style={{ color: "var(--foreground)" }}>
          금지어 사용이 감지되었습니다
        </h3>
        <p className="text-sm leading-relaxed mb-2" style={{ color: "var(--foreground)" }}>
          {message}
        </p>
        <p className="text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>
          금지어(비속어)를 수정한 뒤 다시 시도해 주세요.
        </p>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="w-full py-2.5 text-sm font-700 transition-all hover:opacity-95"
          style={{
            background: "#ef4444",
            color: "#fff",
            borderRadius: "40px",
            boxShadow: "0 4px 12px rgba(239,68,68,0.28)",
          }}
        >
          확인
        </button>
      </div>
    </div>,
    document.body
  );
}
