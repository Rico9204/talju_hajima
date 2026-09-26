// 새 PostgreSQL에 server/db/bootstrap.sql → supabase/schema.sql 을 올린다.
// 이미 앱 표(public.projects)가 있으면 아무것도 하지 않고 멈춘다 — 기존 DB에는 supabase/migrations/ 를 순서대로 적용.
// 사용: pnpm --dir server db:setup   (server/.env 의 DATABASE_URL 사용)
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다(server/.env).');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const [{ exists }] = (await client.query("select to_regclass('public.projects') is not null as exists")).rows;
  if (exists) {
    console.error('이미 앱 표가 있는 DB입니다. 새 DB에서만 실행하세요(기존 DB에는 supabase/migrations/ 를 순서대로 적용).');
    process.exitCode = 1;
  } else {
    await client.query(readFileSync(new URL('../db/bootstrap.sql', import.meta.url), 'utf8'));
    await client.query(readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'));
    console.log('DB 준비 완료: bootstrap.sql + supabase/schema.sql');
  }
} finally {
  await client.end();
}
