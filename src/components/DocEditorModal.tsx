import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import type { WorkspaceFile } from "../api/types";
import EditorAvatars from "./EditorAvatars";
import { connectCollabRoom, type CollabEditor, type CollabMode, type CollabPresence, type CollabRoom } from "../lib/collab";
import { RICH_DOC_FIELD, richDocKey, richDocText } from "../lib/richDoc";
import { exportElementAsPdf, exportRichDocAsDocx } from "../lib/exportRichDoc";

const AUTOSAVE_MS = 5 * 60 * 1000;

// 워크스페이스 "문서"(.rtdoc) 편집기: 서식 있는 글을 여러 명이 함께 쓴다(TipTap + Yjs, Supabase Realtime으로 동기화).
// 저장 방식은 "바로 수정"과 같다 — 저장 버튼(Ctrl/⌘+S)이나 5분 자동 저장 때 지금 합쳐진 문서가 새 버전으로 올라가고,
// 이미 같은 내용이 저장돼 있으면 건너뛴다. 원본: Temporary_Merge a068d15(NestJS 웹소켓 대신 Supabase로 이식).
// 이번 판에서는 이미지 삽입을 넣지 않았다(문서에 이미지를 통째로 넣으면 실시간 전송 한도를 넘을 수 있다).
export default function DocEditorModal({ projectId, file, room, mode, initialBytes, presence, editors, save, onClose }: {
  projectId: string;
  file: WorkspaceFile;
  room: number; // 편집을 시작한 기준 버전 id
  mode: CollabMode;
  initialBytes: Uint8Array;
  presence: CollabPresence;
  editors: CollabEditor[];
  save: (bytes: Uint8Array, text: string, baseVersionId: number, auto: boolean) => Promise<number>;
  onClose: () => void;
}) {
  const [doc] = useState(() => {
    const d = new Y.Doc();
    Y.applyUpdate(d, initialBytes, "seed");
    return d;
  });
  const roomRef = useRef<CollabRoom | null>(null);
  const saving = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const roomEditors = editors.filter((e) => e.fileId === file.id && e.room === room && e.mode === mode);
  const baseName = file.name.replace(/\.rtdoc$/i, "") || "문서";

  const refreshDirty = () => {
    const r = roomRef.current;
    if (r) setDirty(richDocKey(doc) !== r.savedKey());
  };

  useEffect(() => {
    const r = connectCollabRoom(doc, {
      projectId, fileId: file.id, room, mode, initialKey: richDocKey(doc),
      onSaved: () => { setStatus("saved"); setError(""); refreshDirty(); },
    });
    roomRef.current = r;
    const onUpdate = () => refreshDirty();
    doc.on("update", onUpdate);
    presence.track({ fileId: file.id, room, mode });
    return () => {
      presence.track(null);
      doc.off("update", onUpdate);
      roomRef.current = null;
      r.destroy();
      window.setTimeout(() => doc.destroy(), 1500); // 마지막 저장 알림이 나갈 시간
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false, protocols: ["http", "https", "mailto"] } }),
      Collaboration.configure({ document: doc, field: RICH_DOC_FIELD }),
    ],
    editorProps: { attributes: { class: "rich-doc-prose", "aria-label": "문서 내용" } },
  }, []);

  async function runSave(auto = false): Promise<boolean> {
    const r = roomRef.current;
    if (!r || saving.current) return false;
    if (richDocKey(doc) === r.savedKey()) { setDirty(false); return true; } // 이미 저장됨
    saving.current = true;
    setStatus("saving");
    try {
      const key = richDocKey(doc);
      const id = await saveRef.current(Y.encodeStateAsUpdate(doc), richDocText(doc), r.head(), auto);
      r.markSaved(id, key);
      setStatus("saved");
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      setError("");
      refreshDirty();
      return true;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "저장하지 못했습니다.");
      return false;
    } finally { saving.current = false; }
  }

  // 5분마다 자동 저장(변경이 없으면 runSave가 건너뜀).
  useEffect(() => {
    const id = window.setInterval(() => { void runSave(true); }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장하지 않은 변경이 있을 때 탭을 닫거나 새로고침하면 브라우저가 한 번 물어본다.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  async function saveAndClose() {
    if (await runSave()) onClose();
    else setConfirmClose(false);
  }

  async function exportAs(kind: "docx" | "pdf") {
    if (!editor || exporting) return;
    setExporting(kind);
    setError("");
    try {
      if (kind === "docx") await exportRichDocAsDocx(editor, `${baseName}.docx`);
      else await exportElementAsPdf(editor.view.dom as HTMLElement, `${baseName}.pdf`);
    } catch {
      setError(kind === "docx" ? "Word 파일로 내보내지 못했습니다." : "PDF로 내보내지 못했습니다.");
    } finally {
      setExporting(null);
    }
  }

  const names = [...new Set(roomEditors.map((e) => e.name))];
  const lastEditor = names.length <= 1;
  const statusText = status === "saving" ? "저장 중…" : status === "error" ? "저장 실패" : dirty ? "저장하지 않은 변경사항이 있어요 (5분마다 자동 저장)" : status === "saved" ? `저장됨 ${savedAt}`.trim() : "변경사항 없음";
  const pill = "h-8 px-3 rounded-full text-xs font-700 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)" }}>
      <style>{`
        .rich-doc-prose { outline: none; padding: 24px; min-height: 100%; font-size: 14px; line-height: 1.7; color: var(--foreground); }
        .rich-doc-prose h1 { font-size: 1.6em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-doc-prose h2 { font-size: 1.3em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-doc-prose h3 { font-size: 1.1em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-doc-prose p { margin: 0.4em 0; }
        .rich-doc-prose ul { list-style: disc; padding-left: 1.4em; margin: 0.4em 0; }
        .rich-doc-prose ol { list-style: decimal; padding-left: 1.4em; margin: 0.4em 0; }
        .rich-doc-prose blockquote { border-left: 3px solid var(--border); padding-left: 12px; color: var(--muted-foreground); margin: 0.4em 0; }
        .rich-doc-prose pre { background: var(--card); border-radius: 8px; padding: 10px 12px; overflow-x: auto; font-family: var(--font-jetbrains); font-size: 12px; }
        .rich-doc-prose code { font-family: var(--font-jetbrains); }
        .rich-doc-prose a { color: var(--primary); text-decoration: underline; }
        .rich-doc-prose hr { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
        .rich-doc-export, .rich-doc-export * { color: #111827 !important; background: #fff !important; }
        .rich-doc-export a { color: #2563eb !important; }
        .rich-doc-export pre { background: #f3f4f6 !important; }
      `}</style>
      <section className="w-[min(96vw,900px)] h-[min(88vh,760px)] flex flex-col border" aria-label="문서 편집" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 24px 70px rgba(15,18,53,0.25)", color: "var(--foreground)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0 flex-wrap" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <div className="text-xs font-700" style={{ color: "var(--primary)" }}>{mode === "pin" ? "📌 핀 버전에서 분기해 수정" : "📄 문서 (함께 편집)"}</div>
            <div className="text-sm font-700 truncate mt-0.5">{file.name}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: status === "error" ? "#ef4444" : "var(--muted-foreground)" }} role="status">{statusText}</span>
            <button type="button" onClick={() => void exportAs("docx")} disabled={!!exporting} className={pill} style={{ background: "var(--muted)", color: "var(--foreground)" }}>{exporting === "docx" ? "내보내는 중…" : "Word로"}</button>
            <button type="button" onClick={() => void exportAs("pdf")} disabled={!!exporting} className={pill} style={{ background: "var(--muted)", color: "var(--foreground)" }}>{exporting === "pdf" ? "내보내는 중…" : "PDF로"}</button>
            <button type="button" onClick={() => void runSave()} disabled={!dirty || status === "saving"} title="Ctrl/⌘+S" className={pill} style={{ background: "var(--primary)", color: "#fff" }}>{status === "saving" ? "저장 중…" : "저장"}</button>
            <button type="button" onClick={requestClose} className={pill} style={{ background: "var(--muted)", color: "var(--foreground)" }}>닫기</button>
          </div>
        </div>
        <div className="px-5 py-2 text-xs border-b shrink-0 flex items-center gap-2" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <EditorAvatars editors={roomEditors} size={26} max={6} />
          <span>{names.length > 1 ? `지금 ${names.length}명이 함께 수정 중 · 사진을 누르면 이름이 보여요` : "지금은 나만 수정 중이에요. 다른 팀원이 들어오면 여기에 표시돼요."}</span>
        </div>
        {confirmClose && (
          <div role="alertdialog" aria-label="저장하지 않은 변경사항" className="mx-5 mt-2 p-3 text-xs rounded-lg flex flex-wrap items-center gap-2" style={{ background: "rgba(245, 158, 11, 0.14)", color: "var(--foreground)", border: "1px solid rgba(245, 158, 11, 0.35)" }}>
            <span className="flex-1 min-w-48">저장하지 않은 변경사항이 있어요.{lastEditor && " 지금 나가면 지금까지 수정한 내용이 사라질 수 있어요."}</span>
            <button type="button" onClick={() => void saveAndClose()} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--primary)", color: "#fff" }}>저장하고 닫기</button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--card)", color: "var(--foreground)" }}>저장 없이 닫기</button>
            <button type="button" onClick={() => setConfirmClose(false)} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--card)", color: "var(--foreground)" }}>계속 수정</button>
          </div>
        )}
        {error && <p role="alert" className="mx-5 mt-2 text-xs rounded-lg bg-red-500/10 text-red-500 p-2">{error}</p>}
        <Toolbar editor={editor} />
        <div
          className="flex-1 min-h-0 overflow-auto mx-5 mb-5 rounded-[10px] border"
          style={{ background: "var(--muted)", borderColor: "var(--border)" }}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void runSave(); } }}
        >
          <EditorContent editor={editor} className="h-full" />
        </div>
      </section>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <div className="h-11 px-5" />;
  const chain = () => editor.chain().focus();
  const items: { key: string; label: string; title: string; active: boolean; run: () => void }[] = [
    { key: "bold", label: "B", title: "굵게", active: editor.isActive("bold"), run: () => chain().toggleBold().run() },
    { key: "italic", label: "I", title: "기울임", active: editor.isActive("italic"), run: () => chain().toggleItalic().run() },
    { key: "underline", label: "U", title: "밑줄", active: editor.isActive("underline"), run: () => chain().toggleUnderline().run() },
    { key: "strike", label: "S", title: "취소선", active: editor.isActive("strike"), run: () => chain().toggleStrike().run() },
    { key: "h1", label: "H1", title: "제목 1", active: editor.isActive("heading", { level: 1 }), run: () => chain().toggleHeading({ level: 1 }).run() },
    { key: "h2", label: "H2", title: "제목 2", active: editor.isActive("heading", { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: "h3", label: "H3", title: "제목 3", active: editor.isActive("heading", { level: 3 }), run: () => chain().toggleHeading({ level: 3 }).run() },
    { key: "bullet", label: "•", title: "글머리 목록", active: editor.isActive("bulletList"), run: () => chain().toggleBulletList().run() },
    { key: "ordered", label: "1.", title: "번호 목록", active: editor.isActive("orderedList"), run: () => chain().toggleOrderedList().run() },
    { key: "quote", label: "❝", title: "인용", active: editor.isActive("blockquote"), run: () => chain().toggleBlockquote().run() },
    { key: "code", label: "</>", title: "코드 블록", active: editor.isActive("codeBlock"), run: () => chain().toggleCodeBlock().run() },
    {
      key: "link", label: "🔗", title: "링크", active: editor.isActive("link"),
      run: () => {
        const url = window.prompt("링크 주소를 입력하세요 (비우면 링크 해제)", editor.getAttributes("link").href ?? "https://");
        if (url === null) return;
        if (!url.trim()) chain().unsetLink().run();
        else if (/^(https?:\/\/|mailto:)/i.test(url.trim())) chain().setLink({ href: url.trim() }).run();
        else window.alert("http://, https://, mailto: 로 시작하는 주소만 넣을 수 있어요.");
      },
    },
  ];
  const btn = "min-w-8 h-8 px-2 flex items-center justify-center text-xs font-700 rounded-md";
  return (
    <div className="flex items-center gap-1 px-5 py-2 flex-wrap shrink-0" role="toolbar" aria-label="서식">
      {items.map((item) => (
        <button key={item.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={item.run} title={item.title} aria-label={item.title} aria-pressed={item.active} className={btn}
          style={{ background: item.active ? "var(--primary)" : "var(--muted)", color: item.active ? "#fff" : "var(--foreground)" }}>
          {item.label}
        </button>
      ))}
      <span className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />
      <button type="button" onClick={() => editor.commands.undo()} title="실행 취소" aria-label="실행 취소" className={btn} style={{ background: "var(--muted)", color: "var(--foreground)" }}>↺</button>
      <button type="button" onClick={() => editor.commands.redo()} title="다시 실행" aria-label="다시 실행" className={btn} style={{ background: "var(--muted)", color: "var(--foreground)" }}>↻</button>
    </div>
  );
}
