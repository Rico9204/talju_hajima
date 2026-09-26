// node tests/board-poll-server.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2609261200_move_workspace_file.sql', import.meta.url), 'utf8'));

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
await system();
const folder = async (pid, name) => (await db.query("insert into folders(project_id,name,color,created_by) values($1,$2,'#123456','사용자') returning id", [pid, name])).rows[0].id;
const fA = await folder('p', '발표'); const fB = await folder('p', '자료'); const fOther = await folder('q', '다른 프로젝트');
const fileId = (await db.query("insert into files(project_id,name,type,uploader,avatar,size,folder_id) values('p','보고서.pdf','pdf','사용자','팀','1 KB',$1) returning id", [fA])).rows[0].id;
const state = async () => { await system(); return (await db.query('select folder_id, updated_at from files where id=$1', [fileId])).rows[0]; };
const move = async (who, target) => { await login(who); await db.query('select move_workspace_file($1,$2)', [fileId, target]); };

await check('팀원은 다른 폴더로, 그리고 워크스페이스 루트(null)로 옮길 수 있다', async () => {
  await move(2, fB);
  assert.equal((await state()).folder_id, fB);
  await move(2, null);
  assert.equal((await state()).folder_id, null);
  await move(1, fA);
  assert.equal((await state()).folder_id, fA);
});
await check('옮겨도 대시보드 수정 시각(updated_at)은 바뀌지 않는다', async () => {
  const before = (await state()).updated_at;
  await move(1, fB);
  assert.deepEqual((await state()).updated_at, before);
  await system(); await db.query("update files set name='보고서2.pdf' where id=$1", [fileId]); // 일반 수정은 그대로 기록
  assert.notDeepEqual((await state()).updated_at, before);
});
await check('다른 프로젝트 폴더·없는 폴더로는 옮길 수 없고, 외부인은 옮길 수 없다', async () => {
  await rejects(move(1, fOther), /폴더를 찾을 수 없/);
  await rejects(move(1, 999999), /폴더를 찾을 수 없/);
  await rejects(move(3, fA), /참여자만/);
  await login(2); await rejects(db.query('update files set folder_id=$1 where id=$2', [fA, fileId]), /permission denied/);
});
await check('종료된 프로젝트에서는 옮길 수 없다', async () => {
  await system(); await db.query("update projects set status='done' where id='p'");
  await rejects(move(1, fA), /진행 중인 프로젝트/);
});
console.log(count + ' workspace-move checks passed');
