// 오피스 편집(OnlyOffice 연동): 편집기 설정(권한·서명), 원본 링크, 저장 콜백(문서 서버 서명 확인 → 새 버전), 문서 서버 중계.
// 진짜 문서 서버 대신 작은 HTTP 서버가 문서 서버 역할을 한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { SignJWT, jwtVerify } from 'jose';
import { createTestDb, setupProject, startApp } from './helpers.mjs';

const SECRET = 'onlyoffice-test-secret-at-least-32-chars';
const key = new TextEncoder().encode(SECRET);
const sign = (payload, secret = key) => new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(secret);
const DECK = Buffer.from('PK\x03\x04 원래 발표 자료');
const EDITED = Buffer.from('PK\x03\x04 고친 발표 자료');

let pg, app, api, upload, origin, s, docs, docsUrl, fileId;
const seen = []; // 문서 서버가 받은 요청
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);

before(async () => {
  docs = createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers['x-forwarded-host'], proto: req.headers['x-forwarded-proto'] });
    if (req.url.startsWith('/cache/')) { res.end(EDITED); return; }
    if (req.url.split('?')[0].endsWith('.html')) { // 편집기 화면: nginx처럼 gzip으로 압축하고 ETag를 붙여 준다
      seen.at(-1).ifNoneMatch = req.headers['if-none-match'];
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip', ETag: '"v1"' });
      res.end(gzipSync('<html><head><title>편집기</title></head><body><div id="header-logo"></div></body></html>'));
      return;
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.end('window.DocsAPI = {};');
  });
  await new Promise((resolve) => docs.listen(0, '127.0.0.1', resolve));
  docsUrl = `http://127.0.0.1:${docs.address().port}`;
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api, upload, origin } = await startApp(db, { onlyoffice: { url: docsUrl, jwtSecret: SECRET, callbackBaseUrl: 'https://api.test' } }));
  s = await setupProject(api, pg);
  const res = await upload(s.leader.token, `/projects/${s.p}/files`, { name: '발표.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: DECK }, { folderId: '' });
  fileId = res.body.fileId;
});
after(async () => { await app?.close(); await pg?.close(); docs?.close(); });

const versions = async () => (await call(s.leader, 'GET', `/projects/${s.p}/files`)).body.find((f) => f.id === fileId).versions;
const linkToken = (url) => new URL(url).searchParams.get('token');
const callback = (config, body, headers = {}) => fetch(`${origin}/api/onlyoffice/callback?token=${linkToken(config.editorConfig.callbackUrl)}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
}).then((r) => r.json());

test('편집기 설정: 팀원만, 문서 서버 비밀값으로 서명, 원본·콜백 주소는 문서 서버가 닿는 주소', async () => {
  assert.deepEqual((await call(s.member, 'GET', '/onlyoffice/status')).body, { enabled: true });
  const res = await call(s.member, 'GET', `/workspace/files/${fileId}/onlyoffice`);
  assert.equal(res.status, 200);
  const config = res.body;
  assert.equal(config.documentType, 'slide');
  assert.equal(config.document.fileType, 'pptx');
  assert.equal(config.editorConfig.mode, 'edit');
  assert.deepEqual(config.editorConfig.customization.logo, { visible: false }); // 외부 편집기 로고를 숨긴다
  assert.equal(config.editorConfig.user.id, s.member.id);
  assert.ok(config.document.url.startsWith('https://api.test/api/onlyoffice/raw?token='));
  assert.ok(config.editorConfig.callbackUrl.startsWith('https://api.test/api/onlyoffice/callback?token='));
  const { payload } = await jwtVerify(config.token, key); // 문서 서버가 확인할 서명
  assert.equal(payload.document.key, config.document.key);
  assert.equal((await call(s.outsider, 'GET', `/workspace/files/${fileId}/onlyoffice`)).status, 404); // 볼 수 없는 파일
});

test('원본 링크: 토큰이 맞을 때만 그 버전 원본을 준다', async () => {
  const config = (await call(s.member, 'GET', `/workspace/files/${fileId}/onlyoffice`)).body;
  const raw = await fetch(`${origin}/api/onlyoffice/raw?token=${linkToken(config.document.url)}`);
  assert.equal(raw.status, 200);
  assert.deepEqual(Buffer.from(await raw.arrayBuffer()), DECK);
  assert.equal((await fetch(`${origin}/api/onlyoffice/raw?token=bad`)).status, 403);
  // 콜백 토큰으로는 원본을 못 받는다(용도가 다름)
  assert.equal((await fetch(`${origin}/api/onlyoffice/raw?token=${linkToken(config.editorConfig.callbackUrl)}`)).status, 403);
});

test('저장 콜백: 문서 서버 서명이 있어야 하고, 받은 주소의 경로만 써서 우리 문서 서버에서 받아 새 버전으로', async () => {
  const config = (await call(s.member, 'GET', `/workspace/files/${fileId}/onlyoffice`)).body;
  const before = (await versions()).length;
  const data = { key: config.document.key, status: 6, url: 'http://evil.example/cache/files/saved.pptx?md5=1' };
  assert.deepEqual(await callback(config, data), { error: 1 }); // 서명 없음
  assert.deepEqual(await callback(config, { token: await sign(data, new TextEncoder().encode('x'.repeat(40))) }), { error: 1 }); // 다른 비밀값
  assert.equal((await versions()).length, before);

  assert.deepEqual(await callback(config, { token: await sign(data) }), { error: 0 });
  assert.ok(seen.some((r) => r.url === '/cache/files/saved.pptx?md5=1')); // evil.example이 아니라 우리 문서 서버로
  const after = await versions();
  assert.equal(after.length, before + 1);
  const current = after.find((v) => v.current);
  assert.equal(current.note, '오피스 편집 자동 저장');
  const download = await fetch(`${origin}/api/workspace/versions/${current.id}/download`, { headers: { authorization: `Bearer ${s.leader.token}` } });
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), EDITED);

  // 편집 중 자동 저장 뒤에 연 사람은 같은 세션(같은 문서 키)으로 합류한다
  const joined = (await call(s.leader, 'GET', `/workspace/files/${fileId}/onlyoffice`)).body;
  assert.equal(joined.document.key, config.document.key);
  // 모두 닫고 저장(status 2)하면 세션이 끝나 다음에는 새 키
  assert.deepEqual(await callback(config, { token: await sign({ ...data, status: 2 }) }), { error: 0 });
  assert.equal((await versions()).find((v) => v.current).note, '오피스 편집 저장');
  assert.notEqual((await call(s.leader, 'GET', `/workspace/files/${fileId}/onlyoffice`)).body.document.key, config.document.key);
  // 실제 문서 서버는 중계 경로(/onlyoffice)를 붙인 공개 주소를 준다 → 접두어를 떼고 문서 서버에 요청
  const fresh = (await call(s.member, 'GET', `/workspace/files/${fileId}/onlyoffice`)).body;
  const viaProxy = { key: fresh.document.key, status: 2, url: 'https://api.test/onlyoffice/cache/files/data/k/output.pptx/output.pptx?md5=2' };
  assert.deepEqual(await callback(fresh, { token: await sign(viaProxy) }), { error: 0 });
  assert.ok(seen.some((r) => r.url === '/cache/files/data/k/output.pptx/output.pptx?md5=2'));
  // Authorization 헤더 방식의 서명도 받는다
  assert.deepEqual(await callback(config, { ...data, status: 1 }, { authorization: `Bearer ${await sign({ payload: { ...data, status: 1 } })}` }), { error: 0 });
});

test('종료된 프로젝트는 보기 전용, pptx·docx·xlsx가 아니면 열 수 없다', async () => {
  const text = await upload(s.leader.token, `/projects/${s.p}/files`, { name: '메모.txt', type: 'text/plain', bytes: Buffer.from('hi') }, { folderId: '' });
  assert.equal((await call(s.leader, 'GET', `/workspace/files/${text.body.fileId}/onlyoffice`)).status, 400);
  await pg.query("update projects set status = 'done' where id = $1", [s.projectId]);
  const config = (await call(s.leader, 'GET', `/workspace/files/${fileId}/onlyoffice`)).body;
  assert.equal(config.editorConfig.mode, 'view');
  assert.equal(config.document.permissions.edit, false);
  await pg.query("update projects set status = 'active' where id = $1", [s.projectId]);
});

test('문서 서버 중계: /onlyoffice 아래를 넘기고, 자기 주소를 "<공개 주소>/onlyoffice"로 알게 한다', async () => {
  const res = await fetch(`${origin}/onlyoffice/web-apps/apps/api/documents/api.js`, { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'window.DocsAPI = {};');
  assert.equal(res.headers.get('access-control-allow-origin'), '*'); // 서비스 워커가 다른 출처에서 가져감
  const last = seen.at(-1);
  assert.equal(last.url, '/web-apps/apps/api/documents/api.js');
  assert.equal(last.host, `${new URL(origin).host}/onlyoffice`);
  assert.equal(last.proto, 'https');
  const preflight = await fetch(`${origin}/onlyoffice/web-apps/x.js`, { method: 'OPTIONS', headers: { origin: 'https://app.test', 'access-control-request-method': 'GET', 'access-control-request-headers': 'ngrok-skip-browser-warning' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /ngrok-skip-browser-warning/);
});

test('편집기 화면: 외부 편집기 로고·정보 버튼을 숨기는 스타일을 끼우고, 캐시된 옛 화면은 쓰지 않게 한다', async () => {
  // 실제 문서 서버는 버전이 붙은 주소(/9.4.0-<해시>/web-apps/…)로 화면을 준다
  const res = await fetch(`${origin}/onlyoffice/9.4.0-abc/web-apps/apps/documenteditor/main/index.html?_dc=1`, { headers: { 'if-none-match': '"v1"' } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<style>#header-logo,#left-btn-about,#tlb-box-users,\.btn-current-user,\.slot-btn-user-name\{display:none!important\}<\/style><\/head>/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('etag'), null);
  const last = seen.at(-1);
  assert.equal(last.url, '/9.4.0-abc/web-apps/apps/documenteditor/main/index.html?_dc=1');
  assert.equal(last.host, `${new URL(origin).host}/onlyoffice`);
  assert.equal(last.ifNoneMatch, undefined); // 304로 옛 화면이 쓰이지 않게 조건부 요청 헤더를 뺀다
  // 그 밖의 파일은 그대로 넘긴다
  assert.equal(await (await fetch(`${origin}/onlyoffice/web-apps/apps/api/documents/api.js`)).text(), 'window.DocsAPI = {};');
});

test('설정이 없으면 꺼져 있다', async () => {
  const { db } = await createTestDb();
  const off = await startApp(db);
  try {
    const [user] = await (await import('./helpers.mjs')).signupUsers(off.api, 1, 'off');
    assert.deepEqual((await off.api(user.token, 'GET', '/onlyoffice/status')).body, { enabled: false });
    assert.equal((await off.api(user.token, 'GET', '/workspace/files/1/onlyoffice')).status, 404);
    assert.equal((await fetch(`${off.origin}/onlyoffice/web-apps/x.js`)).status, 404);
  } finally {
    await off.app.close();
  }
});
