import type { BoardReportReason } from "../api/types";

export const BOARD_REPORT_REASONS: { value: BoardReportReason; label: string }[] = [
  { value: "spam", label: "스팸·광고" },
  { value: "abuse", label: "욕설·비방·혐오" },
  { value: "sexual", label: "음란·부적절한 내용" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "other", label: "기타" },
];

export function reportReasonLabel(reason: BoardReportReason): string {
  return BOARD_REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// 게시글 본문이 에디터 HTML일 수 있어, 화면에는 태그를 벗긴 글자와 이미지 주소만 보여준다(HTML을 그대로 그리지 않는다).
export function htmlToPreview(raw: string): { text: string; images: string[] } {
  if (!raw.includes("<")) return { text: raw.trim(), images: [] };
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const images: string[] = [];
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (/^https?:\/\//i.test(src)) images.push(src);
    img.replaceWith(doc.createTextNode("[이미지]"));
  });
  doc.querySelectorAll("script, style, button").forEach((el) => el.remove());
  doc.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote").forEach((el) => el.append(doc.createTextNode("\n")));
  const text = (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, images };
}
