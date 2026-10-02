import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 되돌릴 수 없는 작업(삭제 등) 전에 한 번 더 묻는 창. 팀원 제외 확인 창과 같은 모양.
// onConfirm이 끝나면 닫히고, 실패하면 창을 그대로 두고 오류를 보여 준다(다시 시도하거나 취소).
export default function ConfirmDialog({ title, message, confirmLabel = "삭제", onConfirm, onClose }: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "처리하지 못했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }} onClick={() => { if (!busy) onClose(); }}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-96 max-w-full p-6" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
        <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#ef444418", borderRadius: "12px" }}>✕</div>
        <h3 className="font-700 mb-1">{title}</h3>
        <div className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>{message}</div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" autoFocus onClick={onClose} disabled={busy} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>
            취소
          </button>
          <button type="button" disabled={busy} onClick={() => void confirm()} className="flex-1 py-2.5 text-sm font-700 transition-all disabled:opacity-60" style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}>
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ConfirmRequest = { title: string; message: ReactNode; confirmLabel?: string };

// 브라우저 기본 confirm() 대신 쓰는 훅: `if (!(await ask({ title, message }))) return;`
// 돌려준 dialog 요소를 화면 어딘가에 그려 둬야 한다.
export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const ask = useCallback((options: ConfirmRequest) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })), []);
  const dialog = request ? (
    <ConfirmDialog
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      onConfirm={() => request.resolve(true)}
      onClose={() => { request.resolve(false); setRequest(null); }}
    />
  ) : null;
  return [ask, dialog] as const;
}
