// api/push.ts(웹 푸시 발송 함수): 비밀값 확인, 알려진 푸시 서비스만, 우리 사이트 주소만, 끊긴 구독 정리.
// 실제 푸시 서비스로 보내지 않도록 web-push의 sendNotification을 가짜로 바꾼다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import webpush from 'web-push';

process.env.PUSH_WEBHOOK_SECRET = 's'.repeat(40);
const vapid = webpush.generateVAPIDKeys();
process.env.VITE_VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VITE_SUPABASE_URL = 'https://db.test';
process.env.VITE_SUPABASE_ANON_KEY = 'anon';

const delivered = [];
webpush.sendNotification = async (sub, message) => {
  if (sub.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
  delivered.push({ endpoint: sub.endpoint, message: JSON.parse(message) });
};
const pruned = [];
globalThis.fetch = async (url, init) => { pruned.push({ url, body: JSON.parse(init.body) }); return new Response('null'); };
const { default: handler } = await import('../api/push.ts');

async function call({ method = 'POST', secret = 's'.repeat(40), body }) {
  const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}))]);
  Object.assign(req, { method, headers: secret ? { 'x-push-secret': secret } : {} });
  const res = { status: 0, body: '', writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
  await handler(req, res);
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}
const sub = (endpoint) => ({ endpoint, p256dh: 'p', auth: 'a' });
const notification = { title: '[캡스톤] 새 과제', body: '보고서', url: '/tasks/1?project=p', tag: 'tasks:p' };

test('비밀값이 틀리거나 없으면 보내지 않는다', async () => {
  assert.equal((await call({ secret: 'wrong', body: { subscriptions: [], notification } })).status, 401);
  assert.equal((await call({ secret: null, body: { subscriptions: [], notification } })).status, 401);
  assert.equal((await call({ method: 'GET' })).status, 405);
});

test('알림을 누르면 열리는 주소는 우리 사이트 안만', async () => {
  for (const url of ['https://evil.example', '//evil.example/x', 'javascript:alert(1)']) {
    assert.equal((await call({ body: { subscriptions: [sub('https://fcm.googleapis.com/fcm/send/a')], notification: { ...notification, url } } })).status, 400);
  }
  assert.equal((await call({ body: '{not json' })).status, 400);
});

test('알려진 푸시 서비스로만 보내고, 끊긴 구독은 비밀값과 함께 정리 요청', async () => {
  delivered.length = 0; pruned.length = 0;
  const res = await call({ body: { notification, subscriptions: [
    sub('https://fcm.googleapis.com/fcm/send/a'),
    sub('https://updates.push.services.mozilla.com/wpush/v2/b'),
    sub('https://internal.example/steal'), // 알려진 푸시 서비스가 아님 → 무시
    sub('https://web.push.apple.com/gone'),
  ] } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sent: 2, gone: 1 });
  assert.deepEqual(delivered.map((d) => d.endpoint).sort(), ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/b']);
  assert.equal(delivered[0].message.url, '/tasks/1?project=p');
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].url, 'https://db.test/rest/v1/rpc/prune_push_subscriptions');
  assert.deepEqual(pruned[0].body, { p_secret: 's'.repeat(40), p_endpoints: ['https://web.push.apple.com/gone'] });
});

test('대시보드에 붙여 넣으며 섞인 앞뒤 공백·줄바꿈은 무시한다', async () => {
  const saved = { ...process.env };
  process.env.PUSH_WEBHOOK_SECRET = ` ${'s'.repeat(40)}\n`;
  process.env.VITE_VAPID_PUBLIC_KEY = `${vapid.publicKey}\n`;
  process.env.VAPID_PRIVATE_KEY = ` ${vapid.privateKey} `;
  process.env.VAPID_SUBJECT = 'https://app.test\r\n';
  try {
    const res = await call({ body: { subscriptions: [], notification } });
    assert.equal(res.status, 200);
  } finally { Object.assign(process.env, saved); }
});

test('VAPID 키 형식이 틀려도 함수가 죽지 않고 원인을 알린다', async () => {
  const saved = process.env.VAPID_PRIVATE_KEY;
  process.env.VAPID_PRIVATE_KEY = '"잘못된 키"';
  try {
    const res = await call({ body: { subscriptions: [], notification } });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'invalid VAPID config' });
  } finally { process.env.VAPID_PRIVATE_KEY = saved; }
});
