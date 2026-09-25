// node tests/member-last-seen.test.mjs <directory containing @electric-sql/pglite>
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2] || '.', 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select case when auth.uid() is null then 'anon' else 'authenticated' end$$;
grant usage on schema auth,storage to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create function storage.extension(text) returns text language sql as $$select substring($1 from '\\.([^.\\/]+)$')$$;
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;
create publication supabase_realtime;
create schema realtime;
create table realtime.messages(id bigint generated always as identity primary key,extension text,topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select ''$$;
grant usage on schema realtime to authenticated;
`);
await db.exec('set check_function_bodies = off');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  .replace('create extension if not exists pgcrypto;', '')
  .replace(/^alter publication .*;\r?$/gm, '');
await db.exec(schema);
// 이미 배포된 DB 흉내: 컬럼이 없던 상태에서 팀원이 있고, 그 위에 마이그레이션을 실행한다.
const ids = [0, 1, 2].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0 관리자, 1·2 팀원
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=$1', [ids[0]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
async function system() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }

await login(1);
await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values('p','프로젝트','학교','기간','active','2026-09-01','2026-10-01',$1,'approved')", [ids[0]]);
const join = async (i) => { await login(i); return (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',$2) returning id", [`사용자${i}`, i === 1])).rows[0].id; };
await system();
await db.exec('alter table members drop column last_seen_at'); // schema.sql에 이미 있으므로 "마이그레이션 전" 상태로 되돌림
const m1 = await join(1);
const m2 = await join(2);
await system();
await db.exec(readFileSync(new URL('../supabase/migrations/2609251800_member_last_seen.sql', import.meta.url), 'utf8'));
const seen = async (id) => { await system(); return (await db.query('select last_seen_at from members where id=$1', [id])).rows[0].last_seen_at; };

await check('마이그레이션 전부터 있던 팀원은 접속 기록 없음(null) — 실행 시각으로 채우지 않는다', async () => {
  assert.equal(await seen(m1), null);
  assert.equal(await seen(m2), null);
});
await check('마이그레이션 뒤 합류한 팀원은 합류 시각이 기본값', async () => {
  await login(0);
  const m0 = (await db.query("insert into members(project_id,name,role,major,student,avatar,color) values('p','관리자','팀원','','','팀','#123456') returning id")).rows[0].id;
  assert.notEqual(await seen(m0), null);
});
await check('touch_member_presence는 본인 행만 갱신하고, 다른 사람 id는 무시', async () => {
  await login(1); await db.query('select touch_member_presence($1)', [m1]);
  assert.notEqual(await seen(m1), null);
  await login(1); await db.query('select touch_member_presence($1)', [m2]); // 남의 id
  assert.equal(await seen(m2), null);
});
await check('로그인하지 않은 호출과 anon 실행은 막힌다', async () => {
  await system(); await db.exec('set role anon');
  await assert.rejects(db.query('select touch_member_presence($1)', [m2]), /permission denied/);
  await db.exec('reset role');
  assert.equal(await seen(m2), null);
});
await check('마이그레이션은 다시 실행해도 안전하고 기존 값을 지우지 않는다', async () => {
  await system();
  await db.exec(readFileSync(new URL('../supabase/migrations/2609251800_member_last_seen.sql', import.meta.url), 'utf8'));
  assert.notEqual(await seen(m1), null);
});
console.log(count + ' member-last-seen checks passed');
