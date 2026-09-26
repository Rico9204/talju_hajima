// 직접 구현한 로그인: 메일 인증 가입(가입 여부가 드러나지 않음)·로그인·실패 제한·토큰 위조/만료·리프레시 1회용·로그아웃
// ·비밀번호 재설정/변경·미인증 계정 가로채기 방지·기존(Supabase) 해시 호환·설정 검사.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { loadConfig } from '../dist/config.js';
import { JWT_SECRET, createTestDb, startApp, tokenInMail } from './helpers.mjs';

let pg, db, app, api, mailer;
before(async () => {
  ({ pg, db } = await createTestDb());
  ({ app, api, mailer } = await startApp(db));
});
after(async () => { await app?.close(); await pg?.close(); });

const signup = (email, password = 'correct-horse-1', displayName = '김철수') => api(null, 'POST', '/auth/signup', { email, password, displayName });
const login = (email, password) => api(null, 'POST', '/auth/login', { email, password });
const confirmLatest = (email) => api(null, 'POST', '/auth/confirm', { token: tokenInMail(mailer.last(email)) });

test('가입: "메일을 보냈다"만 답하고, 인증 전에는 로그인 불가, 확인 링크로 인증과 동시에 로그인', async () => {
  const res = await signup('Kim@Example.com');
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { status: 'check_email', message: '메일을 보냈습니다. 메일의 링크를 눌러 계속해 주세요.' });
  const mail = mailer.last('kim@example.com');
  assert.match(mail.subject, /이메일 인증/);
  assert.match(mail.text, /https:\/\/app\.test\/confirm-email\?token=/);
  const early = await login('kim@example.com', 'correct-horse-1');
  assert.equal(early.status, 403);
  assert.match(early.body.message, /이메일 인증/);
  const confirmed = await confirmLatest('kim@example.com');
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.user.email, 'kim@example.com');
  assert.equal((await api(confirmed.body.accessToken, 'GET', '/auth/me')).body.email, 'kim@example.com');
  assert.equal((await confirmLatest('kim@example.com')).status, 400); // 링크는 한 번만
  const profile = (await pg.query('select display_name, avatar_initial from profiles where id=$1', [confirmed.body.user.id])).rows[0];
  assert.deepEqual(profile, { display_name: '김철수', avatar_initial: '김' });
  const stored = (await pg.query('select encrypted_password, email_confirmed_at from auth.users where id=$1', [confirmed.body.user.id])).rows[0];
  assert.match(stored.encrypted_password, /^\$2[aby]\$10\$/);
  assert.ok(stored.email_confirmed_at);
  assert.equal((await login('KIM@example.com', 'correct-horse-1')).status, 200);
});

test('이미 가입된 이메일로 다시 가입: 화면 응답은 똑같고, 메일로 재설정 링크가 가며 계정은 그대로', async () => {
  const res = await signup('kim@example.com', 'another-password-1');
  assert.equal(res.status, 202);
  assert.deepEqual(res.body.status, 'check_email');
  assert.match(mailer.last('kim@example.com').subject, /이미 가입된/);
  assert.match(mailer.last('kim@example.com').text, /reset-password\?token=/);
  assert.equal((await login('kim@example.com', 'correct-horse-1')).status, 200); // 비밀번호 안 바뀜
  assert.equal((await login('kim@example.com', 'another-password-1')).status, 401);
});

test('미인증 계정 가로채기 방지: 나중 가입이 덮어쓰고, 먼저 만든 확인 링크는 무효', async () => {
  await signup('victim@example.com', 'attacker-password-1', '공격자');
  const attackerToken = tokenInMail(mailer.last('victim@example.com'));
  await signup('victim@example.com', 'victim-password-1', '피해자');
  assert.equal((await api(null, 'POST', '/auth/confirm', { token: attackerToken })).status, 400);
  assert.equal((await confirmLatest('victim@example.com')).status, 200);
  assert.equal((await login('victim@example.com', 'victim-password-1')).status, 200);
  assert.equal((await login('victim@example.com', 'attacker-password-1')).status, 401);
  const name = (await pg.query("select p.display_name from profiles p join auth.users u on u.id = p.id where u.email = 'victim@example.com'")).rows[0].display_name;
  assert.equal(name, '피해자');
});

test('확인 메일 다시 받기: 미인증이면 새 메일, 아니면 조용히 같은 응답', async () => {
  await signup('late@example.com');
  const before = mailer.sent.length;
  assert.equal((await api(null, 'POST', '/auth/resend-confirmation', { email: 'late@example.com' })).status, 202);
  assert.equal(mailer.sent.length, before + 1);
  assert.equal((await api(null, 'POST', '/auth/resend-confirmation', { email: 'nobody@example.com' })).status, 202);
  assert.equal((await api(null, 'POST', '/auth/resend-confirmation', { email: 'kim@example.com' })).status, 202); // 이미 인증됨
  assert.equal(mailer.sent.length, before + 1);
  assert.equal((await confirmLatest('late@example.com')).status, 200);
});

test('짧은 비밀번호·정의하지 않은 필드·앱 역할의 계정 표 접근은 막힌다', async () => {
  assert.equal((await signup('short@example.com', 'short')).status, 400);
  assert.equal((await api(null, 'POST', '/auth/signup', { email: 'x@example.com', password: 'correct-horse-1', displayName: '이', isAdmin: true })).status, 400);
  await pg.exec('set role authenticated');
  await assert.rejects(pg.query('select * from auth.users'), /permission denied/);
  await assert.rejects(pg.query('select * from auth.one_time_tokens'), /permission denied/);
  await pg.exec('reset role');
});

test('로그인: 틀린 비밀번호와 없는 이메일은 같은 안내', async () => {
  const wrong = await login('kim@example.com', 'wrong-password');
  const unknown = await login('nobody@example.com', 'wrong-password');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
});

test('실패가 5번 쌓이면 같은 IP·이메일은 맞는 비밀번호도 15분간 막히지만, 다른 이메일은 영향 없다', async () => {
  await signup('lee@example.com');
  await confirmLatest('lee@example.com');
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
  assert.equal((await api(null, 'POST', '/auth/refresh', { refreshToken: ok.body.refreshToken })).status, 401);
  assert.equal((await api(null, 'POST', '/auth/logout', { refreshToken: first.body.refreshToken })).status, 204);
  assert.equal((await api(null, 'POST', '/auth/refresh', { refreshToken: first.body.refreshToken })).status, 401);
});

test('비밀번호 재설정: 응답은 늘 같고, 링크는 한 번만, 재설정하면 모든 기기가 로그아웃된다', async () => {
  const session = await login('kim@example.com', 'correct-horse-1');
  const before = mailer.sent.length;
  assert.equal((await api(null, 'POST', '/auth/password-reset/request', { email: 'nobody@example.com' })).status, 202);
  assert.equal(mailer.sent.length, before); // 없는 이메일: 메일 없음(응답은 같음)
  assert.equal((await api(null, 'POST', '/auth/password-reset/request', { email: 'KIM@example.com' })).status, 202);
  const token = tokenInMail(mailer.last('kim@example.com'));
  assert.equal((await api(null, 'POST', '/auth/password-reset/confirm', { token, password: 'new-password-123' })).status, 204);
  assert.equal((await api(null, 'POST', '/auth/password-reset/confirm', { token, password: 'again-password-1' })).status, 400);
  assert.equal((await api(null, 'POST', '/auth/refresh', { refreshToken: session.body.refreshToken })).status, 401);
  assert.equal((await login('kim@example.com', 'correct-horse-1')).status, 401);
  assert.equal((await login('kim@example.com', 'new-password-123')).status, 200);
});

test('비밀번호 변경: 현재 비밀번호가 맞아야 하고, 다른 기기는 로그아웃된다', async () => {
  const other = await login('kim@example.com', 'new-password-123');
  const me = await login('kim@example.com', 'new-password-123');
  assert.equal((await api(me.body.accessToken, 'PATCH', '/auth/password', { currentPassword: 'wrong-password', newPassword: 'changed-password-1' })).status, 400);
  const changed = await api(me.body.accessToken, 'PATCH', '/auth/password', { currentPassword: 'new-password-123', newPassword: 'changed-password-1' });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.refreshToken);
  assert.equal((await api(null, 'POST', '/auth/refresh', { refreshToken: other.body.refreshToken })).status, 401);
  assert.equal((await login('kim@example.com', 'changed-password-1')).status, 200);
});

test('Supabase에서 옮겨 온 계정($2a$ bcrypt 해시, 인증됨)도 비밀번호 그대로 로그인된다', async () => {
  const legacyHash = bcrypt.hashSync('old-supabase-pw', bcrypt.genSaltSync(10).replace(/^\$2b\$/, '$2a$'));
  await pg.query("insert into auth.users(email, encrypted_password, raw_user_meta_data, email_confirmed_at) values('old@example.com', $1, '{\"display_name\":\"박\"}', now())", [legacyHash]);
  assert.equal((await login('old@example.com', 'old-supabase-pw')).status, 200);
});

test('설정: 필수값·서명 키 길이·운영의 CORS·메일(SMTP)·화면 주소를 검사한다', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET };
  assert.throws(() => loadConfig({}), /DATABASE_URL, JWT_SECRET/);
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'short' }), /32자 이상/);
  const prod = { ...base, NODE_ENV: 'production', CORS_ORIGIN: 'https://a.app', APP_URL: 'https://a.app' };
  assert.throws(() => loadConfig({ ...prod, CORS_ORIGIN: '' }), /CORS_ORIGIN/);
  assert.throws(() => loadConfig({ ...prod, MAIL_TRANSPORT: 'console' }), /MAIL_TRANSPORT=smtp/);
  assert.throws(() => loadConfig(prod), /SMTP_URL과 MAIL_FROM/);
  assert.throws(() => loadConfig({ ...prod, APP_URL: '', SMTP_URL: 'smtps://u:p@smtp.test', MAIL_FROM: 'no-reply@a.app' }), /APP_URL/);
  const ok = loadConfig({ ...prod, SMTP_URL: 'smtps://u:p@smtp.test', MAIL_FROM: 'no-reply@a.app' });
  assert.deepEqual(ok.mail, { transport: 'smtp', smtpUrl: 'smtps://u:p@smtp.test', from: 'no-reply@a.app' });
  assert.equal(loadConfig(base).mail.transport, 'console'); // 개발 기본값
});
