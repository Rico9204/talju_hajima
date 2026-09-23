// node tests/vice-leader.test.mjs <directory containing @electric-sql/pglite>
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
// schema.sql defines a language-sql function before the table it reads, so body validation must be off for a fresh load.
await db.exec('set check_function_bodies = off');
const schema = readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8')
 .replace('create extension if not exists pgcrypto;','')
 .replace(/^alter publication .*;\r?$/gm,'');
await db.exec(schema);
// The standalone migration must also be safe to apply on top of a schema that already contains it.
await db.exec(readFileSync(new URL('../supabase/migrations/20260921170000_add_vice_leader_role.sql',import.meta.url),'utf8'));

// 0 admin(reviewer), 1 other admin, 2 leader, 3 vice candidate, 4 plain member, 5 plain member 2, 6 leader of another project
const ids = [0,1,2,3,4,5,6].map(n=>`00000000-0000-0000-0000-${String(n+1).padStart(12,'0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')",[id,`${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=any($1::uuid[])',[[ids[0],ids[1]]]);
let count=0;
async function check(name,fn){ try { await fn(); } catch (error) { console.log('FAIL '+name); throw error; } console.log('PASS '+name); count++; }
let current = null;
async function login(index){current=index;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[index]]);await db.exec('set role authenticated');}
async function system(){current=null;await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");}
async function project(id,admin,creator){await login(creator);return db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')",[id,ids[admin]]);}
async function join(pid,index,leader=false,role='팀원'){ await login(index); return (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values($1,$2,$3,'','','팀','#123456',$4) returning id",[pid,`사용자${index}`,role,leader])).rows[0].id; }
async function approve(pid,admin=0){ await login(admin); await db.query("select review_project($1,'approved')",[pid]); }
// Reads as the system role but leaves the caller logged in as before.
async function member(id){ const previous=current; await system(); const row=(await db.query('select is_leader,is_vice_leader,role from members where id=$1',[id])).rows[0]; if(previous!==null) await login(previous); return row; }
async function rejects(fn,pattern){ await assert.rejects(fn,pattern); }

await project('p',0,2); await project('q',1,6);
const leader=await join('p',2,true,'팀장');
const vice=await join('p',3);
const plain=await join('p',4);
const plain2=await join('p',5);
const otherLeader=await join('q',6,true,'팀장');
await approve('p'); await approve('q',1);

await check('new column is readable and defaults to false; members cannot self-assign through insert',async()=>{
 await login(3); assert.equal((await db.query('select is_vice_leader from members where id=$1',[vice])).rows[0].is_vice_leader,false);
 const sneaky=(await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_vice_leader) values('q','침입자','팀원','','','팀','#123456',true) returning id, is_vice_leader")).rows[0];
 assert.equal(sneaky.is_vice_leader,false);
 await system(); await db.query('delete from members where id=$1',[sneaky.id]);
});
await check('only the project leader or an administrator can appoint; plain members, vice leaders and other leaders cannot',async()=>{
 await login(4); await rejects(db.query('select set_vice_leader($1,true)',[vice]),/팀장 또는 관리자/);
 await login(6); await rejects(db.query('select set_vice_leader($1,true)',[vice]),/팀장 또는 관리자/);
 await login(2); await db.query('select set_vice_leader($1,true)',[vice]);
 assert.deepEqual(await member(vice),{is_leader:false,is_vice_leader:true,role:'부팀장'});
 await login(3); await rejects(db.query('select set_vice_leader($1,true)',[plain]),/팀장 또는 관리자/);
 await rejects(db.query('select set_vice_leader($1,false)',[vice]),/팀장 또는 관리자/);
 assert.equal((await member(plain)).is_vice_leader,false);
});
await check('leader cannot be appointed; repeating an appointment is harmless',async()=>{
 await login(2); await rejects(db.query('select set_vice_leader($1,true)',[leader]),/팀장은 부팀장/);
 await db.query('select set_vice_leader($1,true)',[vice]); assert.equal((await member(vice)).is_vice_leader,true);
 await rejects(db.query('select set_vice_leader($1,true)',['00000000-0000-0000-0000-00000000ffff']),/찾을 수 없/);
});
await check('administrator can dismiss and re-appoint; custom role text is kept',async()=>{
 await login(0); await db.query('select set_vice_leader($1,false)',[vice]);
 assert.deepEqual(await member(vice),{is_leader:false,is_vice_leader:false,role:'팀원'});
 await system(); await db.query("update members set role='디자이너' where id=$1",[vice]);
 await login(0); await db.query('select set_vice_leader($1,true)',[vice]);
 assert.deepEqual(await member(vice),{is_leader:false,is_vice_leader:true,role:'디자이너'});
 await db.query('select set_vice_leader($1,false)',[vice]); await db.query('select set_vice_leader($1,true)',[vice]);
 assert.equal((await member(vice)).role,'디자이너');
});
await check('flag cannot be changed by direct update or by breaking the leader/vice exclusivity',async()=>{
 await login(4); await rejects(db.query('update members set is_vice_leader=true where id=$1',[plain]),/permission denied/);
 await system(); await rejects(db.query('update members set is_vice_leader=true where id=$1',[plain]),/set_vice_leader/);
 await db.exec("select set_config('app.allow_vice_leader_change','true',false)");
 await rejects(db.query('update members set is_vice_leader=true where id=$1',[leader]),/members_leader_not_vice/);
 await db.exec("select set_config('app.allow_vice_leader_change','',false)");
});
await check('vice leader can create, edit, assign and delete tasks; plain members cannot',async()=>{
 await login(4); await rejects(db.query("insert into tasks(project_id,title,assignee,avatar,priority,due,status,color) values('p','침범','x','x','mid','2026-09-30','todo','#000')"),/row-level security/);
 await login(3);
 const taskId=(await db.query("insert into tasks(project_id,title,assignee,avatar,priority,due,status,color) values('p','부팀장 과제','x','x','mid','2026-09-30','todo','#000') returning id")).rows[0].id;
 await db.query("update tasks set status='inprogress' where id=$1",[taskId]);
 assert.equal((await db.query('select status from tasks where id=$1',[taskId])).rows[0].status,'inprogress');
 await db.query('insert into task_assignees(task_id,member_id) values($1,$2)',[taskId,plain]);
 assert.equal((await db.query('select member_id from task_assignees where task_id=$1',[taskId])).rows.length,1);
 await login(5); assert.equal((await db.query("update tasks set title='침범' where id=$1 returning id",[taskId])).rows.length,0);
 assert.equal((await db.query('delete from tasks where id=$1 returning id',[taskId])).rows.length,0);
 await rejects(db.query('insert into task_assignees(task_id,member_id) values($1,$2)',[taskId,plain2]),/row-level security/);
 await login(4); assert.equal((await db.query("update tasks set status='review' where id=$1 returning id",[taskId])).rows.length,1);
 await login(3); assert.equal((await db.query('delete from task_assignees where task_id=$1 returning member_id',[taskId])).rows.length,1);
 assert.equal((await db.query('delete from tasks where id=$1 returning id',[taskId])).rows.length,1);
});
await check('vice leader manages team schedule; plain members cannot; personal events stay private to their owner',async()=>{
 await login(4); await rejects(db.query("insert into schedule_events(project_id,title,date,type,scope) values('p','침범',current_date,'meeting','team')"),/row-level security/);
 await login(3);
 const eventId=(await db.query("insert into schedule_events(project_id,title,date,type,scope) values('p','팀 회의',current_date,'meeting','team') returning id")).rows[0].id;
 await db.query("update schedule_events set title='팀 회의(수정)' where id=$1",[eventId]);
 await login(4); assert.equal((await db.query("update schedule_events set title='침범' where id=$1 returning id",[eventId])).rows.length,0);
 assert.equal((await db.query('delete from schedule_events where id=$1 returning id',[eventId])).rows.length,0);
 const personal=(await db.query("insert into schedule_events(project_id,title,date,type,scope,owner_member_id,visibility) values('p','내 일정',current_date,'other','personal',$1,'shared') returning id",[plain])).rows[0].id;
 await login(3); assert.equal((await db.query("update schedule_events set title='침범' where id=$1 returning id",[personal])).rows.length,0);
 assert.equal((await db.query('delete from schedule_events where id=$1 returning id',[personal])).rows.length,0);
 assert.equal((await db.query('delete from schedule_events where id=$1 returning id',[eventId])).rows.length,1);
});
await check('vice leader can delete other members workspace items, plain members cannot',async()=>{
 // Clients cannot insert files directly; a trigger records auth.uid() as the owner, so insert as the owner's identity with elevated rights.
 await system(); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[4]]);
 const folder=(await db.query("insert into folders(project_id,name,color,created_by) values('p','내 폴더','blue','사용자4') returning id")).rows[0].id;
 const file=(await db.query("insert into files(project_id,name,type,uploader,avatar,size,folder_id) values('p','자료.pdf','pdf','사용자4','팀','1MB',$1) returning id",[folder])).rows[0].id;
 await login(4); await rejects(db.query('select delete_workspace_folder($1)',[folder]),/파일이 있는 폴더/);
 await login(5); await rejects(db.query('select delete_workspace_file($1)',[file]),/팀장, 부팀장 또는 최초 업로더/);
 await rejects(db.query('select delete_workspace_folder($1)',[folder]),/팀장, 부팀장 또는 생성자/);
 await login(3); await db.query('select delete_workspace_file($1)',[file]);
 await db.query('select delete_workspace_folder($1)',[folder]);
 assert.equal((await db.query('select id from files where id=$1',[file])).rows.length,0);
 await system();
 const legacy=(await db.query("insert into folders(project_id,name,color,created_by,owner_user_id) values('p','옛 폴더','blue','누군가',null) returning id")).rows[0].id;
 await login(5); await rejects(db.query('select delete_workspace_folder($1)',[legacy]),/팀장, 부팀장 또는 생성자/);
 await login(3); await db.query('select delete_workspace_folder($1)',[legacy]);
 assert.equal((await db.query('select id from folders where id=$1',[legacy])).rows.length,0);
});
await check('leader-only actions stay leader-only for a vice leader',async()=>{
 await login(3);
 await rejects(db.query('select kick_project_member($1)',[plain2]),/팀장 또는 관리자/);
 await rejects(db.query("select complete_evaluation_project('p')"),/팀장 또는 관리자/);
 await rejects(db.query("select transfer_leadership('p','사용자4')"),/팀장만/);
 assert.equal((await db.query("update projects set name='탈취' where id='p' returning id")).rows.length,0);
 assert.equal((await db.query('select id from members where id=$1',[plain2])).rows.length,1);
});
await check('team roster exposes the flag to members and to administrators',async()=>{
 await login(4);
 const visible=(await db.query("select id,is_vice_leader from visible_evaluation_members('p')")).rows;
 assert.equal(visible.find(r=>r.id===vice).is_vice_leader,true);
 assert.equal(visible.find(r=>r.id===plain).is_vice_leader,false);
 await login(0);
 assert.equal((await db.query("select is_vice_leader from admin_project_members('p') where id=$1",[vice])).rows[0].is_vice_leader,true);
});
await check('leader can still remove a plain member; a vice leader stays a manager until dismissed',async()=>{
 await login(2); await db.query('select kick_project_member($1)',[plain2]);
 assert.equal((await db.query('select id from members where id=$1',[plain2])).rows.length,0);
 await login(3); assert.equal((await db.query("select is_project_manager('p') value")).rows[0].value,true);
 await login(4); assert.equal((await db.query("select is_project_manager('p') value")).rows[0].value,false);
 await login(2); assert.equal((await db.query("select is_project_manager('p') value")).rows[0].value,true);
});
await check('transferring leadership to a vice leader clears the vice flag and demotes the old leader',async()=>{
 await login(2); await db.query("select transfer_leadership('p','사용자3')");
 assert.deepEqual(await member(vice),{is_leader:true,is_vice_leader:false,role:'디자이너'});
 assert.deepEqual(await member(leader),{is_leader:false,is_vice_leader:false,role:'팀원'});
 await login(2); assert.equal((await db.query("select is_project_manager('p') value")).rows[0].value,false);
 await login(3); assert.equal((await db.query("select is_project_manager('p') value")).rows[0].value,true);
 await login(2); await rejects(db.query('select set_vice_leader($1,true)',[plain]),/팀장 또는 관리자/);
 await login(3); await db.query('select set_vice_leader($1,true)',[leader]);
 assert.deepEqual(await member(leader),{is_leader:false,is_vice_leader:true,role:'부팀장'});
 await db.query("select transfer_leadership('p','사용자2')");
 assert.deepEqual(await member(leader),{is_leader:true,is_vice_leader:false,role:'팀장'});
});
await check('appointments are refused once the project is completed',async()=>{
 await login(2); await db.query("select complete_evaluation_project('p')");
 await rejects(db.query('select set_vice_leader($1,true)',[plain]),/진행 중인 승인된 프로젝트/);
 await login(0); await rejects(db.query('select set_vice_leader($1,false)',[vice]),/진행 중인 승인된 프로젝트/);
});
await db.close(); console.log(`${count} vice-leader checks passed`);
