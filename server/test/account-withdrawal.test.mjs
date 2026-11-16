// 계정 탈퇴·복구: 아이디·비밀번호 재확인, 참여 프로젝트가 있으면 불가, 신청 후 로그인 차단, 14일 보관, 복구 신청, 운영자 승인.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, signupUsers, startApp } from './helpers.mjs';

let pg, app, api, upload, s;
const PASSWORD = 'correct-horse-1';
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const withdraw = (user, over = {}) => call(user, 'POST', '/auth/withdraw', { email: user.email, password: PASSWORD, ...over });
const loginOf = (user, password = PASSWORD) => api(null, 'POST', '/auth/login', { email: user.email, password });
const recoverRequest = (user, password = PASSWORD) => api(null, 'POST', '/auth/recover-request', { email: user.email, password });
const backdate = (user, days) => pg.query("update public.account_withdrawals set requested_at = now() - make_interval(days => $2) where user_id = $1", [user.id, days]);
const listOf = async () => (await call(s.operator, 'GET', '/admin/account-withdrawals')).body;
const ids = (list) => list.map((x) => x.userId);

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api, upload } = await startApp(db));
  s = await setupProject(api, pg);
  [s.operator, s.a, s.b, s.c, s.d, s.e] = await signupUsers(api, 6, 'extra');
  await pg.query('update profiles set is_operator = true, is_admin = true where id = $1', [s.operator.id]);
});
after(async () => { await app?.close(); await pg?.close(); });

test('참여한 프로젝트가 있으면 탈퇴할 수 없다(팀장·팀원 모두), 운영자 계정도 탈퇴할 수 없다', async () => {
  for (const user of [s.leader, s.member]) {
    const res = await withdraw(user);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /참여 중인 프로젝트/);
  }
  const op = await withdraw(s.operator);
  assert.equal(op.status, 400);
  assert.match(op.body.message, /운영자/);
  assert.equal((await loginOf(s.member)).status, 200);
});

test('탈퇴 신청: 아이디·비밀번호를 다시 입력해야 하고, 틀리거나 다른 계정이면 거절한다', async () => {
  assert.equal((await call(null, 'POST', '/auth/withdraw', { email: s.a.email, password: PASSWORD })).status, 401); // 로그인 필요
  assert.equal((await withdraw(s.a, { password: 'wrong-password' })).status, 401);
  assert.equal((await withdraw(s.a, { email: s.b.email })).status, 401); // 남의 아이디(비밀번호는 내 것)
  assert.equal((await call(s.a, 'POST', '/auth/withdraw', { email: s.b.email, password: PASSWORD })).status, 401);
  assert.equal((await withdraw(s.a, { reason: 'x'.repeat(501) })).status, 400); // 사유는 500자까지
  assert.equal((await pg.query('select count(*)::int as n from public.account_withdrawals')).rows[0].n, 0);
});

test('탈퇴 신청(사유는 선택): 바로 로그인·기존 토큰·토큰 갱신이 모두 막히고 상태가 안내된다', async () => {
  const res = await withdraw(s.a, { reason: '더 이상 쓰지 않아요' });
  assert.equal(res.status, 204);
  assert.equal((await withdraw(s.b)).status, 204); // 사유 없이도 신청된다
  const row = (await pg.query('select email, reason, display_name from public.account_withdrawals where user_id = $1', [s.a.id])).rows[0];
  assert.equal(row.email, s.a.email);
  assert.equal(row.reason, '더 이상 쓰지 않아요');
  // 이미 받아 둔 토큰으로도 아무것도 못 한다
  assert.equal((await call(s.a, 'GET', '/projects')).status, 401);
  assert.equal((await call(s.a, 'POST', '/auth/withdraw', { email: s.a.email, password: PASSWORD })).status, 401);
  // 로그인은 비밀번호가 맞아도 403 + 탈퇴 상태(화면이 복구 신청을 안내)
  const login = await loginOf(s.a);
  assert.equal(login.status, 403);
  assert.equal(login.body.code, 'account_withdrawn');
  assert.equal(login.body.withdrawal.canRecover, true);
  assert.equal(login.body.withdrawal.recoveryRequested, false);
  assert.ok(login.body.withdrawal.recoveryDeadline);
  // 틀린 비밀번호에는 탈퇴 여부를 알려 주지 않는다
  const wrong = await loginOf(s.a, 'wrong-password');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, undefined);
  // 쿠키(리프레시 토큰)도 지워져 있어 갱신할 수 없다
  assert.equal((await api(null, 'POST', '/auth/refresh', undefined, { cookie: s.a.cookie, origin: 'http://localhost:5173' })).status, 401);
  assert.equal((await withdraw({ ...s.a, token: null })).status, 401);
});

test('운영자만 탈퇴 신청 목록을 볼 수 있고, 복구를 신청하지 않은 계정이 "탈퇴 신청"에 보인다', async () => {
  for (const user of [s.leader, s.outsider, s.a]) assert.equal((await call(user, 'GET', '/admin/account-withdrawals')).status, user === s.a ? 401 : 403);
  const list = await listOf();
  assert.deepEqual(ids(list.withdrawals).sort(), [s.a.id, s.b.id].sort());
  assert.deepEqual(list.recoveries, []);
  const a = list.withdrawals.find((x) => x.userId === s.a.id);
  assert.equal(a.email, s.a.email);
  assert.equal(a.reason, '더 이상 쓰지 않아요');
  assert.equal(a.purgeable, false);
  assert.ok(a.purgeAt);
});

test('14일 전에는 정보를 지울 수 없다(탈퇴 승인 거절), 일반 사용자는 승인할 수 없다', async () => {
  const early = await call(s.operator, 'POST', `/admin/account-withdrawals/${s.a.id}/approve`);
  assert.equal(early.status, 400);
  assert.match(early.body.message, /14일/);
  assert.equal((await call(s.leader, 'POST', `/admin/account-withdrawals/${s.a.id}/approve`)).status, 400);
  assert.equal((await call(s.operator, 'POST', '/admin/account-withdrawals/not-a-uuid/approve')).status, 400);
  assert.equal((await pg.query('select count(*)::int as n from auth.users where id = $1', [s.a.id])).rows[0].n, 1); // 정보는 그대로
});

test('복구 신청: 비밀번호를 확인하고, 신청하면 탈퇴 신청 목록에서 빠져 복구 신청 목록으로 간다', async () => {
  assert.equal((await recoverRequest(s.b, 'wrong-password')).status, 401);
  assert.equal((await recoverRequest(s.leader)).status, 400); // 탈퇴 신청한 계정이 아님
  const res = await recoverRequest(s.b);
  assert.equal(res.status, 200);
  assert.equal(res.body.withdrawal.recoveryRequested, true);
  assert.equal((await recoverRequest(s.b)).status, 400); // 중복 신청
  const list = await listOf();
  assert.deepEqual(ids(list.withdrawals), [s.a.id]);
  assert.deepEqual(ids(list.recoveries), [s.b.id]);
  assert.ok(list.recoveries[0].recoveryRequestedAt);
  assert.equal((await loginOf(s.b)).body.withdrawal.recoveryRequested, true); // 로그인 화면도 접수 상태를 안다
});

test('복구 신청이 접수된 계정은 14일이 지나도 정보를 지울 수 없다', async () => {
  await backdate(s.b, 30);
  const res = await call(s.operator, 'POST', `/admin/account-withdrawals/${s.b.id}/approve`);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /복구 신청/);
  assert.equal((await pg.query('select count(*)::int as n from auth.users where id = $1', [s.b.id])).rows[0].n, 1);
});

test('복구 승인: 탈퇴 신청이 사라지고 다시 로그인할 수 있다(목록에서도 빠진다)', async () => {
  assert.equal((await call(s.leader, 'POST', `/admin/account-recoveries/${s.b.id}/approve`)).status, 400);
  assert.equal((await call(s.operator, 'POST', `/admin/account-recoveries/${s.b.id}/approve`)).status, 204);
  const login = await loginOf(s.b);
  assert.equal(login.status, 200);
  assert.equal((await call({ token: login.body.accessToken }, 'GET', '/projects')).status, 200);
  const list = await listOf();
  assert.deepEqual(ids(list.recoveries), []);
  assert.deepEqual(ids(list.withdrawals), [s.a.id]);
  assert.equal((await call(s.operator, 'POST', `/admin/account-recoveries/${s.b.id}/approve`)).status, 400); // 이미 처리됨
});

test('복구 거절: 탈퇴 신청 목록으로 돌아가고 같은 계정은 다시 신청할 수 없다', async () => {
  assert.equal((await withdraw(s.c)).status, 204);
  assert.equal((await recoverRequest(s.c)).status, 200);
  assert.deepEqual(ids((await listOf()).recoveries), [s.c.id]);
  assert.equal((await call(s.operator, 'POST', `/admin/account-recoveries/${s.c.id}/reject`)).status, 204);
  const list = await listOf();
  assert.deepEqual(ids(list.recoveries), []);
  assert.ok(ids(list.withdrawals).includes(s.c.id));
  const again = await recoverRequest(s.c);
  assert.equal(again.status, 400);
  assert.match(again.body.message, /거절/);
  assert.equal((await loginOf(s.c)).status, 403);
  assert.equal((await loginOf(s.c)).body.withdrawal.canRecover, false);
});

test('복구 신청 기간(탈퇴 신청 후 14일)이 지나면 신청할 수 없다', async () => {
  assert.equal((await withdraw(s.d)).status, 204);
  await backdate(s.d, 15);
  const res = await recoverRequest(s.d);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /14일/);
  assert.equal((await loginOf(s.d)).body.withdrawal.canRecover, false);
});

test('14일이 지난 계정은 운영자가 탈퇴 승인하면 계정 정보와 프로필 사진이 삭제된다', async () => {
  // 프로필 사진을 올려 둔 계정을 탈퇴시키고 14일이 지난 것으로 만든다.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f645400000000049454e44ae426082', 'hex');
  const uploaded = await upload(s.e.token, '/me/images/avatar', { name: 'a.png', type: 'image/png', bytes: png });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  assert.equal((await pg.query("select count(*)::int as n from storage.objects where bucket_id = 'avatars' and name like $1", [`${s.e.id}/%`])).rows[0].n, 1);
  assert.equal((await withdraw(s.e)).status, 204);
  await backdate(s.e, 15);
  const list = await listOf();
  assert.equal(list.withdrawals.find((x) => x.userId === s.e.id).purgeable, true);
  assert.equal((await call(s.operator, 'POST', `/admin/account-withdrawals/${s.e.id}/approve`)).status, 204);
  assert.equal((await pg.query('select count(*)::int as n from auth.users where id = $1', [s.e.id])).rows[0].n, 0);
  assert.equal((await pg.query('select count(*)::int as n from public.profiles where id = $1', [s.e.id])).rows[0].n, 0);
  assert.equal((await pg.query('select count(*)::int as n from public.account_withdrawals where user_id = $1', [s.e.id])).rows[0].n, 0);
  assert.equal((await pg.query("select count(*)::int as n from storage.objects where bucket_id = 'avatars' and name like $1", [`${s.e.id}/%`])).rows[0].n, 0);
  assert.ok(!ids((await listOf()).withdrawals).includes(s.e.id));
  assert.equal((await loginOf(s.e)).status, 401); // 계정이 없다
  assert.equal((await call(s.operator, 'POST', `/admin/account-withdrawals/${s.e.id}/approve`)).status, 400); // 이미 삭제됨
});

test('운영자 승인 전의 다른 신청은 영향받지 않는다', async () => {
  const list = await listOf();
  assert.ok(ids(list.withdrawals).includes(s.a.id));
  assert.ok(ids(list.withdrawals).includes(s.c.id));
  assert.ok(ids(list.withdrawals).includes(s.d.id));
});
