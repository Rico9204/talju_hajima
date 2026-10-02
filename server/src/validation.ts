import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

// 입력 검사(class-validator) 실패를 한국어 안내로 바꾼다. 기본 문구는 영어("password must be longer than or equal to 6 characters")라
// 화면에 그대로 나가면 사용자가 알아보기 어렵다. 숫자(최소·최대 길이 등)는 기본 문구에서 읽어 온다.

// 항목 이름(DTO 필드) → 화면에 보일 이름. 없으면 "입력값".
const LABELS: Record<string, string> = {
  email: "이메일", password: "비밀번호", newPassword: "새 비밀번호", currentPassword: "현재 비밀번호",
  displayName: "이름", name: "이름", org: "소속", school: "학교", schoolName: "학교", major: "전공", student: "학번", contact: "연락처",
  title: "제목", text: "내용", content: "내용", message: "메시지", comment: "댓글", summary: "요약", detail: "상세 내용", note: "메모",
  question: "질문", options: "선택지", reason: "사유", category: "분류", tags: "태그", label: "이름", emoji: "이모지",
  url: "주소", link: "링크", links: "링크", attachments: "첨부 파일", path: "경로",
  date: "날짜", startDate: "시작일", endDate: "종료일", due: "마감일", deadline: "마감일",
  token: "링크", code: "코드", status: "상태", priority: "우선순위", role: "역할",
};

// 받침 유무에 맞는 조사(은/는, 을/를). 한글이 아니면 둘 다 적는다.
function particle(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}${withFinal}(${withoutFinal})`;
  return `${word}${(code - 0xac00) % 28 ? withFinal : withoutFinal}`;
}

const numberIn = (message: string | undefined, pattern: RegExp) => message?.match(pattern)?.[1];

function messageFor(error: ValidationError): string | null {
  const constraints = error.constraints ?? {};
  const keys = Object.keys(constraints);
  if (keys.length === 0) return null;
  const label = LABELS[error.property] ?? "입력값";
  if (keys.includes("whitelistValidation")) return `허용되지 않은 항목(${error.property})이 포함되어 있습니다.`;
  if (error.value === undefined || error.value === null) return `${particle(label, "을", "를")} 입력해 주세요.`;
  for (const key of ["isLength", "minLength", "maxLength"]) {
    const min = numberIn(constraints[key], /longer than or equal to (\d+)/);
    if (min) return `${particle(label, "은", "는")} ${min}자 이상이어야 합니다.`;
    const max = numberIn(constraints[key], /shorter than or equal to (\d+)/);
    if (max) return `${particle(label, "은", "는")} ${max}자 이하여야 합니다.`;
  }
  const most = numberIn(constraints.arrayMaxSize, /no more than (\d+)/);
  if (most) return `${particle(label, "은", "는")} 최대 ${most}개까지 넣을 수 있습니다.`;
  const least = numberIn(constraints.arrayMinSize, /at least (\d+)/);
  if (least) return `${particle(label, "은", "는")} ${least}개 이상이어야 합니다.`;
  if (keys.includes("isEmail")) return `${label} 형식이 올바르지 않습니다.`;
  if (keys.some((key) => ["isIn", "isEnum", "matches", "isUuid"].includes(key))) return `${label} 값이 올바르지 않습니다.`;
  return `${label} 값의 형식이 올바르지 않습니다.`;
}

// 중첩 객체(ValidateNested)의 오류까지 펼쳐 항목마다 한 문장.
function collect(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const own = messageFor(error);
    return [...(own ? [own] : []), ...collect(error.children ?? [])];
  });
}

export function validationException(errors: ValidationError[]): BadRequestException {
  const messages = [...new Set(collect(errors))];
  return new BadRequestException(messages.length > 0 ? messages.join(" ") : "입력값을 확인해 주세요.");
}
