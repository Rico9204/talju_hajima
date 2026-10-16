// main에서 들어온 기능의 자체 서버 엔드포인트: 평가 상위 %, 캠퍼스 소식 스크랩, 웹 푸시(구독 저장 → DB 트리거 → 서버 발송).
// 실제 푸시 서비스로 보내지 않도록 발송 함수(pushSend)만 바꿔 끼운다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, s;
const delivered = [];
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const KEY = 'B' + 'a'.repeat(86); // p256dh 형식(base64url)만 맞춘 값
const sub = (name) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, p256dh: KEY, auth: 'a'.repeat(22) });
const until = async (check) => { for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20)); };

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  const vapid = webpush.generateVAPIDKeys();
  ({ app, api } = await startApp(db, {
    vapid: { ...vapid, subject: 'mailto:test@example.com' },
    pushSend: async (subscription, payload) => {
      if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      delivered.push({ endpoint: subscription.endpoint, message: JSON.parse(payload) });
    },
  }));
  s = await setupProject(api, pg);
});
after(async () => { await app?.close(); await pg?.close(); });

test('평가 상위 %: 내 위치, 대상 지정은 projectId·memberId를 함께', async () => {
  const mine = await call(s.member, 'GET', '/me/evaluation-percentiles');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.available, false);
  assert.equal(typeof mine.body.population, 'number');
  const target = await call(s.member, 'GET', `/me/evaluation-percentiles?projectId=${s.p}&memberId=${s.leader.memberId}`);
  assert.equal(target.status, 200);
  assert.equal((await call(s.member, 'GET', `/me/evaluation-percentiles?projectId=${s.p}`)).status, 400);
  assert.equal((await call(s.member, 'GET', `/me/evaluation-percentiles?projectId=${s.p}&memberId=x`)).status, 400);
  assert.equal((await call(null, 'GET', '/me/evaluation-percentiles')).status, 401);
});

test('캠퍼스 소식 스크랩: 토글로 저장·해제, 본인 것만 보이고 http(s) 링크만', async () => {
  const notice = { id: 'n1', schoolCode: 'snu', schoolName: '서울대학교', category: 'contest', title: '공모전', author: '학생처', postDate: '2026-10-01', link: 'https://example.com/n1', dDay: 'D-3' };
  assert.deepEqual((await call(s.member, 'POST', '/me/scrapped-notices/toggle', notice)).body, { scrapped: true });
  const list = await call(s.member, 'GET', '/me/scrapped-notices');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].link, notice.link);
  assert.equal(list.body[0].userId, s.member.id);
  assert.deepEqual((await call(s.leader, 'GET', '/me/scrapped-notices')).body, []);
  assert.deepEqual((await call(s.member, 'POST', '/me/scrapped-notices/toggle', notice)).body, { scrapped: false });
  assert.deepEqual((await call(s.member, 'GET', '/me/scrapped-notices')).body, []);
  assert.equal((await call(s.member, 'POST', '/me/scrapped-notices/toggle', { ...notice, link: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call(s.member, 'POST', '/me/scrapped-notices/toggle', { ...notice, category: 'x' })).status, 400);
});

test('웹 푸시 구독: 알려진 푸시 서비스 주소만, 본인 것만 삭제', async () => {
  assert.equal((await call(s.member, 'POST', '/me/push-subscriptions', { ...sub('m'), endpoint: 'https://evil.example/x' })).status, 400);
  assert.equal((await call(s.member, 'POST', '/me/push-subscriptions', sub('m'))).status, 204);
  assert.equal((await call(s.leader, 'POST', '/me/push-subscriptions/delete', { endpoint: sub('m').endpoint })).status, 204);
  assert.equal((await pg.query('select count(*)::int as n from push_subscriptions')).rows[0].n, 1); // 남의 구독은 지워지지 않음
});

test('웹 푸시 발송: 새 과제를 작성자 말고 팀원에게 보내고, 끊긴 구독은 정리', async () => {
  await call(s.leader, 'POST', '/me/push-subscriptions', sub('leader'));
  await pg.query("insert into push_subscriptions(endpoint, user_id, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/gone', $1, $2, $3)", [s.member.id, KEY, 'a'.repeat(22)]);
  delivered.length = 0;
  const created = await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '자료 조사', assigneeIds: [s.member.memberId], status: 'todo' });
  assert.equal(created.status, 201);
  await until(() => delivered.length > 0);
  for (let i = 0; i < 100 && (await pg.query("select 1 from push_subscriptions where endpoint like '%/gone'")).rows.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(delivered.map((d) => d.endpoint), [sub('m').endpoint]);
  assert.equal(delivered[0].message.title, '[팀 프로젝트] 새 과제');
  assert.equal(delivered[0].message.body, '자료 조사');
  assert.ok(delivered[0].message.url.startsWith('/tasks/'));
  const left = (await pg.query('select endpoint from push_subscriptions order by endpoint')).rows.map((r) => r.endpoint);
  assert.deepEqual(left, [sub('leader').endpoint, sub('m').endpoint]);
  assert.equal((await pg.query('select count(*)::int as n from net.push_outbox')).rows[0].n, 0);
});
