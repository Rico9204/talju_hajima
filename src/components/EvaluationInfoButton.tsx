import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EVALUATION_GUIDE, type EvaluationGuideSection } from "../lib/evaluationGuide";

// 평가 점수 옆의 ⓘ. 누르면 평가 점수 안내 창이 열리고 해당 항목으로 바로 이동한다.
// 화면에는 점수와 짧은 상태만 두고, 계산 방식·공개 조건 같은 설명은 모두 이 창에서 본다.
export default function EvaluationInfoButton({ section, light = false }: { section: EvaluationGuideSection; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const title = EVALUATION_GUIDE.find((s) => s.id === section)?.title ?? "평가 점수 안내";
  return <>
    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={`${title} 설명 보기`} title={`${title} 설명 보기`}
      className="inline-flex items-center justify-center w-4 h-4 shrink-0 align-middle rounded-full text-[10px] font-800 leading-none transition-opacity hover:opacity-70"
      style={{ border: `1.5px solid ${light ? "rgba(255,255,255,0.75)" : "var(--muted-foreground)"}`, color: light ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)", fontFamily: "Georgia, serif" }}>
      i
    </button>
    {open && <EvaluationGuide section={section} onClose={() => setOpen(false)} />}
  </>;
}

function EvaluationGuide({ section, onClose }: { section: EvaluationGuideSection; onClose: () => void }) {
  const [active, setActive] = useState(section);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 다른 창(프로필 등) 위에 열리므로 Esc는 이 창만 닫는다.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    body.current?.querySelector(`[data-guide-section="${active}"]`)?.scrollIntoView({ block: "start" });
  }, [active]);

  // 포털이어도 React 이벤트는 컴포넌트 트리를 따라 올라가므로, 바깥 창의 클릭 처리(닫기 등)에 닿지 않게 막는다.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.42)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="evaluation-guide-title" className="w-full max-w-3xl h-[min(80vh,640px)] flex flex-col"
        style={{ background: "var(--background)", color: "var(--foreground)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.32)" }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 id="evaluation-guide-title" className="text-base font-800">평가 점수 안내</h2>
          <button type="button" onClick={onClose} aria-label="안내 닫기" className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--muted)]">✕</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <nav aria-label="안내 항목" className="flex md:flex-col gap-1 p-3 md:w-48 shrink-0 overflow-x-auto md:overflow-y-auto" style={{ borderBottom: "1px solid var(--border)" }}>
            {EVALUATION_GUIDE.map((s) => <button key={s.id} type="button" onClick={() => setActive(s.id)} aria-current={active === s.id}
              className="px-3 py-2 text-left text-xs font-700 shrink-0 whitespace-nowrap md:whitespace-normal transition-colors"
              style={{ borderRadius: "10px", background: active === s.id ? "var(--primary)" : "transparent", color: active === s.id ? "#fff" : "var(--foreground)" }}>
              {s.title}
            </button>)}
          </nav>
          <div ref={body} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-4">
            {EVALUATION_GUIDE.map((s) => <section key={s.id} data-guide-section={s.id} aria-labelledby={`evaluation-guide-${s.id}`} className="p-4 scroll-mt-2"
              style={{ background: "var(--card)", borderRadius: "var(--radius)", outline: active === s.id ? "2px solid var(--primary)" : "none" }}>
              <h3 id={`evaluation-guide-${s.id}`} className="text-sm font-800 mb-2">{s.title}</h3>
              <ul className="space-y-1.5 text-xs leading-relaxed list-disc pl-4" style={{ color: "var(--muted-foreground)" }}>
                {s.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
