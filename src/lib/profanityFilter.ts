import { ENGLISH_PROFANITY_LIST, KOREAN_PROFANITY_LIST } from "./profanityWords.ts";

const ZERO_WIDTH_RE = /[\u200b-\u200d\ufeff]/g;
const HTML_TAG_RE = /<[^>]*>/g;
const SEPARATORS_RE = /[\s.,_\-*!?~@#$%^&()[\]{}/\\|+=:;"'`]+/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ENGLISH_PROFANITY_RE = new RegExp(
  `(?:^|[^a-z])(?:${ENGLISH_PROFANITY_LIST.map(escapeRegExp).join("|")})(?:$|[^a-z])`,
  "i"
);

function decodeHtmlAndStripTags(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(HTML_TAG_RE, " ")
    .replace(ZERO_WIDTH_RE, "");
}

function normalizeForKoreanCheck(text: string): string {
  return text.toLowerCase().replace(SEPARATORS_RE, "");
}

/**
 * 입력 문자열에 비속어·욕설이 포함되어 있는지 검사한다.
 * HTML 태그, zero-width 문자, 공백/특수문자 우회 입력도 함께 탐지한다.
 */
export function containsProfanity(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const plain = decodeHtmlAndStripTags(String(raw));
  if (!plain.trim()) return false;

  const compactKo = normalizeForKoreanCheck(plain);
  for (const word of KOREAN_PROFANITY_LIST) {
    if (compactKo.includes(word)) {
      return true;
    }
  }

  // 영어는 구분자 제거 버전과 단어 경계 버전 모두 검사 (f.u.c.k 같은 우회 탐지 + classic 등 오탐 방지)
  const lower = plain.toLowerCase();
  const collapsedPunct = lower.replace(/[.\-_*]+/g, "");
  return ENGLISH_PROFANITY_RE.test(lower) || ENGLISH_PROFANITY_RE.test(collapsedPunct);
}

/**
 * 게시판 작성/수정/댓글 필드들을 검사하여 비속어가 포함된 첫 번째 항목의 안내 메시지를 반환한다.
 * 문제가 없으면 null을 반환한다.
 */
export function validateBoardProfanity(fields: {
  title?: string;
  content?: string;
  tags?: string[];
  pollQuestion?: string;
  pollOptions?: string[];
  comment?: string;
}): string | null {
  if (containsProfanity(fields.title)) {
    return "제목에 부적절한 표현(비속어)이 포함되어 있어 작성할 수 없습니다.";
  }
  if (containsProfanity(fields.content)) {
    return "본문에 부적절한 표현(비속어)이 포함되어 있어 작성할 수 없습니다.";
  }
  if (fields.tags?.some((t) => containsProfanity(t))) {
    return "태그에 부적절한 표현(비속어)이 포함되어 있어 작성할 수 없습니다.";
  }
  if (containsProfanity(fields.pollQuestion) || fields.pollOptions?.some((o) => containsProfanity(o))) {
    return "투표 내용에 부적절한 표현(비속어)이 포함되어 있어 작성할 수 없습니다.";
  }
  if (containsProfanity(fields.comment)) {
    return "댓글에 부적절한 표현(비속어)이 포함되어 있어 작성할 수 없습니다.";
  }
  return null;
}
