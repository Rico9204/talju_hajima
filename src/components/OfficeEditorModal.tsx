import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dataRepository } from "../api";
import { backendOrigin } from "../api/rest/backendUrl";

// 워드·엑셀·PPT를 앱 안에서 편집(OnlyOffice 문서 서버, Temporary_Merge에서 이식).
// 편집기 스크립트는 API 서버의 /onlyoffice/ 아래(문서 서버 중계)에서 받고, 설정은 서버가 서명해 준다.
// 저장은 문서 서버가 서버로 직접 보내고(자동 저장·닫을 때), 새 버전은 실시간으로 파일 목록에 나타난다.

interface DocsEditor { destroyEditor(): void }
declare global {
  interface Window { DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown> & { events?: Record<string, (event?: unknown) => void> }) => DocsEditor } }
}

let scriptPromise: Promise<void> | null = null;

function loadEditorScript(): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${backendOrigin()}/onlyoffice/web-apps/apps/api/documents/api.js`;
    script.async = true;
    script.onload = () => (window.DocsAPI ? resolve() : reject(new Error("편집기 스크립트를 불러오지 못했습니다.")));
    script.onerror = () => reject(new Error("오피스 문서 서버에 연결하지 못했습니다."));
    document.head.appendChild(script);
  }).catch((error) => { scriptPromise = null; throw error; });
  return scriptPromise;
}

const isNgrok = (() => { try { return /\.(ngrok-free\.dev|ngrok-free\.app|ngrok\.app|ngrok\.io)$/.test(new URL(backendOrigin()).hostname); } catch { return false; } })();

export const OFFICE_EXTENSIONS = ["docx", "xlsx", "pptx"];
export const isOfficeEditable = (name: string) => OFFICE_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");

// 서버에 오피스 편집이 켜져 있는지(한 번만 묻는다).
let statusPromise: Promise<boolean> | null = null;
export function officeEditorEnabled(): Promise<boolean> {
  statusPromise ??= dataRepository.getOfficeEditorStatus().then((s) => s.enabled).catch(() => { statusPromise = null; return false; });
  return statusPromise;
}

export default function OfficeEditorModal({ fileId, fileName, readOnly, onClose }: { fileId: number; fileName: string; readOnly: boolean; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const editor = useRef<DocsEditor | null>(null);
  // 편집기는 자리 표시 요소를 iframe으로 바꿔 끼운다 — React가 관리하지 않는 요소를 만들어 넘긴다.
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let revealTimer: number | undefined;
    (async () => {
      try {
        const [config] = await Promise.all([dataRepository.getOfficeEditorConfig(fileId), loadEditorScript()]);
        if (cancelled || !window.DocsAPI || !container.current) return;
        const holder = document.createElement("div");
        holder.id = `office-editor-${fileId}-${Date.now()}`;
        container.current.appendChild(holder);
        const ready = () => { if (!cancelled) setLoading(false); };
        editor.current = new window.DocsAPI.DocEditor(holder.id, {
          ...config, width: "100%", height: "100%", type: "desktop",
          events: { onAppReady: ready, onError: () => { if (!cancelled) { setError("편집기를 열지 못했습니다."); setLoading(false); } } },
        });
        // 준비 신호가 안 오면(ngrok 안내 페이지가 편집기 자리에 뜬 경우 등) 가림막을 걷어 안의 화면을 보이게 한다.
        revealTimer = window.setTimeout(ready, isNgrok ? 4000 : 20000);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "편집기를 열지 못했습니다."); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      try { editor.current?.destroyEditor(); } catch { /* 이미 닫힘 */ }
      editor.current = null;
      if (container.current) container.current.innerHTML = "";
    };
  }, [fileId]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--background)" }} role="dialog" aria-label={`${fileName} 오피스 편집`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="min-w-0">
          <div className="text-sm font-700 truncate">{fileName}</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {readOnly ? "종료된 프로젝트라 보기만 할 수 있어요." : "변경 내용은 자동으로 새 버전으로 저장돼요. 다른 팀원과 동시에 편집할 수 있어요."}
          </div>
        </div>
        <button onClick={onClose} className="text-xs font-700 px-3 py-1.5 rounded-full shrink-0" style={{ background: "var(--muted)" }}>닫기</button>
      </div>
      {isNgrok && !error && (
        <p className="text-xs px-4 py-2 shrink-0" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
          편집 화면에 ngrok 안내 페이지가 보이면 <b>Visit Site</b>를 한 번 눌러 주세요. Safari처럼 다른 사이트 쿠키를 막는 브라우저에서는 열리지 않을 수 있어요(Chrome·Edge 권장).
        </p>
      )}
      <div className="flex-1 min-h-0 relative">
        {/* 편집기 자체 로딩 화면(외부 편집기 이름이 나옴)을 덮는 가림막 — 편집기가 준비되면 걷힌다. */}
        {loading && <p role="status" className="absolute inset-0 z-10 flex items-center justify-center text-sm" style={{ background: "var(--background)", color: "var(--muted-foreground)" }}>편집기를 불러오는 중…</p>}
        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-700">{error}</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>오피스 문서 서버가 꺼져 있을 수 있어요. 서버를 운영하는 팀원에게 문의해 주세요.</p>
          </div>
        )}
        <div ref={container} className="w-full h-full" />
      </div>
    </div>,
    document.body,
  );
}
