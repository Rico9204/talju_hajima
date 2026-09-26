import * as Y from "yjs";
import { textHash } from "./collabCore.ts";

// 워크스페이스 "문서"(.rtdoc): 이 앱에서 여러 명이 함께 서식 있는 글을 쓰는 파일.
// 파일 내용은 Yjs 문서 상태(Y.encodeStateAsUpdate) 그대로다. 모두가 같은 바이트를 불러오면 같은 상태에서
// 시작하므로, 동시에 열어도 내용이 두 번 들어가지 않는다. 검색·버전 비교용 글자는 저장할 때 따로 뽑는다.

export const RICH_DOC_EXT = "rtdoc";
export const RICH_DOC_MIME = "application/x-talju-rtdoc";
export const RICH_DOC_FIELD = "content"; // TipTap Collaboration이 쓰는 Y.XmlFragment 이름

export function isRichDocName(name: string): boolean {
  return name.toLowerCase().endsWith(`.${RICH_DOC_EXT}`);
}

// 새 문서의 첫 상태: 빈 문단 하나. 고정 clientID로 만들어, 여러 명이 동시에 처음 열어도 편집기가 각자 빈 문단을
// 만들어 넣는 일(문단 중복)이 없게 한다.
export function newRichDocBytes(): Uint8Array {
  const seed = new Y.Doc();
  seed.clientID = 1;
  seed.getXmlFragment(RICH_DOC_FIELD).insert(0, [new Y.XmlElement("paragraph")]);
  return Y.encodeStateAsUpdate(seed);
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "horizontalRule"]);

// 검색·버전 비교(페이지 보기)용 글자. 문단마다 줄을 나눈다.
export function richDocText(doc: Y.Doc): string {
  const lines: string[] = [];
  let line = "";
  const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlFragment) => {
    if (node instanceof Y.XmlText) { line += node.toString().replace(/<[^>]*>/g, ""); return; }
    const isBlock = node instanceof Y.XmlElement && BLOCKS.has(node.nodeName);
    if (node instanceof Y.XmlElement && node.nodeName === "hardBreak") { lines.push(line); line = ""; return; }
    node.toArray().forEach((child) => walk(child as Y.XmlElement | Y.XmlText));
    if (isBlock && line) { lines.push(line); line = ""; }
  };
  walk(doc.getXmlFragment(RICH_DOC_FIELD));
  if (line) lines.push(line);
  return lines.join("\n");
}

// "마지막으로 저장한 내용과 같은지" 비교하는 값(서식까지 포함).
export function richDocKey(doc: Y.Doc): string {
  return textHash(doc.getXmlFragment(RICH_DOC_FIELD).toString());
}
