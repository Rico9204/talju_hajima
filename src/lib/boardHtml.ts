// 게시글 본문(에디터가 만든 HTML)을 화면에 그리기 전에 허용 목록 방식으로 정리한다.
// 저장된 본문은 사용자가 API로 임의 HTML을 넣을 수 있으므로 그대로 innerHTML에 넣으면 XSS가 된다.
//  * 허용한 태그만 남기고(나머지는 태그만 벗기고 글자는 유지, script/style 등은 통째로 제거)
//  * 속성은 class / alt / title, img src(https 또는 data:image), a href(http·https·mailto)만 남긴다
//    — on* 이벤트, style, javascript: 주소는 모두 사라진다.

const ALLOWED_TAGS = new Set([
  "p", "div", "span", "br", "hr", "b", "strong", "i", "em", "u", "s", "strike", "del", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "ul", "ol", "li",
  "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "form", "button", "textarea", "select", "input", "link", "meta", "base"]);

function safeImgSrc(src: string): boolean {
  return /^https:\/\//i.test(src) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src);
}

function safeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

function cleanNode(node: Element) {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      child.remove();
      continue;
    }
    cleanNode(child);
    if (!ALLOWED_TAGS.has(tag)) {
      child.replaceWith(...Array.from(child.childNodes)); // 태그만 벗기고 내용 유지
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const keep =
        name === "class" || name === "alt" || name === "title" ||
        (tag === "img" && name === "src" && safeImgSrc(attr.value)) ||
        (tag === "a" && name === "href" && safeHref(attr.value));
      if (!keep) child.removeAttribute(attr.name);
    }
    if (tag === "img" && !child.hasAttribute("src")) child.remove();
    if (tag === "a") {
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
  // 주석 노드 제거
  for (const n of Array.from(node.childNodes)) if (n.nodeType === 8) n.remove();
}

export function sanitizeBoardHtml(raw: string): string {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

// 한글(HWPX) 편집기 문단: 문서 파일·공동 편집(다른 사람의 브라우저)에서 온 HTML이라 그대로 넣으면 XSS가 된다.
// 편집기가 쓰는 글자 서식(굵게·기울임·밑줄·취소선, 글자색·형광펜·글꼴·크기)만 남긴다.
const EDITOR_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "strike", "del", "sub", "sup", "span", "font", "br"]);
const EDITOR_STYLES = ["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-decoration", "text-decoration-line"];

function cleanEditorNode(node: Element) {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      child.remove();
      continue;
    }
    cleanEditorNode(child);
    if (!EDITOR_TAGS.has(tag)) {
      child.replaceWith(...Array.from(child.childNodes)); // 태그만 벗기고 내용 유지
      continue;
    }
    const style = (child as HTMLElement).style;
    const kept = EDITOR_STYLES.map((name) => [name, style.getPropertyValue(name)] as const)
      .filter(([, value]) => value && !/url\(|expression\(/i.test(value));
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (!(tag === "font" && (name === "face" || name === "color"))) child.removeAttribute(attr.name);
    }
    if (kept.length) child.setAttribute("style", kept.map(([name, value]) => `${name}: ${value}`).join("; "));
  }
  for (const n of Array.from(node.childNodes)) if (n.nodeType === 8) n.remove();
}

export function sanitizeEditorHtml(raw: string): string {
  if (!raw.includes("<")) return raw; // 서식 없는 글자(대부분의 문단)
  const doc = new DOMParser().parseFromString(raw, "text/html");
  cleanEditorNode(doc.body);
  return doc.body.innerHTML;
}

// 글자를 HTML 안에 넣을 때(브라우저의 innerHTML과 같은 규칙: & < > 만).
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
