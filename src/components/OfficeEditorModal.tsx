import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dataRepository } from "../api";
import { backendOrigin } from "../api/rest/backendUrl";
import type { WorkspaceFile } from "../api/types";
import type { CollabEditor, CollabPresence } from "../lib/collab";
import { fileEditStatus, linesChangedFromOriginal, originalVersion } from "../lib/workspaceFiles";
import { useOtherEditMarks } from "../hooks/useOtherEditMarks";
import EditorAvatars from "./EditorAvatars";
import OtherEditNotice from "./OtherEditNotice";
import AddFontModal from "./AddFontModal";
import { injectAllWebFonts } from "../lib/editorFonts";

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

const FULL_KEY = "collabpeer.office-editor-full";

// .hwp(바이너리 한글)는 OnlyOffice가 hwp로 저장하지 못해(docx로 바뀌어 원본이 깨짐) 넣지 않는다. .hwpx는 자체 한글 편집기로 연다.
export const OFFICE_EXTENSIONS = ["docx", "xlsx", "pptx"];
export const isOfficeEditable = (name: string) => OFFICE_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");

// 서버에 오피스 편집이 켜져 있는지(한 번만 묻는다).
let statusPromise: Promise<boolean> | null = null;
export function officeEditorEnabled(): Promise<boolean> {
  statusPromise ??= dataRepository.getOfficeEditorStatus().then((s) => { if (s.enabled) warmOfficeEditor(); return s.enabled; }).catch(() => { statusPromise = null; return false; });
  return statusPromise;
}

// 편집 버튼을 누르기 전에 편집기 서버와의 연결(DNS·TCP·TLS)을 열어 두고 편집기 스크립트(api.js)를 받아 둔다.
// 터널을 거치면 연결을 새로 맺는 데만 0.4초 안팎이 걸려서, 버튼을 누른 뒤의 대기 시간을 줄인다. 실패해도 조용히 넘어가고(열 때 다시 시도) 화면은 영향이 없다.
let warmed = false;
export function warmOfficeEditor(): void {
  if (warmed || typeof document === "undefined") return;
  warmed = true;
  try {
    const origin = backendOrigin();
    if (origin && !document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      document.head.appendChild(link);
    }
  } catch { /* 연결 미리 열기는 선택 사항 */ }
  void loadEditorScript().catch(() => { warmed = false; });
}

const MAX_CHANGED_LINES = 300;

export default function OfficeEditorModal({ fileId, fileName, file, readOnly, presence = null, editors = [], onClose }: { fileId: number; fileName: string; file?: WorkspaceFile; readOnly: boolean; presence?: CollabPresence | null; editors?: CollabEditor[]; onClose: () => void }) {
  // 지금 버전을 원작자가 아닌 팀원이 저장했으면 안내하고, 처음 글에 없던 줄(문서에서 뽑은 글 기준)을 옆 패널에 모아 보여 준다.
  // 문서 안의 표시는 OnlyOffice "검토 → 변경 내용 추적"이 맡는다(워드 문서만, 서버 설정에서 편집할 수 있는 사람에게 권한을 연다).
  const editStatus = file ? fileEditStatus(file) : null;
  const [showOtherEdits, toggleOtherEdits] = useOtherEditMarks();
  const [panelOpen, setPanelOpen] = useState(false);
  const currentText = file?.versions.find((v) => v.current)?.searchText ?? "";
  const originalText = file ? originalVersion(file)?.searchText ?? "" : "";
  const changedLines = useMemo(() => {
    if (!editStatus?.byOther || !originalText.trim() || !currentText.trim()) return null;
    const lines = currentText.split(/\r\n|\r|\n/);
    return [...linesChangedFromOriginal(originalText, currentText)].map((i) => lines[i]);
  }, [editStatus?.byOther, originalText, currentText]);
  const isWord = fileName.toLowerCase().endsWith(".docx");
  const otherDetail = changedLines === null ? "문서의 글을 아직 뽑는 중이라 바뀐 줄은 보여 줄 수 없어요."
    : changedLines.length === 0 ? "글은 처음과 같아요(서식·도형만 바뀌었을 수 있어요)."
    : `처음 글에 없던 줄 ${changedLines.length}개를 “바뀐 내용”에서 볼 수 있어요.`;
  // 편집 중인 사람 표시는 문서 서버 것 대신(중계에서 숨김) 우리 프로필로: 워크스페이스 접속 상태에 "오피스로 여는 중"을 올린다.
  const officeEditors = editors.filter((e) => e.fileId === fileId && e.mode === "office");
  useEffect(() => {
    if (!presence || readOnly) return;
    presence.track({ fileId, room: 0, mode: "office" });
    return () => presence.track(null);
  }, [presence, fileId, readOnly]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false); // 편집기가 준비 신호를 보냄
  const [showFontModal, setShowFontModal] = useState(false);
  const editor = useRef<DocsEditor | null>(null);
  // 편집기는 자리 표시 요소를 iframe으로 바꿔 끼운다 — React가 관리하지 않는 요소를 만들어 넘긴다.
  const container = useRef<HTMLDivElement | null>(null);

  // 확장: 창이 브라우저 화면(탭·주소창 아래)을 꽉 채운다. 마지막 선택은 이 브라우저에 기억한다.
  const [full, setFull] = useState(() => { try { return localStorage.getItem(FULL_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(FULL_KEY, full ? "1" : "0"); } catch { /* 저장 못 해도 동작에는 지장 없음 */ } }, [full]);

  useEffect(() => {
    injectAllWebFonts();
    let cancelled = false;
    let revealTimer: number | undefined;
    (async () => {
      try {
        const [config] = await Promise.all([dataRepository.getOfficeEditorConfig(fileId), loadEditorScript()]);
        if (cancelled || !window.DocsAPI || !container.current) return;
        const holder = document.createElement("div");
        holder.id = `office-editor-${fileId}-${Date.now()}`;
        container.current.appendChild(holder);
        const reveal = () => { if (!cancelled) setLoading(false); };
        // customization.font(name·size)는 무료판에서 쓰면 "유료기능" 팝업이 매번 뜬다(textCustomLoader) → 넘기지 않는다.
        const finalConfig = {
          ...config,
          width: "100%",
          height: "100%",
          type: "desktop",
          events: {
            onAppReady: () => { if (!cancelled) { setReady(true); setLoading(false); } },
            onError: () => { if (!cancelled) { setError("편집기를 열지 못했습니다."); setLoading(false); } },
          },
        };
        editor.current = new window.DocsAPI.DocEditor(holder.id, finalConfig);
        // 준비 신호가 안 오면 가림막을 걷어 안의 화면을 보이게 한다.
        revealTimer = window.setTimeout(reveal, 20000);
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
    // 화면 위에 창 하나를 띄우는 모양(Temporary_Merge의 편집 창과 같은 배치): 어두운 배경 + 둥근 카드 + 파일 이름·닫기 버튼.
    // 확장하면 여백·모서리 없이 화면을 꽉 채운다.
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${full ? "" : "p-3 sm:p-6"}`} style={{ background: full ? "var(--card)" : "rgba(15,23,42,0.5)" }} role="dialog" aria-modal="true" aria-label={`${fileName} 오피스 편집`}>
      <div className={`w-full flex flex-col overflow-hidden ${full ? "h-full" : "max-w-6xl h-[90vh]"}`} style={{ background: "var(--card)", borderRadius: full ? 0 : "var(--radius)", boxShadow: full ? "none" : "0 24px 64px rgba(15,18,53,0.28)" }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-sm font-700 truncate">📎 {fileName}</span>
          {readOnly && <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>보기 전용</span>}
        </div>
        {officeEditors.length > 0 && <span className="ml-auto shrink-0"><EditorAvatars editors={officeEditors} size={26} max={6} /></span>}
        {editStatus?.byOther && showOtherEdits && !!changedLines?.length && (
          <button type="button" onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen} title="처음 글에 없던 줄을 옆에 모아 봅니다"
            className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-700 shrink-0 border rounded-lg"
            style={{ background: panelOpen ? "rgba(245, 158, 11, 0.18)" : "var(--muted)", borderColor: panelOpen ? "rgba(245, 158, 11, 0.45)" : "var(--border)", color: "var(--foreground)" }}>
            ✏️ 바뀐 내용 {changedLines.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowFontModal(true)}
          title="오피스 글꼴(폰트) 설정 및 추가"
          className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer border border-[var(--border)] rounded-lg hover:bg-[var(--secondary)] transition"
          style={{ background: "var(--muted)" }}
        >
          <span>🔤</span>
          <span>글꼴 설정/추가</span>
        </button>
        <button onClick={() => setFull((value) => !value)} aria-pressed={full} title={full ? "원래 크기로" : "브라우저 화면에 꽉 차게"} className="h-8 px-3 flex items-center gap-1.5 text-xs font-700 shrink-0" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "10px" }}>
          <span aria-hidden="true" className="text-sm">{full ? "⤡" : "⤢"}</span>{full ? "축소" : "확장"}
        </button>
        <button onClick={onClose} aria-label="닫기" title="닫기" className="w-8 h-8 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>×</button>
      </div>
      {editStatus?.byOther && (
        <OtherEditNotice status={editStatus} on={showOtherEdits} onToggle={toggleOtherEdits} className="mx-5 mt-2 shrink-0"
          detail={`${otherDetail}${isWord && !readOnly ? " 앞으로 고치는 내용을 문서에 표시하려면 위쪽 “검토” 탭에서 “변경 내용 추적”을 켜고, 다 본 뒤 수락·거부해 주세요." : ""}`} />
      )}
      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 relative">
        {/* 편집기 자체 로딩 화면(외부 편집기 이름이 나옴)을 덮는 가림막 — 편집기가 준비되면 걷힌다. */}
        {loading && <p role="status" className="absolute inset-0 z-10 flex items-center justify-center text-sm" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>편집기를 불러오는 중…</p>}
        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-700">{error}</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>오피스 문서 서버가 꺼져 있을 수 있어요. 서버를 운영하는 팀원에게 문의해 주세요.</p>
          </div>
        )}
        <div ref={container} className="w-full h-full" />
      </div>
      {panelOpen && showOtherEdits && !!changedLines?.length && editStatus && (
        <aside aria-label="처음 글에 없던 줄" className="w-72 max-w-[45%] shrink-0 overflow-y-auto p-3 text-xs border-l" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
          <p className="font-700 mb-1">처음 글에 없던 줄</p>
          <p className="mb-2" style={{ color: "var(--muted-foreground)" }}>원작자 {editStatus.originalAuthor} 님의 처음 버전과 지금 버전({editStatus.editor} 님 저장)을 비교했어요. 저장된 버전 기준이라 지금 편집 중인 내용은 저장된 뒤에 반영돼요.</p>
          <ul className="flex flex-col gap-1">
            {changedLines.slice(0, MAX_CHANGED_LINES).map((line, i) => (
              <li key={i} className="px-2 py-1 rounded whitespace-pre-wrap break-words" style={{ background: "rgba(249, 115, 22, 0.12)", boxShadow: "inset 3px 0 0 #ea580c" }}>{line.trim()}</li>
            ))}
          </ul>
          {changedLines.length > MAX_CHANGED_LINES && <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>외 {changedLines.length - MAX_CHANGED_LINES}줄은 생략했어요.</p>}
        </aside>
      )}
      </div>
      </div>
      {showFontModal && <AddFontModal isOffice onClose={() => setShowFontModal(false)} />}
    </div>,
    document.body,
  );
}
