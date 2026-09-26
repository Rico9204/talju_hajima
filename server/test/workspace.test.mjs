// 워크스페이스 API: 폴더·파일 목록·댓글·반응·태그·삭제·정리 대기열. 원본 업로드는 파일 저장소 단계라 파일 행은 SQL로 만든다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
let fileId;

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  s = await setupProject(api, pg);
  fileId = (await pg.query("insert into files(project_id,name,type,uploader,avatar,size) values($1,'보고서.pdf','pdf','user1','u','1 KB') returning id", [s.projectId])).rows[0].id;
});
after(async () => { await app?.close(); await pg?.close(); });

test('폴더: 만든 사람 이름은 서버가 정하고, 하위 폴더·빈 이름·외부인을 구분한다', async () => {
  const root = await call(s.member, 'POST', `/projects/${s.p}/folders`, { name: ' 발표 자료 ', parentId: null });
  assert.equal(root.status, 201);
  assert.equal(root.body.name, '발표 자료');
  assert.equal(root.body.createdBy, 'user2');
  assert.match(root.body.date, /^\d{4}-\d{2}-\d{2}$/);
  const child = await call(s.member, 'POST', `/projects/${s.p}/folders`, { name: '1차', parentId: root.body.id });
  assert.equal(child.body.parentId, root.body.id);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/folders`, { name: '  ', parentId: null })).status, 400);
  assert.equal((await call(s.outsider, 'POST', `/projects/${s.p}/folders`, { name: '침입', parentId: null })).status, 403);
  const folders = await call(s.member, 'GET', `/projects/${s.p}/folders`);
  assert.deepEqual(folders.body.map((f) => f.name), ['발표 자료', '1차']);
  assert.deepEqual((await call(s.outsider, 'GET', `/projects/${s.p}/folders`)).body, []);
});

test('파일 목록과 댓글: 작성자는 서버가 정하고, 반응은 켜고 끌 수 있다', async () => {
  const comment = await call(s.member, 'POST', `/workspace/files/${fileId}/comments`, { text: '검토했어요' });
  assert.equal(comment.status, 201);
  assert.equal(comment.body.author, 'user2');
  assert.equal((await call(s.member, 'POST', `/workspace/files/${fileId}/comments`, { text: ' ' })).status, 400);
  assert.equal((await call(s.outsider, 'POST', `/workspace/files/${fileId}/comments`, { text: '침입' })).status, 400); // 파일 자체가 안 보임

  assert.equal((await call(s.leader, 'PUT', `/workspace/comments/${comment.body.id}/reaction`, { emoji: '👍', active: true })).status, 204);
  await call(s.leader, 'PUT', `/workspace/comments/${comment.body.id}/reaction`, { emoji: '👍', active: true }); // 두 번 눌러도 하나
  let files = (await call(s.member, 'GET', `/projects/${s.p}/files`)).body;
  assert.equal(files.length, 1);
  assert.equal(files[0].name, '보고서.pdf');
  assert.deepEqual(files[0].comments[0].reactions, [{ commentId: comment.body.id, memberId: s.leader.memberId, emoji: '👍' }]);
  await call(s.leader, 'PUT', `/workspace/comments/${comment.body.id}/reaction`, { emoji: '👍', active: false });
  files = (await call(s.member, 'GET', `/projects/${s.p}/files`)).body;
  assert.deepEqual(files[0].comments[0].reactions, []);
  assert.equal((await call(s.leader, 'PUT', `/workspace/comments/${comment.body.id}/reaction`, { emoji: '🔥', active: true })).status, 400);
  assert.deepEqual((await call(s.outsider, 'GET', `/projects/${s.p}/files`)).body, []);
});

test('태그·삭제·정리 대기열: DB 함수의 검사를 그대로 거친다', async () => {
  assert.equal((await call(s.member, 'PUT', `/workspace/files/${fileId}/tags`, { tags: ['발표', '최종'] })).status, 204);
  assert.deepEqual((await call(s.member, 'GET', `/projects/${s.p}/files`)).body[0].tags, ['발표', '최종']);
  const denied = await call(s.member, 'DELETE', `/workspace/files/${fileId}`); // 올린 사람도 팀장도 아님
  assert.equal(denied.status, 400);
  assert.equal((await call(s.leader, 'DELETE', `/workspace/files/${fileId}`)).status, 204);
  assert.deepEqual((await call(s.member, 'GET', `/projects/${s.p}/files`)).body, []);
  assert.ok(Array.isArray((await call(s.leader, 'GET', `/projects/${s.p}/workspace-cleanup`)).body));
  assert.ok(Array.isArray((await call(s.leader, 'GET', '/me/workspace-cleanup-projects')).body));
});
