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

// Migration file should run idempotently on top of schema
const migration = readFileSync(new URL('../supabase/migrations/2609262310_campus_notices.sql', import.meta.url), 'utf8');
await db.exec(migration);

const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';
for (const id of [userA, userB]) {
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"학생\"}')", [id, `${id}@example.test`]);
}

let count = 0;
async function check(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.log('FAIL ' + name);
    throw err;
  }
  console.log('PASS ' + name);
  count++;
}

await check('campus_notices_cache 테이블에 크롤링 결과 삽입 및 조회 가능', async () => {
  await db.query(`
    insert into campus_notices_cache (school_code, school_name, category, title, author, post_date, link)
    values ('seoultech', '서울과학기술대학교', 'contest', '2026 공모전', '사업단', '2026-09-20', 'https://seoultech.ac.kr/1')
    on conflict (school_code, link) do nothing
  `);

  const res = await db.query("select * from campus_notices_cache where school_code = 'seoultech'");
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].title, '2026 공모전');
});

async function login(userId) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec('set role authenticated');
}

await check('campus_scrapped_notices 사용자는 자신의 스크랩만 조회 및 관리', async () => {
  await login(userA);
  await db.query(`
    insert into campus_scrapped_notices (user_id, school_code, school_name, category, title, link)
    values ($1, 'seoultech', '서울과기대', 'contest', 'AI 경진대회', 'https://seoultech.ac.kr/ai')
  `, [userA]);

  // User A reads their scrap
  const resA = await db.query("select * from campus_scrapped_notices");
  assert.equal(resA.rows.length, 1);
  assert.equal(resA.rows[0].title, 'AI 경진대회');

  // User B cannot see User A's scrap due to RLS
  await login(userB);
  const resB = await db.query("select * from campus_scrapped_notices");
  assert.equal(resB.rows.length, 0);
});

console.log(`${count} campus crawler db checks passed`);
