// 동료평가 공개 조건: 테스트 모드가 기본으로 꺼져 있고, 꺼져 있으면 2인 팀이나 일부 제출 상태에서는 점수·코멘트가 드러나지 않는다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb, joinCode, setupProject, signupUsers, startApp } from './helpers.mjs';

let pg, app, api;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const entry = (recipient, comment = '') => ({ recipient_id: recipient.memberId, role: 2, deadline: 3, communication: 4, collaboration: 5, quality: 6, comment });
const scoreIn = async (viewer, p, target) => (await call(viewer, 'GET', `/projects/${p}/team`)).body.members.find((m) => m.id === target.memberId);

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
});
after(async () => { await app?.close(); await pg?.close(); });

test('테스트 모드: 새 DB는 꺼져 있고, 값이 없어도 꺼짐이다', async () => {
  const [user] = await signupUsers(api, 1, 'mode');
  assert.equal((await call(user, 'GET', '/evaluation-mode')).body, false);
  await pg.query("delete from public.app_settings where key = 'evaluation_prototype_enabled'");
  assert.equal((await call(user, 'GET', '/evaluation-mode')).body, false);
  await pg.query("insert into public.app_settings (key, value) values ('evaluation_prototype_enabled', false)");
});

test('마이그레이션: 켜져 있던 운영 DB도 꺼진다', async () => {
  await pg.query("update public.app_settings set value = true where key = 'evaluation_prototype_enabled'");
  await pg.exec(readFileSync(new URL('../../supabase/migrations/2611021600_evaluation_prototype_default_off.sql', import.meta.url), 'utf8'));
  assert.equal((await pg.query("select public.evaluation_prototype_enabled() as on")).rows[0].on, false);
});

test('2인 팀: 받은 사람에게도, 팀 화면에도 점수·코멘트가 드러나지 않는다', async () => {
  const s = await setupProject(api, pg);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/evaluations/midterm`, { entries: [entry(s.leader, '팀장 역할을 잘 못했음')] })).status, 204);
  const midterm = (await call(s.leader, 'GET', `/projects/${s.p}/evaluations/midterm`)).body.average;
  assert.equal(midterm.available, false);
  assert.deepEqual(midterm.comments, []);

  assert.equal((await call(s.leader, 'POST', `/projects/${s.p}/complete`)).status < 300, true);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/evaluations/final`, { entries: [entry(s.leader)] })).status, 204);
  const final = (await call(s.leader, 'GET', `/projects/${s.p}/evaluations/final`)).body.average;
  assert.equal(final.available, false);
  assert.equal(final.score, null);
  for (const viewer of [s.leader, s.member]) {
    const seen = await scoreIn(viewer, s.p, s.leader);
    assert.equal(seen.score, 0);
    assert.equal(seen.evalCount, 0);
  }
});

test('3인 팀: 일부만 제출하면 가려지고, 전원이 제출하면 평균이 공개된다', async () => {
  const s = await setupProject(api, pg);
  const [third] = await signupUsers(api, 1, 'third');
  const joined = await call(third, 'POST', `/projects/${s.p}/join`, { code: await joinCode(api, s.leader, s.p), school: '한국대학교', major: '컴퓨터공학과', student: '2' });
  assert.equal(joined.status, 201);
  third.memberId = (await call(s.leader, 'GET', `/projects/${s.p}/team`)).body.members.find((m) => m.userId === third.id).id;
  assert.equal((await call(s.leader, 'POST', `/projects/${s.p}/complete`)).status < 300, true);

  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/evaluations/final`, { entries: [entry(s.leader), entry(third)] })).status, 204);
  assert.equal((await call(s.leader, 'GET', `/projects/${s.p}/evaluations/final`)).body.average.available, false);
  assert.equal((await scoreIn(third, s.p, s.leader)).evalCount, 0);

  assert.equal((await call(third, 'POST', `/projects/${s.p}/evaluations/final`, { entries: [entry(s.leader), entry(s.member)] })).status, 204);
  const average = (await call(s.leader, 'GET', `/projects/${s.p}/evaluations/final`)).body.average;
  assert.equal(average.available, true);
  assert.equal(average.count, 2);
  assert.equal(Number(average.score), 4);
});
