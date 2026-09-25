// 채팅 멘션(@이름) 판정과 강조 구간 찾기.
// "텍스트에 @이름이 들어 있는지"만 보면 이름이 "김"인 팀원이 "@김철수"에도 불리고, a@b.com 같은 메일 주소도
// 멘션처럼 보인다. 그래서 @ 앞은 글자가 아니어야 하고(메일 주소 제외), 이름 뒤도 이름에 쓰이는 글자가 아니어야
// 한다(더 긴 이름의 일부 제외). 이름에 공백이 있어도 팀원 이름 목록과 통째로 비교하므로 끝까지 강조된다.

export const MENTION_ALL = ["전체", "all"];

const NAME_CHAR = /[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MentionRange {
  start: number; // "@" 위치
  end: number; // 이름 끝(다음 글자 위치)
  name: string;
}

// 팀원 이름과 @전체/@all을 텍스트에서 찾는다. 긴 이름을 먼저 맞춰 "김"이 "김철수"를 가로채지 않게 한다.
export function findMentions(text: string, names: string[]): MentionRange[] {
  const candidates = [...new Set([...MENTION_ALL, ...names.map((n) => n.trim()).filter(Boolean)])].sort((a, b) => b.length - a.length);
  if (!text.includes("@") || candidates.length === 0) return [];
  const pattern = new RegExp(`@(${candidates.map(escapeRegExp).join("|")})`, "gi");
  const found: MentionRange[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = start > 0 ? text[start - 1] : "";
    const after = text[end] ?? "";
    if (before && (NAME_CHAR.test(before) || before === "@" || before === ".")) continue; // 메일 주소 등
    if (after && NAME_CHAR.test(after)) continue; // 더 긴 이름의 일부
    found.push({ start, end, name: match[1] });
  }
  return found;
}

// 이 멤버를 부른 멘션(본인 이름 또는 @전체/@all)이 있는지.
export function isMentionForMember(text: string | null | undefined, memberName: string | null | undefined, allNames: string[] = []): boolean {
  if (!text || !memberName) return false;
  const me = memberName.trim().toLowerCase();
  return findMentions(text, [...allNames, memberName]).some((m) => {
    const name = m.name.toLowerCase();
    return name === me || MENTION_ALL.includes(name);
  });
}
