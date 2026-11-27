import { ENGLISH_PROFANITY_LIST, KOREAN_ALLOWED_PATTERNS, KOREAN_PROFANITY_LIST } from "./profanityWords.ts";

const ZERO_WIDTH_RE = /[\u200b-\u200d\ufeff]/g;
const HTML_TAG_RE = /<[^>]*>/g;

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

// 두 글자 이하의 짧은 비속어는 띄어쓰기를 넘어 찾으면 "다시 발송", "그게 이상해요"처럼 멀쩡한 문장이 걸린다.
// 그래서 짧은 비속어는 단어 안에서만 찾고, "시 발"·"ㅅ ㅂ"처럼 한 글자씩 띄운 우회만 이어 붙여 찾는다.
// 세 글자 이상은 띄어쓰기를 모두 무시하고 찾는다("개 새끼", "개새 끼").
const NON_SPACE_SEPARATORS_RE = /[.,_\-*!?~@#$%^&()[\]{}/\\|+=:;"'`]+/g;
const LONG_KOREAN_WORDS = KOREAN_PROFANITY_LIST.filter((word) => [...word].length > 2);
const hasAny = (text: string, words: readonly string[]) => words.some((word) => text.includes(word));

function containsKoreanProfanity(plain: string): boolean {
  let text = plain.toLowerCase();
  for (const pattern of KOREAN_ALLOWED_PATTERNS) text = text.replace(pattern, " ");
  const tokens = text.split(/\s+/).map((token) => token.replace(NON_SPACE_SEPARATORS_RE, "")).filter(Boolean);
  if (tokens.some((token) => hasAny(token, KOREAN_PROFANITY_LIST))) return true;
  let run = "";
  for (const token of [...tokens, ""]) {
    if ([...token].length === 1) { run += token; continue; }
    if ([...run].length > 1 && hasAny(run, KOREAN_PROFANITY_LIST)) return true;
    run = "";
  }
  return hasAny(tokens.join(""), LONG_KOREAN_WORDS);
}

/**
 * 입력 문자열에 비속어·욕설이 포함되어 있는지 검사한다.
 * HTML 태그, zero-width 문자, 공백/특수문자 우회 입력도 함께 탐지한다.
 */
export function containsProfanity(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const plain = decodeHtmlAndStripTags(String(raw));
  if (!plain.trim()) return false;

  if (containsKoreanProfanity(plain)) return true;

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
