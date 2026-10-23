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
// <script src="...">는 브라우저가 커스텀 헤더를 못 붙인다 — ngrok 무료 도메인은 이 헤더
// (ngrok-skip-browser-warning) 없이 오는 요청을 전부 "방문 경고" HTML 페이지로 가로채므로,
// script 태그로 바로 불러오면 그 경고 페이지가 JS인 척 로드되어 DocsAPI가 끝내 정의되지
// 않는다(ngrok 쪽 트래픽 정책으로 헤더를 강제해봐도 그 경고 페이지 자체는 우회되지 않음 —
// 무료 플랜 제한으로 보임). apiClient와 같은 방식으로 fetch에 헤더를 직접 실어 받은 뒤
// 내용을 그대로 실행하면, 커스텀 헤더를 못 붙이는 제약을 피해갈 수 있다.
function loadDocsApiScript(origin: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = (async () => {
    const res = await fetch(`${origin}/web-apps/apps/api/documents/api.js`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    const code = await res.text();
    const looksLikeHtml = /^\s*<!doctype/i.test(code);
    if (!res.ok || looksLikeHtml) {
      scriptLoadPromise = null;
      throw new Error("편집기 스크립트를 불러오지 못했습니다.");
    }
    // api.js 안의 getBasePath()는 DOM에서 "...api/documents/api.js"로 끝나는 src를 가진
    // <script> 태그를 찾아 그 경로를 자기 서버 주소로 쓴다(에디터 iframe이 그 주소 밑에서
    // 열린다). 내용을 인라인으로 실행하면 이 태그엔 src가 없어 getBasePath()가 빈 문자열을
    // 돌려주고, 에디터 iframe이 우리 앱 자신의 주소로 열려버린다(지금 재현된 버그 — 편집기
    // 대신 우리 앱 화면이 모달 안에 떠 보임). type을 스크립트가 아닌 값으로 둬서 브라우저가
    // 실행·재요청 없이 src 속성만 갖게 하는 "표지" 태그를 하나 더 둔다.
    const marker = document.createElement("script");
    marker.type = "application/json";
    marker.src = `${origin}/web-apps/apps/api/documents/api.js`;
    document.body.appendChild(marker);
    const script = document.createElement("script");
    script.textContent = code;
    document.body.appendChild(script);
    if (!window.DocsAPI) {
      scriptLoadPromise = null;
      throw new Error("편집기 스크립트를 불러오지 못했습니다.");
    }
  })();
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
              변환 중... (워드/엑셀/PPT를 편집 가능한 형태로 바꾸는 중이에요)
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
