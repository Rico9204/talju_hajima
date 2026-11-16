import test from 'node:test';
import assert from 'node:assert/strict';
import { enterEdit, indentUnitFor, tabEdit } from '../src/lib/codeIndent.ts';

// 코드 편집창 자동 들여쓰기(이전 폴더의 바로 수정 편집창과 같은 규칙). 결과를 글에 적용해 확인한다.
const apply = (value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end);
const U = '  ';

test('들여쓰기 단위: 파이썬은 4칸, 나머지는 2칸', () => {
  assert.equal(indentUnitFor('python'), '    ');
  assert.equal(indentUnitFor('javascript'), '  ');
  assert.equal(indentUnitFor(null), '  ');
});

test('Enter: 직전 줄의 들여쓰기를 이어받는다', () => {
  const v = '  foo();';
  const e = enterEdit(v, v.length, v.length, U);
  assert.equal(apply(v, e), '  foo();\n  ');
  assert.equal(e.selStart, v.length + 3); // 커서는 새 줄의 들여쓰기 뒤
});

test('Enter: ":" "{" "(" "["로 끝나는 줄은 한 단계 더 들여쓴다(뒤 공백은 무시)', () => {
  for (const line of ['if x:', 'function f() {', 'foo(', 'const a = [', 'if x:   ']) {
    const e = enterEdit(line, line.length, line.length, U);
    assert.equal(apply(line, e), line + '\n' + U, line);
  }
  const py = enterEdit('def f():', 8, 8, indentUnitFor('python'));
  assert.equal(apply('def f():', py), 'def f():\n    ');
});

test('Enter: 괄호 사이에서는 안쪽 줄을 들여쓰고 닫는 괄호를 아래 줄로 내린다', () => {
  const v = 'foo({})';
  const e = enterEdit(v, 5, 5, U); // foo({|})
  assert.equal(apply(v, e), 'foo({\n  \n})');
  assert.equal(e.selStart, 5 + 1 + 2); // 안쪽 줄의 들여쓰기 뒤
  const v2 = '  if (a) {}';
  const e2 = enterEdit(v2, 10, 10, U);
  assert.equal(apply(v2, e2), '  if (a) {\n    \n  }');
});

test('Enter: 따옴표 사이나 짝이 아닌 글자 사이는 그냥 줄바꿈 + 들여쓰기만', () => {
  const v = '  x = ""';
  assert.equal(apply(v, enterEdit(v, 7, 7, U)), '  x = "\n  "');
});

test('Enter: 선택 영역이 있으면 그 부분을 지우고 줄바꿈', () => {
  const v = '  abcdef';
  assert.equal(apply(v, enterEdit(v, 4, 6, U)), '  ab\n  ef');
});

test('Enter: 여러 줄 글의 중간 줄에서도 그 줄의 들여쓰기를 쓴다', () => {
  const v = 'a\n    b\nc';
  const e = enterEdit(v, 7, 7, U); // "    b" 끝
  assert.equal(apply(v, e), 'a\n    b\n    \nc');
});

test('Tab: 커서만 있으면 그 자리에 한 단계', () => {
  const e = tabEdit('abc', 1, 1, false, U);
  assert.equal(apply('abc', e), 'a  bc');
  assert.equal(e.selStart, 3);
});

test('Tab: 여러 줄을 선택하면 선택한 줄 전체를 들여쓰고 선택 영역을 유지한다', () => {
  const v = 'a\nb\nc';
  const e = tabEdit(v, 0, 3, false, U); // "a\nb" 선택
  assert.equal(apply(v, e), '  a\n  b\nc');
  assert.equal(e.selStart, 2); // 첫 줄 들여쓰기 뒤
  assert.equal(e.selEnd, 3 + 4); // 두 줄 만큼 늘어남
  // 마지막 줄 맨 앞에서 끝난 선택은 그 줄을 포함하지 않는다
  assert.equal(apply('a\nb\n', tabEdit('a\nb\n', 0, 4, false, U)), '  a\n  b\n');
});

test('Shift+Tab: 선택한 줄(또는 지금 줄)을 한 단계 내어쓴다, 더 내어쓸 게 없으면 아무 것도 안 한다', () => {
  const v = '    a\n  b\nc';
  assert.equal(apply(v, tabEdit(v, 0, v.length, true, U)), '  a\nb\nc');
  assert.equal(apply('    a', tabEdit('    a', 5, 5, true, U)), '  a'); // 커서만 있어도 지금 줄
  assert.equal(tabEdit('a', 1, 1, true, U), null);
  assert.equal(apply('\tx', tabEdit('\tx', 2, 2, true, U)), 'x'); // 탭 문자도 내어쓴다
  assert.equal(apply(' x', tabEdit(' x', 2, 2, true, U)), 'x'); // 한 단계보다 적은 공백도 가능한 만큼
});
