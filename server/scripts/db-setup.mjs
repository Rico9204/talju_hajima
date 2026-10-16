// 새 PostgreSQL에 server/db/bootstrap.sql → supabase/schema.sql → server/db/realtime.sql 을 올린다.
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
  const resumeEmpty = process.argv.includes('--resume-empty');
  if (exists && resumeEmpty) {
    const { rows: [{ complete }] } = await client.query("select to_regclass('public.app_text_settings') is not null as complete");
    if (complete) throw new Error('이미 초기화된 DB에는 --resume-empty를 사용할 수 없습니다. 마이그레이션을 적용하세요.');
    const { rows: tables } = await client.query("select schemaname, tablename from pg_tables where schemaname = 'public' or (schemaname = 'auth' and tablename = 'users')");
    for (const table of tables) {
      const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
      const { rows: [{ populated }] } = await client.query(`select exists(select 1 from ${identifier(table.schemaname)}.${identifier(table.tablename)} limit 1) as populated`);
      if (populated) throw new Error('기존 데이터가 있는 DB는 복구 모드로 초기화할 수 없습니다. 데이터는 변경하지 않았습니다.');
    }
  }
  if (exists && !resumeEmpty) {
    console.error('이미 앱 표가 있는 DB입니다. 새 DB에서만 실행하세요(기존 DB에는 supabase/migrations/ 를 순서대로 적용).');
    process.exitCode = 1;
  } else {
    // schema.sql contains forward references (e.g. app_settings). Match the
    // PostgreSQL dump/test loading mode for this connection only. The baseline
    // has its own BEGIN/COMMIT blocks, so SET LOCAL would reset too early.
    await client.query('set check_function_bodies = off');
    await client.query(readFileSync(new URL('../db/bootstrap.sql', import.meta.url), 'utf8'));
    let schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
    if (resumeEmpty) {
      const { rows: published } = await client.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'");
      const existing = new Set(published.map((row) => row.tablename));
      schema = schema.replace(/^alter publication supabase_realtime add table (\w+);\r?$/gm,
        (statement, table) => existing.has(table) ? '' : statement);
    }
    await client.query(schema);
    await client.query(readFileSync(new URL('../db/realtime.sql', import.meta.url), 'utf8'));
    console.log('DB 준비 완료: bootstrap.sql + supabase/schema.sql + realtime.sql');
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message || error.code || 'DB 초기화 실패');
  process.exitCode = 1;
} finally {
  await client.end();
}
