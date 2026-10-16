// node tests/text-diff.test.mjs
import assert from 'node:assert/strict';
import { buildFullTextDiff } from '../src/lib/textDiff.ts';

let count = 0;
function check(name, fn) { fn(); console.log('PASS ' + name); count++; }

check('고친 줄은 changed + 이전 내용, 나머지는 그대로', () => {
  const lines = buildFullTextDiff('a\nb\nc', 'a\nB\nc');
  assert.deepEqual(lines.map((l) => [l.text, l.changed, l.oldText]), [['a', false, null], ['B', true, 'b'], ['c', false, null]]);
});
check('새로 추가된 줄은 oldText null', () => {
  const lines = buildFullTextDiff('a', 'a\nnew');
  assert.deepEqual(lines[1], { text: 'new', changed: true, oldText: null });
});
check('CRLF와 끝 개행 차이는 변경으로 보지 않음', () => {
  assert.equal(buildFullTextDiff('a\r\nb\r\n', 'a\nb').filter((l) => l.changed).length, 0);
});
console.log(count + ' text-diff checks passed');
