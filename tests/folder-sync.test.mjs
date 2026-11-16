import test from 'node:test';
import assert from 'node:assert/strict';
import { planSync, isTextFileName } from '../src/lib/folderSync.ts';

// 로컬 폴더 ↔ 워크스페이스 양방향 동기화의 비교 규칙(이전 폴더의 폴더 연동과 같은 방식).
const server = (versionId, text) => ({ versionId, content: async () => text });
const plan = (o) => planSync({ inScope: () => true, initial: false, localFirst: false, baseline: new Map(), local: new Map(), server: new Map(), ...o });
const paths = (items) => items.map((x) => x.path).sort();

test('로컬에 새 파일이 생기면 올린다', async () => {
  const p = await plan({ local: new Map([['a.txt', 'A']]) });
  assert.deepEqual(paths(p.push), ['a.txt']);
  assert.equal(p.pull.length, 0);
});

test('워크스페이스에만 있는 새 파일은 받는다', async () => {
  const p = await plan({ server: new Map([['b.txt', server(5, 'B')]]) });
  assert.deepEqual(paths(p.pull), ['b.txt']);
  assert.equal(p.baseline.get('b.txt').versionId, 5);
});

test('로컬만 고치면 기준 버전을 붙여 올린다', async () => {
  const p = await plan({ local: new Map([['a.txt', 'A2']]), server: new Map([['a.txt', server(5, 'A')]]), baseline: new Map([['a.txt', { content: 'A', versionId: 5 }]]) });
  assert.deepEqual(p.push.map((x) => [x.path, x.baseVersionId]), [['a.txt', 5]]);
  assert.equal(p.pull.length, 0);
});

test('워크스페이스만 고쳤으면(버전 번호가 커졌으면) 받는다', async () => {
  const p = await plan({ local: new Map([['a.txt', 'A']]), server: new Map([['a.txt', server(6, 'A-server')]]), baseline: new Map([['a.txt', { content: 'A', versionId: 5 }]]) });
  assert.equal(p.pull[0].content, 'A-server');
  assert.equal(p.push.length, 0);
});

test('양쪽 다 고치면 서버 내용으로 덮지 않고 로컬을 기준 버전으로 올려 분기가 되게 한다', async () => {
  const p = await plan({ local: new Map([['a.txt', 'A-local']]), server: new Map([['a.txt', server(6, 'A-server')]]), baseline: new Map([['a.txt', { content: 'A', versionId: 5 }]]) });
  assert.equal(p.pull.length, 0);
  assert.deepEqual(p.push.map((x) => [x.baseVersionId, x.content]), [[5, 'A-local']]);
});

test('방금 올린 직후 목록이 아직 옛 버전이어도 되받지 않는다', async () => {
  const p = await plan({ local: new Map([['a.txt', 'A2']]), server: new Map([['a.txt', server(5, 'A')]]), baseline: new Map([['a.txt', { content: 'A2', versionId: 7 }]]) });
  assert.equal(p.pull.length, 0);
  assert.equal(p.push.length, 0);
});

test('로컬에서 지워도 워크스페이스 파일은 지우지 않고 다시 받지도 않는다', async () => {
  const p = await plan({ server: new Map([['a.txt', server(5, 'A')]]), baseline: new Map([['a.txt', { content: 'A', versionId: 5 }]]) });
  assert.equal(p.push.length + p.pull.length, 0);
  assert.equal(p.baseline.has('a.txt'), false);
});

test('처음 연결할 때 겹치는 파일: 기본은 워크스페이스 기준(받음), 로컬 기준 동기화는 로컬을 올림', async () => {
  const both = { local: new Map([['c.txt', 'L']]), server: new Map([['c.txt', server(3, 'S')]]), initial: true };
  assert.equal((await plan(both)).pull[0].content, 'S');
  assert.deepEqual((await plan({ ...both, localFirst: true })).push.map((x) => [x.content, x.baseVersionId]), [['L', 3]]);
});

test('내용이 같으면 아무것도 주고받지 않고 기준만 맞춘다', async () => {
  const p = await plan({ local: new Map([['c.txt', 'same']]), server: new Map([['c.txt', server(3, 'same')]]), initial: true });
  assert.equal(p.push.length + p.pull.length, 0);
  assert.equal(p.baseline.get('c.txt').versionId, 3);
});

test('동기화 범위 밖의 경로는 건드리지 않는다', async () => {
  const p = await plan({ local: new Map([['x/a.txt', '1'], ['y/b.txt', '2']]), inScope: (path) => path.startsWith('x/') });
  assert.deepEqual(paths(p.push), ['x/a.txt']);
});

test('글자 파일만 동기화 대상이다', () => {
  assert.ok(isTextFileName('a.md') && isTextFileName('Main.JAVA'));
  assert.ok(!isTextFileName('a.pdf') && !isTextFileName('img.png') && !isTextFileName('README'));
});
