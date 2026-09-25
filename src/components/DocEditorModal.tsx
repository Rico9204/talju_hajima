import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Extension } from "@tiptap/core";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import Collaboration from "@tiptap/extension-collaboration";
import { yCursorPlugin } from "@tiptap/y-tiptap";
import type { WebsocketProvider } from "y-websocket";
import { useCollabSession } from "../lib/useCollabSession";
import { exportRichDocAsDocx, exportElementAsPdf } from "../lib/exportRichDoc";

// "바로 수정"(QuickEditModal, 일반 텍스트용)과 같은 collab 웹소켓 인프라를 그대로 쓰되, 내용을
// 통째로 문자열로 다루는 대신 TipTap의 Collaboration 확장이 Y.XmlFragment를 직접 동기화한다 —
// 그래서 커서/선택영역 표시도 커서 플러그인이 대신 그려준다(직접 좌표 계산 불필요).
//
// 커서 표시는 @tiptap/extension-collaboration-cursor 패키지 대신 @tiptap/y-tiptap의
// yCursorPlugin을 직접 감싸서 쓴다 — extension-collaboration-cursor@3.0.0은 peerDependency로
// (구) y-prosemirror를 바라보는데, Collaboration 확장이 실제로 쓰는 동기화 플러그인은
// @tiptap/y-tiptap(TipTap 자체 포크) 기반이라 플러그인 키가 서로 달라서 동기화 상태 조회가
// undefined로 실패 -> 에디터 마운트 시 크래시(새 문서/슬라이드 만들기가 "먹통"으로 보였던 원인).
// yCursorPlugin은 Collaboration과 같은 @tiptap/y-tiptap 패키지 소속이라 플러그인 키가 일치한다.
// cursorBuilder는 각 원격 참여자의 awareness "user" 필드(useCollabSession이
// provider.awareness.setLocalStateField("user", {...})로 세팅)를 인자로 받아 그 사람마다 호출된다 —
// 내 자신의 이름/색을 고정해서 쓰면 안 되고, 매번 넘어오는 user를 그대로 써야 한다.
function createCollabCursorExtension(provider: WebsocketProvider) {
  return Extension.create({
    name: "collabCursor",
    addProseMirrorPlugins() {
      return [
        yCursorPlugin(provider.awareness, {
          cursorBuilder: (user: { name: string; color: string }) => {
            const caret = document.createElement("span");
            caret.classList.add("collab-cursor-caret");
            caret.style.borderLeft = `2px solid ${user.color}`;
            const label = document.createElement("div");
            label.classList.add("collab-cursor-label");
            label.style.background = user.color;
            label.textContent = user.name;
            caret.appendChild(label);
            return caret;
          },
        }),
      ];
    },
  });
}
export default function DocEditorModal({
  projectId,
  fileId,
  filePath,
  pinId,
  pinLabel,
  myUserId,
  myName,
  onClose,
}: {
  projectId: string;
  fileId: string;
  filePath: string;
  pinId?: string;
  pinLabel?: string;
  myUserId: string;
  myName: string;
  onClose: () => void;
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { provider, status, peers } = useCollabSession(ydoc, { projectId, fileId, pinId, myUserId, myName });
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const baseName = (filePath.split("/").pop() ?? "문서").replace(/\.rtdoc$/i, "");

  // Y.Doc은 마운트 시 한 번만 만들고 언마운트될 때 정리.
  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
        TiptapImage,
        Collaboration.configure({ document: ydoc, field: "content" }),
        createCollabCursorExtension(provider),
      ],
      editorProps: {
        attributes: { class: "rich-doc-prose" },
      },
    },
    [],
  );

  function insertImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      editor?.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  }

  async function handleExportDocx() {
    if (!editor || exporting) return;
    setExporting("docx");
    try {
      await exportRichDocAsDocx(editor, `${baseName}.docx`);
    } catch {
      window.alert("Word 파일로 내보내는 중 오류가 발생했어요.");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    if (!editor || exporting) return;
    setExporting("pdf");
    try {
      await exportElementAsPdf(editor.view.dom as HTMLElement, `${baseName}.pdf`);
    } catch {
      window.alert("PDF로 내보내는 중 오류가 발생했어요.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6" style={{ background: "rgba(15,23,42,0.5)" }}>
      <style>{`
        .collab-cursor-caret { position: relative; margin-left: -1px; margin-right: -1px; pointer-events: none; word-break: normal; }
        .collab-cursor-label { position: absolute; top: -1.4em; left: -2px; font-size: 11px; font-weight: 700; line-height: 1; padding: 2px 5px; border-radius: 4px; color: #fff; white-space: nowrap; }
        .rich-doc-prose { outline: none; padding: 24px; min-height: 100%; font-size: 14px; line-height: 1.7; }
        .rich-doc-prose h1 { font-size: 1.6em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-doc-prose h2 { font-size: 1.3em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-doc-prose h3 { font-size: 1.1em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-doc-prose p { margin: 0.4em 0; }
        .rich-doc-prose ul, .rich-doc-prose ol { padding-left: 1.4em; margin: 0.4em 0; }
        .rich-doc-prose blockquote { border-left: 3px solid var(--border); padding-left: 12px; color: var(--muted-foreground); margin: 0.4em 0; }
        .rich-doc-prose pre { background: var(--muted); border-radius: 8px; padding: 10px 12px; overflow-x: auto; font-family: var(--font-jetbrains); font-size: 12px; }
        .rich-doc-prose img { max-width: 100%; border-radius: 8px; }
        .rich-doc-prose a { color: var(--primary); text-decoration: underline; }
      `}</style>
      <div
        className="w-full max-w-4xl h-[85vh] flex flex-col"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <div className="text-sm font-700 truncate">
              📄 {filePath}
              {pinLabel && <span style={{ color: "#8b5cf6" }}> · 📌 {pinLabel}</span>}
            </div>
            {peers.map((p) => (
              <span key={p.userId} className="px-1.5 py-0.5 text-[10px] font-700 rounded-full shrink-0" style={{ background: `${p.color}20`, color: p.color }}>
                ✏️ {p.name}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleExportDocx}
              disabled={exporting !== null}
              className="text-xs font-700 px-3 py-1.5"
              style={{ borderRadius: "20px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent", opacity: exporting !== null ? 0.6 : 1 }}
            >
              {exporting === "docx" ? "내보내는 중..." : "Word로 내보내기"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting !== null}
              className="text-xs font-700 px-3 py-1.5"
              style={{ borderRadius: "20px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent", opacity: exporting !== null ? 0.6 : 1 }}
            >
              {exporting === "pdf" ? "내보내는 중..." : "PDF로 내보내기"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-lg shrink-0"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="text-xs flex items-center gap-1.5 px-5 pt-2" style={{ color: "var(--muted-foreground)" }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status === "connected" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444" }} />
          {status === "connected" ? "실시간 연결됨" : status === "connecting" ? "연결 중..." : "연결 끊김 — 재연결 시도 중"}
        </div>

        <Toolbar editor={editor} onPickImage={() => fileInputRef.current?.click()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) insertImage(file);
            e.target.value = "";
          }}
        />

        <div className="flex-1 overflow-auto m-4 mt-2 rounded-[10px]" style={{ background: "var(--muted)" }}>
          <EditorContent editor={editor} className="h-full" />
        </div>

        <div className="px-5 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
          타이핑을 멈추면 자동으로 새 버전이 저장돼요. 이 창을 닫아도 계속 저장됩니다.
          {pinLabel && ` (파일의 현재 버전이 아니라 "${pinLabel}" 핀에 이어붙어요)`}
        </div>
      </div>
    </div>
  );
}

function Toolbar({ editor, onPickImage }: { editor: Editor | null; onPickImage: () => void }) {
  if (!editor) return <div className="h-11 px-4" />;

  const items: { key: string; label: string; active: boolean; onClick: () => void; disabled?: boolean }[] = [
    { key: "bold", label: "B", active: editor.isActive("bold"), onClick: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", label: "I", active: editor.isActive("italic"), onClick: () => editor.chain().focus().toggleItalic().run() },
    { key: "underline", label: "U", active: editor.isActive("underline"), onClick: () => editor.chain().focus().toggleUnderline().run() },
    { key: "strike", label: "S", active: editor.isActive("strike"), onClick: () => editor.chain().focus().toggleStrike().run() },
    { key: "h1", label: "H1", active: editor.isActive("heading", { level: 1 }), onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: "h2", label: "H2", active: editor.isActive("heading", { level: 2 }), onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "h3", label: "H3", active: editor.isActive("heading", { level: 3 }), onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: "bullet", label: "•—", active: editor.isActive("bulletList"), onClick: () => editor.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: "1.", active: editor.isActive("orderedList"), onClick: () => editor.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: "❝", active: editor.isActive("blockquote"), onClick: () => editor.chain().focus().toggleBlockquote().run() },
    { key: "code", label: "</>", active: editor.isActive("codeBlock"), onClick: () => editor.chain().focus().toggleCodeBlock().run() },
    {
      key: "link",
      label: "🔗",
      active: editor.isActive("link"),
      onClick: () => {
        const url = window.prompt("링크 주소를 입력하세요", editor.getAttributes("link").href ?? "https://");
        if (url === null) return;
        if (!url) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().setLink({ href: url }).run();
      },
    },
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-2 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onClick}
          title={item.key}
          className="min-w-7 h-7 px-1.5 flex items-center justify-center text-xs font-700 rounded-md"
          style={{ background: item.active ? "var(--primary)" : "var(--muted)", color: item.active ? "#fff" : "var(--foreground)" }}
        >
          {item.label}
        </button>
      ))}
      <button
        onClick={onPickImage}
        title="이미지 삽입"
        className="min-w-7 h-7 px-1.5 flex items-center justify-center text-xs font-700 rounded-md"
        style={{ background: "var(--muted)", color: "var(--foreground)" }}
      >
        🖼️
      </button>
      <span className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />
      <button
        onClick={() => editor.commands.undo()}
        title="실행 취소"
        className="min-w-7 h-7 px-1.5 flex items-center justify-center text-xs font-700 rounded-md"
        style={{ background: "var(--muted)", color: "var(--foreground)" }}
      >
        ↺
      </button>
      <button
        onClick={() => editor.commands.redo()}
        title="다시 실행"
        className="min-w-7 h-7 px-1.5 flex items-center justify-center text-xs font-700 rounded-md"
        style={{ background: "var(--muted)", color: "var(--foreground)" }}
      >
        ↻
      </button>
    </div>
  );
}
