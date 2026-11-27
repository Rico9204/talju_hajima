// 게시판 비속어 필터: 화면을 거치지 않고 API를 바로 불러도 서버가 막는다. 일상 표현(오탐 방지 목록)은 통과한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const post = (title, content = '<p>내용</p>', over = {}) => ({ category: 'free', title, content, attachments: [], ...over });

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  s = await setupProject(api, pg);
});
after(async () => { await app?.close(); await pg?.close(); });

test('글: 제목·본문·태그에 비속어가 있으면 400과 안내 문구, 아무것도 저장되지 않는다', async () => {
  const before = (await pg.query('select count(*)::int as n from board_posts')).rows[0].n;
  for (const [body, field] of [[post('시 발 진짜'), '제목'], [post('정상 제목', '<p>개 새끼</p>'), '본문'], [post('정상 제목', '<p>정상</p>', { tags: ['ㅅㅂ'] }), '태그']]) {
    const res = await call(s.member, 'POST', '/board/posts', body);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(JSON.stringify(res.body), new RegExp(field));
  }
  assert.equal((await pg.query('select count(*)::int as n from board_posts')).rows[0].n, before);
});

test('글: 띄어쓰기를 넘는 문장과 일상 표현은 통과하고, 고칠 때도 같은 검사를 한다', async () => {
  const res = await call(s.member, 'POST', '/board/posts', post('다시 발송합니다', '<p>시발점부터 정리, 새끼 고양이 사진, 3조까지 발표</p>'));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  s.postId = res.body.id;
  assert.equal((await call(s.member, 'PATCH', `/board/posts/${s.postId}`, { title: '병신아' })).status, 400);
  assert.equal((await call(s.member, 'PATCH', `/board/posts/${s.postId}`, { title: '그게 이상해요' })).status, 204);
});

test('댓글: 비속어는 막고 일상 표현은 통과한다', async () => {
  assert.equal((await call(s.leader, 'POST', `/board/posts/${s.postId}/comments`, { content: '꺼져' })).status, 400);
  const ok = await call(s.leader, 'POST', `/board/posts/${s.postId}/comments`, { content: '화면이 꺼져 있어요' });
  assert.ok(ok.status === 201 || ok.status === 204, JSON.stringify(ok.body));
});
