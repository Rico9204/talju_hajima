// 코드 문법 색칠: 확장자 → 언어, 토큰을 이어 붙이면 원문과 같고 주석·문자열·키워드가 제 색으로 나뉜다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { codeLanguageOf, tokenizeCode, tokenLines } from '../src/lib/codeHighlight.ts';
import { CODE_EXTENSIONS, codeBadgeLabel, isEditableTextFile } from '../src/lib/workspaceFiles.ts';

const kinds = (tokens) => tokens.filter((t) => t.kind).map((t) => [t.kind, t.text]);
const joined = (tokens) => tokens.map((t) => t.text).join('');

test('코드 확장자는 바로 수정 대상이고 언어가 정해진다', () => {
  for (const name of ['main.c', 'Main.java', 'app.py', 'index.TSX', 'query.sql']) assert.equal(isEditableTextFile(name, 1000), true, name);
  assert.equal(isEditableTextFile('Main.java', 300_000), false);
  assert.equal(isEditableTextFile('photo.png', 10), false);
  assert.equal(codeLanguageOf('a.h'), 'c');
  assert.equal(codeLanguageOf('Main.JAVA'), 'java');
  assert.equal(codeLanguageOf('notes.txt'), null);
  assert.ok(CODE_EXTENSIONS.includes('cpp'));
});

test('C: 전처리·주석·문자열·숫자·키워드', () => {
  const src = '#include <stdio.h>\nint main(void) { // 시작\n  printf("hi %d\\n", 42); /* 끝 */\n  return 0;\n}\n';
  const tokens = tokenizeCode(src, 'c');
  assert.equal(joined(tokens), src);
  assert.deepEqual(kinds(tokens), [
    ['meta', '#include <stdio.h>'], ['keyword', 'int'], ['keyword', 'void'], ['comment', '// 시작'],
    ['string', '"hi %d\\n"'], ['number', '42'], ['comment', '/* 끝 */'], ['keyword', 'return'], ['number', '0'],
  ]);
});

test('Java: 어노테이션, 대문자 타입, 단어 속 숫자는 그대로', () => {
  const tokens = tokenizeCode('@Override\npublic String name2() { return "a\'b"; }', 'java');
  assert.deepEqual(kinds(tokens), [['meta', '@Override'], ['keyword', 'public'], ['type', 'String'], ['keyword', 'return'], ['string', '"a\'b"']]);
});

test('Python: 세 겹 따옴표 문자열은 여러 줄, # 주석', () => {
  const src = 'def f():\n    """설명\n    끝"""\n    return None  # 없음\n';
  const tokens = tokenizeCode(src, 'python');
  assert.equal(joined(tokens), src);
  assert.deepEqual(kinds(tokens), [['keyword', 'def'], ['string', '"""설명\n    끝"""'], ['keyword', 'return'], ['keyword', 'None'], ['comment', '# 없음']]);
});

test('SQL 키워드는 대소문자 구분 없음, 닫히지 않은 문자열은 줄 끝까지', () => {
  assert.deepEqual(kinds(tokenizeCode("SELECT * from t -- x\nwhere a = 'b", 'sql')),
    [['keyword', 'SELECT'], ['keyword', 'from'], ['comment', '-- x'], ['keyword', 'where'], ['string', "'b"]]);
});

test('HTML: 태그·속성·문자열·주석', () => {
  const src = '<!-- c --><a href="/x">링크</a>';
  const tokens = tokenizeCode(src, 'markup');
  assert.equal(joined(tokens), src);
  assert.deepEqual(kinds(tokens), [['comment', '<!-- c -->'], ['tag', '<a'], ['attr', 'href'], ['string', '"/x"'], ['tag', '>'], ['tag', '</a'], ['tag', '>']]);
});

test('줄 나누기: 여러 줄 주석도 줄마다 나뉘고 빈 줄이 유지된다', () => {
  const lines = tokenLines(tokenizeCode('/* a\nb */\n\nx', 'c'));
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map((l) => l.map((t) => t.text).join('')), ['/* a', 'b */', '', 'x']);
  assert.equal(lines[1][0].kind, 'comment');
});

test('코드 파일 배지는 확장자 이름, 다른 파일은 null', () => {
  assert.equal(codeBadgeLabel('Main.java'), 'JAVA');
  assert.equal(codeBadgeLabel('app.PY'), 'PY');
  assert.equal(codeBadgeLabel('gradle.properties'), 'PROP');
  assert.equal(codeBadgeLabel('보고서.docx'), null);
  assert.equal(codeBadgeLabel('notes.txt'), null);
});
