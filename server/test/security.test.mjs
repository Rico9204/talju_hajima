// 보안 검토에서 고친 5가지: 운영자 신청 목록(이메일 인증 칼럼), IP 단위 로그인·가입 제한, 프록시 뒤 실제 IP,
// bcrypt 72바이트, X-Powered-By 헤더. 한도는 테스트용으로 작게 넣는다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AuthLimits, RateLimiter } from '../dist/auth.js';
import { loadConfig } from '../dist/config.js';
import { JWT_SECRET, createTestDb, startApp } from './helpers.mjs';

const HOUR = 60 * 60_000;
let pg, db;
const apps = [];
async function start(extra) {
  const started = await startApp(db, extra);
  apps.push(started.app);
  return started.api;
}
before(async () => { ({ pg, db } = await createTestDb()); });
after(async () => { for (const app of apps) await app.close(); await pg?.close(); });

const signupBody = (email, password = 'correct-horse-1') => ({ email, password, displayName: '사용자' });

test('1) 운영자의 관리자 신청 목록이 동작하고, 가입한 계정은 이메일 미인증으로 보인다', async () => {
  const api = await start();
  const res = await api(null, 'POST', '/auth/signup', signupBody('operator@example.com'));
  assert.equal(res.status, 202);
  const userId = (await pg.query("select id from auth.users where email = 'operator@example.com'")).rows[0].id;
  await pg.query('update profiles set is_operator=true where id=$1', [userId]);
  await pg.query(`insert into admin_applications(user_id, org, job_title, contact, doc_type, doc_name, doc_size, doc_path, consent_at)
    values ($1, '학교', '교수', '010-0000', 'employment', '재직증명서.pdf', 10, $2, now())`, [userId, `${userId}/doc.pdf`]);
  const rows = await db.asUser(userId, (query) => query('select email, email_confirmed from public.list_admin_applications()'));
  assert.deepEqual(rows, [{ email: 'operator@example.com', email_confirmed: false }]);
});

test('2) 같은 IP에서 이메일을 바꿔 가며 틀리면 IP 전체가 막히고, 자기 계정으로 성공해도 초기화되지 않는다', async () => {
  const api = await start({ authLimits: new AuthLimits(new RateLimiter(5, HOUR), new RateLimiter(3, HOUR), new RateLimiter(100, HOUR)) });
  await api(null, 'POST', '/auth/signup', signupBody('mine@example.com'));
  await pg.query("update auth.users set email_confirmed_at = now() where email = 'mine@example.com'");
  const login = (email, password = 'wrong-password') => api(null, 'POST', '/auth/login', { email, password });
  assert.equal((await login('a@example.com')).status, 401);
  assert.equal((await login('b@example.com')).status, 401);
  assert.equal((await login('mine@example.com', 'correct-horse-1')).status, 200); // 성공해도 IP 실패 수는 그대로
  assert.equal((await login('c@example.com')).status, 401); // 3번째 실패
  assert.equal((await login('mine@example.com', 'correct-horse-1')).status, 429); // 이제 IP 전체가 막힘
});

test('2) 같은 IP의 가입은 한도까지만', async () => {
  const api = await start({ authLimits: new AuthLimits(undefined, undefined, new RateLimiter(2, HOUR)) });
  assert.equal((await api(null, 'POST', '/auth/signup', signupBody('s1@example.com'))).status, 202);
  assert.equal((await api(null, 'POST', '/auth/signup', signupBody('s2@example.com'))).status, 202);
  assert.equal((await api(null, 'POST', '/auth/signup', signupBody('s3@example.com'))).status, 429);
});

test('3) TRUST_PROXY를 켜면 프록시가 알려 준 실제 IP별로 제한한다(다른 사용자는 막히지 않음)', async () => {
  const limits = () => new AuthLimits(new RateLimiter(5, HOUR), new RateLimiter(2, HOUR), new RateLimiter(100, HOUR));
  const behindProxy = await start({ trustProxy: 1, authLimits: limits() });
  const login = (api, ip) => api(null, 'POST', '/auth/login', { email: 'x@example.com', password: 'wrong-password' }, { 'x-forwarded-for': ip });
  await login(behindProxy, '203.0.113.1');
  await login(behindProxy, '203.0.113.1');
  assert.equal((await login(behindProxy, '203.0.113.1')).status, 429);
  assert.equal((await login(behindProxy, '203.0.113.2')).status, 401); // 다른 사람은 영향 없음
  // 설정하지 않으면 X-Forwarded-For를 믿지 않는다(위조한 헤더로 제한을 피할 수 없음)
  const direct = await start({ authLimits: limits() });
  await login(direct, '198.51.100.1');
  await login(direct, '198.51.100.2');
  assert.equal((await login(direct, '198.51.100.3')).status, 429);
  assert.equal(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET, TRUST_PROXY: '1' }).trustProxy, 1);
  assert.equal(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET, TRUST_PROXY: 'loopback' }).trustProxy, 'loopback');
  assert.equal(loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET }).trustProxy, undefined);
});

test('4) 비밀번호는 바이트로 검사: 72바이트를 넘는 한글 비밀번호는 가입 거부, 로그인도 실패로 처리', async () => {
  const api = await start();
  const longKorean = '가'.repeat(30); // 30자 = 90바이트
  const signup = await api(null, 'POST', '/auth/signup', signupBody('long@example.com', longKorean));
  assert.equal(signup.status, 400);
  assert.match(signup.body.message, /72바이트/);
  const exact = '가'.repeat(24); // 72바이트 — 허용
  assert.equal((await api(null, 'POST', '/auth/signup', signupBody('ok@example.com', exact))).status, 202);
  await pg.query("update auth.users set email_confirmed_at = now() where email = 'ok@example.com'");
  assert.equal((await api(null, 'POST', '/auth/login', { email: 'ok@example.com', password: exact })).status, 200);
  // 앞 72바이트가 같아도 더 긴 비밀번호는 맞은 것으로 보지 않는다
  assert.equal((await api(null, 'POST', '/auth/login', { email: 'ok@example.com', password: `${exact}가` })).status, 401);
});

test('5) 응답에 X-Powered-By 헤더가 없다', async () => {
  const api = await start();
  const res = await api(null, 'GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-powered-by'), null);
});
