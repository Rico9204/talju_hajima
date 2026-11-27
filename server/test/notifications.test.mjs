// 전체 알림: 관리자 공지(기간 동안 계속 조회)와 게시판 공지사항(운영자가 쓰면 사용자 전체에게)을 한 목록으로, 읽음 표시, 실시간·웹 푸시 알림.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

let pg, app, api, origin, s;
const delivered = [];
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const KEY = 'B' + 'a'.repeat(86);
const sub = (name) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, p256dh: KEY, auth: 'a'.repeat(22) });
const notice = (title, over = {}) => ({ category: 'notice', title, content: '<p>내용</p>', attachments: [], ...over });
const list = async (user) => (await call(user, 'GET', '/notifications')).body.items;
const find = (items, kind, title) => items.find((i) => i.kind === kind && i.title === title);

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  const vapid = webpush.generateVAPIDKeys();
  ({ app, api, origin } = await startApp(db, {
    vapid: { ...vapid, subject: 'mailto:test@example.com' },
    pushSend: async (subscription, payload) => { delivered.push({ endpoint: subscription.endpoint, message: JSON.parse(payload) }); },
  }));
  s = await setupProject(api, pg);
  // 시스템 공지(전체 대상)는 운영자만 보낸다. 관리자(admin)는 이 프로젝트의 승인 담당이라 프로젝트 공지도 보낼 수 있다.
  await pg.query('update profiles set is_operator = true where id = $1', [s.admin.id]);
});
after(async () => { await app?.close(); await pg?.close(); });

test('로그인해야 하고, 처음에는 비어 있다', async () => {
  assert.equal((await call(null, 'GET', '/notifications')).status, 401);
  assert.equal((await call(null, 'POST', '/notifications/read', { items: [] })).status, 401);
  assert.deepEqual(await list(s.member), []);
});

test('게시판 공지사항: 관리자가 쓰면 사용자 전체(참여 프로젝트와 무관)의 알림 목록에 안 읽음으로 뜬다', async () => {
  assert.equal((await call(s.member, 'POST', '/board/posts', notice('몰래 공지'))).status, 403); // 공지사항은 관리자만
  const res = await call(s.admin, 'POST', '/board/posts', notice('전체 점검 안내'));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  for (const user of [s.leader, s.member, s.outsider]) {
    const item = find(await list(user), 'board_notice', '전체 점검 안내');
    assert.ok(item, `${user.email} 알림 목록`);
    assert.equal(item.read, false);
    assert.equal(item.body, null); // 게시판 공지는 제목만 알린다(본문은 게시판에서)
  }
  // 쓴 사람은 자기 글을 읽은 것으로 본다
  assert.equal(find(await list(s.admin), 'board_notice', '전체 점검 안내').read, true);
  s.noticeId = find(await list(s.member), 'board_notice', '전체 점검 안내').refId;
  assert.equal(s.noticeId, res.body.id);
});

test('공지사항이 아닌 글(자유·모집)은 알림이 되지 않는다', async () => {
  assert.equal((await call(s.member, 'POST', '/board/posts', { category: 'free', title: '잡담', content: '<p>x</p>', attachments: [] })).status, 201);
  assert.equal(find(await list(s.leader), 'board_notice', '잡담'), undefined);
});

test('30일이 지난 공지사항은 알림 목록에서 빠지고, 글을 지우면 알림도 사라진다', async () => {
  const old = (await call(s.admin, 'POST', '/board/posts', notice('옛 공지'))).body.id;
  await pg.query("update board_posts set created_at = now() - interval '31 days' where id = $1", [old]);
  assert.equal(find(await list(s.member), 'board_notice', '옛 공지'), undefined);
  const temp = (await call(s.admin, 'POST', '/board/posts', notice('곧 지울 공지'))).body.id;
  assert.ok(find(await list(s.member), 'board_notice', '곧 지울 공지'));
  assert.equal((await call(s.admin, 'DELETE', `/board/posts/${temp}`)).status, 204);
  assert.equal(find(await list(s.member), 'board_notice', '곧 지울 공지'), undefined);
});

test('관리자 공지: 공지 기간 동안 알림 목록에 계속 남는다("다시 보지 않기"를 눌러도), 기간 밖은 안 보인다, 대상 밖은 안 보인다', async () => {
  const make = (over) => ({ title: '공지', body: '내용', startDate: day(0), endDate: day(1), targetAll: true, projectIds: [], ...over });
  const all = (await call(s.admin, 'POST', '/announcements', make({ title: '전체 공지' }))).body.id;
  const proj = (await call(s.admin, 'POST', '/announcements', make({ title: '프로젝트 공지', targetAll: false, projectIds: [s.projectId] }))).body.id;
  await call(s.admin, 'POST', '/announcements', make({ title: '지난 공지', startDate: day(-5), endDate: day(-2) }));
  await call(s.admin, 'POST', '/announcements', make({ title: '미래 공지', startDate: day(3), endDate: day(5) }));
  const mine = await list(s.member);
  assert.ok(find(mine, 'announcement', '전체 공지') && find(mine, 'announcement', '프로젝트 공지'));
  assert.equal(find(mine, 'announcement', '지난 공지'), undefined);
  assert.equal(find(mine, 'announcement', '미래 공지'), undefined);
  assert.equal(find(mine, 'announcement', '전체 공지').body, '내용'); // 관리자 공지는 내용까지 보인다
  assert.ok(!find(await list(s.outsider), 'announcement', '프로젝트 공지'));
  // 팝업의 "다시 보지 않기"를 눌러도 알림 목록에는 남는다
  assert.equal((await call(s.member, 'POST', `/announcements/${all}/dismiss`)).status, 204);
  assert.ok(!(await call(s.member, 'GET', '/announcements/active')).body.some((a) => a.id === all)); // 팝업에서는 사라지고
  assert.ok(find(await list(s.member), 'announcement', '전체 공지')); // 알림에는 남는다
  s.announcementId = all; s.projectAnnouncementId = proj;
});

test('읽음 표시: 사용자별로 기록되고 두 번 눌러도 괜찮다, 읽어도 목록에서 사라지지 않는다', async () => {
  const res = await call(s.member, 'POST', '/notifications/read', { items: [{ kind: 'board_notice', refId: s.noticeId }, { kind: 'announcement', refId: s.announcementId }] });
  assert.equal(res.status, 204);
  assert.equal((await call(s.member, 'POST', '/notifications/read', { items: [{ kind: 'board_notice', refId: s.noticeId }] })).status, 204);
  const mine = await list(s.member);
  assert.equal(find(mine, 'board_notice', '전체 점검 안내').read, true);
  assert.equal(find(mine, 'announcement', '전체 공지').read, true); // 읽음이어도 기간 동안 계속 보인다
  assert.equal(find(await list(s.leader), 'board_notice', '전체 점검 안내').read, false); // 다른 사람은 그대로
  assert.equal((await call(s.member, 'POST', '/notifications/read', { items: [] })).status, 204);
});

test('관리자 공지의 읽음은 "확인했어요"(announcement_reads)와 한 기록이다', async () => {
  const active = async (user) => (await call(user, 'GET', '/announcements/active')).body;
  // 알림 종에서 읽으면 공지 띠·대시보드 카드에서도 확인한 것으로 보이고, 확인 인원 수에 들어간다
  assert.equal((await active(s.member)).find((a) => a.id === s.projectAnnouncementId).read, false);
  assert.equal((await call(s.member, 'POST', '/notifications/read', { items: [{ kind: 'announcement', refId: s.projectAnnouncementId }] })).status, 204);
  assert.equal((await active(s.member)).find((a) => a.id === s.projectAnnouncementId).read, true);
  const managed = (await call(s.admin, 'GET', '/announcements')).body.find((a) => a.id === s.projectAnnouncementId);
  assert.equal(managed.readCount, 1);
  // "확인했어요"를 누르면 알림 종에서도 읽음
  assert.equal(find(await list(s.leader), 'announcement', '프로젝트 공지').read, false);
  assert.equal((await call(s.leader, 'POST', `/announcements/${s.projectAnnouncementId}/read`)).status, 204);
  assert.equal(find(await list(s.leader), 'announcement', '프로젝트 공지').read, true);
  // 받지 않는 공지(대상 밖)는 알림 종으로 읽음 표시해도 기록되지 않는다
  assert.equal((await call(s.outsider, 'POST', '/notifications/read', { items: [{ kind: 'announcement', refId: s.projectAnnouncementId }] })).status, 204);
  const outsiderRead = await pg.query('select 1 from announcement_reads where announcement_id = $1 and user_id = $2', [s.projectAnnouncementId, s.outsider.id]);
  assert.equal(outsiderRead.rows.length, 0);
  // notification_reads에는 게시판 공지사항만 남는다
  assert.equal((await pg.query("select 1 from notification_reads where kind <> 'board_notice'")).rows.length, 0);
  await assert.rejects(pg.query("insert into notification_reads(user_id, kind, ref_id) values ($1, 'announcement', 1)", [s.member.id]));
});

test('읽음 표시 입력 검증', async () => {
  assert.equal((await call(s.member, 'POST', '/notifications/read', { items: [{ kind: 'chat', refId: 1 }] })).status, 400);
  assert.equal((await call(s.member, 'POST', '/notifications/read', { items: [{ kind: 'board_notice', refId: 'x' }] })).status, 400);
  const many = Array.from({ length: 201 }, (_, i) => ({ kind: 'board_notice', refId: i + 1 }));
  assert.equal((await call(s.member, 'POST', '/notifications/read', { items: many })).status, 400);
  assert.equal((await call(s.member, 'POST', '/notifications/read', {})).status, 400);
});

test('실시간: 공지사항을 쓰거나 지우면 접속 중인 사람에게 "바뀌었다"가 온다', async () => {
  const ws = new WebSocket(`${origin.replace('http', 'ws')}/realtime`);
  const got = [];
  ws.addEventListener('message', (event) => got.push(JSON.parse(event.data)));
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  ws.send(JSON.stringify({ type: 'auth', token: s.outsider.token }));
  await sleep(300);
  ws.send(JSON.stringify({ type: 'join', topic: 'announcements', ref: 'n' }));
  await sleep(300);
  const changes = () => got.filter((m) => m.type === 'change' && m.topic === 'announcements').length;
  const before = changes();
  const id = (await call(s.admin, 'POST', '/board/posts', notice('실시간 공지'))).body.id;
  await sleep(300);
  assert.equal(changes(), before + 1);
  await call(s.admin, 'POST', '/board/posts', { category: 'free', title: '실시간 아님', content: '<p>x</p>', attachments: [] });
  await sleep(200);
  assert.equal(changes(), before + 1, '공지사항이 아닌 글은 알리지 않는다');
  assert.equal((await call(s.admin, 'DELETE', `/board/posts/${id}`)).status, 204);
  await sleep(300);
  assert.equal(changes(), before + 2);
  ws.close();
});

test('웹 푸시: 공지사항을 쓰면 푸시를 켠 모든 사용자에게 제목만 보낸다(공지사항이 아닌 글은 보내지 않는다)', async () => {
  assert.equal((await call(s.member, 'POST', '/me/push-subscriptions', sub('member'))).status, 204);
  assert.equal((await call(s.outsider, 'POST', '/me/push-subscriptions', sub('outsider'))).status, 204);
  delivered.length = 0;
  await call(s.admin, 'POST', '/board/posts', { category: 'free', title: '푸시 아님', content: '<p>x</p>', attachments: [] });
  await sleep(300);
  assert.equal(delivered.length, 0);
  await call(s.admin, 'POST', '/board/posts', notice('긴급 공지 제목'));
  for (let i = 0; i < 50 && delivered.length < 2; i++) await sleep(40);
  assert.deepEqual(delivered.map((d) => d.endpoint).sort(), [sub('member').endpoint, sub('outsider').endpoint].sort());
  assert.equal(delivered[0].message.body, '긴급 공지 제목');
  assert.equal(delivered[0].message.url, '/home');
});
