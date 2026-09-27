// .rtdoc/.slides(Yjs 스냅샷)에서 "지금 저장된 내용"을 줄글로 뽑아낸다 — PPT 텍스트 추출과
// 같은 목적: 서식/이미지 없이 텍스트만이라도 버전 간 비교(diffLines)에 흘려보내기 위함.
import * as Y from "yjs";
import { SNAPSHOT_PREFIX, isRichDocPath, isSlidesPath, base64ToUint8Array } from "./richDoc";

function decodeSnapshotToDoc(content: string): Y.Doc {
  const doc = new Y.Doc();
  const bytes = base64ToUint8Array(content.slice(SNAPSHOT_PREFIX.length));
  Y.applyUpdate(doc, bytes);
  return doc;
}

// 블록 단위(문단/제목/목록 항목 등) 하나당 한 줄 - 줄 단위 diff와 궁합이 맞다. bulletList 같은
// 감싸는 태그는 그 안의 블록들을 각각 펼쳐 보여주기 위해 통과시키고, 실제 텍스트가 있는
// 블록만 한 줄로 만든다.
const BLOCK_TAGS = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock"]);

function collectText(node: Y.XmlText | Y.XmlElement | Y.XmlHook): string {
  if (node instanceof Y.XmlText) return node.toString();
  if (node instanceof Y.XmlElement) {
    // hardBreak(Shift+Enter로 만든, 새 문단이 아닌 줄바꿈)는 자식이 없는 빈 인라인 노드라, 그냥
    // 재귀하면 빈 문자열로 사라져서 앞뒤 텍스트가 줄바꿈 없이 붙어버린다 — 명시적으로 줄바꿈으로
    // 바꿔줘야 "줄바꿈이 미리보기에서 안 보이는" 문제가 안 생긴다.
    if (node.nodeName === "hardBreak") return "\n";
    return node.toArray().map(collectText).join("");
  }
  return "";
}

function xmlFragmentToLines(fragment: Y.XmlFragment): string[] {
  const lines: string[] = [];
  function walk(node: Y.XmlText | Y.XmlElement | Y.XmlHook): void {
    if (!(node instanceof Y.XmlElement)) return;
    if (BLOCK_TAGS.has(node.nodeName)) {
      const text = collectText(node).trim();
      if (text) lines.push(text);
    } else {
      for (const child of node.toArray()) walk(child);
    }
  }
  for (const child of fragment.toArray()) walk(child);
  return lines;
}

function extractRichDocText(content: string): string {
  const doc = decodeSnapshotToDoc(content);
  return xmlFragmentToLines(doc.getXmlFragment("content")).join("\n");
}

function extractSlidesText(content: string): string {
  const doc = decodeSnapshotToDoc(content);
  const slides = doc.getArray<Y.Map<unknown>>("slides").toArray();
  const lines = slides.map((slide, i) => {
    const elements = (slide.get("elements") as Y.Array<Y.Map<unknown>> | undefined)?.toArray() ?? [];
    const texts = elements
      .filter((el) => el.get("type") === "text")
      .map((el) => (el.get("text") as Y.Text | undefined)?.toString().trim())
      .filter((t): t is string => !!t);
    return `[슬라이드 ${i + 1}] ${texts.length > 0 ? texts.join(" / ") : "(텍스트 없음)"}`;
  });
  return lines.join("\n");
}

export async function extractSnapshotTextSummary(content: string, path: string): Promise<string> {
  if (isRichDocPath(path)) return extractRichDocText(content);
  if (isSlidesPath(path)) return extractSlidesText(content);
  return "";
}
