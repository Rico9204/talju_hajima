import { Node } from "@tiptap/core";
import type { CollabImageLoader } from "./collabImages";

// 문서(.rtdoc)의 이미지 블록. 문서에는 워크스페이스 이미지의 버전 번호만 저장하고(collabImages.ts), 그릴 때 받아 온다.
// 이미지 주소(src)를 문서에 두지 않으므로 바깥 주소의 이미지가 끼어들 수 없다.
export const WORKSPACE_IMAGE_NODE = "workspaceImage";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    workspaceImage: { insertWorkspaceImage: (versionId: number, at?: number) => ReturnType };
  }
}

export const WorkspaceImage = Node.create<{ loader: CollabImageLoader | null }>({
  name: WORKSPACE_IMAGE_NODE,
  group: "block",
  atom: true,
  draggable: true,
  addOptions() {
    return { loader: null };
  },
  addAttributes() {
    return {
      versionId: {
        default: null,
        parseHTML: (el) => { const id = Number(el.getAttribute("data-version-id")); return Number.isInteger(id) && id > 0 ? id : null; },
        renderHTML: (attrs) => ({ "data-version-id": attrs.versionId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-version-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, alt: "문서 이미지" }];
  },
  // 넣은 뒤에는 이미지 다음 줄에 글자 커서를 둔다(이미지가 선택된 채로 남으면 이어서 붙여 넣을 때 앞 이미지가 바뀐다).
  addCommands() {
    return {
      insertWorkspaceImage: (versionId, at) => ({ chain, state }) => chain()
        .insertContentAt(at ?? { from: state.selection.from, to: state.selection.to }, { type: this.name, attrs: { versionId } })
        .command(({ tr, commands }) => {
          const sel = tr.selection as unknown as { node?: { type: { name: string } }; from: number; to: number };
          let after = sel.to;
          if (sel.node?.type.name !== this.name) {
            const before = tr.doc.resolve(sel.from).nodeBefore;
            if (before?.type.name !== this.name) return true;
          }
          if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, tr.doc.type.schema.nodes.paragraph.create());
          after = Math.min(after + 1, tr.doc.content.size);
          return commands.setTextSelection(after);
        })
        .run(),
    };
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "workspace-image";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      img.alt = "문서 이미지";
      img.draggable = false;
      const note = document.createElement("span");
      note.className = "workspace-image-note";
      note.textContent = "이미지를 불러오는 중…";
      dom.append(note);
      const versionId = Number(node.attrs.versionId);
      const loader = this.options.loader;
      if (!loader || !Number.isInteger(versionId) || versionId <= 0) note.textContent = "이미지를 찾을 수 없어요.";
      else {
        loader.url(versionId).then(
          (url) => { img.src = url; note.replaceWith(img); },
          () => { note.textContent = "이미지를 불러오지 못했어요. 워크스페이스에서 이미지 파일이 지워졌을 수 있어요."; },
        );
      }
      return { dom };
    };
  },
});
