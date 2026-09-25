import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { findMentions, isMentionForMember } from "../lib/chatMentions";

const COLLAPSE_OVER = 300;

// 멘션(@팀원 이름, @전체)만 배지로 강조한다. 판정 기준은 lib/chatMentions(메일 주소·이름 일부 제외).
export function renderMentionText(text: string, mine: boolean, myName?: string, mentionNames: string[] = []): ReactNode {
  const ranges = findMentions(text, myName ? [...mentionNames, myName] : mentionNames);
  if (ranges.length === 0) return text;
  const out: ReactNode[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) out.push(text.slice(pos, r.start));
    const isMe = !!myName && isMentionForMember(text.slice(r.start, r.end), myName);
    out.push(
      <span
        key={r.start}
        className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded font-700 text-xs transition-all"
        style={{
          background: mine ? "rgba(255, 255, 255, 0.28)" : isMe ? "rgba(239, 68, 68, 0.18)" : "rgba(37, 99, 235, 0.15)",
          color: mine ? "#fff" : isMe ? "#ef4444" : "var(--primary)",
          boxShadow: isMe && !mine ? "0 0 0 1px rgba(239, 68, 68, 0.3)" : undefined,
        }}
      >
        {text.slice(r.start, r.end)}
      </span>,
    );
    pos = r.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

// 카카오톡처럼 긴 메시지는 앞부분만 보여주고 "전체보기"를 누르면 전문을 크게 보여준다.
export default function ChatMessageText({ text, mine, myName, mentionNames = [] }: { text: string; mine: boolean; myName?: string; mentionNames?: string[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  if (text.length <= COLLAPSE_OVER) return <>{renderMentionText(text, mine, myName, mentionNames)}</>;
  return (
    <>
      {renderMentionText(text.slice(0, COLLAPSE_OVER).trimEnd(), mine, myName, mentionNames)}…
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
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => void copyAll()} aria-label="전체 복사" title="전체 복사" className="h-8 px-2 flex items-center gap-1 text-xs font-700 rounded-lg" style={{ color: copied ? "var(--primary)" : "var(--foreground)" }}>
                  {copied ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
                  )}
                  {copied ? "복사됨" : "복사"}
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="w-8 h-8 text-lg">×</button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto text-sm leading-relaxed" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderMentionText(text, false, myName, mentionNames)}</div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
