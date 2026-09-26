// node tests/workspace-nested-folders.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2609262000_nested_folders.sql', import.meta.url), 'utf8')); // 이미 반영된 DB에 다시 실행해도 안전한지

const ids = [0, 1, 2, 3].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0 관리자, 1·2 팀원, 3 외부인
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=$1', [ids[0]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
async function system() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);

for (const pid of ['p', 'q']) {
  await login(1);
  await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')", [pid, ids[0]]);
}
for (const i of [1, 2]) { await login(i); await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',$2)", [`사용자${i}`, i === 1]); }
await login(1); await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('q','사용자1','팀원','','','팀','#123456',true)");
await login(0); await db.query("select review_project('p','approved')"); await db.query("select review_project('q','approved')");
const folder = async (who, pid, parent) => { await login(who); return (await db.query("insert into folders(project_id,name,color,created_by,parent_id) values($1,'폴더','#123456','사용자',$2) returning id", [pid, parent])).rows[0].id; };
const del = async (who, id) => { await login(who); await db.query('select delete_workspace_folder($1)', [id]); };

let chain = [];
await check('폴더 안에 폴더를 10단계까지 만들 수 있고 11단계는 막힌다', async () => {
  let parent = null;
  for (let depth = 1; depth <= 10; depth++) { parent = await folder(2, 'p', parent); chain.push(parent); }
  await rejects(folder(2, 'p', parent), /최대 10단계/);
  await folder(2, 'p', chain[8]); // 9단계 아래(10단계)는 여전히 가능
});
await check('다른 프로젝트의 폴더나 없는 폴더를 상위로 지정할 수 없다', async () => {
  const other = await folder(1, 'q', null);
  await rejects(folder(2, 'p', other), /folders_parent_fk/);
  await rejects(folder(2, 'p', 999999), /folders_parent_fk/);
});
await check('외부인은 남의 프로젝트 폴더 안에 폴더를 만들 수 없다', async () => {
  await rejects(folder(3, 'p', chain[0]), /row-level security/);
});
await check('하위 폴더가 있으면 삭제할 수 없고, 비우면 삭제된다', async () => {
  await rejects(del(2, chain[8]), /하위 폴더가 있는/);
  await system(); await db.query('delete from folders where parent_id=$1 and id<>$2', [chain[8], chain[9]]);
  await del(2, chain[9]);
  await del(2, chain[8]);
  await system();
  assert.equal((await db.query('select count(*)::int n from folders where id = any($1)', [[chain[8], chain[9]]])).rows[0].n, 0);
});
await check('프로젝트를 지우면 하위 폴더까지 한꺼번에 지워진다', async () => {
  await system(); await db.query("delete from projects where id='p'");
  assert.equal((await db.query("select count(*)::int n from folders where project_id='p'")).rows[0].n, 0);
});
console.log(count + ' workspace-nested-folders checks passed');
