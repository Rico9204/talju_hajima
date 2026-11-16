// C·Java 코드 실행(서버): 켜짐/꺼짐, 인증·검증, 컨테이너 안전 옵션, 컴파일 오류 구분, 시간·출력 제한, 중지, 동시·횟수 제한.
// 실제 Docker 대신 가짜 spawn으로 확인한다(Docker로 실제 실행하는 시험은 수동으로 따로 했다).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createTestDb, setupProject, startApp } from './helpers.mjs';
import { javaClassName, dockerArgs } from '../dist/coderun.js';

let pg, app, api, s, runs, kills, behave;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 가짜 docker: 실행(run)마다 child를 만들어 behave(child, args)가 하고 싶은 대로 출력·종료한다.
function fakeSpawn(command, args) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const received = [];
  child.stdin = new PassThrough();
  child.stdin.on('data', (chunk) => received.push(chunk));
  child.killed = false;
  child.kill = () => { child.killed = true; };
  child.finish = (code) => setImmediate(() => { child.stdout.end(); child.stderr.end(); child.emit('close', code); });
  child.codeSent = () => Buffer.concat(received).toString('utf8');
  if (args[0] === 'kill') { kills.push(args[1]); return child; }
  runs.push({ command, args, child });
  setImmediate(() => behave(child, args));
  return child;
}
const envOf = (args, key) => args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db, { codeRunner: { enabled: true, spawn: fakeSpawn } }));
  s = await setupProject(api, pg);
  runs = []; kills = [];
});
after(async () => { await app?.close(); await pg?.close(); });

const run = (user, language, code) => call(user, 'POST', '/code/run', { language, code });

test('Java 클래스 이름: 공개 클래스, 없으면 main이 있는 클래스, 없으면 Main(주석·문자 속 내용은 무시)', () => {
  assert.equal(javaClassName('public class Hello { }'), 'Hello');
  assert.equal(javaClassName('class A {}\npublic final class B { public static void main(String[] a){} }'), 'B');
  assert.equal(javaClassName('class Foo { public static void main(String[] a){} }'), 'Foo');
  assert.equal(javaClassName('class A {}\nclass Bar { static void main(String[] a){} }'), 'Bar');
  assert.equal(javaClassName('// public class Fake { }\n/* public class Fake2 */ class Real { public static void main(String[] a){} }'), 'Real');
  assert.equal(javaClassName('int x;'), 'Main');
  assert.equal(javaClassName('public class 한글 {}'), 'Main'); // 식별자 규칙에 맞지 않으면 안전한 기본값
});

test('컨테이너 실행 옵션: 네트워크 없음·읽기 전용·권한 제거·자원 제한·이미지 내려받기 금지', () => {
  for (const language of ['c', 'java']) {
    const args = dockerArgs(language, 'img', 'talju-run-x', 'MARKER', 'Main');
    const text = args.join(' ');
    for (const must of ['--rm', '--pull never', '--network none', '--read-only', '--cap-drop ALL', '--security-opt no-new-privileges', '--user 65534:65534', '--memory ', '--memory-swap ', '--pids-limit', '--cpus', '--ulimit fsize=']) {
      assert.ok(text.includes(must), `${language}: ${must}`);
    }
    assert.ok(/--tmpfs \/work:rw,exec,/.test(text) && /--tmpfs \/tmp:rw,noexec,/.test(text));
    assert.ok(!text.includes('--privileged') && !text.includes('-v ') && !text.includes('--volume') && !text.includes('--mount'), '호스트 폴더를 연결하면 안 된다');
  }
});

test('인증이 필요하고, 언어·코드 길이를 검증한다', async () => {
  runs.length = 0;
  assert.equal((await call(null, 'POST', '/code/run', { language: 'c', code: 'int main(){}' })).status, 401);
  assert.equal((await run(s.member, 'ruby', 'puts 1')).status, 400);
  assert.equal((await run(s.member, 'c', 'x'.repeat(100_001))).status, 400);
  assert.equal((await call(s.member, 'POST', '/code/run', { language: 'c', code: 'int main(){}', extra: 1 })).status, 400);
  assert.equal(runs.length, 0, '검증에 실패하면 컨테이너를 만들지 않는다');
});

test('상태 조회: 켜져 있으면 C·Java를 알려 준다', async () => {
  const res = await call(s.member, 'GET', '/code/status');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { enabled: true, languages: ['c', 'java'] });
});

test('정상 실행: 코드는 명령줄이 아니라 표준입력으로만 전달되고, 출력이 돌아온다', async () => {
  runs.length = 0;
  const code = '#include <stdio.h>\nint main(void){ printf("hi"); return 0; }';
  behave = (child) => { child.stdout.write('hi\n'); child.finish(0); };
  const res = await run(s.member, 'c', code);
  assert.equal(res.status, 200);
  assert.deepEqual({ ok: res.body.ok, stdout: res.body.stdout, exitCode: res.body.exitCode, compileError: res.body.compileError, timedOut: res.body.timedOut }, { ok: true, stdout: 'hi\n', exitCode: 0, compileError: false, timedOut: false });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].child.codeSent(), code);
  assert.ok(!runs[0].args.join(' ').includes('printf'), '코드가 명령줄에 들어가면 안 된다');
});

test('Java: 클래스 이름이 검증된 값으로 환경변수로 전달된다', async () => {
  runs.length = 0;
  behave = (child) => child.finish(0);
  await run(s.leader, 'java', 'public class Hello { public static void main(String[] a){} }');
  assert.equal(envOf(runs[0].args, 'CLASS'), 'Hello');
  assert.ok(!runs[0].args.some((a) => a.startsWith('CLASS=') && /[^A-Za-z0-9_=]/.test(a)));
});

test('컴파일 오류: 표시(marker)가 있으면 compileError, 표시는 응답에서 지워진다. 프로그램이 표시를 흉내 내도 속지 않는다', async () => {
  behave = (child, args) => { child.stderr.write(`main.c:1: error: boom\n${envOf(args, 'MARK')}\n`); child.finish(1); };
  const res = await run(s.member, 'c', 'bad');
  assert.equal(res.body.compileError, true);
  assert.equal(res.body.ok, false);
  assert.ok(res.body.stderr.includes('boom') && !/[0-9a-f]{32}/.test(res.body.stderr));
  behave = (child) => { child.stderr.write('0123456789abcdef0123456789abcdef\n'); child.finish(0); }; // 프로그램은 marker를 모른다
  const forged = await run(s.leader, 'c', 'ok');
  assert.equal(forged.body.compileError, false);
  assert.equal(forged.body.ok, true);
});

test('시간·메모리 한도: 종료코드 124·137은 timedOut, 일반 실패는 timedOut이 아니다', async () => {
  for (const [code, limit] of [[124, true], [137, true], [2, false]]) {
    behave = (child) => child.finish(code);
    const res = await run(s.member, 'c', 'x');
    assert.equal(res.body.timedOut, limit, `종료코드 ${code}`);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.exitCode, code);
  }
});

test('과도한 출력은 잘라서 중단하고 컨테이너를 종료한다', async () => {
  kills.length = 0;
  behave = (child) => { child.stdout.write('x'.repeat(150_000)); child.stdout.write('y'.repeat(150_000)); setTimeout(() => child.finish(0), 50); };
  const res = await run(s.member, 'c', 'x');
  assert.equal(res.body.truncated, true);
  assert.equal(res.body.ok, false);
  assert.ok(res.body.stdout.length <= 200_000);
  assert.equal(kills.length, 1);
  assert.match(kills[0], /^talju-run-[0-9a-f]{16}$/);
});

test('실행 환경을 시작하지 못하면(Docker 없음 등) 안내와 함께 실패로 끝난다', async () => {
  behave = (child) => child.emit('error', new Error('spawn docker ENOENT'));
  const res = await run(s.member, 'c', 'x');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, false);
  assert.match(res.body.stderr, /실행 환경을 시작하지 못했어요/);
});

test('요청자가 연결을 끊으면(중지) 컨테이너를 바로 종료한다', async () => {
  kills.length = 0; runs.length = 0;
  behave = () => {}; // 끝나지 않는 실행
  const controller = new AbortController();
  const pending = fetch(`${app.getHttpServer().address() ? `http://127.0.0.1:${app.getHttpServer().address().port}` : ''}/api/code/run`, {
    method: 'POST', signal: controller.signal,
    headers: { authorization: `Bearer ${s.member.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ language: 'c', code: 'for(;;){}' }),
  }).catch(() => null);
  await sleep(200);
  assert.equal(runs.length, 1);
  controller.abort();
  await pending;
  await sleep(200);
  assert.equal(kills.length, 1, '연결이 끊기면 docker kill');
  runs[0].child.finish(137); // 정리
});

test('한 사용자는 동시에 하나만, 분당 20번까지, 서버 전체 동시 3개까지', async () => {
  // 사용자당 동시 1개
  let release;
  behave = (child) => { release = () => child.finish(0); };
  const first = run(s.leader, 'c', 'a');
  await sleep(150);
  const second = await run(s.leader, 'c', 'b');
  assert.equal(second.status, 429);
  assert.match(second.body.message, /이미 실행 중/);
  release(); await first;
  // 서버 전체 동시 3개: 서로 다른 사용자 3명이 실행 중이면 4번째는 거절
  const holders = [];
  behave = (child) => holders.push(() => child.finish(0));
  const users = [s.member, s.leader, s.admin];
  const pending = users.map((u) => run(u, 'c', 'x'));
  await sleep(300);
  const fourth = await run(s.outsider, 'c', 'x');
  assert.equal(fourth.status, 429);
  assert.match(fourth.body.message, /실행 중인 코드가 많아요/);
  holders.forEach((f) => f()); await Promise.all(pending);
  // 분당 20번
  behave = (child) => child.finish(0);
  let blocked = 0;
  for (let i = 0; i < 25; i++) if ((await run(s.outsider, 'c', 'x')).status === 429) blocked++;
  assert.ok(blocked >= 4, `분당 제한(20번)에 걸려야 한다: ${blocked}`);
});

test('중지(취소) 요청: 실행 중인 내 컨테이너만 종료하고, 아무것도 실행 중이 아니면 아무 일도 없다', async () => {
  kills.length = 0; runs.length = 0;
  assert.equal((await call(null, 'POST', '/code/cancel')).status, 401);
  assert.equal((await call(s.member, 'POST', '/code/cancel')).status, 204); // 실행 중인 것이 없다
  assert.equal(kills.length, 0);
  behave = () => {}; // 끝나지 않는 실행
  const pending = run(s.member, 'c', 'for(;;){}');
  await sleep(200);
  assert.equal(runs.length, 1);
  assert.equal((await call(s.leader, 'POST', '/code/cancel')).status, 204); // 다른 사용자의 취소는 남의 실행에 영향이 없다
  assert.equal(kills.length, 0);
  assert.equal((await call(s.member, 'POST', '/code/cancel')).status, 204);
  assert.equal(kills.length, 1);
  assert.match(kills[0], /^talju-run-[0-9a-f]{16}$/);
  runs[0].child.finish(137);
  const result = await pending;
  assert.equal(result.status, 200);
  // 끝난 뒤에는 바로 다시 실행할 수 있다(동시 실행 제한에 걸리지 않는다)
  behave = (child) => child.finish(0);
  assert.equal((await run(s.member, 'c', 'ok')).status, 200);
});
