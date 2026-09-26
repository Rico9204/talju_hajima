// 기능 API: 실제 가입 API로 받은 토큰으로 호출하고, 권한 규칙(RLS)·DB 함수의 검사가 서버 경유로도 그대로인지 본다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, startApp } from './helpers.mjs';

let pg, db, app, api;
// 0 관리자, 1 팀장(p·q), 2 부팀장(p), 3·4 팀원(p)
const user = [];
const member = {};

before(async () => {
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  for (let i = 0; i < 5; i++) {
    const res = await api(null, 'POST', '/auth/signup', { email: `user${i}@example.com`, password: 'correct-horse-1', displayName: `사용자${i}` });
    assert.equal(res.status, 201);
    user.push({ id: res.body.user.id, token: res.body.accessToken });
  }
  await pg.query('update profiles set is_admin=true where id=$1', [user[0].id]);
  // 프로젝트·팀원 준비는 아직 API가 없어 "그 사용자로서" SQL로 한다(권한 규칙은 그대로 적용).
  const as = (i, sql, params) => db.asUser(user[i].id, (query) => query(sql, params));
  for (const pid of ['p', 'q']) {
    await as(1, "insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')", [pid, user[0].id]);
    await as(1, "insert into members(project_id,name,role,major,student,avatar,color,is_leader) values($1,'사용자1','팀원','','','팀','#123456',true)", [pid]);
  }
  for (const i of [2, 3, 4]) {
    member[i] = (await as(i, "insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',false) returning id", [`사용자${i}`]))[0].id;
  }
  member[1] = (await pg.query("select id from members where project_id='p' and user_id=$1", [user[1].id])).rows[0].id;
  await as(0, "select review_project('p','approved')");
  await as(0, "select review_project('q','approved')");
  await as(1, 'select set_vice_leader($1,true)', [member[2]]);
});
after(async () => { await app?.close(); await pg?.close(); });

const call = (i, method, path, body) => api(i === null ? null : user[i].token, method, path, body);

test('상태 확인은 로그인 없이, 나머지는 로그인 토큰이 있어야 한다', async () => {
  const health = await call(null, 'GET', '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });
  assert.equal((await call(null, 'GET', '/me/project-alerts')).status, 401);
});

let group;
test('단체방: 팀장·부팀장만 만들고, DB 함수의 한국어 안내가 그대로 전달된다', async () => {
  const created = await call(1, 'POST', '/projects/p/chat-groups', { name: '발표 준비', memberIds: [member[2], member[3]] });
  assert.equal(created.status, 201);
  group = created.body.id;
  const denied = await call(3, 'POST', '/projects/p/chat-groups', { name: '몰래 방', memberIds: [member[2], member[4]] });
  assert.equal(denied.status, 400);
  assert.match(denied.body.message, /팀장 또는 부팀장만/);
});

test('입력 검증: 정의하지 않은 필드·uuid가 아닌 값·빈 이름은 DB에 닿기 전에 거부', async () => {
  assert.equal((await call(1, 'POST', '/projects/p/chat-groups', { name: '방', memberIds: [member[2], member[3]], isAdmin: true })).status, 400);
  assert.equal((await call(1, 'POST', '/projects/p/chat-groups', { name: '방', memberIds: ['not-a-uuid'] })).status, 400);
  assert.equal((await call(1, 'POST', '/projects/p/chat-groups', { name: '', memberIds: [member[2], member[3]] })).status, 400);
  assert.equal((await call(1, 'POST', '/chat-groups/not-a-uuid/members', { memberIds: [member[4]] })).status, 400);
});

test('읽기 권한(RLS)이 서버 경유로도 그대로: 방 참여자만 방과 메시지를 본다', async () => {
  const mine = await call(2, 'GET', '/projects/p/chat-groups');
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.map((g) => g.id), [group]);
  assert.deepEqual((await call(4, 'GET', '/projects/p/chat-groups')).body, []);
  const channel = encodeURIComponent(`grp:${group}`);
  const messages = await call(3, 'GET', `/projects/p/chat/${channel}/messages`);
  assert.equal(messages.status, 200);
  assert.equal(messages.body.length, 1);
  assert.match(messages.body[0].text, /발표 준비/);
  assert.deepEqual(messages.body[0].message_reads, []);
  assert.match(messages.body[0].created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual((await call(4, 'GET', `/projects/p/chat/${channel}/messages`)).body, []);
});

test('초대: 방에 있는 부팀장이 초대하면 초대받은 사람도 방을 본다', async () => {
  assert.equal((await call(2, 'POST', `/chat-groups/${group}/members`, { memberIds: [member[4]] })).status, 204);
  assert.deepEqual((await call(4, 'GET', '/projects/p/chat-groups')).body.map((g) => g.id), [group]);
});

test('워크스페이스: 파일 이동·폴더 삭제가 DB 함수의 검사를 그대로 거친다', async () => {
  const folder = async (pid) => (await pg.query("insert into folders(project_id,name,color,created_by) values($1,'폴더','#123456','사용자') returning id", [pid])).rows[0].id;
  const fA = await folder('p'); const fB = await folder('p'); const fOther = await folder('q');
  const fileId = (await pg.query("insert into files(project_id,name,type,uploader,avatar,size,folder_id) values('p','보고서.pdf','pdf','사용자','팀','1 KB',$1) returning id", [fA])).rows[0].id;

  assert.equal((await call(3, 'POST', `/workspace/files/${fileId}/move`, { folderId: fB })).status, 204);
  assert.equal((await pg.query('select folder_id from files where id=$1', [fileId])).rows[0].folder_id, fB);
  assert.equal((await call(3, 'POST', `/workspace/files/${fileId}/move`, { folderId: null })).status, 204);
  const other = await call(3, 'POST', `/workspace/files/${fileId}/move`, { folderId: fOther });
  assert.equal(other.status, 400);
  assert.match(other.body.message, /폴더를 찾을 수 없/);
  assert.equal((await call(3, 'POST', `/workspace/files/${fileId}/move`, {})).status, 400);

  await call(3, 'POST', `/workspace/files/${fileId}/move`, { folderId: fA });
  const nonEmpty = await call(1, 'DELETE', `/workspace/folders/${fA}`);
  assert.equal(nonEmpty.status, 400);
  assert.match(nonEmpty.body.message, /파일이 있는 폴더/);
  assert.equal((await call(1, 'DELETE', `/workspace/folders/${fB}`)).status, 204);
});

test('메인 화면 알림: 새 과제가 생기면 그 프로젝트가 나오고, 과제 화면을 보면 빠진다', async () => {
  await call(1, 'POST', '/projects/q/sections/tasks/viewed');
  await pg.query("insert into tasks(project_id,title,assignee,avatar,priority,due,status,color) values('q','새 과제','사용자1','팀','mid','내일','todo','#123456')");
  assert.ok((await call(1, 'GET', '/me/project-alerts')).body.includes('q'));
  assert.equal((await call(1, 'POST', '/projects/q/sections/tasks/viewed')).status, 204);
  assert.ok(!(await call(1, 'GET', '/me/project-alerts')).body.includes('q'));
  const wrong = await call(1, 'POST', '/projects/q/sections/secret/viewed');
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /잘못된 섹션/);
});
