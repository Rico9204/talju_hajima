// node tests/collab-core.test.mjs
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { applyTextEdit, seedDoc, textHash, transformIndex } from '../src/lib/collabCore.ts';

let count = 0;
function check(name, fn) { fn(); console.log('PASS ' + name); count++; }
const exchange = (a, b) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
};

check('같은 초기 텍스트를 각자 seed해도 합칠 때 중복되지 않음', () => {
  const a = new Y.Doc(); const b = new Y.Doc();
  seedDoc(a, 'hello\nworld'); seedDoc(b, 'hello\nworld');
  exchange(a, b);
  assert.equal(a.getText('t').toString(), 'hello\nworld');
  assert.equal(b.getText('t').toString(), 'hello\nworld');
});
check('동시에 다른 위치를 고치면 둘 다 반영되고 수렴', () => {
  const a = new Y.Doc(); const b = new Y.Doc();
  seedDoc(a, 'aaa\nbbb\nccc'); seedDoc(b, 'aaa\nbbb\nccc');
  applyTextEdit(a, 'aaa\nbbb\nccc', 'AAA\nbbb\nccc');
  applyTextEdit(b, 'aaa\nbbb\nccc', 'aaa\nbbb\nCCC');
  exchange(a, b);
  assert.equal(a.getText('t').toString(), 'AAA\nbbb\nCCC');
  assert.equal(b.getText('t').toString(), a.getText('t').toString());
});
check('나중에 들어온 사람이 상태 벡터로 받은 diff로 따라잡음', () => {
  const a = new Y.Doc(); seedDoc(a, 'x'); applyTextEdit(a, 'x', 'x y z');
  const late = new Y.Doc(); seedDoc(late, 'x');
  Y.applyUpdate(late, Y.encodeStateAsUpdate(a, Y.encodeStateVector(late)), 'remote');
  assert.equal(late.getText('t').toString(), 'x y z');
});
check('원격 삽입/삭제 뒤 커서 인덱스 이동', () => {
  assert.equal(transformIndex(5, [{ insert: 'ab' }, { retain: 10 }]), 7); // 앞에 삽입 → 밀림
  assert.equal(transformIndex(5, [{ retain: 8 }, { insert: 'ab' }]), 5); // 뒤에 삽입 → 그대로
  assert.equal(transformIndex(5, [{ delete: 3 }]), 2); // 앞을 지움 → 당겨짐
});
check('한글 조합 중 상대가 앞쪽을 고쳐도 조합 결과가 제자리에 들어감', () => {
  const me = new Y.Doc(); const other = new Y.Doc();
  seedDoc(me, 'abc XYZ'); seedDoc(other, 'abc XYZ');
  const base = me.getText('t').toString(); // 조합 시작 시점
  const remote = [];
  me.getText('t').observe((e) => { if (e.transaction.origin === 'remote') remote.push(e.delta); });
  other.getText('t').insert(0, '0123456789'); // 조합 중 상대가 맨 앞에 10글자 추가
  exchange(me, other);
  // 나는 'abc '와 'XYZ' 사이에 '한글'을 입력하고, 'XYZ'의 'X'를 지웠다(조합 끝 시점의 textarea는 옛 기준)
  applyTextEdit(me, base, 'abc 한글YZ', remote);
  exchange(me, other);
  assert.equal(me.getText('t').toString(), '0123456789abc 한글YZ');
  assert.equal(other.getText('t').toString(), '0123456789abc 한글YZ');
});
check('원격 변경 보정 없이 적용하면 위치가 어긋남(보정이 필요한 이유)', () => {
  const me = new Y.Doc(); const other = new Y.Doc();
  seedDoc(me, 'abc XYZ'); seedDoc(other, 'abc XYZ');
  const base = me.getText('t').toString();
  other.getText('t').insert(0, '0123456789');
  exchange(me, other);
  applyTextEdit(me, base, 'abc 한글YZ');
  assert.notEqual(me.getText('t').toString(), '0123456789abc 한글YZ');
});
check('해시는 내용이 다르면 다름', () => {
  assert.notEqual(textHash('abc'), textHash('abd'));
});
console.log(count + ' collab-core checks passed');
