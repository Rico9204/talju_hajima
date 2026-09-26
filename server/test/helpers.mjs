// 서버 테스트 공통 준비: 일반 PostgreSQL(PGlite)에 server/db/bootstrap.sql → supabase/schema.sql 순서로 올리고
// (운영에서 새 DB를 만드는 순서와 같음), 실제 Nest 앱을 띄워 HTTP로 호출한다. 바꿔 끼우는 것은 DB 연결뿐.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../dist/app.js';
import { AS_USER_SQL, claimsFor } from '../dist/db.js';

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
  return { pg, db: { asUser: (userId, fn) => run(fn, userId), asSystem: (fn) => run(fn, null) } };
}

export async function startApp(db, extra = {}) {
  const app = await createApp({ db, jwtSecret: JWT_SECRET, corsOrigins: ['http://localhost:5173'], ...extra });
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  async function api(token, method, path, body, headers = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }
  return { app, api };
}
