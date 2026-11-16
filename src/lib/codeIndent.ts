// 코드 편집창의 자동 들여쓰기(이전 폴더의 바로 수정 편집창과 같은 규칙).
//  - Tab: 커서 자리에 들여쓰기 한 단계, 여러 줄을 선택했으면 선택한 줄 전체를 한 단계 들여쓰기
//  - Shift+Tab: 지금 줄(또는 선택한 줄 전체)을 한 단계 내어쓰기
//  - Enter: 직전 줄의 들여쓰기를 이어받고, 줄이 ':' '{' '(' '['로 끝나면 한 단계 더.
//    여는·닫는 괄호 사이("foo(|)")에서 누르면 안쪽 줄은 한 단계 더 들여쓰고 닫는 괄호는 아래 줄로 내려보낸다.
// 화면 쪽은 결과(TextEdit)를 insertText로 넣어, 되돌리기(Ctrl+Z)와 동시 편집에 보통 타이핑처럼 반영되게 한다.

// 파이썬은 관례상 4칸, 나머지는 2칸.
export function indentUnitFor(language: string | null): string {
  return language === "python" ? "    " : "  ";
}

// [start, end) 구간을 text로 바꾼 뒤, 새 글에서 [selStart, selEnd)를 선택 상태로 둔다(모두 글자 위치).
export interface TextEdit { start: number; end: number; text: string; selStart: number; selEnd: number }

const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

export function tabEdit(value: string, selStart: number, selEnd: number, outdent: boolean, unit: string): TextEdit | null {
  if (selStart === selEnd && !outdent) {
    const at = selStart + unit.length;
    return { start: selStart, end: selEnd, text: unit, selStart: at, selEnd: at };
  }
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  let lineEnd = value.indexOf("\n", Math.max(selEnd - 1, lineStart));
  if (lineEnd === -1) lineEnd = value.length;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  let firstDelta = 0;
  let totalDelta = 0;
  const next = lines.map((line, i) => {
    if (!outdent) {
      totalDelta += unit.length;
      if (i === 0) firstDelta = unit.length;
      return unit + line;
    }
    let removed = 0;
    if (line.startsWith("\t")) removed = 1;
    else while (removed < unit.length && line[removed] === " ") removed++;
    totalDelta -= removed;
    if (i === 0) firstDelta = -removed;
    return line.slice(removed);
  });
  const text = next.join("\n");
  if (text === value.slice(lineStart, lineEnd)) return null; // 더 내어쓸 것이 없다
  const newStart = Math.max(lineStart, selStart + firstDelta);
  const newEnd = Math.max(newStart, selEnd + totalDelta);
  return { start: lineStart, end: lineEnd, text, selStart: newStart, selEnd: newEnd };
}

export function enterEdit(value: string, selStart: number, selEnd: number, unit: string): TextEdit {
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  const beforeCaret = value.slice(lineStart, selStart);
  const leading = beforeCaret.match(/^[ \t]*/)?.[0] ?? "";
  const before = value[selStart - 1];
  const after = value[selEnd];
  // 여는 괄호와 짝이 되는 닫는 괄호 사이: 안쪽 줄 + 닫는 괄호 줄
  if (before && OPENERS[before] !== undefined && OPENERS[before] === after) {
    const inner = "\n" + leading + unit;
    return { start: selStart, end: selEnd, text: inner + "\n" + leading, selStart: selStart + inner.length, selEnd: selStart + inner.length };
  }
  const extra = /[:{([]$/.test(beforeCaret.trimEnd()) ? unit : "";
  const text = "\n" + leading + extra;
  return { start: selStart, end: selEnd, text, selStart: selStart + text.length, selEnd: selStart + text.length };
}
