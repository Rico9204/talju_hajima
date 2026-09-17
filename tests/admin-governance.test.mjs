// node tests/admin-governance.test.mjs <directory containing @electric-sql/pglite>
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
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;
`);
const schema = readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8')
 .replace('create extension if not exists pgcrypto;','')
 .replace(/^alter publication .*;\r?$/gm,'');
await db.exec(schema);
await db.exec(`create function public.archive_and_cleanup_project(text) returns void language sql security definer as $$select$$;
create function public.cleanup_completed_projects() returns void language sql security definer as $$select$$;`);
await db.exec(readFileSync(new URL('../supabase/migration_admin_governance.sql',import.meta.url),'utf8'));
const ids = [1,2,3,4,5].map(n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\",\"is_admin\":true}')",[id,`${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=any($1::uuid[])',[[ids[0],ids[1]]]);
let count=0;
async function check(name,fn){ await fn(); console.log('PASS '+name); count++; }
async function login(index){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[index]]);await db.exec('set role authenticated');}
async function system(){await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");}
async function project(id){return db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')",[id,ids[0]]);}
async function join(pid,index,leader=false){ await login(index); return (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values($1,'팀원','팀원','','','팀','#123456',$2) returning id",[pid,leader])).rows[0].id; }
await check('signup metadata cannot grant administrator privileges',async()=>{
 await login(2); assert.equal((await db.query('select is_admin() value')).rows[0].value,false);
 await assert.rejects(db.query('update profiles set is_admin=true where id=$1',[ids[2]]),/운영자/);
 await assert.rejects(db.exec("select archive_and_cleanup_project('p')"),/permission denied/);
 await assert.rejects(db.exec('select cleanup_completed_projects()'),/permission denied/);
});
await check('new member projects require dates and a real reviewer, and remain pending',async()=>{
 await assert.rejects(db.exec("insert into projects(id,name,org,period,status) values('invalid','x','x','x','active')"),/시작일/);
 await project('p'); assert.equal((await db.query("select approval_status from projects where id='p'")).rows[0].approval_status,'pending');
});
const leader=await join('p',2,true);
const member=await join('p',3);
const kickable=await join('p',4);
await check('leader cannot self-approve or bypass pending state through workspace writes',async()=>{
 await login(2);
 await assert.rejects(db.exec("update projects set approval_status='approved' where id='p'"),/전용 기능/);
 await assert.rejects(db.exec("select review_project('p','approved')"),/관리자/);
 await assert.rejects(db.exec("insert into folders(project_id,name,color,created_by,date) values('p','test','blue','팀원',current_date)"),/승인 후/);
 await assert.rejects(db.exec("select complete_evaluation_project('p')"),/승인된/);
});
await check('only the assigned admin can approve once',async()=>{
 await login(1); await assert.rejects(db.exec("select review_project('p','approved')"),/지정된/);
 await login(0); await db.exec("select review_project('p','approved')");
 await assert.rejects(db.exec("select review_project('p','rejected')"),/이미 처리/);
});
await check('admin can inspect outside rosters while ordinary members cannot call admin RPC',async()=>{
 assert.equal((await db.query("select * from admin_project_members('p')")).rows.length,3);
 await login(3); await assert.rejects(db.exec("select * from admin_project_members('p')"),/관리자/);
 await assert.rejects(db.exec('select score from members'),/permission denied/);
 await assert.rejects(db.exec("update members set role='팀장'"),/permission denied/);
});
await check('member exclusion checks actor and leader; valid exclusion succeeds',async()=>{
 await assert.rejects(db.query('select kick_project_member($1)',[kickable]),/팀장 또는 관리자/);
 await login(0); await assert.rejects(db.query('select kick_project_member($1)',[leader]),/팀장 또는 본인/);
 await login(2); await db.query('select kick_project_member($1)',[kickable]);
 assert.equal((await db.query('select id from members where id=$1',[kickable])).rows.length,0);
});
await check('schedule owner may edit; other members cannot; scope stays immutable',async()=>{
 await login(3);
 await db.query("insert into schedule_events(project_id,title,date,type,scope,owner_member_id,visibility) values('p','일정',current_date,'meeting','personal',$1,'shared')",[member]);
 await db.exec("update schedule_events set title='수정' where project_id='p'");
 await login(2); assert.equal((await db.query("update schedule_events set title='침범' where project_id='p' returning id")).rows.length,0);
 await login(3); await assert.rejects(db.exec("update schedule_events set scope='team',owner_member_id=null,visibility=null"),/소유자와 범위/);
});
await check('evaluation records prevent destructive member exclusion',async()=>{
 await system();
 const submission=(await db.query("insert into peer_evaluation_submissions(project_id,evaluator_id,phase) values('p',$1,'midterm') returning id",[member])).rows[0].id;
 await db.query("insert into peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality) values($1,'p',$2,$3,'midterm',5,5,5,5,5)",[submission,member,leader]);
 await login(0); await assert.rejects(db.query('select kick_project_member($1)',[member]),/평가 기록/);
});
const storagePath=`v2/70/${ids[2]}/original`;
await check('approved workspace keeps binary registration, indexing and privacy',async()=>{
 await login(2);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('workspace-files',$1,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[storagePath]);
 const result=(await db.query("select register_workspace_search_version('p',null,null,null,'보고서.pdf','pdf',$1,'메모',array['자료'],'검색 본문','ready') result",[storagePath])).rows[0].result;
 assert.equal((await db.query('select search_text from file_versions where id=$1',[result.version_id])).rows[0].search_text,'검색 본문');
 await login(1); assert.equal((await db.query('select id from file_versions')).rows.length,0);
});
await check('completion is authorized, durable and idempotent; completed schedules stay read-only',async()=>{
 await login(3); await assert.rejects(db.exec("select complete_evaluation_project('p')"),/팀장 또는 관리자/);
 await login(2); await db.exec("select complete_evaluation_project('p')");
 const first=(await db.query("select completed_at from projects where id='p'")).rows[0].completed_at;
 await db.exec("select complete_evaluation_project('p')");
 assert.deepEqual((await db.query("select completed_at from projects where id='p'")).rows[0].completed_at,first);
 await login(3); await assert.rejects(db.exec("update schedule_events set title='종료 후 수정'"),/종료된/);
});
await check('only admin can delete a project, including projects with evaluation records',async()=>{
 await login(2); await assert.rejects(db.exec("select delete_managed_project('p')"),/관리자만/);
 await login(0); await db.exec("select delete_managed_project('p')");
 assert.equal((await db.query("select id from projects where id='p'")).rows.length,0);
 assert.equal((await db.query('select storage_path from workspace_delete_queue')).rows[0].storage_path,storagePath);
 await db.exec("select finish_workspace_cleanup('p')");
 assert.equal((await db.query('select storage_path from workspace_delete_queue')).rows.length,1);
 await login(3); assert.equal((await db.query('select storage_path from workspace_delete_queue')).rows.length,0);
 await login(0); await db.query('delete from storage.objects where name=$1',[storagePath]);
 await db.exec("select finish_workspace_cleanup('p')");
 assert.equal((await db.query('select storage_path from workspace_delete_queue')).rows.length,0);
});
await db.close(); console.log(`${count} governance checks passed`);
