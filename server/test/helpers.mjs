// 서버 테스트 공통 준비: 일반 PostgreSQL(PGlite)에 server/db/bootstrap.sql → supabase/schema.sql 순서로 올리고
// (운영에서 새 DB를 만드는 순서와 같음), 실제 Nest 앱을 띄워 HTTP로 호출한다. 바꿔 끼우는 것은 DB 연결뿐.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../dist/app.js';
import { AS_USER_SQL, claimsFor } from '../dist/db.js';
import { DiskFileStore } from '../dist/storage.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars';

export async function createTestDb() {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL('../db/bootstrap.sql', import.meta.url), 'utf8'));
  await pg.exec('set check_function_bodies = off');
  // PGlite에는 pgcrypto 확장과 publication 표 추가가 없어 그 두 줄만 뺀다(운영 PostgreSQL에서는 그대로 실행).
  await pg.exec(readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')
    .replace('create extension if not exists pgcrypto;', '')
    .replace(/^alter publication .*;\r?$/gm, ''));
  const run = (fn, userId) => pg.transaction(async (tx) => {
    if (userId) {
      await tx.query(AS_USER_SQL[0]);
      await tx.query(AS_USER_SQL[1], [userId, claimsFor(userId)]);
    }
    return fn(async (sql, params) => (await tx.query(sql, params)).rows);
  });
  await pg.exec(readFileSync(new URL('../db/realtime.sql', import.meta.url), 'utf8'));
  const listen = async (channel, onMessage) => pg.listen(channel, onMessage);
  return { pg, db: { asUser: (userId, fn) => run(fn, userId), asSystem: (fn) => run(fn, null), listen } };
}

// 테스트용 메일함: 보낸 메일을 모아 둔다.
export class CaptureMailer {
  sent = [];
  async send(message) { this.sent.push(message); }
  last(email) { return this.sent.filter((m) => m.to === email.toLowerCase()).at(-1); }
}
const mailers = new WeakMap(); // api 함수 → 그 앱의 메일함
export const APP_URL = 'https://app.test';
export const tokenInMail = (message) => new URL(message.text.match(/https:\/\/app\.test\S+/)[0]).searchParams.get('token');

// 실제 흐름대로 가입 → 확인 메일의 링크 토큰으로 인증 → 로그인 토큰. [{ id, email, token }]. 이름은 `${prefix}${i}`.
export async function signupUsers(api, n, prefix = '사용자') {
  const mailer = mailers.get(api);
  const users = [];
  for (let i = 0; i < n; i++) {
    const email = `${prefix}${i}-${Date.now()}@example.com`.replace(/[^\x00-\x7F]/g, 'u').toLowerCase();
    const res = await api(null, 'POST', '/auth/signup', { email, password: 'correct-horse-1', displayName: `${prefix}${i}` });
    if (res.status !== 202) throw new Error(`가입 실패: ${JSON.stringify(res.body)}`);
    const confirmed = await api(null, 'POST', '/auth/confirm', { token: tokenInMail(mailer.last(email)) });
    if (confirmed.status !== 200) throw new Error(`인증 실패: ${JSON.stringify(confirmed.body)}`);
    users.push({ id: confirmed.body.user.id, email, token: confirmed.body.accessToken, refreshToken: confirmed.body.refreshToken });
  }
  return users;
}

// 관리자·팀장·팀원·외부인 + 승인된 진행 중 프로젝트 하나(팀장·팀원 참여). 모두 실제 API로 만든다.
export async function setupProject(api, pg) {
  const [admin, leader, member, outsider] = await signupUsers(api, 4, 'user');
  await pg.query("update profiles set is_admin = true where id = $1", [admin.id]);
  const created = await api(leader.token, 'POST', '/projects', {
    name: '팀 프로젝트', org: '한국대학교', period: '2026-2학기', startDate: '2026-09-01', endDate: '2026-12-20', requestedAdminId: admin.id,
  });
  if (created.status !== 201) throw new Error(`프로젝트 생성 실패: ${JSON.stringify(created.body)}`);
  const projectId = created.body.id;
  const p = encodeURIComponent(projectId);
  await api(admin.token, 'POST', `/projects/${p}/approve`);
  await api(member.token, 'POST', `/projects/${p}/join`, { school: '한국대학교', major: '컴퓨터공학과', student: '1' });
  const team = (await api(leader.token, 'GET', `/projects/${p}/team`)).body.members;
  leader.memberId = team.find((m) => m.userId === leader.id).id;
  member.memberId = team.find((m) => m.userId === member.id).id;
  return { admin, leader, member, outsider, projectId, p };
}

export const PUBLIC_BASE_URL = 'https://files.test';

export async function startApp(db, extra = {}) {
  // 파일은 테스트마다 새 임시 폴더에. 공개 주소는 https://files.test/... (DB의 게시판 첨부 주소 검사가 https를 요구)
  const store = new DiskFileStore(await mkdtemp(join(tmpdir(), 'talju-storage-')));
  const mailer = new CaptureMailer();
  const app = await createApp({ db, jwtSecret: JWT_SECRET, corsOrigins: ['http://localhost:5173'], store, publicBaseUrl: PUBLIC_BASE_URL, mailer, appUrl: APP_URL, ...extra });
  await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const base = `${origin}/api`;
  // multipart 업로드: fields는 문자열 값들, file은 { name, type, bytes }.
  async function upload(token, path, file, fields = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (file) form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: form });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  async function api(token, method, path, body, headers = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }
  mailers.set(api, mailer);
  return { app, api, upload, origin, mailer };
}
