import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dataRepository } from "../api";
import { backendOrigin } from "../api/rest/backendUrl";
import type { CollabEditor, CollabPresence } from "../lib/collab";
import type { WorkspaceFile } from "../api/types";
import { buildFullTextDiff } from "../lib/textDiff";
import { fileOriginalAuthor } from "../lib/workspaceFiles";
import EditorAvatars from "./EditorAvatars";

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

const FULL_KEY = "collabpeer.office-editor-full";

export const OFFICE_EXTENSIONS = ["docx", "xlsx", "pptx"];
export const isOfficeEditable = (name: string) => OFFICE_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");

// 서버에 오피스 편집이 켜져 있는지(한 번만 묻는다).
let statusPromise: Promise<boolean> | null = null;
export function officeEditorEnabled(): Promise<boolean> {
  statusPromise ??= dataRepository.getOfficeEditorStatus().then((s) => s.enabled).catch(() => { statusPromise = null; return false; });
  return statusPromise;
}

export default function OfficeEditorModal({
  file,
  fileId,
  fileName,
  readOnly,
  presence = null,
  editors = [],
  onClose,
}: {
  file?: WorkspaceFile;
  fileId: number;
  fileName: string;
  readOnly: boolean;
  presence?: CollabPresence | null;
  editors?: CollabEditor[];
  onClose: () => void;
}) {
  const officeEditors = editors.filter((e) => e.fileId === fileId && e.mode === "office");
  useEffect(() => {
    if (!presence || readOnly) return;
    presence.track({ fileId, room: 0, mode: "office" });
    return () => presence.track(null);
  }, [presence, fileId, readOnly]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [hasOnlyOfficeIframe, setHasOnlyOfficeIframe] = useState(false);
  const editor = useRef<DocsEditor | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  const [full, setFull] = useState(() => { try { return localStorage.getItem(FULL_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(FULL_KEY, full ? "1" : "0"); } catch {} }, [full]);

  // 원작자 정보 및 타인 수정 여부 판별
  const originalAuthor = file ? fileOriginalAuthor(file) : null;
  const currentVersion = file?.versions.find((v) => v.current);
  const latestEditor = currentVersion?.uploadedBy?.trim() || originalAuthor;
  const isOtherEditor = Boolean(latestEditor && originalAuthor && latestEditor !== originalAuthor);

  // 타인 수정 표시 온/오프 상태 (기본값 true)
  const [showOtherEditorMarks, setShowOtherEditorMarks] = useState<boolean>(true);

  // 타인 수정 내역 사이드 패널 열림/닫힘 상태
  const [showDiffPanel, setShowDiffPanel] = useState<boolean>(isOtherEditor);

  function toggleOtherEditorMarks() {
    setShowOtherEditorMarks((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("talju:workspace:showOtherEditorMarks", String(next));
      } catch {}
      return next;
    });
  }

  // 원작자 최초 버전 vs 현재 버전 텍스트 diff 계산
  const firstVersion = useMemo(() => {
    if (!file) return null;
    return [...file.versions].sort((a, b) => a.id - b.id)[0] ?? null;
  }, [file]);

  const lines = useMemo(() => {
    if (!file || !firstVersion || !currentVersion) return [];
    const origText = firstVersion.searchText || "";
    const curText = currentVersion.searchText || "";
    if (!origText && !curText) return [];
    return buildFullTextDiff(origText, curText);
  }, [file, firstVersion, currentVersion]);

  const changedLines = useMemo(() => lines.filter((l) => l.changed), [lines]);

  useEffect(() => {
    let cancelled = false;
    let revealTimer: number | undefined;
    (async () => {
      try {
        const [config] = await Promise.all([
          dataRepository.getOfficeEditorConfig(fileId).catch(() => null),
          loadEditorScript().catch(() => null),
        ]);
        if (cancelled || !container.current) return;

        const docConfig = config as { document?: { url?: string } } | null;
        const validUrl = Boolean(docConfig?.document?.url && docConfig.document.url.startsWith("http"));

        if (window.DocsAPI?.DocEditor && validUrl) {
          const holder = document.createElement("div");
          holder.id = `office-editor-${fileId}-${Date.now()}`;
          container.current.appendChild(holder);
          const reveal = () => { if (!cancelled) setLoading(false); };
          editor.current = new window.DocsAPI.DocEditor(holder.id, {
            ...config, width: "100%", height: "100%", type: "desktop",
            events: {
              onAppReady: () => { if (!cancelled) { setReady(true); setLoading(false); setHasOnlyOfficeIframe(true); } },
              onError: () => { if (!cancelled) { setError("편집기를 열지 못했습니다."); setLoading(false); } },
            },
          });
          revealTimer = window.setTimeout(reveal, isNgrok ? 4000 : 20000);
        } else {
          // 문서 서버가 미설치/오프라인이거나 fixture 환경일 때 alert를 띄우지 않고 텍스트 뷰어로 표시
          setLoading(false);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "편집기를 열지 못했습니다.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      try { editor.current?.destroyEditor(); } catch {}
      editor.current = null;
      if (container.current) container.current.innerHTML = "";
    };
  }, [fileId]);

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${full ? "" : "p-3 sm:p-6"}`} style={{ background: full ? "var(--card)" : "rgba(15,23,42,0.5)" }} role="dialog" aria-modal="true" aria-label={`${fileName} 오피스 편집`}>
      <div className={`w-full flex flex-col overflow-hidden ${full ? "h-full" : "max-w-7xl h-[92vh]"}`} style={{ background: "var(--card)", borderRadius: full ? 0 : "var(--radius)", boxShadow: full ? "none" : "0 24px 64px rgba(15,18,53,0.28)" }}>
        {/* 상단 툴바 */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-sm font-700 truncate">📎 {fileName}</span>
            {readOnly && <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>보기 전용</span>}
            {!hasOnlyOfficeIframe && <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>오피스 뷰어</span>}
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0 flex-wrap">
            {officeEditors.length > 0 && <EditorAvatars editors={officeEditors} size={26} max={6} />}
            {isOtherEditor && (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showOtherEditorMarks}
                  onClick={toggleOtherEditorMarks}
                  className="h-8 px-2.5 rounded-full text-xs font-600 flex items-center gap-1.5 border transition-all"
                  style={{
                    background: showOtherEditorMarks ? "rgba(245, 158, 11, 0.15)" : "var(--muted)",
                    borderColor: showOtherEditorMarks ? "rgba(245, 158, 11, 0.4)" : "var(--border)",
                    color: showOtherEditorMarks ? "#d97706" : "var(--muted-foreground)",
                  }}
                  title="원작자가 아닌 다른 사람이 수정한 내용 표시를 켜거나 끕니다"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: showOtherEditorMarks ? "#ea580c" : "var(--muted-foreground)" }} />
                  <span>타인({latestEditor}) 수정 표시 {showOtherEditorMarks ? "ON" : "OFF"}</span>
                </button>
                {showOtherEditorMarks && (
                  <button
                    type="button"
                    onClick={() => setShowDiffPanel((v) => !v)}
                    className="h-8 px-2.5 rounded-full text-xs font-600 flex items-center gap-1.5 border transition-all"
                    style={{
                      background: showDiffPanel ? "rgba(245, 158, 11, 0.2)" : "var(--muted)",
                      borderColor: showDiffPanel ? "#ea580c" : "var(--border)",
                      color: showDiffPanel ? "#ea580c" : "var(--foreground)",
                    }}
                    title="타인이 수정한 줄 단위 변경 내역 패널을 열거나 닫습니다"
                  >
                    <span>📋 수정 내역 ({changedLines.length}줄) {showDiffPanel ? "접기" : "보기"}</span>
                  </button>
                )}
              </>
            )}
            <button onClick={() => setFull((value) => !value)} aria-pressed={full} title={full ? "원래 크기로" : "브라우저 화면에 꽉 차게"} className="h-8 px-3 flex items-center gap-1.5 text-xs font-700 shrink-0" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "10px" }}>
              <span aria-hidden="true" className="text-sm">{full ? "⤡" : "⤢"}</span>{full ? "축소" : "확장"}
            </button>
            <button onClick={onClose} aria-label="닫기" title="닫기" className="w-8 h-8 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>×</button>
          </div>
        </div>

        {/* 타인 수정 안내 배너 */}
        {isOtherEditor && showOtherEditorMarks && (
          <div
            className="px-5 py-2 text-xs flex items-center justify-between gap-2 border-b shrink-0"
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              borderColor: "rgba(245, 158, 11, 0.25)",
              color: "#b45309",
            }}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>✏️</span>
              <span>원작자 <strong>{originalAuthor}</strong> 님이 아닌 <strong>{latestEditor}</strong> 님이 수정한 파일입니다. {changedLines.length > 0 ? `(우측 패널에서 바뀐 ${changedLines.length}개 줄 확인 가능)` : ""}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDiffPanel((v) => !v)}
                className="text-[11px] font-600 underline underline-offset-2 opacity-90 hover:opacity-100"
              >
                수정 내역 {showDiffPanel ? "패널 접기" : "패널 열기"}
              </button>
              <button
                type="button"
                onClick={toggleOtherEditorMarks}
                className="text-[11px] underline underline-offset-2 opacity-75 hover:opacity-100"
              >
                표시 끄기
              </button>
            </div>
          </div>
        )}

        {/* ngrok 안내 페이지가 편집기 자리에 뜰 수 있는 동안만 */}
        {isNgrok && hasOnlyOfficeIframe && !ready && !error && (
          <p className="text-xs px-5 py-2 shrink-0" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
            편집 화면에 ngrok 안내 페이지가 보이면 <b>Visit Site</b>를 한 번 눌러 주세요. Safari처럼 다른 사이트 쿠키를 막는 브라우저에서는 열리지 않을 수 있어요(Chrome·Edge 권장).
          </p>
        )}

        {/* 편집기 및 우측 타인 수정 내역 패널 영역 */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          {/* 좌측: OnlyOffice 편집기 또는 오피스 텍스트 뷰어 */}
          <div className="flex-1 min-w-0 h-full relative overflow-auto p-4 flex flex-col items-center" style={{ background: "var(--muted)" }}>
            {loading && <p role="status" className="absolute inset-0 z-10 flex items-center justify-center text-sm" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>편집기를 불러오는 중…</p>}
            {error && (
              <div role="alert" className="p-4 mb-3 rounded-lg border text-center text-xs w-full max-w-3xl" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#ef4444" }}>
                {error} (문서 서버가 오프라인이므로 본문 텍스트 뷰어로 표시합니다)
              </div>
            )}

            {/* 실제 OnlyOffice 컨테이너 (서버가 있을 때 여기에 iframe이 마운트됨) */}
            <div ref={container} className={`w-full h-full ${hasOnlyOfficeIframe ? "block" : "hidden"}`} />

            {/* 서버 미연결/뷰어 모드일 때 보여주는 깔끔한 문서 본문 뷰어 (A4 스타일) */}
            {!hasOnlyOfficeIframe && !loading && (
              <div className="w-full max-w-3xl min-h-[500px] p-8 rounded-lg border shadow-sm my-auto" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between pb-3 mb-4 border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  <div className="flex items-center gap-2">
                    <span className="font-700 text-sm" style={{ color: "var(--foreground)" }}>{fileName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-600" style={{ background: "var(--muted)" }}>{currentVersion?.version || "최신본"}</span>
                  </div>
                  <span>최종 수정: {latestEditor}</span>
                </div>

                <div className="space-y-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                  {lines.length > 0 ? (
                    lines.map((l, i) => {
                      const isHighlighted = isOtherEditor && showOtherEditorMarks && l.changed;
                      return (
                        <div
                          key={i}
                          className={`p-1.5 rounded transition-all ${isHighlighted ? "other-editor-highlight" : ""}`}
                          style={isHighlighted ? {
                            background: "rgba(249, 115, 22, 0.16)",
                            borderLeft: "4px solid #ea580c",
                            paddingLeft: "10px",
                          } : {}}
                        >
                          {isHighlighted && (
                            <span
                              className="inline-block mr-2 px-1.5 py-0.2 rounded text-[10px] font-700 select-none align-middle"
                              style={{
                                background: "rgba(234, 88, 12, 0.25)",
                                color: "#c2410c",
                                border: "1px solid rgba(234, 88, 12, 0.4)",
                              }}
                            >
                              {latestEditor} 수정
                            </span>
                          )}
                          <span className="whitespace-pre-wrap">{l.text || "\u00A0"}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-center py-12" style={{ color: "var(--muted-foreground)" }}>
                      문서 본문 텍스트가 비어 있거나 추출되지 않았습니다.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 우측: 타인 수정 내역 슬라이드 패널 */}
          {isOtherEditor && showOtherEditorMarks && showDiffPanel && (
            <aside
              className="w-80 md:w-96 border-l flex flex-col shrink-0 animate-in slide-in-from-right duration-200"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
              aria-label="타인 수정 내역 대조 패널"
            >
              <div className="p-3 border-b flex items-center justify-between gap-2 shrink-0" style={{ borderColor: "var(--border)", background: "rgba(245, 158, 11, 0.08)" }}>
                <div className="min-w-0">
                  <div className="text-xs font-700 flex items-center gap-1.5" style={{ color: "#d97706" }}>
                    <span>📋 타인({latestEditor}) 수정 내역</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-700" style={{ background: "rgba(234, 88, 12, 0.2)", color: "#c2410c" }}>{changedLines.length}줄 변경</span>
                  </div>
                  <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    원작자({originalAuthor}) 초안 대비 바뀐 내용
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiffPanel(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-xs font-700 opacity-70 hover:opacity-100"
                  style={{ background: "var(--muted)", color: "var(--foreground)" }}
                  title="패널 닫기"
                  aria-label="패널 닫기"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {changedLines.length > 0 ? (
                  changedLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg text-xs transition-all"
                      style={{
                        background: "rgba(249, 115, 22, 0.12)",
                        borderLeft: "4px solid #ea580c",
                        color: "var(--foreground)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-700"
                          style={{
                            background: "rgba(234, 88, 12, 0.25)",
                            color: "#c2410c",
                            border: "1px solid rgba(234, 88, 12, 0.4)",
                          }}
                        >
                          {latestEditor} 수정
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed select-text">
                        {line.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <p className="font-600 mb-1">추출된 텍스트 변경 내용이 없습니다.</p>
                    <p className="text-[11px]">서식·도형만 변경되었거나 버전 텍스트를 추출 중일 수 있습니다.</p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
