// 게시판 글 태그 정리(서버 server/src/mappers.ts의 normalizeBoardTags와 같은 규칙).
// 앞의 #·겹친 공백 제거, 내부 표시 이름(미리보기 방지) 제외, 대소문자 무시 중복 제거, 최대 10개·각 30자.
export const MAX_BOARD_TAGS = 10;
const FLAG_TAGS = ["hide_image_preview", "no_preview"];

export function normalizeBoardTags(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const tag = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 30);
    const key = tag.toLowerCase();
    if (!tag || FLAG_TAGS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_BOARD_TAGS) break;
  }
  return out;
}

// 입력칸 글을 쉼표로 나눠 태그로("공모전, #AI" → ["공모전", "AI"]).
export function splitTagInput(text: string): string[] {
  return text.split(/[,，]/);
}

export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
