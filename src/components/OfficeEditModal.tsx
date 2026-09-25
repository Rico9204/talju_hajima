import { useEffect, useRef, useState } from "react";
import { getOnlyofficeConfig, type OnlyofficeConfig } from "../api/backend/files";
import { buildBackendHttpOrigin } from "../lib/quickEdit";

// 워드/엑셀/PPT를 브라우저 안에서 진짜로 열고 편집한다 — 우리 자체 Yjs 협업 인프라가 아니라
// 백엔드에 붙여둔 OnlyOffice Document Server(도커)의 편집기를 iframe으로 그대로 띄운다.
// DocsAPI.js와 편집기 내부 요청은 전부 백엔드(프록시)를 거치므로 별도 도메인/터널이 필요 없다.

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        containerId: string,
        config: Record<string, unknown> & { events?: Record<string, (...args: unknown[]) => void> },
      ) => { destroyEditor: () => void };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;
function loadDocsApiScript(origin: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${origin}/web-apps/apps/api/documents/api.js`;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("편집기 스크립트를 불러오지 못했습니다."));
    };
    document.body.appendChild(script);
  });
  return scriptLoadPromise;
}

const CONTAINER_ID = "onlyoffice-editor-container";

export default function OfficeEditModal({
  projectId,
  fileId,
  filePath,
  onClose,
}: {
  projectId: string;
  fileId: string;
  filePath: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function init() {
      try {
        const origin = buildBackendHttpOrigin();
        const [{ data: config }] = await Promise.all([getOnlyofficeConfig(projectId, fileId), loadDocsApiScript(origin)]);
        if (cancelled) return;
        if (!window.DocsAPI) throw new Error("편집기를 초기화하지 못했습니다.");
        editorRef.current = new window.DocsAPI.DocEditor(CONTAINER_ID, config as unknown as OnlyofficeConfig & Record<string, unknown>);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "편집기를 여는 중 오류가 발생했어요.");
        setLoading(false);
      }
    }
    void init();

    return () => {
      cancelled = true;
      editorRef.current?.destroyEditor();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fileId]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div
        className="w-full max-w-6xl h-[90vh] flex flex-col"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-sm font-700 truncate">📎 {filePath}</div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-lg shrink-0"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
          >
            ×
          </button>
        </div>
        <div className="flex-1 relative min-h-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>
              편집기를 불러오는 중...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-center px-6" style={{ color: "#ef4444" }}>
              <span>{error}</span>
              <span style={{ color: "var(--muted-foreground)" }}>편집 서버가 켜져 있는지 확인해주세요.</span>
            </div>
          )}
          <div id={CONTAINER_ID} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
