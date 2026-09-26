// 파일 저장소: 프로필 이미지(형식·서명 검사), 게시판 첨부(안전한 제공), 워크스페이스 업로드·내려받기·정리,
// 관리자 증명서(서명 주소·정리), 경로 탈출·비공개 버킷 차단.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_BASE_URL, createTestDb, setupProject, signupUsers, startApp } from './helpers.mjs';

let pg, app, api, upload, origin, s;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const PDF = Buffer.from('%PDF-1.4\n% test document\n');
const localUrl = (url) => url.replace(PUBLIC_BASE_URL, origin); // 공개 주소 → 테스트 서버 주소

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api, upload, origin } = await startApp(db));
  s = await setupProject(api, pg);
  await pg.query("insert into app_text_settings(key, value) values ('storage_host', 'files.test')");
});
after(async () => { await app?.close(); await pg?.close(); });

test('프로필 이미지: 공개 주소로 올라가고, 형식·파일 서명이 틀리면 거부', async () => {
  const res = await upload(s.member.token, '/me/images/avatar', { name: 'me.png', type: 'image/png', bytes: PNG });
  assert.equal(res.status, 201);
  assert.ok(res.body.url.startsWith(`${PUBLIC_BASE_URL}/storage/v1/object/public/avatars/${s.member.id}/`));
  const served = await fetch(localUrl(res.body.url));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
  const fake = await upload(s.member.token, '/me/images/avatar', { name: 'x.png', type: 'image/png', bytes: Buffer.from('not an image') });
  assert.equal(fake.status, 400);
  assert.equal((await upload(s.member.token, '/me/images/banner', { name: 'x.pdf', type: 'application/pdf', bytes: PDF })).status, 400);
  assert.equal((await upload(s.member.token, '/me/images/icon', { name: 'me.png', type: 'image/png', bytes: PNG })).status, 400);
  assert.equal((await upload(null, '/me/images/avatar', { name: 'me.png', type: 'image/png', bytes: PNG })).status, 401);
});

test('게시판 첨부: HTML도 올릴 수 있지만 내려받기로만 제공되고, 게시글에 붙일 수 있다', async () => {
  const res = await upload(s.member.token, '/board/attachments', { name: '보고서.html', type: 'text/html', bytes: Buffer.from('<script>alert(1)</script>') });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, '보고서.html'); // 한글 이름 유지
  assert.equal(res.body.kind, 'file');
  assert.match(res.body.url, /\/board-attachments\/[0-9a-f-]+\/[0-9a-f-]+\.html$/);
  const served = await fetch(localUrl(res.body.url));
  assert.equal(served.headers.get('content-type'), 'application/octet-stream');
  assert.match(served.headers.get('content-disposition'), /^attachment/);
  assert.match(served.headers.get('content-security-policy'), /sandbox/);
  const post = await call(s.member, 'POST', '/board/posts', { category: 'free', title: '첨부', content: 'x', attachments: [res.body] });
  assert.equal(post.status, 201); // DB의 첨부 주소 검사(storage_host) 통과
  const foreign = await call(s.member, 'POST', '/board/posts', { category: 'free', title: '외부', content: 'x', attachments: [{ ...res.body, url: 'https://evil.example/x.html' }] });
  assert.equal(foreign.status, 400);
});

let fileId, versionId;
test('워크스페이스: 원본 업로드 + 버전 등록, 팀원만 내려받기, 이미지는 태그 필수', async () => {
  const res = await upload(s.member.token, `/projects/${s.p}/files`, { name: '중간 보고서.pdf', type: 'application/pdf', bytes: PDF }, { folderId: '', note: '초안', searchText: '보고서 본문', searchStatus: 'ready' });
  assert.equal(res.status, 201);
  ({ fileId, versionId } = res.body);
  const [file] = (await call(s.leader, 'GET', `/projects/${s.p}/files`)).body;
  assert.equal(file.name, '중간 보고서.pdf');
  assert.equal(file.type, 'pdf');
  assert.equal(file.versions[0].searchText, '보고서 본문');
  const download = await fetch(`${origin}/api/workspace/versions/${versionId}/download`, { headers: { authorization: `Bearer ${s.leader.token}` } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment; filename\*=UTF-8''%EC%A4%91%EA%B0%84/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), PDF);
  const outsider = await fetch(`${origin}/api/workspace/versions/${versionId}/download`, { headers: { authorization: `Bearer ${s.outsider.token}` } });
  assert.equal(outsider.status, 400); // 버전 자체가 안 보임
  const image = await upload(s.member.token, `/projects/${s.p}/files`, { name: '사진.png', type: 'image/png', bytes: PNG }, { folderId: '' });
  assert.equal(image.status, 400);
  assert.match(image.body.message, /태그/);
  const second = await upload(s.member.token, `/projects/${s.p}/files`, { name: '중간 보고서.pdf', type: 'application/pdf', bytes: PDF }, { fileId: String(fileId), baseVersionId: String(versionId), folderId: '' });
  assert.equal(second.status, 201);
  assert.equal(second.body.fileId, fileId);
  // 외부인은 원본 목록(storage.objects) 권한 규칙에서 먼저 막힌다.
  assert.equal((await upload(s.outsider.token, `/projects/${s.p}/files`, { name: 'a.pdf', type: 'application/pdf', bytes: PDF }, { folderId: '' })).status, 403);
  assert.equal((await pg.query("select count(*)::int n from storage.objects where bucket_id = 'workspace-files'")).rows[0].n, 2); // 거부된 업로드는 남지 않음
});

test('워크스페이스 정리: 지운 파일의 원본이 목록·디스크에서 사라진다', async () => {
  assert.equal((await call(s.member, 'DELETE', `/workspace/files/${fileId}`)).status, 204); // 올린 사람
  assert.ok((await call(s.member, 'GET', `/projects/${s.p}/workspace-cleanup`)).body.length >= 1);
  assert.equal((await call(s.member, 'POST', `/projects/${s.p}/workspace-cleanup`)).status, 204);
  assert.deepEqual((await call(s.member, 'GET', `/projects/${s.p}/workspace-cleanup`)).body, []);
  assert.equal((await pg.query("select count(*)::int n from storage.objects where bucket_id = 'workspace-files'")).rows[0].n, 0);
});

test('관리자 증명서: PDF만, 운영자만 60초 서명 주소로 열람, 위조 주소 거부, 처리 후 원본 삭제', async () => {
  const [applicant, operator] = await signupUsers(api, 2, 'storage');
  await pg.query('update profiles set is_operator = true where id = $1', [operator.id]);
  const fields = { org: '한국대학교', jobTitle: '교수', contact: '010-1234-5678', docType: 'employment', consent: 'true' };
  assert.equal((await upload(applicant.token, '/me/admin-application', { name: 'doc.pdf', type: 'application/pdf', bytes: Buffer.from('not pdf') }, fields)).status, 400);
  assert.equal((await upload(applicant.token, '/me/admin-application', { name: '재직증명서.pdf', type: 'application/pdf', bytes: PDF }, fields)).status, 201);
  const [record] = (await call(operator, 'GET', '/admin/applications')).body;
  assert.equal(record.docName, '재직증명서.pdf');
  assert.equal((await call(applicant, 'GET', `/admin/applications/document-url?path=${encodeURIComponent(record.docPath)}`)).status, 200); // 본인 서류
  assert.equal((await call(s.member, 'GET', `/admin/applications/document-url?path=${encodeURIComponent(record.docPath)}`)).status, 403); // 남의 서류
  const { url } = (await call(operator, 'GET', `/admin/applications/document-url?path=${encodeURIComponent(record.docPath)}`)).body;
  assert.ok(url.startsWith(`${PUBLIC_BASE_URL}/storage/v1/object/sign/admin-verification/`));
  const opened = await fetch(localUrl(url));
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get('content-type'), 'application/pdf');
  const tampered = new URL(localUrl(url));
  // 서명 가운데 글자를 바꾼다(마지막 글자는 base64 여분 비트라 바꿔도 같은 값일 수 있음).
  const token = tampered.searchParams.get('token');
  const i = token.indexOf('.') + 10;
  tampered.searchParams.set('token', token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1));
  assert.equal((await fetch(tampered)).status, 403);
  assert.equal((await fetch(`${origin}/storage/v1/object/public/admin-verification/${record.docPath}`)).status, 404); // 비공개 버킷
  assert.equal((await call(operator, 'POST', `/admin/applications/${record.id}/review`, { approve: true, note: '' })).status, 204);
  assert.equal((await call(operator, 'POST', `/admin/applications/${record.id}/document-cleanup`, { path: record.docPath })).status, 204);
  assert.equal((await fetch(localUrl(url))).status, 404);
  assert.equal((await call(operator, 'GET', '/admin/applications')).body[0].docDeleted, true);
});

test('경로 탈출·이상한 경로는 막힌다', async () => {
  for (const path of ['avatars/..%2F..%2Fpackage.json', 'avatars/%2e%2e/%2e%2e/x', '..%2Fserver/x', 'avatars/a%5Cb.png']) {
    assert.equal((await fetch(`${origin}/storage/v1/object/public/${path}`)).status, 404, path);
  }
  assert.equal((await call(s.leader, 'GET', '/admin/applications/document-url?path=..%2F..%2Fx')).status, 400);
});
