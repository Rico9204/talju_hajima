// 관리자 공지(기간·대상·다시 보지 않기·실시간 알림), 홈 "전체 일정" 조회, 로컬 폴더 동기화 접속 표시.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, origin, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10); // 한국 시간 기준 날짜
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const make = (over = {}) => ({ title: '공지', body: '내용', startDate: day(0), endDate: day(1), targetAll: true, projectIds: [], ...over });
const activeIds = async (user) => (await call(user, 'GET', '/announcements/active')).body.map((a) => a.id);

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api, origin } = await startApp(db));
  s = await setupProject(api, pg);
});
after(async () => { await app?.close(); await pg?.close(); });

test('공지 만들기·삭제는 관리자만, 입력은 검증한다', async () => {
  assert.equal((await call(null, 'POST', '/announcements', make())).status, 401);
  for (const user of [s.leader, s.member, s.outsider]) assert.equal((await call(user, 'POST', '/announcements', make())).status, 400); // 관리자만
  assert.equal((await call(s.admin, 'POST', '/announcements', make({ title: '  ' }))).status, 400);
  assert.equal((await call(s.admin, 'POST', '/announcements', make({ startDate: day(2), endDate: day(1) }))).status, 400);
  assert.equal((await call(s.admin, 'POST', '/announcements', make({ targetAll: false, projectIds: [] }))).status, 400);
  assert.equal((await call(s.admin, 'POST', '/announcements', make({ targetAll: false, projectIds: ['없는-프로젝트'] }))).status, 400);
  assert.equal((await call(s.admin, 'POST', '/announcements', { ...make(), extra: 1 })).status, 400); // 정의하지 않은 필드는 거부
});

test('전체 공지는 모두에게, 프로젝트 공지는 그 프로젝트 참여자에게만 보인다', async () => {
  const all = (await call(s.admin, 'POST', '/announcements', make({ title: '전체' }))).body.id;
  const proj = (await call(s.admin, 'POST', '/announcements', make({ title: '프로젝트', targetAll: false, projectIds: [s.projectId] }))).body.id;
  assert.deepEqual((await activeIds(s.member)).sort(), [all, proj].sort());
  assert.deepEqual((await activeIds(s.leader)).sort(), [all, proj].sort());
  assert.deepEqual(await activeIds(s.outsider), [all]);
  // 관리자라도 대상이 아니면 팝업으로는 받지 않는다(관리 목록에는 모두 보인다).
  assert.deepEqual(await activeIds(s.admin), [all]);
  const list = (await call(s.admin, 'GET', '/announcements')).body;
  assert.ok([all, proj].every((id) => list.some((a) => a.id === id)));
  assert.equal((await call(s.outsider, 'GET', '/announcements')).body.some((a) => a.id === proj), false);
  s.all = all; s.proj = proj;
});

test('기간 밖(지난 공지·아직 안 시작한 공지)은 팝업에 나오지 않는다', async () => {
  const past = (await call(s.admin, 'POST', '/announcements', make({ startDate: day(-5), endDate: day(-2) }))).body.id;
  const future = (await call(s.admin, 'POST', '/announcements', make({ startDate: day(3), endDate: day(5) }))).body.id;
  const today = (await call(s.admin, 'POST', '/announcements', make({ startDate: day(0), endDate: day(0) }))).body.id; // 시작일·종료일 당일은 보인다
  const ids = await activeIds(s.member);
  assert.ok(!ids.includes(past) && !ids.includes(future) && ids.includes(today));
});

test('다시 보지 않기는 사용자별로 기록되고, 대상이 아닌 공지에는 쓸 수 없다', async () => {
  assert.equal((await call(s.member, 'POST', `/announcements/${s.all}/dismiss`)).status, 204);
  assert.equal((await call(s.member, 'POST', `/announcements/${s.all}/dismiss`)).status, 204); // 두 번 눌러도 괜찮다
  assert.ok(!(await activeIds(s.member)).includes(s.all));
  assert.ok((await activeIds(s.leader)).includes(s.all));
  assert.equal((await call(s.outsider, 'POST', `/announcements/${s.proj}/dismiss`)).status, 400); // 존재 여부도 알려 주지 않는다
});

test('삭제는 관리자만, 지우면 목록에서 사라진다', async () => {
  assert.equal((await call(s.member, 'DELETE', `/announcements/${s.proj}`)).status, 400);
  assert.equal((await call(s.admin, 'DELETE', `/announcements/${s.proj}`)).status, 204);
  assert.ok(!(await activeIds(s.leader)).includes(s.proj));
  assert.equal((await call(s.admin, 'DELETE', `/announcements/${s.proj}`)).status, 400); // 이미 없음
});

test('실시간: 공지가 만들어지거나 지워지면 구독 중인 사람에게 "바뀌었다"가 온다(아무나 구독 가능)', async () => {
  const ws = new WebSocket(`${origin.replace('http', 'ws')}/realtime`);
  const got = [];
  ws.addEventListener('message', (event) => got.push(JSON.parse(event.data)));
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  ws.send(JSON.stringify({ type: 'auth', token: s.outsider.token }));
  await sleep(300);
  ws.send(JSON.stringify({ type: 'join', topic: 'announcements', ref: 'a' }));
  await sleep(300);
  assert.ok(got.some((m) => m.type === 'joined' && m.topic === 'announcements'), '외부인도 공지 알림은 구독할 수 있다');
  const id = (await call(s.admin, 'POST', '/announcements', make({ title: '실시간' }))).body.id;
  await sleep(300);
  assert.equal(got.filter((m) => m.type === 'change' && m.topic === 'announcements').length, 1);
  await call(s.admin, 'DELETE', `/announcements/${id}`);
  await sleep(300);
  assert.equal(got.filter((m) => m.type === 'change' && m.topic === 'announcements').length, 2);
  assert.ok(!got.some((m) => m.type === 'change' && JSON.stringify(m).includes('실시간')), '알림에는 공지 내용이 담기지 않는다');
  ws.close();
});

test('전체 일정: 내가 참여한 모든 프로젝트의 기간 일정(지난 일정 포함)만, 100일 제한·검증', async () => {
  const mine = await call(s.leader, 'POST', `/projects/${s.p}/schedule`, { title: '지난 회의', date: day(-3), type: 'meeting', scope: 'team' });
  assert.equal(mine.status, 201);
  await call(s.leader, 'POST', `/projects/${s.p}/schedule`, { title: '다음 주 마감', date: day(5), type: 'deadline', scope: 'team' });
  await call(s.leader, 'POST', `/projects/${s.p}/schedule`, { title: '먼 미래', date: day(60), type: 'other', scope: 'team' });
  const res = await call(s.leader, 'GET', `/me/schedule-events?from=${day(-7)}&to=${day(10)}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((e) => e.title), ['지난 회의', '다음 주 마감']); // 기간 밖(먼 미래)은 빠지고 날짜순
  assert.equal(res.body[0].projectId, s.projectId);
  assert.equal(res.body[0].projectName, '팀 프로젝트');
  assert.deepEqual((await call(s.outsider, 'GET', `/me/schedule-events?from=${day(-7)}&to=${day(10)}`)).body, []);
  assert.equal((await call(s.leader, 'GET', `/me/schedule-events?from=${day(0)}&to=${day(120)}`)).status, 400); // 100일 초과
  assert.equal((await call(s.leader, 'GET', `/me/schedule-events?from=${day(5)}&to=${day(0)}`)).status, 400);
  assert.equal((await call(s.leader, 'GET', '/me/schedule-events')).status, 400);
  assert.equal((await call(s.leader, 'GET', '/me/schedule-events?from=abc&to=def')).status, 400);
  assert.equal((await call(null, 'GET', `/me/schedule-events?from=${day(0)}&to=${day(1)}`)).status, 401);
});

test('전체 일정: 남의 "제목 숨김" 개인 일정은 "바쁨"으로 보인다', async () => {
  const hidden = await call(s.member, 'POST', `/projects/${s.p}/schedule`, { title: '비밀 일정', date: day(1), type: 'other', scope: 'personal', visibility: 'shared', hideTitle: true });
  assert.equal(hidden.status, 201);
  const mine = (await call(s.member, 'GET', `/me/schedule-events?from=${day(0)}&to=${day(2)}`)).body.find((e) => e.date === day(1));
  const theirs = (await call(s.leader, 'GET', `/me/schedule-events?from=${day(0)}&to=${day(2)}`)).body.find((e) => e.date === day(1));
  assert.equal(mine.title, '비밀 일정');
  assert.equal(theirs.title, '바쁨');
});

test('동기화 접속 표시: 참여자만 알리고 볼 수 있고, 나는 목록에서 빠진다', async () => {
  const ping = (user, root) => call(user, 'POST', `/projects/${s.p}/sync-presence`, { root });
  assert.equal((await ping(s.member, 0)).status, 204);
  assert.deepEqual((await call(s.member, 'GET', `/projects/${s.p}/sync-presence`)).body, { active: [] });
  assert.deepEqual((await call(s.leader, 'GET', `/projects/${s.p}/sync-presence`)).body, { active: [{ userId: s.member.id, root: 0 }] });
  assert.equal((await ping(s.member, 7)).status, 204); // 같은 사람이 폴더를 바꿔도 한 줄
  assert.deepEqual((await call(s.leader, 'GET', `/projects/${s.p}/sync-presence`)).body.active, [{ userId: s.member.id, root: 7 }]);
  assert.equal((await ping(s.outsider, 0)).status, 403);
  assert.equal((await call(s.outsider, 'GET', `/projects/${s.p}/sync-presence`)).status, 403);
  assert.equal((await ping(s.member, -1)).status, 400);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/sync-presence`, { root: 1, extra: true })).status, 400);
  assert.equal((await call(null, 'GET', `/projects/${s.p}/sync-presence`)).status, 401);
});
