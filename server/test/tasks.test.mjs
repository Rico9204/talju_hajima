// 과제·일정 API: 만들기(팀장), 상태·내용 수정, 체크리스트, 댓글·반응, 일정 연결·삭제, 개인 일정 공개 범위.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, joinCode, setupProject, signupUsers, startApp } from './helpers.mjs';

let pg, db, app, api, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
let task;

before(async () => {
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  s = await setupProject(api, pg);
});
after(async () => { await app?.close(); await pg?.close(); });

test('과제 만들기: 팀장만, 첫 담당자의 이름·색이 카드에 들어가고 담당자 목록이 붙는다', async () => {
  assert.equal((await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '자료 조사', assigneeIds: [], status: 'todo' })).status, 400);
  const denied = await call(s.member, 'POST', `/projects/${s.p}/tasks`, { title: '몰래', assigneeIds: [s.member.memberId], status: 'todo' });
  assert.equal(denied.status, 403); // 권한 규칙(RLS)에 걸림
  // 새 과제는 예정에서만 시작(검토 중·완료로 바로 만들 수 없음)
  const skipped = await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '바로 완료', assigneeIds: [s.member.memberId], status: 'done' });
  assert.equal(skipped.status, 400);
  assert.match(skipped.body.message, /예정/);
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

  // 프로젝트 일정 목록도 응답에서부터 가린다(주인에게는 원래 제목).
  const listed = (viewer) => call(viewer, 'GET', `/projects/${s.p}/schedule`).then((r) => r.body.find((e) => e.id === busy.id));
  assert.equal((await listed(s.leader)).title, '바쁨');
  assert.equal((await listed(s.member)).title, '아르바이트');
  assert.equal((await call(s.member, 'PATCH', `/schedule/${busy.id}`, { hideTitle: false })).status, 204);
  assert.equal((await listed(s.leader)).title, '아르바이트');

  for (const e of [future, past, ongoing]) await call(s.leader, 'DELETE', `/schedule/${e.id}`);
  for (const e of [secret, busy]) await call(s.member, 'DELETE', `/schedule/${e.id}`);
});

test('검토 흐름: 담당자는 검토 중까지, 완료·완료 취소·반려는 팀장만, 반려 사유는 반려 피드백 댓글로', async () => {
  const created = (await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '발표 자료', assigneeIds: [s.member.memberId], status: 'todo' })).body;
  const status = (user, value) => call(user, 'PUT', `/tasks/${created.id}/status`, { status: value });
  const reject = (user, text) => call(user, 'POST', `/tasks/${created.id}/reject`, { text });
  const current = async () => (await call(s.member, 'GET', `/projects/${s.p}/tasks`)).body.find((t) => t.id === created.id);

  assert.equal((await reject(s.leader, '아직')).status, 400); // 검토 중이 아니면 반려할 수 없다
  assert.equal((await status(s.member, 'review')).status, 204);
  const skip = await status(s.member, 'done');
  assert.equal(skip.status, 400);
  assert.match(skip.body.message, /팀장·부팀장만/);
  assert.equal((await reject(s.member, '셀프 반려')).status, 400);
  assert.equal((await reject(s.leader, '   ')).status, 400); // 사유 필수

  const feedback = await reject(s.leader, '출처를 표 아래에 적어 주세요');
  assert.equal(feedback.status, 201);
  assert.equal(feedback.body.kind, 'rejection');
  let task = await current();
  assert.equal(task.status, 'inprogress');
  assert.deepEqual(task.comments.map((c) => [c.kind, c.text]), [['rejection', '출처를 표 아래에 적어 주세요']]);

  // 팀원 댓글은 일반 댓글이고, DB에 직접 넣어도 반려 피드백을 흉내 낼 수 없다.
  assert.equal((await call(s.member, 'POST', `/tasks/${created.id}/comments`, { text: '고쳤습니다' })).body.kind, 'comment');
  await assert.rejects(db.asUser(s.member.id, (query) => query(
    "insert into public.task_comments(task_id, member_id, author, avatar, text, kind) values ($1, $2, 'user3', 'U', '가짜 반려', 'rejection')",
    [created.id, s.member.memberId])), /row-level security/);

  assert.equal((await status(s.member, 'review')).status, 204);
  assert.equal((await status(s.leader, 'done')).status, 204); // 승인
  assert.equal((await status(s.member, 'inprogress')).status, 400); // 완료 취소도 팀장만
  task = await current();
  assert.equal(task.status, 'done');
  await call(s.leader, 'DELETE', `/tasks/${created.id}`);
});

test('세부 업무: 담당자는 과제 담당자 중에서, 완료 표시는 그 담당자와 팀장만, 과제 담당자에서 빠지면 담당자 없음', async () => {
  const third = (await signupUsers(api, 1, 'sub'))[0];
  await call(third, 'POST', `/projects/${s.p}/join`, { code: await joinCode(api, s.leader, s.p), school: '한국대학교', major: '컴퓨터공학과', student: '1' });
  third.memberId = (await call(s.leader, 'GET', `/projects/${s.p}/team`)).body.members.find((m) => m.userId === third.id).id;
  const created = (await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '발표 준비', assigneeIds: [s.member.memberId, third.memberId], status: 'todo' })).body;
  const add = (user, text, assigneeMemberId) => call(user, 'POST', `/tasks/${created.id}/checklist`, { text, assigneeMemberId });
  const items = async () => (await call(s.leader, 'GET', `/projects/${s.p}/tasks`)).body.find((t) => t.id === created.id).checklist;

  const outside = await add(s.leader, '남에게', s.leader.memberId); // 팀장이지만 이 과제 담당자는 아님
  assert.equal(outside.status, 400);
  assert.match(outside.body.message, /과제의 담당자 중에서/);
  const slides = (await add(s.leader, '슬라이드', s.member.memberId)).body; // 팀장도 세부 업무를 나눌 수 있다
  assert.equal(slides.assigneeMemberId, s.member.memberId);
  const script = (await add(s.member, '대본', third.memberId)).body; // 과제 담당자도 나눌 수 있다
  const free = (await add(third, '리허설')).body;
  assert.equal(free.assigneeMemberId, null);
  assert.equal((await add(s.outsider, '몰래')).status, 403);

  assert.equal((await call(third, 'PUT', `/checklist/${slides.id}`, { done: true })).status, 400); // 남의 세부 업무
  assert.equal((await call(s.member, 'PUT', `/checklist/${slides.id}`, { done: true })).status, 204);
  assert.equal((await call(s.leader, 'PUT', `/checklist/${script.id}`, { done: true })).status, 204); // 팀장은 모두
  assert.equal((await call(s.member, 'PUT', `/checklist/${free.id}`, { done: true })).status, 204); // 담당자 없음 → 과제 담당자 누구나
  assert.deepEqual((await items()).map((i) => i.done), [true, true, true]);

  assert.equal((await call(s.member, 'PUT', `/checklist/${free.id}/assignee`, { memberId: s.leader.memberId })).status, 400);
  assert.equal((await call(s.member, 'PUT', `/checklist/${free.id}/assignee`, { memberId: s.member.memberId })).status, 204);

  // third를 과제 담당자에서 빼면 third가 맡던 "대본"은 담당자 없음으로
  assert.equal((await call(s.leader, 'PATCH', `/tasks/${created.id}`, { assigneeIds: [s.member.memberId] })).status, 204);
  assert.deepEqual((await items()).map((i) => [i.text, i.assigneeMemberId]), [['슬라이드', s.member.memberId], ['대본', null], ['리허설', s.member.memberId]]);

  await call(s.outsider, 'DELETE', `/checklist/${free.id}`); // 권한 없음 → 그대로
  assert.equal((await call(s.member, 'DELETE', `/checklist/${free.id}`)).status, 204);
  assert.deepEqual((await items()).map((i) => i.text), ['슬라이드', '대본']);
  await call(s.leader, 'DELETE', `/tasks/${created.id}`);
});

test('과제 만들기 창: 우선순위·마감일·태그·세부 업무까지 한 번에, 세부 업무 담당자는 과제 담당자 중에서만', async () => {
  const bad = await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '형식 오류', assigneeIds: [s.member.memberId], status: 'todo', due: '12월 5일' });
  assert.equal(bad.status, 400);
  const res = await call(s.leader, 'POST', `/projects/${s.p}/tasks`, {
    title: '중간 발표 준비', assigneeIds: [s.member.memberId, s.member.memberId], status: 'todo',
    priority: 'high', due: '2026-12-05', tags: [' 발표 ', '발표', ''],
    checklist: [{ text: '슬라이드', assigneeMemberId: s.member.memberId }, { text: '  ' }, { text: '대본', assigneeMemberId: s.leader.memberId }],
  });
  assert.equal(res.status, 201);
  const t = res.body;
  assert.equal(t.priority, 'high');
  assert.equal(t.due, '2026-12-05');
  assert.deepEqual(t.tags, ['발표']); // 앞뒤 공백·중복·빈 태그 정리
  assert.deepEqual(t.assigneeIds, [s.member.memberId]); // 중복 담당자는 한 번만
  assert.deepEqual(t.checklist.map((i) => [i.text, i.assigneeMemberId]), [['슬라이드', s.member.memberId], ['대본', null]]); // 빈 줄은 빼고, 과제 담당자가 아니면 담당자 없음
  await call(s.leader, 'DELETE', `/tasks/${t.id}`);
});
