// 프로젝트·팀·프로필·평가·관리자 API. 가입 API로 받은 실제 토큰으로 호출한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, signupUsers, startApp } from './helpers.mjs';

let pg, app, api;
let admin, leader, alice, bob; // alice·bob: 팀원
let projectId;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  [admin, leader, alice, bob] = await signupUsers(api, 4, 'user');
  await pg.query("update profiles set is_admin = true, display_name = '김교수', org = '한국대학교' where id = $1", [admin.id]);
});
after(async () => { await app?.close(); await pg?.close(); });

test('프로젝트 만들기: 프로젝트·팀·팀장(나)이 한 번에 생기고, 팀장 이름은 계정 프로필에서 온다', async () => {
  const noDates = await call(leader, 'POST', '/projects', { name: '날짜 없음', org: 'x', period: 'y' });
  assert.equal(noDates.status, 400);
  assert.match(noDates.body.message, /시작일과 종료일/); // DB 검사 문구가 그대로
  const res = await call(leader, 'POST', '/projects', {
    name: '캡스톤 디자인', org: '한국대학교', period: '2026-2학기', startDate: '2026-09-01', endDate: '2026-12-20', requestedAdminId: admin.id,
  });
  assert.equal(res.status, 201);
  projectId = res.body.id;
  assert.match(projectId, /^캡스톤-디자인-/);
  assert.equal(res.body.approvalStatus, 'pending');
  const team = await call(leader, 'GET', `/projects/${encodeURIComponent(projectId)}/team`);
  assert.equal(team.body.teamLabel, '캡스톤 디자인 팀');
  assert.equal(team.body.members.length, 1);
  assert.equal(team.body.members[0].name, 'user1');
  assert.equal(team.body.members[0].isLeader, true);
  assert.equal(team.body.members[0].userId, leader.id);
  assert.ok((await call(leader, 'GET', '/projects')).body.some((p) => p.id === projectId));
  assert.deepEqual((await call(leader, 'GET', '/me/project-ids')).body, [projectId]);
  assert.equal((await call(leader, 'GET', `/projects/${encodeURIComponent(projectId)}`)).body.name, '캡스톤 디자인');
  assert.equal((await call(leader, 'GET', '/projects/없는-프로젝트')).body, null);
  assert.equal((await call(leader, 'POST', '/projects', { name: 'x', org: 'y', period: 'z', startDate: '내일' })).status, 400);
});

test('관리자 승인: 요청받은 관리자만 승인할 수 있다', async () => {
  const p = encodeURIComponent(projectId);
  assert.equal((await call(alice, 'POST', `/projects/${p}/approve`)).status, 400);
  assert.equal((await call(admin, 'POST', `/projects/${p}/approve`)).status, 204);
  assert.equal((await call(leader, 'GET', `/projects/${p}`)).body.approvalStatus, 'approved');
});

test('참여: 팀원이 되고 학교·전공·학번이 계정 프로필에 반영되며, 두 번 참여는 막힌다', async () => {
  const p = encodeURIComponent(projectId);
  const joined = await call(alice, 'POST', `/projects/${p}/join`, { school: '한국대학교', major: '컴퓨터공학과', student: '20261234' });
  assert.equal(joined.status, 201);
  assert.equal(joined.body.userId, alice.id);
  assert.equal(joined.body.name, 'user2');
  assert.equal(joined.body.school, '한국대학교');
  assert.equal(joined.body.isLeader, false);
  const again = await call(alice, 'POST', `/projects/${p}/join`, { school: 'a', major: 'b', student: 'c' });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /이미 참여/);
  await call(bob, 'POST', `/projects/${p}/join`, { school: '한국대학교', major: '경영학과', student: '20265678' });
  const team = await call(alice, 'GET', `/projects/${p}/team`);
  assert.equal(team.body.members.length, 3);
  assert.equal(team.body.members[0].isLeader, true); // 팀장이 맨 앞
});

test('밖에서는 팀을 볼 수 없다(DB 함수가 거부)', async () => {
  const [outsider] = await signupUsers(api, 1, 'outsider');
  const team = await call(outsider, 'GET', `/projects/${encodeURIComponent(projectId)}/team`);
  assert.equal(team.status, 400);
  assert.match(team.body.message, /참여자만/);
});

test('부팀장 임명은 팀장만, 팀원 제외도 팀장만', async () => {
  const p = encodeURIComponent(projectId);
  const members = (await call(leader, 'GET', `/projects/${p}/team`)).body.members;
  const aliceMember = members.find((m) => m.userId === alice.id);
  const bobMember = members.find((m) => m.userId === bob.id);
  assert.equal((await call(alice, 'PUT', `/members/${bobMember.id}/vice-leader`, { enabled: true })).status, 400);
  assert.equal((await call(leader, 'PUT', `/members/${aliceMember.id}/vice-leader`, { enabled: true })).status, 204);
  const after = (await call(leader, 'GET', `/projects/${p}/team`)).body.members;
  assert.equal(after[1].userId, alice.id); // 팀장 다음에 부팀장
  assert.equal(after[1].isViceLeader, true);
  assert.equal((await call(alice, 'DELETE', `/members/${bobMember.id}`)).status, 400); // 부팀장도 제외는 못 함
  assert.equal((await call(leader, 'DELETE', `/members/${bobMember.id}`)).status, 204);
  assert.equal((await call(leader, 'GET', `/projects/${p}/team`)).body.members.length, 2);
});

test('프로필 수정: 보낸 칸만 바뀌고, 이름을 null로·모르는 칸은 거부', async () => {
  const patch = await call(alice, 'PATCH', '/me/profile', { name: ' 앨리스 ', contact: null, links: [{ id: 'l1', type: 'github', url: 'https://github.com/alice', label: 'GitHub' }] });
  assert.equal(patch.status, 204);
  const me = (await call(alice, 'GET', `/projects/${encodeURIComponent(projectId)}/team`)).body.members.find((m) => m.userId === alice.id);
  assert.equal(me.name, '앨리스');
  assert.equal(me.major, '컴퓨터공학과'); // 안 보낸 칸은 그대로
  assert.equal(me.links[0].url, 'https://github.com/alice');
  assert.equal((await call(alice, 'PATCH', '/me/profile', { name: null })).status, 400);
  assert.equal((await call(alice, 'PATCH', '/me/profile', { isAdmin: true })).status, 400);
});

// 주의(기존 동작 그대로): transfer_leadership 은 팀원 행에 저장된 이름(members.name, 참여할 때의 이름)으로 찾는다.
// 참여 뒤 프로필 이름을 바꾼 팀원에게는 새 이름으로 위임되지 않는다 — Supabase 버전과 같다(별도 수정 과제).
test('팀장 위임은 팀장만', async () => {
  const p = encodeURIComponent(projectId);
  assert.equal((await call(alice, 'POST', `/projects/${p}/transfer-leadership`, { targetName: 'user2' })).status, 400);
  assert.equal((await call(leader, 'POST', `/projects/${p}/transfer-leadership`, { targetName: '앨리스' })).status, 400); // 바뀐 이름으로는 못 찾음
  assert.equal((await call(leader, 'POST', `/projects/${p}/transfer-leadership`, { targetName: 'user2' })).status, 204);
  const members = (await call(leader, 'GET', `/projects/${p}/team`)).body.members;
  assert.equal(members[0].userId, alice.id);
  assert.equal(members[0].isLeader, true);
});

test('평가·업적: 단계 이름 검사, 빈 평가 조회, 업적 요약, 참여 통계', async () => {
  const p = encodeURIComponent(projectId);
  assert.equal((await call(alice, 'GET', `/projects/${p}/evaluations/weekly`)).status, 400);
  const evals = await call(alice, 'GET', `/projects/${p}/evaluations/midterm`);
  assert.equal(evals.status, 200);
  assert.deepEqual(evals.body.records, []);
  assert.equal(evals.body.submitted, false);
  assert.equal(typeof (await call(alice, 'GET', '/evaluation-mode')).body, 'boolean');
  const summary = await call(alice, 'GET', '/me/evaluation-summary');
  assert.equal(summary.body.projectCount, 0); // 종료된 프로젝트만 센다
  assert.equal(summary.body.count, 0);
  const stats = await call(alice, 'GET', `/users/${leader.id}/participation-stats`);
  assert.equal(stats.status, 200);
  assert.equal(typeof stats.body.projectCount, 'number');
});

test('관리자·운영자: 검색, 운영자 아님, 신청 없음, 운영자 전용 목록은 거부', async () => {
  assert.deepEqual((await call(alice, 'GET', '/admins/search?q=')).body, []);
  const found = await call(alice, 'GET', `/admins/search?q=${encodeURIComponent('김교수')}`);
  assert.deepEqual(found.body.map((a) => a.id), [admin.id]);
  assert.equal((await call(alice, 'GET', '/me/is-admin')).body, false);
  assert.equal((await call(admin, 'GET', '/me/is-admin')).body, true);
  assert.equal((await call(alice, 'GET', '/me/is-operator')).body, false);
  assert.equal((await call(alice, 'GET', '/me/admin-application')).body, null);
  const list = await call(alice, 'GET', '/admin/applications');
  assert.equal(list.status, 400);
  assert.match(list.body.message, /운영자만/);
});
