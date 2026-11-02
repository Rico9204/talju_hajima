// DB가 늦게 뜨거나 끊겼을 때: 서버가 죽지 않고 기다리며, 재연결이 한 번 실패해도 알림 연결을 계속 다시 시도한다.
// 실제 DB 대신 PostgreSQL 통신 규약의 필요한 부분만 답하는 가짜 서버를 쓴다(PGlite로는 연결을 끊을 수 없다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { PgDb } from '../dist/db.js';

const msg = (type, body = Buffer.alloc(0)) => {
  const head = Buffer.alloc(5);
  head.write(type);
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
};
const ready = msg('Z', Buffer.from('I'));
const auth = msg('R', Buffer.alloc(4));
const done = msg('C', Buffer.from('OK\0'));
const notice = (channel, payload) => msg('A', Buffer.concat([Buffer.alloc(4), Buffer.from(`${channel}\0${payload}\0`)]));

function fakePostgres() {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.once('data', () => {
      socket.write(Buffer.concat([auth, ready]));
      socket.on('data', (data) => { if (data[0] === 0x51) socket.write(Buffer.concat([done, ready])); });
    });
  });
  return {
    sockets,
    start: (port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address().port))),
    stop: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(resolve); }),
    dropAll: () => { for (const s of sockets) s.destroy(); },
    send: (data) => { for (const s of sockets) s.write(data); },
  };
}
const until = async (check) => { for (let i = 0; i < 300 && !check(); i++) await new Promise((r) => setTimeout(r, 10)); assert.ok(check(), '시간 안에 조건이 맞지 않음'); };
const url = (port) => `postgres://u:p@127.0.0.1:${port}/db?sslmode=disable`;

test('시작 대기: DB가 늦게 떠도 기다리고, 끝내 안 뜨면 오류를 낸다', async () => {
  const probe = fakePostgres();
  const port = await probe.start();
  await probe.stop();

  const down = new PgDb(url(port), 1);
  await assert.rejects(down.waitUntilReady(2));
  await down.close();

  const late = new PgDb(url(port), 20);
  const waiting = late.waitUntilReady(100);
  await new Promise((r) => setTimeout(r, 60));
  const fake = fakePostgres();
  await fake.start(port);
  await waiting;
  await late.close();
  await fake.stop();
});

test('쉬는 연결이 끊겨도 프로세스가 죽지 않고 다음 요청은 새 연결로 처리한다', async () => {
  const fake = fakePostgres();
  const db = new PgDb(url(await fake.start()), 5);
  await db.waitUntilReady(1);
  fake.dropAll(); // 받는 곳이 없으면 여기서 처리되지 않은 오류로 테스트가 실패한다
  await new Promise((r) => setTimeout(r, 30));
  await db.waitUntilReady(1);
  await db.close();
  await fake.stop();
});

test('알림 연결: DB가 한동안 꺼져 재연결이 여러 번 실패해도 다시 붙어 알림을 받고, 멈추면 더 시도하지 않는다', async () => {
  const fake = fakePostgres();
  const port = await fake.start();
  const db = new PgDb(url(port), 10);
  const got = [];
  const stop = await db.listen('talju_test', (payload) => got.push(payload));

  await fake.stop(); // 연결이 끊긴 채 여러 번의 재시도가 실패할 시간
  await new Promise((r) => setTimeout(r, 80));

  const back = fakePostgres();
  await back.start(port);
  await until(() => back.sockets.size === 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(back.sockets.size, 1); // 재시도가 겹쳐 연결이 여러 개 생기지 않는다
  back.send(notice('talju_test', 'hello'));
  await until(() => got.length === 1);
  assert.deepEqual(got, ['hello']);

  await stop();
  await until(() => back.sockets.size === 0);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(back.sockets.size, 0);
  await db.close();
  await back.stop();
});
