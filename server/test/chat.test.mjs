// 채팅 API: 보내기(보낸 사람은 서버가 정함)·1:1 채널 접근·읽음·반응·채팅 도구·접속 기록.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, setupProject, signupUsers, startApp } from './helpers.mjs';

let pg, app, api, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const channel = (id) => encodeURIComponent(id);
let hello;

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  s = await setupProject(api, pg);
});
after(async () => { await app?.close(); await pg?.close(); });

test('보내기: 보낸 사람은 로그인한 사용자, 빈 메시지·외부인은 거부', async () => {
  const sent = await call(s.member, 'POST', `/projects/${s.p}/chat/all/messages`, { text: '안녕하세요' });
  assert.equal(sent.status, 201);
  hello = sent.body;
  assert.equal(hello.senderId, s.member.memberId);
  assert.equal(hello.channelId, 'all');
  assert.deepEqual(hello.readBy, []);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/chat/all/messages`, { text: '  ' })).status, 400);
  assert.equal((await call(s.outsider, 'POST', `/projects/${s.p}/chat/all/messages`, { text: '침입' })).status, 403);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/chat/all/messages`, { text: 'x', senderId: s.leader.memberId })).status, 400); // 남의 이름으로 못 보냄
  const list = (await call(s.leader, 'GET', `/projects/${s.p}/chat/all/messages`)).body;
  assert.deepEqual(list.map((m) => m.text), ['안녕하세요']);
});

test('1:1 채널: 당사자만 쓰고 읽는다', async () => {
  const dm = `dm:${[s.leader.memberId, s.member.memberId].sort().join(':')}`;
  assert.equal((await call(s.leader, 'POST', `/projects/${s.p}/chat/${channel(dm)}/messages`, { text: '비밀 얘기' })).status, 201);
  assert.equal((await call(s.member, 'GET', `/projects/${s.p}/chat/${channel(dm)}/messages`)).body.length, 1);
  const [third] = await signupUsers(api, 1, 'third');
  await call(third, 'POST', `/projects/${s.p}/join`, { school: 's', major: 'm', student: '3' });
  assert.deepEqual((await call(third, 'GET', `/projects/${s.p}/chat/${channel(dm)}/messages`)).body, []);
  assert.equal((await call(third, 'POST', `/projects/${s.p}/chat/${channel(dm)}/messages`, { text: '끼어들기' })).status, 403);
});

test('읽음·반응: 읽은 사람·반응한 사람은 로그인한 사용자, 두 번 해도 하나', async () => {
  assert.equal((await call(s.leader, 'POST', `/projects/${s.p}/chat/read`, { messageIds: [hello.id] })).status, 204);
  await call(s.leader, 'POST', `/projects/${s.p}/chat/read`, { messageIds: [hello.id] });
  assert.equal((await call(s.leader, 'PUT', `/projects/${s.p}/chat/messages/${hello.id}/reaction`, { emoji: '❤️', active: true })).status, 204);
  await call(s.leader, 'PUT', `/projects/${s.p}/chat/messages/${hello.id}/reaction`, { emoji: '❤️', active: true });
  let [m] = (await call(s.member, 'GET', `/projects/${s.p}/chat/all/messages`)).body;
  assert.deepEqual(m.readBy, [s.leader.memberId]);
  assert.deepEqual(m.reactions, [{ messageId: hello.id, memberId: s.leader.memberId, emoji: '❤️' }]);
  await call(s.leader, 'PUT', `/projects/${s.p}/chat/messages/${hello.id}/reaction`, { emoji: '❤️', active: false });
  [m] = (await call(s.member, 'GET', `/projects/${s.p}/chat/all/messages`)).body;
  assert.deepEqual(m.reactions, []);
});

test('채팅 도구(제비뽑기): 만들기와 뽑기 결과는 DB 함수가 정하고, 이벤트 목록으로 보인다', async () => {
  const text = '[TALJU_CHAT_TOOL]:{"type":"draw","server":true,"data":{"title":"발표 순서"}}';
  const created = await call(s.leader, 'POST', `/projects/${s.p}/chat/all/tools`, { text, config: { items: [{ label: '당첨', isWinner: true }, { label: '꽝' }] } });
  assert.equal(created.status, 201);
  assert.equal(created.body.message.senderId, s.leader.memberId);
  assert.equal(created.body.event.kind, 'draw');
  assert.equal(created.body.event.event, 'init');
  assert.equal(created.body.event.data.total, 2);
  const bad = await call(s.leader, 'POST', `/projects/${s.p}/chat/all/tools`, { text, config: { items: [{ label: '하나' }] } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /2~50개/);
  const pick = await call(s.member, 'POST', `/chat/messages/${created.body.message.id}/tool-actions`, { action: 'draw_pick', args: { itemId: 1 } });
  assert.equal(pick.status, 201);
  assert.equal(pick.body.event, 'draw_pick');
  assert.equal(pick.body.actorMemberId, s.member.memberId);
  const events = (await call(s.member, 'GET', `/projects/${s.p}/chat-tool-events`)).body;
  assert.deepEqual(events.map((e) => e.event), ['init', 'draw_pick']);
  assert.deepEqual((await call(s.outsider, 'GET', `/projects/${s.p}/chat-tool-events`)).body, []);
});

test('접속 기록: 본인 팀원 행만 기록되고, 남의 것은 조용히 무시된다', async () => {
  assert.equal((await call(s.member, 'POST', `/members/${s.member.memberId}/presence`)).status, 204);
  const mine = (await pg.query('select last_seen_at from members where id = $1', [s.member.memberId])).rows[0];
  assert.ok(mine.last_seen_at);
  const leaderSeen = async () => (await pg.query('select last_seen_at::text as t from members where id = $1', [s.leader.memberId])).rows[0].t;
  const before = await leaderSeen();
  assert.equal((await call(s.member, 'POST', `/members/${s.leader.memberId}/presence`)).status, 204);
  assert.equal(await leaderSeen(), before); // 남의 행은 바뀌지 않음
});
