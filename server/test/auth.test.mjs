// 직접 구현한 로그인: 가입·로그인·실패 제한·토큰 위조/만료·리프레시 1회용·로그아웃·기존(Supabase) 해시 호환.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { loadConfig } from '../dist/config.js';
import { JWT_SECRET, createTestDb, startApp } from './helpers.mjs';

let pg, db, app, api;
before(async () => {
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
});
after(async () => { await app?.close(); await pg?.close(); });

const signup = (email, password = 'correct-horse-1', displayName = '김철수') => api(null, 'POST', '/auth/signup', { email, password, displayName });
const login = (email, password) => api(null, 'POST', '/auth/login', { email, password });

test('가입하면 토큰을 받고, 트리거가 프로필을 만들며, 비밀번호·리프레시 토큰은 해시로만 저장된다', async () => {
  const res = await signup('Kim@Example.com');
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'kim@example.com'); // 소문자로 정규화
  const me = await api(res.body.accessToken, 'GET', '/auth/me');
  assert.deepEqual(me.body, { id: res.body.user.id, email: 'kim@example.com' });
  const profile = (await pg.query('select display_name, avatar_initial, is_admin from profiles where id=$1', [res.body.user.id])).rows[0];
  assert.deepEqual(profile, { display_name: '김철수', avatar_initial: '김', is_admin: false });
  const stored = (await pg.query('select encrypted_password from auth.users where id=$1', [res.body.user.id])).rows[0].encrypted_password;
  assert.match(stored, /^\$2[aby]\$10\$/);
  const tokens = (await pg.query('select token_hash from auth.refresh_tokens where user_id=$1', [res.body.user.id])).rows;
  assert.equal(tokens.length, 1);
  assert.notEqual(tokens[0].token_hash, res.body.refreshToken);
});

test('중복 이메일(대소문자 무관)·짧은 비밀번호·정의하지 않은 필드·앱 역할의 계정 표 접근은 막힌다', async () => {
  assert.equal((await signup('KIM@example.com')).status, 409);
  assert.equal((await signup('short@example.com', 'short')).status, 400);
  assert.equal((await api(null, 'POST', '/auth/signup', { email: 'x@example.com', password: 'correct-horse-1', displayName: '이', isAdmin: true })).status, 400);
  await pg.exec('set role authenticated');
  await assert.rejects(pg.query('select * from auth.users'), /permission denied/);
  await pg.exec('reset role');
});

test('로그인: 틀린 비밀번호와 없는 이메일은 같은 안내, 맞으면 토큰', async () => {
  const wrong = await login('kim@example.com', 'wrong-password');
  const unknown = await login('nobody@example.com', 'wrong-password');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
  const ok = await login('KIM@example.com', 'correct-horse-1');
  assert.equal(ok.status, 200);
  assert.equal((await api(ok.body.accessToken, 'GET', '/auth/me')).status, 200);
});

test('실패가 5번 쌓이면 같은 IP·이메일은 맞는 비밀번호도 15분간 막히지만, 다른 이메일은 영향 없다', async () => {
  await signup('lee@example.com');
  for (let i = 0; i < 5; i++) assert.equal((await login('lee@example.com', 'wrong-password')).status, 401);
  assert.equal((await login('lee@example.com', 'correct-horse-1')).status, 429);
  assert.equal((await login('kim@example.com', 'correct-horse-1')).status, 200);
});

test('위조·다른 키·만료·형식이 틀린 토큰은 401', async () => {
  const ok = await login('kim@example.com', 'correct-horse-1');
  const [h, p, s] = ok.body.accessToken.split('.');
  assert.equal((await api(`${h}.${p}.${s.slice(0, -2)}xx`, 'GET', '/auth/me')).status, 401);
  const forge = (secret, exp = '1h', sub = ok.body.user.id) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub).setIssuer('talju-server').setAudience('talju-app').setIssuedAt().setExpirationTime(exp).sign(new TextEncoder().encode(secret));
  assert.equal((await api(await forge('another-secret-that-is-32-characters-long'), 'GET', '/auth/me')).status, 401);
  assert.equal((await api(await forge(JWT_SECRET, '-1m'), 'GET', '/auth/me')).status, 401);
  assert.equal((await api(await forge(JWT_SECRET, '1h', 'not-a-uuid'), 'GET', '/auth/me')).status, 401);
  assert.equal((await api(await forge(JWT_SECRET), 'GET', '/auth/me')).status, 200); // 같은 키로 서명하면 통과(대조군)
  assert.equal((await api('garbage', 'GET', '/auth/me')).status, 401);
});

test('리프레시 토큰은 한 번만 쓸 수 있고, 로그아웃하면 더 이상 쓸 수 없다', async () => {
  const ok = await login('kim@example.com', 'correct-horse-1');
  const first = await api(null, 'POST', '/auth/refresh', { refreshToken: ok.body.refreshToken });
  assert.equal(first.status, 200);
  assert.equal((await api(first.body.accessToken, 'GET', '/auth/me')).status, 200);
  assert.equal((await api(null, 'POST', '/auth/refresh', { refreshToken: ok.body.refreshToken })).status, 401);
  assert.equal((await api(null, 'POST', '/auth/logout', { refreshToken: first.body.refreshToken })).status, 204);
  assert.equal((await api(null, 'POST', '/auth/refresh', { refreshToken: first.body.refreshToken })).status, 401);
});

test('Supabase에서 옮겨 온 계정($2a$ bcrypt 해시)도 비밀번호 그대로 로그인된다', async () => {
  const legacyHash = bcrypt.hashSync('old-supabase-pw', bcrypt.genSaltSync(10).replace(/^\$2b\$/, '$2a$'));
  assert.match(legacyHash, /^\$2a\$10\$/);
  await pg.query("insert into auth.users(email, encrypted_password, raw_user_meta_data) values('old@example.com', $1, '{\"display_name\":\"박\"}')", [legacyHash]);
  assert.equal((await login('old@example.com', 'old-supabase-pw')).status, 200);
});

test('필수 환경변수가 없거나 서명 키가 짧거나, 운영인데 CORS_ORIGIN이 없으면 서버가 뜨지 않는다', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL, JWT_SECRET/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'short' }), /32자 이상/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET, NODE_ENV: 'production' }), /CORS_ORIGIN/);
  const config = loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET, CORS_ORIGIN: 'https://a.app, https://b.app' });
  assert.deepEqual(config.corsOrigins, ['https://a.app', 'https://b.app']);
});
