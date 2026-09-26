// 실시간(WebSocket /realtime): 인증·출처 거부, 채널 권한, DB 변경 전달(권한 규칙대로 — 남의 1:1은 안 옴),
// 접속 상태(위장 불가), 동시 편집 방송, 팀에서 빠지면 구독 해제.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WsClient from 'ws';
import { RealtimeHub } from '../dist/realtime.js';
import { createTestDb, setupProject, signupUsers, startApp } from './helpers.mjs';

let pg, app, api, origin, s, third;
const clients = [];
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 받은 메시지를 모아 두고, 조건에 맞는 것을 기다리는 테스트용 클라이언트(Node 내장 WebSocket).
async function connect(user) {
  const ws = new WebSocket(`${origin.replace('http', 'ws')}/realtime`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const i = waiters.findIndex((w) => w.match(message));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(message);
    else inbox.push(message);
  });
  const closed = new Promise((resolve) => ws.addEventListener('close', (event) => resolve(event.code)));
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const next = (match, ms = 3000) => {
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const k = waiters.indexOf(waiter);
        if (k >= 0) { waiters.splice(k, 1); reject(new Error('기다린 메시지가 오지 않았습니다')); }
      }, ms);
    });
  };
  const send = (message) => ws.send(JSON.stringify(message));
  const client = { ws, inbox, next, send, closed };
  clients.push(client);
  if (user) {
    send({ type: 'auth', token: user.token });
    await next((m) => m.type === 'ready');
  }
  return client;
}
const join = async (client, topic) => {
  client.send({ type: 'join', topic, ref: topic });
  return client.next((m) => m.ref === topic && (m.type === 'joined' || m.type === 'error'));
};
const nothing = async (client, match, ms = 400) => { await sleep(ms); assert.ok(!client.inbox.some(match), '오면 안 되는 메시지가 왔습니다'); };

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api, origin } = await startApp(db));
  s = await setupProject(api, pg);
  [third] = await signupUsers(api, 1, 'third');
  await call(third, 'POST', `/projects/${s.p}/join`, { school: 's', major: 'm', student: '3' });
  third.memberId = (await call(s.leader, 'GET', `/projects/${s.p}/team`)).body.members.find((m) => m.userId === third.id).id;
});
after(async () => { for (const c of clients) c.ws.close(); await app?.close(); await pg?.close(); });

test('인증: 잘못된 토큰은 4001로 끊고, 인증 전 요청은 거부, 허용하지 않은 사이트에서는 연결 자체를 거부', async () => {
  const bad = await connect(null);
  bad.send({ type: 'join', topic: `chat_messages:${s.projectId}` });
  assert.match((await bad.next((m) => m.type === 'error')).message, /로그인 토큰/);
  bad.send({ type: 'auth', token: 'forged' });
  assert.equal(await bad.closed, 4001);
  const evil = new WsClient(`${origin.replace('http', 'ws')}/realtime`, { headers: { origin: 'https://evil.example' } });
  const status = await new Promise((resolve) => { evil.on('unexpected-response', (_req, res) => resolve(res.statusCode)); evil.on('open', () => resolve('open')); });
  assert.equal(status, 403);
});

test('채널 권한: 팀원만 프로젝트 채널에 들어온다', async () => {
  const outsider = await connect(s.outsider);
  assert.equal((await join(outsider, `chat_messages:${s.projectId}`)).type, 'error');
  assert.equal((await join(outsider, `collab_doc:${s.projectId}:1:1:main`)).type, 'error');
  const member = await connect(s.member);
  assert.equal((await join(member, `chat_messages:${s.projectId}`)).type, 'joined');
  assert.equal((await join(member, 'chat_messages:다른-프로젝트')).type, 'error');
});

test('채팅: 새 메시지·반응·읽음이 오고, 볼 수 없는 1:1 메시지는 오지 않는다', async () => {
  const member = await connect(s.member);
  const outsiderOfDm = await connect(third);
  await join(member, `chat_messages:${s.projectId}`);
  await join(member, `message_reads:${s.projectId}`);
  await join(outsiderOfDm, `chat_messages:${s.projectId}`);

  const sent = (await call(s.leader, 'POST', `/projects/${s.p}/chat/all/messages`, { text: '회의 10분 전' })).body;
  const got = await member.next((m) => m.type === 'change' && m.event === 'message');
  assert.equal(got.data.id, sent.id);
  assert.equal(got.data.text, '회의 10분 전');
  assert.equal(got.data.senderId, s.leader.memberId);

  const dm = `dm:${[s.leader.memberId, s.member.memberId].sort().join(':')}`;
  const secret = (await call(s.leader, 'POST', `/projects/${s.p}/chat/${encodeURIComponent(dm)}/messages`, { text: '비밀' })).body;
  assert.equal((await member.next((m) => m.type === 'change' && m.data?.id === secret.id)).data.text, '비밀');
  await nothing(outsiderOfDm, (m) => m.type === 'change' && m.data?.id === secret.id);

  await call(s.leader, 'PUT', `/projects/${s.p}/chat/messages/${sent.id}/reaction`, { emoji: '👍', active: true });
  const reaction = await member.next((m) => m.event === 'reaction');
  assert.deepEqual(reaction.data, { active: true, reaction: { messageId: sent.id, memberId: s.leader.memberId, emoji: '👍' } });
  await call(s.leader, 'POST', `/projects/${s.p}/chat/read`, { messageIds: [sent.id] });
  const read = await member.next((m) => m.event === 'read');
  assert.deepEqual(read.data, { messageId: sent.id, memberId: s.leader.memberId });
});

test('과제·일정 변경 알림: 목록을 다시 받도록 "바뀜"이 온다', async () => {
  const member = await connect(s.member);
  await join(member, `tasks:${s.projectId}`);
  await call(s.leader, 'POST', `/projects/${s.p}/tasks`, { title: '실시간 과제', assigneeIds: [s.member.memberId], status: 'todo' });
  const change = await member.next((m) => m.type === 'change' && m.topic === `tasks:${s.projectId}`);
  assert.equal(change.event, 'changed');
  assert.equal(change.data.op, 'INSERT');
});

test('접속 상태: 키와 팀원 id는 서버가 정해 위장할 수 없다', async () => {
  const leader = await connect(s.leader);
  const member = await connect(s.member);
  await join(leader, `presence:${s.projectId}`);
  await join(member, `presence:${s.projectId}`);
  member.send({ type: 'track', topic: `presence:${s.projectId}`, key: s.leader.memberId, meta: { status: 'active', memberId: s.leader.memberId } });
  const state = await leader.next((m) => m.type === 'presence' && Object.keys(m.state).length > 0);
  assert.deepEqual(Object.keys(state.state), [s.member.memberId]);
  assert.equal(state.state[s.member.memberId][0].memberId, s.member.memberId);
  assert.equal(state.state[s.member.memberId][0].status, 'active');
  member.ws.close();
  const after = await leader.next((m) => m.type === 'presence' && Object.keys(m.state).length === 0);
  assert.deepEqual(after.state, {}); // 연결이 끊기면 사라진다
});

test('동시 편집 방송: 같은 방의 다른 사람에게만 전달', async () => {
  const topic = `collab_doc:${s.projectId}:7:3:main`;
  const a = await connect(s.leader);
  const b = await connect(s.member);
  await join(a, topic);
  await join(b, topic);
  a.send({ type: 'broadcast', topic, event: 'update', payload: { u: 'AAEC' } });
  const got = await b.next((m) => m.type === 'broadcast');
  assert.deepEqual({ event: got.event, payload: got.payload }, { event: 'update', payload: { u: 'AAEC' } });
  await nothing(a, (m) => m.type === 'broadcast');
  a.send({ type: 'broadcast', topic: `chat_messages:${s.projectId}`, event: 'update', payload: {} });
  assert.match((await a.next((m) => m.type === 'error')).message, /참여/);
});

test('팀에서 제외되면 주기 검사에서 구독이 해제된다', async () => {
  const kicked = await connect(third);
  await join(kicked, `chat_messages:${s.projectId}`);
  assert.equal((await call(s.leader, 'DELETE', `/members/${third.memberId}`)).status, 204);
  await app.get(RealtimeHub).revalidateAll();
  const left = await kicked.next((m) => m.type === 'left');
  assert.equal(left.topic, `chat_messages:${s.projectId}`);
  await call(s.leader, 'POST', `/projects/${s.p}/chat/all/messages`, { text: '제외 후 메시지' });
  await nothing(kicked, (m) => m.type === 'change');
});
