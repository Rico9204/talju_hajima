// node tests/workspace-nested-folders.test.mjs <directory containing @electric-sql/pglite>
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2] || '.', 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
// 준비용 팀원 행: 참여는 이제 참여 코드로만(join_project_with_code) 되므로, 이름·역할을 정해 둔 행은 권한 규칙 밖에서 넣는다(user_id는 트리거가 로그인한 사용자로 채운다).
async function asFixture(sql, params) { await db.exec('reset role'); try { return await db.query(sql, params); } finally { await db.exec('set role authenticated'); } }
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
const ids = [0, 1, 2].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0 관리자, 1 팀장(프로필 있음), 2 팀장(프로필 비어 있음)
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query("update profiles set is_admin=true where id=$1", [ids[0]]);
await db.query("update profiles set major='AI학부 3학년', student='22110034' where id=$1", [ids[1]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
async function system() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
for (const [i, pid] of [[1, 'p'], [2, 'q']]) {
  await login(i);
  await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')", [pid, ids[0]]);
  await asFixture("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values($1,'팀장','팀장','역사문화학과 3학년','2021123456','팀','#123456',true)", [pid]);
}
await system();
await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p','옛 팀원','팀원','역사문화학과 3학년','2021123456','옛','#123456',false)");
await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p','진짜 팀원','팀원','역사문화학과 3학년','2099000000','진','#123456',false)");
const migration = readFileSync(new URL('../supabase/migrations/2610041800_fix_sample_leader_major.sql', import.meta.url), 'utf8');
await check('예시 값이 남은 행은 프로필 값으로, 프로필이 비었거나 계정이 없으면 기본값으로 바뀐다', async () => {
  await db.exec(migration);
  const rows = (await db.query("select project_id, name, major, student from members order by project_id, name")).rows;
  assert.deepEqual(rows.map((r) => [r.project_id, r.name, r.major, r.student]), [
    ['p', '옛 팀원', '전공 미지정', '-'],
    ['p', '진짜 팀원', '역사문화학과 3학년', '2099000000'], // 학번이 다르면 실제 입력값으로 보고 그대로 둔다
    ['p', '팀장', 'AI학부 3학년', '22110034'],
    ['q', '팀장', '전공 미지정', '-'],
  ]);
});
await check('여러 번 실행해도 결과가 같다', async () => {
  await db.exec(migration);
  assert.equal((await db.query("select count(*)::int n from members where major='전공 미지정'")).rows[0].n, 2);
});
console.log(count + ' leader-sample-major checks passed');
