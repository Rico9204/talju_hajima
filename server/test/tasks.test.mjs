// 과제·일정 API: 만들기(팀장), 상태·내용 수정, 체크리스트, 댓글·반응, 일정 연결·삭제, 개인 일정 공개 범위.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
let task;

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  s = await setupProject(api, pg);
});
after(async () => { await app?.close(); await pg?.close(); });

test('과제 만들기: 팀장만, 첫 담당자의 이름·색이 카드에 들어가고 담당자 목록이 붙는다', async () => {
  assert.equal((await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '자료 조사', assigneeIds: [], status: 'todo' })).status, 400);
  const denied = await call(s.member, 'POST', `/projects/${s.p}/tasks`, { title: '몰래', assigneeIds: [s.member.memberId], status: 'todo' });
  assert.equal(denied.status, 403); // 권한 규칙(RLS)에 걸림
  const res = await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: ' 자료 조사 ', assigneeIds: [s.member.memberId, s.leader.memberId], status: 'todo' });
  assert.equal(res.status, 201);
  task = res.body;
  assert.equal(task.title, '자료 조사');
  assert.equal(task.assignee, 'user2');
  assert.deepEqual(task.assigneeIds.sort(), [s.member.memberId, s.leader.memberId].sort());
  assert.deepEqual(task.checklist, []);
  assert.equal((await call(s.member, 'GET', `/projects/${s.p}/tasks`)).body.length, 1);
  assert.deepEqual((await call(s.outsider, 'GET', `/projects/${s.p}/tasks`)).body, []);
});

test('상태·내용 수정: 담당자를 바꾸면 카드의 대표 담당자도 바뀐다', async () => {
  assert.equal((await call(s.member, 'PUT', `/tasks/${task.id}/status`, { status: 'inprogress' })).status, 204); // 담당자는 상태 변경 가능
  assert.equal((await call(s.member, 'PUT', `/tasks/${task.id}/status`, { status: 'finished' })).status, 400);
  assert.equal((await call(s.leader, 'PATCH', `/tasks/${task.id}`, { title: '자료 조사(최종)', priority: 'high', tags: ['조사'], assigneeIds: [s.leader.memberId] })).status, 204);
  const [updated] = (await call(s.leader, 'GET', `/projects/${s.p}/tasks`)).body;
  assert.equal(updated.status, 'inprogress');
  assert.equal(updated.title, '자료 조사(최종)');
  assert.equal(updated.priority, 'high');
  assert.deepEqual(updated.tags, ['조사']);
  assert.equal(updated.assignee, 'user1');
  assert.deepEqual(updated.assigneeIds, [s.leader.memberId]);
  assert.equal((await call(s.leader, 'PATCH', `/tasks/${task.id}`, { assigneeIds: [] })).status, 400);
});

test('체크리스트와 댓글: 댓글 작성자는 서버가 정하고, 반응은 켜고 끌 수 있다', async () => {
  const item = await call(s.leader, 'POST', `/tasks/${task.id}/checklist`, { text: '논문 3편 찾기' });
  assert.equal(item.status, 201);
  assert.deepEqual({ text: item.body.text, done: item.body.done }, { text: '논문 3편 찾기', done: false });
  assert.equal((await call(s.leader, 'PUT', `/checklist/${item.body.id}`, { done: true })).status, 204);
  const comment = await call(s.member, 'POST', `/tasks/${task.id}/comments`, { text: '진행 중이에요' });
  assert.equal(comment.status, 201);
  assert.equal(comment.body.author, 'user2');
  assert.equal(comment.body.memberId, s.member.memberId);
  assert.equal((await call(s.outsider, 'POST', `/tasks/${task.id}/comments`, { text: '침입' })).status, 400);
  await call(s.leader, 'PUT', `/task-comments/${comment.body.id}/reaction`, { emoji: '🎉', active: true });
  let [t] = (await call(s.leader, 'GET', `/projects/${s.p}/tasks`)).body;
  assert.equal(t.checklist[0].done, true);
  assert.deepEqual(t.comments[0].reactions, [{ commentId: comment.body.id, memberId: s.leader.memberId, emoji: '🎉' }]);
  await call(s.leader, 'PUT', `/task-comments/${comment.body.id}/reaction`, { emoji: '🎉', active: false });
  [t] = (await call(s.leader, 'GET', `/projects/${s.p}/tasks`)).body;
  assert.deepEqual(t.comments[0].reactions, []);
});

test('일정: 팀 일정과 개인 일정, 개인 일정의 주인은 서버가 정하고 나만 보기는 다른 팀원에게 안 보인다', async () => {
  const team = await call(s.leader, 'POST', `/projects/${s.p}/schedule`, { title: '중간 발표', date: '2026-10-20', type: 'presentation', scope: 'team' });
  assert.equal(team.status, 201);
  assert.equal(team.body.ownerMemberId, null);
  assert.equal(team.body.createdByMemberId, s.leader.memberId); // 작성자는 서버(트리거)가 정한다
  const mine = await call(s.member, 'POST', `/projects/${s.p}/schedule`, { title: '개인 공부', date: '2026-10-01', endDate: '2026-10-03', type: 'other', scope: 'personal' });
  assert.equal(mine.status, 201);
  assert.equal(mine.body.ownerMemberId, s.member.memberId);
  assert.equal(mine.body.createdByMemberId, s.member.memberId);
  assert.equal(mine.body.visibility, 'private');
  assert.equal(mine.body.endDate, '2026-10-03');
  assert.deepEqual((await call(s.member, 'GET', `/projects/${s.p}/schedule`)).body.map((e) => e.title), ['개인 공부', '중간 발표']);
  assert.deepEqual((await call(s.leader, 'GET', `/projects/${s.p}/schedule`)).body.map((e) => e.title), ['중간 발표']);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/schedule`, { title: 'x', date: '10월 1일', type: 'other', scope: 'team' })).status, 400);
  // 종료일이 시작일보다 빠르면 DB 제약에 걸리고, 이유를 알 수 있게 안내한다
  const backwards = await call(s.member, 'POST', `/projects/${s.p}/schedule`, { title: '거꾸로', date: '2026-10-05', endDate: '2026-10-01', type: 'other', scope: 'personal' });
  assert.equal(backwards.status, 400);
  assert.deepEqual(backwards.body, { message: '종료일은 시작일과 같거나 그 이후여야 합니다.' });

  assert.equal((await call(s.member, 'PATCH', `/schedule/${mine.body.id}`, { title: '개인 공부(수정)', visibility: 'shared' })).status, 204);
  assert.ok((await call(s.leader, 'GET', `/projects/${s.p}/schedule`)).body.some((e) => e.title === '개인 공부(수정)'));
  // 작성자는 수정으로 바꿀 수 없다(관리자 계정의 직접 SQL로도 트리거가 그대로 둔다).
  await pg.query('update public.schedule_events set created_by_member_id = $2 where id = $1', [team.body.id, s.member.memberId]);
  assert.equal((await call(s.leader, 'GET', `/projects/${s.p}/schedule`)).body.find((e) => e.id === team.body.id).createdByMemberId, s.leader.memberId);

  // 과제에 연결한 일정은 과제를 지우면 함께 지워진다.
  assert.equal((await call(s.leader, 'PUT', `/tasks/${task.id}/schedule-link`, { field: 'team', eventId: team.body.id })).status, 204);
  assert.equal((await call(s.leader, 'DELETE', `/tasks/${task.id}`)).status, 204);
  assert.deepEqual((await call(s.leader, 'GET', `/projects/${s.p}/tasks`)).body, []);
  assert.ok(!(await call(s.leader, 'GET', `/projects/${s.p}/schedule`)).body.some((e) => e.id === team.body.id));
  assert.equal((await call(s.member, 'DELETE', `/schedule/${mine.body.id}`)).status, 204);
  assert.deepEqual((await call(s.member, 'GET', `/projects/${s.p}/schedule`)).body, []);
});

test('다가오는 일정(메인 화면): 내 프로젝트의 오늘 이후 일정만, 남의 나만 보기는 빠지고 제목 숨김은 "바쁨"', async () => {
  const post = (user, body) => call(user, 'POST', `/projects/${s.p}/schedule`, body);
  const future = (await post(s.leader, { title: '최종 발표', date: '2099-01-10', type: 'presentation', scope: 'team' })).body;
  const past = (await post(s.leader, { title: '지난 회의', date: '2000-01-01', type: 'meeting', scope: 'team' })).body;
  const ongoing = (await post(s.leader, { title: '긴 작업', date: '2000-01-01', endDate: '2099-12-31', type: 'other', scope: 'team' })).body;
  const secret = (await post(s.member, { title: '병원', date: '2099-01-11', type: 'other', scope: 'personal' })).body;
  const busy = (await post(s.member, { title: '아르바이트', date: '2099-01-12', type: 'other', scope: 'personal', visibility: 'shared', hideTitle: true })).body;

  const leaderView = (await call(s.leader, 'GET', '/me/upcoming-events')).body;
  assert.deepEqual(leaderView.map((e) => e.title), ['긴 작업', '최종 발표', '바쁨']); // 지난 일정·남의 나만 보기 제외
  assert.equal(leaderView[1].projectId, s.projectId);
  assert.equal(leaderView[1].projectName, '팀 프로젝트');
  const memberView = (await call(s.member, 'GET', '/me/upcoming-events')).body;
  assert.ok(memberView.some((e) => e.title === '병원') && memberView.some((e) => e.title === '아르바이트')); // 내 일정은 원래 제목
  assert.deepEqual((await call(s.outsider, 'GET', '/me/upcoming-events')).body, []);

  for (const e of [future, past, ongoing]) await call(s.leader, 'DELETE', `/schedule/${e.id}`);
  for (const e of [secret, busy]) await call(s.member, 'DELETE', `/schedule/${e.id}`);
});
