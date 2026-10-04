import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";
import "../../src/index.css";
import QuickEditModal from "../../src/components/QuickEditModal";
import DocEditorModal from "../../src/components/DocEditorModal";
import { joinCollabPresence, type CollabEditor, type CollabPresence } from "../../src/lib/collab";
import { RICH_DOC_FIELD } from "../../src/lib/richDoc";
import type { WorkspaceFile } from "../../src/api/types";

// ?user=a|b&kind=quick|doc — collab-cursors.html이 두 사람을 iframe 두 개로 띄운다.
const params = new URLSearchParams(location.search);
const me = params.get("user") === "b" ? { id: "user-b", name: "이두리" } : { id: "user-a", name: "김하나" };
const kind = params.get("kind") === "doc" ? "doc" : "quick";
const text = "회의록\n- 발표 순서: 김하나 → 이두리\n- 자료 조사는 금요일까지 끝내기로 했다. 아주 긴 줄은 칸 끝에서 줄바꿈되어 다음 줄로 넘어가야 커서 위치가 맞는지 확인할 수 있다.\n- 다음 회의: 월요일 오후 3시";
const file = { id: 1, name: kind === "doc" ? "회의록.rtdoc" : "회의록.txt" } as WorkspaceFile;

function docBytes() {
  const seed = new Y.Doc();
  seed.clientID = 1;
  seed.getXmlFragment(RICH_DOC_FIELD).insert(0, text.split("\n").map((line) => { const p = new Y.XmlElement("paragraph"); p.insert(0, [new Y.XmlText(line)]); return p; }));
  return Y.encodeStateAsUpdate(seed);
}
const bytes = docBytes();

function App() {
  const [editors, setEditors] = useState<CollabEditor[]>([]);
  const [presence] = useState<CollabPresence>(() => joinCollabPresence("fixture", me, setEditors));
  // 화면을 자동으로 움직여 커서를 보낸다: 김하나는 단어 하나를 선택, 이두리는 커서만.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (kind === "quick") {
        const area = document.querySelector("textarea")!;
        area.focus();
        if (me.id === "user-a") area.setSelectionRange(8, 13); else area.setSelectionRange(60, 60);
      } else {
        const prose = document.querySelector(".ProseMirror") as HTMLElement;
        prose.focus();
        const paragraphs = prose.querySelectorAll("p");
        const node = paragraphs[me.id === "user-a" ? 1 : 2].firstChild!;
        if (me.id === "user-a") document.getSelection()!.setBaseAndExtent(node, 2, node, 7); else document.getSelection()!.setBaseAndExtent(node, 20, node, 20);
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, []);
  const save = async () => 2;
  return kind === "doc"
    ? <DocEditorModal projectId="fixture" file={file} room={1} mode="main" initialBytes={bytes} presence={presence} editors={editors} save={save} onClose={() => {}} />
    : <QuickEditModal projectId="fixture" file={file} room={1} mode="main" initialText={text} presence={presence} editors={editors} save={save} onClose={() => {}} />;
}
createRoot(document.getElementById("root")!).render(<App />);
