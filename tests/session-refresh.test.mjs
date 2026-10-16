import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// 브라우저 전역(localStorage, window 이벤트, Web Locks)을 흉내 낸다.
const store = new Map([['talju-server-session', '{"accessToken":"old","refreshToken":"old"}']]);
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = new EventTarget();
let tail = Promise.resolve();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (_name, run) => { const next = tail.then(run); tail = next.catch(() => {}); return next; } } } });

const { accessToken, readSession, refreshSession, writeSession } = await import('../src/api/rest/session.ts');
const { ApiClient } = await import('../src/api/rest/apiClient.ts');

const jwt = (secondsLeft) => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsLeft })).toString('base64url')}.s`;
const session = (token) => ({ user: { id: 'u1' }, accessToken: token });
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => writeSession(null));

test('예전 버전이 localStorage에 남긴 토큰은 지우고, 새 로그인도 저장하지 않는다', () => {
  assert.equal(store.has('talju-server-session'), false);
  writeSession(session(jwt(3600)));
  assert.equal(store.size, 0);
});

test('만료 직전 토큰은 동시에 여러 번 요청해도 쿠키로 한 번만 갱신한다', async () => {
  writeSession(session(jwt(10)));
  const fresh = jwt(3600);
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return json(200, { user: { id: 'u1' }, accessToken: fresh }); };
  const tokens = await Promise.all([accessToken(), accessToken(), accessToken()]);
  assert.deepEqual(tokens, [fresh, fresh, fresh]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.credentials, 'include'); // 리프레시 토큰은 httpOnly 쿠키로 간다
  assert.equal(calls[0].init.body, undefined);
  assert.equal(readSession().accessToken, fresh);
});

test('새로 고침 직후에는 쿠키로 로그인 상태를 되찾는다', async () => {
  globalThis.fetch = async () => json(200, { user: { id: 'u9', email: 'a@b.c' }, accessToken: 'restored' });
  assert.equal(await refreshSession(), 'restored');
  assert.equal(readSession().user.id, 'u9');
});

test('로그인 전에는 토큰을 요청하지 않는다', async () => {
  globalThis.fetch = async () => { throw new Error('호출되면 안 됨'); };
  assert.equal(await accessToken(), null);
});

test('리프레시가 거부되면 로그아웃된다', async () => {
  writeSession(session(jwt(-10)));
  globalThis.fetch = async () => json(401, { message: '만료' });
  assert.equal(await accessToken(), null);
  assert.equal(readSession(), null);
});

test('네트워크 오류로는 로그아웃하지 않는다', async () => {
  writeSession(session(jwt(-10)));
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(accessToken());
  assert.ok(readSession());
});

test('API가 401이면 토큰을 갱신해 한 번만 다시 보낸다', async () => {
  const seen = [];
  const client = new ApiClient('https://api.test/api', async (force) => (force ? 'new' : 'old'));
  globalThis.fetch = async (_url, init) => { const auth = new Headers(init.headers).get('Authorization'); seen.push(auth); return auth === 'Bearer new' ? json(200, { ok: true }) : json(401, { message: '만료' }); };
  assert.deepEqual(await client.request('/x'), { ok: true });
  assert.deepEqual(seen, ['Bearer old', 'Bearer new']);

  seen.length = 0;
  const stuck = new ApiClient('https://api.test/api', async () => 'bad');
  await assert.rejects(stuck.request('/x'), /만료/);
  assert.equal(seen.length, 2);
});
