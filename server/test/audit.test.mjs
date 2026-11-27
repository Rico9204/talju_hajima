// 접속 감사: 로그인(IP)·업로드·삭제 기록, 운영자만 조회(사용자 목록 → IP별 처음~마지막 접속 → IP별 상세 활동), 1년 보관, 계정 삭제 뒤에도 보존.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, origin, s;
const IP_A = '203.0.113.5';
const IP_B = '198.51.100.7';
const call = (user, method, path, body, ip) => api(user?.token ?? null, method, path, body, ip ? { 'x-vercel-forwarded-for': ip } : {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check) => { for (let i = 0; i < 100 && !(await check()); i++) await sleep(30); };
const count = async (where = 'true', params = []) => (await pg.query(`select count(*)::int as n from public.audit_log where ${where}`, params)).rows[0].n;

// multipart 업로드(IP 헤더를 붙인다)
async function send(user, ip, path, file, fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  const response = await fetch(`${origin}/api${path}`, { method: 'POST', headers: { authorization: `Bearer ${user.token}`, 'x-vercel-forwarded-for': ip }, body: form });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const fileOf = (name, text = 'hello') => ({ name, type: 'text/plain', bytes: Buffer.from(text) });
const usersOf = async (q = '') => (await call(s.op, 'GET', `/admin/audit/users?q=${encodeURIComponent(q)}`)).body;
const activitiesOf = async (user, ip) => (await call(s.op, 'GET', `/admin/audit/users/${user.id}/activities?ip=${encodeURIComponent(ip)}`)).body;

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api, origin } = await startApp(db, { trustVercelIp: true }));
  s = await setupProject(api, pg);
  s.op = s.admin; // 이 시험에서는 관리자 계정을 운영자로도 쓴다
  await pg.query('update profiles set is_operator = true where id = $1', [s.admin.id]);
});
after(async () => { await app?.close(); await pg?.close(); });

test('운영자만 볼 수 있다(로그인 필요, 일반 사용자·관리자만인 계정은 거절)', async () => {
  const paths = ['/admin/audit/users', `/admin/audit/users/${s.leader.id}/ips`, `/admin/audit/users/${s.leader.id}/activities?ip=x`];
  for (const path of paths) {
    assert.equal((await call(null, 'GET', path)).status, 401, path);
    for (const user of [s.leader, s.member, s.outsider]) assert.equal((await call(user, 'GET', path)).status, 403, `${user.email} ${path}`);
    assert.equal((await call(s.op, 'GET', path)).status, 200, path);
  }
  assert.equal((await call(s.op, 'GET', '/admin/audit/users/not-a-uuid/ips')).status, 400);
});

test('로그인 성공은 IP와 함께 기록되고, 실패는 기록되지 않는다', async () => {
  const login = (ip, password = 'correct-horse-1') => api(null, 'POST', '/auth/login', { email: s.leader.email, password }, { 'x-vercel-forwarded-for': ip });
  const before = await count();
  assert.equal((await login(IP_A, 'wrong-password')).status, 401);
  await sleep(150);
  assert.equal(await count(), before, '실패한 로그인은 기록하지 않는다');
  assert.equal((await login(IP_A)).status, 200);
  assert.equal((await login(IP_A)).status, 200);
  await sleep(1100);
  assert.equal((await login(IP_B)).status, 200);
  await until(async () => (await count('user_id = $1 and kind = $2', [s.leader.id, 'login'])) >= 3);
  const ips = (await call(s.op, 'GET', `/admin/audit/users/${s.leader.id}/ips`)).body;
  const a = ips.find((x) => x.ip === IP_A); const b = ips.find((x) => x.ip === IP_B);
  assert.equal(a.logins, 2);
  assert.equal(b.logins, 1);
  assert.ok(new Date(b.lastAt) > new Date(a.firstAt), '처음~마지막 접속 시각이 IP별로 계산된다');
  assert.ok(new Date(a.firstAt) <= new Date(a.lastAt));
  assert.equal(ips[0].ip, IP_B, '최근에 접속한 IP가 먼저');
});

test('업로드 기록: 파일 이름(한글 포함)·크기·프로젝트·새 버전 여부가 IP별로 남는다', async () => {
  const first = await send(s.leader, IP_A, `/projects/${s.p}/files`, fileOf('보고서.txt', 'hello world'), { folderId: '', note: '첫 버전' });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const next = await send(s.leader, IP_A, `/projects/${s.p}/files`, fileOf('보고서.txt', 'hello world 2'), { fileId: String(first.body.fileId), baseVersionId: String(first.body.versionId), folderId: '', note: '수정' });
  assert.equal(next.status, 201);
  await send(s.leader, IP_B, `/projects/${s.p}/files`, fileOf('다른곳.txt'), { folderId: '' });
  await until(async () => (await count("user_id = $1 and kind = 'upload'", [s.leader.id])) >= 3);
  const { items } = await activitiesOf(s.leader, IP_A);
  const uploads = items.filter((i) => i.kind === 'upload');
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].targetName, '보고서.txt');
  assert.equal(uploads[0].projectName, '팀 프로젝트');
  assert.equal(uploads[0].targetType, 'workspace_file');
  assert.equal(uploads[0].detail.size, 'hello world 2'.length);
  assert.equal(uploads[0].detail.newVersion, true); // 이미 있는 파일에 새 버전
  assert.equal(uploads[1].detail.newVersion, false);
  assert.deepEqual((await activitiesOf(s.leader, IP_B)).items.map((i) => i.targetName), ['다른곳.txt'], '다른 IP의 활동은 따로');
  s.reportFileId = first.body.fileId;
});

test('삭제 기록: 지우기 전의 이름·프로젝트가 남는다(파일·폴더·과제·일정), 실패한 삭제는 남지 않는다', async () => {
  const folder = await call(s.leader, 'POST', `/projects/${s.p}/folders`, { name: '자료실', parentId: null });
  const task = await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '자료 조사', assigneeIds: [s.leader.memberId], status: 'todo' });
  const event = await call(s.leader, 'POST', `/projects/${s.p}/schedule`, { title: '중간 발표', date: '2026-12-01', type: 'presentation', scope: 'team' });
  const before = await count("kind = 'delete'");
  // 권한 없는 사람의 삭제는 실패하고 기록되지 않는다
  assert.ok((await call(s.outsider, 'DELETE', `/workspace/files/${s.reportFileId}`, undefined, IP_A)).status >= 400);
  assert.ok((await call(s.leader, 'DELETE', '/workspace/files/999999', undefined, IP_A)).status >= 400);
  await sleep(200);
  assert.equal(await count("kind = 'delete'"), before);
  for (const [path, label] of [[`/workspace/files/${s.reportFileId}`, '파일'], [`/workspace/folders/${folder.body.id}`, '폴더'], [`/tasks/${task.body.id}`, '과제'], [`/schedule/${event.body.id}`, '일정']]) {
    assert.equal((await call(s.leader, 'DELETE', path, undefined, IP_A)).status, 204, label);
  }
  await until(async () => (await count("kind = 'delete'")) >= before + 4);
  const deletes = (await activitiesOf(s.leader, IP_A)).items.filter((i) => i.kind === 'delete');
  const by = (type) => deletes.find((d) => d.targetType === type);
  assert.equal(by('workspace_file').targetName, '보고서.txt');
  assert.equal(by('workspace_file').projectName, '팀 프로젝트');
  assert.equal(by('workspace_folder').targetName, '자료실');
  assert.equal(by('task').targetName, '자료 조사');
  assert.equal(by('schedule_event').targetName, '중간 발표');
  assert.equal(by('task').targetId, String(task.body.id));
});

test('조회·일반 쓰기 요청은 활동으로 남기지 않는다(업로드·삭제만)', async () => {
  const before = await count("kind in ('upload', 'delete')");
  await call(s.leader, 'GET', `/projects/${s.p}/files`, undefined, IP_A);
  await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '기록 안 됨', assigneeIds: [s.leader.memberId], status: 'todo' }, IP_A);
  await call(s.member, 'GET', `/projects/${s.p}/tasks`, undefined, IP_A);
  await sleep(250);
  assert.equal(await count("kind in ('upload', 'delete')"), before);
});

test('사용자 목록: 이름·이메일 검색(대소문자 무시, %·_ 는 글자로), 횟수, 페이지', async () => {
  const all = await usersOf();
  const leader = all.items.find((u) => u.userId === s.leader.id);
  assert.equal(leader.email, s.leader.email);
  assert.equal(leader.name, 'user1');
  assert.equal(leader.logins, 4); // 시험 준비(가입 뒤 로그인) 1번 + 위에서 한 3번
  assert.equal(leader.uploads, 3);
  assert.equal(leader.deletes, 4);
  assert.equal(leader.ipCount, 3); // 203.0.113.5, 198.51.100.7, 그리고 헤더 없이 한 준비 로그인(127.0.0.1)
  assert.equal(leader.active, true);
  assert.ok(new Date(leader.firstAt) <= new Date(leader.lastAt));
  assert.deepEqual((await usersOf(s.leader.email.toUpperCase())).items.map((u) => u.userId), [s.leader.id]);
  assert.deepEqual((await usersOf('없는사람')).items, []);
  assert.deepEqual((await usersOf('%')).items, [], '%는 모든 글자와 맞는 기호가 아니라 그냥 글자다');
  const page = (await call(s.op, 'GET', '/admin/audit/users?limit=1')).body;
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, all.items.length > 1);
});

test('상세 활동은 최신순이고 이어서 받을 수 있다', async () => {
  const first = (await call(s.op, 'GET', `/admin/audit/users/${s.leader.id}/activities?ip=${IP_A}&limit=2`)).body;
  assert.equal(first.items.length, 2);
  assert.ok(first.nextBefore);
  assert.ok(first.items[0].id > first.items[1].id);
  const second = (await call(s.op, 'GET', `/admin/audit/users/${s.leader.id}/activities?ip=${IP_A}&limit=10&before=${first.nextBefore}`)).body;
  assert.ok(second.items.every((i) => i.id < first.nextBefore));
  assert.equal(first.items.length + second.items.length, 6); // 업로드 2 + 삭제 4
  assert.equal(second.nextBefore, null);
});

test('계정이 삭제돼도 기록은 그때의 이메일·이름으로 남는다(비활성 표시)', async () => {
  await call(s.member, 'POST', `/projects/${s.p}/tasks`, { title: 'x', assigneeIds: [s.member.memberId], status: 'todo' }, IP_A).catch(() => {});
  await send(s.member, IP_A, `/projects/${s.p}/files`, fileOf('멤버파일.txt'), { folderId: '' });
  await until(async () => (await count('user_id = $1', [s.member.id])) >= 1);
  await pg.query('delete from auth.users where id = $1', [s.member.id]); // 탈퇴 승인·자동 삭제와 같은 결과
  const gone = (await usersOf()).items.find((u) => u.userId === s.member.id);
  assert.ok(gone, '삭제된 계정의 기록도 목록에 있다');
  assert.equal(gone.active, false);
  assert.equal(gone.email, s.member.email);
  assert.equal((await activitiesOf(s.member, IP_A)).items[0].targetName, '멤버파일.txt');
});

test('보관 기간 1년: 오래된 기록만 지우고 최근 기록은 남긴다', async () => {
  await pg.query("insert into public.audit_log(at, user_id, ip, kind) values (now() - interval '366 days', $1, '192.0.2.1', 'login'), (now() - interval '364 days', $1, '192.0.2.1', 'login')", [s.outsider.id]);
  const removed = (await pg.query('select public.purge_audit_log() as n')).rows[0].n;
  assert.equal(Number(removed), 1);
  assert.equal(await count("user_id = $1 and ip = '192.0.2.1'", [s.outsider.id]), 1);
});

test('기록은 앱 계정으로 고치거나 지울 수 없다(서버만 쓴다)', async () => {
  await pg.exec('set role authenticated');
  try {
    await assert.rejects(pg.query("insert into public.audit_log(user_id, ip, kind) values ('00000000-0000-0000-0000-000000000009', '1.1.1.1', 'login')"), /permission denied/);
    await assert.rejects(pg.query("update public.audit_log set ip = '9.9.9.9'"), /permission denied/);
    await assert.rejects(pg.query('delete from public.audit_log'), /permission denied/);
    await assert.rejects(pg.query('select public.purge_audit_log()'), /permission denied/);
  } finally { await pg.exec('reset role'); }
});
