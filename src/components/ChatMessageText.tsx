import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const COLLAPSE_OVER = 300;

// 카카오톡처럼 긴 메시지는 앞부분만 보여주고 "전체보기"를 누르면 전문을 크게 보여준다.
export default function ChatMessageText({ text, mine }: { text: string; mine: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (text.length <= COLLAPSE_OVER) return <>{text}</>;
  return (
    <>
      {text.slice(0, COLLAPSE_OVER).trimEnd()}…
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block mt-1.5 text-xs font-700 underline underline-offset-2"
        style={{ color: mine ? "rgba(255,255,255,0.9)" : "var(--primary)" }}
      >
        전체보기
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-label="메시지 전체보기" className="w-[min(92vw,640px)] max-h-[80vh] flex flex-col border" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 24px 70px rgba(15,18,53,0.25)", color: "var(--foreground)" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm font-700">메시지 전체보기</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="w-8 h-8 text-lg">×</button>
            </div>
            <div className="p-5 overflow-y-auto text-sm leading-relaxed" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
