import { useEffect, useRef, useState } from "react";
import { useProject } from "../context/ProjectContext";

function errorMessage(error: unknown): string {
  return (error as { message?: string })?.message ?? "삭제하지 못했습니다. 다시 시도해 주세요.";
}

export default function WorkspaceDeleteActions({ item, kind, fileCount = 0, onDeleted }: {
  item: { id: number; name: string; ownerUserId?: string | null };
  kind: "file" | "folder";
  fileCount?: number;
  onDeleted?: () => void;
}) {
  const { project, currentMember, isManager, deleteWorkspaceFile, deleteWorkspaceFolder } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (project.status === "done" || !currentMember || !(isManager || (item.ownerUserId && item.ownerUserId === currentMember.userId))) return null;
  const nonempty = kind === "folder" && fileCount > 0;
  async function remove() {
    if (pending.current || nonempty) return;
    const detail = kind === "file" ? "모든 버전과 댓글도 함께 삭제되며 복구할 수 없습니다." : "폴더를 삭제하면 복구할 수 없습니다.";
    if (!window.confirm(`“${item.name}” ${kind === "file" ? "파일" : "폴더"}을 삭제하시겠습니까?\n${detail}`)) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (kind === "file") await deleteWorkspaceFile(item.id);
      else await deleteWorkspaceFolder(item.id);
      if (mounted.current) onDeleted?.();
    } catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className={kind === "file" ? "shrink-0 text-right text-xs max-w-[50%]" : "mb-4 text-xs"}>
    <button disabled={busy || nonempty} onClick={() => void remove()} className="rounded-full px-3 py-2 font-600 whitespace-nowrap text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50">
      {busy ? "삭제 중…" : `${kind === "file" ? "파일" : "폴더"} 삭제`}
    </button>
    {nonempty && <p className="mt-1" style={{ color: "var(--muted-foreground)" }}>폴더 안의 파일을 먼저 삭제해 주세요.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </div>;
}

// Retry persisted cleanup after reload, including a lost deletion response.
export function WorkspaceCleanupNotice() {
  const { project, files, pendingWorkspaceCleanup, cleanupWorkspaceFiles } = useProject();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState("idle");
    void (async () => {
      try {
        const pending = await pendingWorkspaceCleanup();
        if (cancelled || !pending.length) return;
        setState("busy");
        await cleanupWorkspaceFiles();
        if (!cancelled) setState("idle");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [project.id, files, attempt]);
  if (state === "idle") return null;
  return <div role={state === "error" ? "alert" : "status"} className="mb-4 text-sm">
    {state === "busy" ? "삭제한 파일의 원본을 정리하고 있습니다…" : <>
      파일 삭제 후 원본 정리를 완료하지 못했습니다.
      <button className="ml-2 underline" onClick={() => setAttempt((n) => n + 1)}>다시 시도</button>
    </>}
  </div>;
}
