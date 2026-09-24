// node tests/admin-applications.test.mjs <directory containing @electric-sql/pglite>
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
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
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
await db.exec(readFileSync(new URL('../supabase/migrations/2609211800_admin_applications.sql',import.meta.url),'utf8'));

// 0 operator, 1 applicant A, 2 applicant B, 3 plain user, 4 regular admin, 5 second operator
const ids = [0,1,2,3,4,5].map(n=>`00000000-0000-0000-0000-${String(n+1).padStart(12,'0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')",[id,`${id}@example.test`]);
await db.query("update auth.users set email_confirmed_at=now() where id=$1",[ids[1]]);
await db.query('update profiles set is_admin=true, is_operator=true where id=any($1::uuid[])',[[ids[0],ids[5]]]);
await db.query('update profiles set is_admin=true where id=$1',[ids[4]]);
let count=0;
async function check(name,fn){ try { await fn(); } catch (error) { console.log('FAIL '+name); throw error; } console.log('PASS '+name); count++; }
async function login(index){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[index]]);await db.exec('set role authenticated');}
async function system(){await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");}
async function rejects(fn,pattern){ await assert.rejects(fn,pattern); }
const bucket='admin-verification';
// Stands in for a completed Storage upload: the real service fills metadata.size / metadata.mimetype.
async function upload(index,{size=1000,mimetype='application/pdf',folder=index}={}){
  const name=`${ids[folder]}/${crypto.randomUUID()}.pdf`;
  await login(index);
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,name,JSON.stringify({size,mimetype})]);
  return name;
}
const fields=(path,over={})=>({org:'컴퓨터공학과',title:'교수',contact:'010-1234-5678',type:'employment',name:'재직증명서.pdf',consent:true,...over,path});
const submit=(f)=>db.query('select submit_admin_application($1,$2,$3,$4,$5,$6,$7) id',[f.org,f.title,f.contact,f.type,f.path,f.name,f.consent]);
async function appOf(index){ await system(); return (await db.query('select * from admin_applications where user_id=$1 order by submitted_at desc',[ids[index]])).rows; }
async function profile(index){ await system(); return (await db.query('select is_admin,is_operator,org from profiles where id=$1',[ids[index]])).rows[0]; }

await check('account type never comes from signup metadata or client writes',async()=>{
 const rogue='00000000-0000-0000-0000-0000000000ff';
 await system();
 await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'rogue@example.test','{\"display_name\":\"침입\",\"is_admin\":true,\"is_operator\":true,\"signup_type\":\"admin\"}')",[rogue]);
 const p=(await db.query('select is_admin,is_operator from profiles where id=$1',[rogue])).rows[0];
 assert.deepEqual(p,{is_admin:false,is_operator:false});
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[rogue]); await db.exec('set role authenticated');
 await rejects(db.query('update profiles set is_operator=true where id=$1',[rogue]),/운영자 권한은 DB 관리자만/);
 await rejects(db.query('update profiles set is_admin=true where id=$1',[rogue]),/관리자 권한은 운영자만/);
 assert.equal((await db.query('select is_operator() a, is_admin() b')).rows[0].a,false);
 await login(0); assert.equal((await db.query('select is_operator() a')).rows[0].a,true);
});
await check('certificate storage is private, own-folder, PDF-named, capped, and closed to admins',async()=>{
 await login(1);
 await rejects(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,`${ids[2]}/${crypto.randomUUID()}.pdf`,'{}']),/row-level security/);
 await rejects(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,`${ids[1]}/notes.txt`,'{}']),/row-level security/);
 const mine=await upload(1);
 await login(2); assert.equal((await db.query('select name from storage.objects where bucket_id=$1',[bucket])).rows.length,0);
 await login(4); assert.equal((await db.query('select name from storage.objects where bucket_id=$1',[bucket])).rows.length,0);
 await rejects(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,`${ids[4]}/${crypto.randomUUID()}.pdf`,'{}']),/row-level security/);
 await login(0); assert.equal((await db.query('select name from storage.objects where bucket_id=$1',[bucket])).rows[0].name,mine);
 await system(); await db.query('delete from storage.objects where bucket_id=$1',[bucket]);
 for (let i=0;i<5;i++) await upload(3);
 await login(3); await rejects(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,`${ids[3]}/${crypto.randomUUID()}.pdf`,'{}']),/row-level security/);
 await system(); await db.query('delete from storage.objects where bucket_id=$1',[bucket]);
});
let fileA, appA;
await check('submission validates consent, fields, path, file presence, PDF type and size',async()=>{
 fileA=await upload(1);
 await login(1);
 await rejects(submit(fields(fileA,{consent:false})),/동의/);
 await rejects(submit(fields(fileA,{org:'  '})),/소속/);
 await rejects(submit(fields(fileA,{title:''})),/직위/);
 await rejects(submit(fields(fileA,{contact:'1'})),/연락처/);
 await rejects(submit(fields(fileA,{type:'other-type'})),/증명서 종류/);
 await rejects(submit(fields(`${ids[2]}/${crypto.randomUUID()}.pdf`)),/경로/);
 await rejects(submit(fields(`${ids[1]}/${crypto.randomUUID()}.pdf`)),/확인할 수 없습니다/);
 const wrongType=await upload(3,{mimetype:'text/plain'}); await login(3); await rejects(submit(fields(wrongType)),/PDF 파일만/);
 const tooBig=await upload(3,{size:20*1024*1024}); await login(3); await rejects(submit(fields(tooBig)),/10MB/);
 await system(); await rejects(submit(fields(fileA)),/로그인/);
 const someoneElses=await upload(2); await login(3); await rejects(submit(fields(someoneElses)),/경로/);
 await login(0); await rejects(submit(fields('x')),/이미 관리자/);
 await login(1); appA=(await submit(fields(fileA,{org:'  컴퓨터공학과 ',title:' 교수 '}))).rows[0].id;
 const row=(await appOf(1))[0];
 assert.deepEqual([row.status,row.org,row.job_title,row.doc_size],['pending','컴퓨터공학과','교수',1000]);
 await login(1); await rejects(submit(fields(await upload(1))),/이미 검토 중/);
 await system(); await db.query('delete from storage.objects where bucket_id=$1 and name<>$2',[bucket,fileA]);
});
await check('applicants see only their own application; only the operator lists and reviews',async()=>{
 await login(2); assert.equal((await db.query('select id from admin_applications')).rows.length,0);
 await login(4); assert.equal((await db.query('select id from admin_applications')).rows.length,0);
 await login(1); assert.equal((await db.query('select id from admin_applications')).rows.length,1);
 await rejects(db.query("insert into admin_applications(user_id,org,job_title,contact,doc_type,doc_name,doc_size,consent_at) values($1,'a','b','ccc','other','d.pdf',1,now())",[ids[1]]),/permission denied/);
 await rejects(db.query("update admin_applications set status='approved'"),/permission denied/);
 await rejects(db.query('select * from list_admin_applications()'),/운영자만/);
 await rejects(db.query('select * from list_admins()'),/운영자만/);
 await login(4); await rejects(db.query('select * from list_admin_applications()'),/운영자만/);
 await login(0); const rows=(await db.query('select * from list_admin_applications()')).rows;
 assert.equal(rows.length,1); assert.equal(rows[0].email_confirmed,true); assert.equal(rows[0].status,'pending');
 await login(1); await rejects(db.query('select review_admin_application($1,true,null)',[appA]),/운영자만/);
 await login(4); await rejects(db.query('select review_admin_application($1,true,null)',[appA]),/운영자만/);
 assert.equal((await profile(1)).is_admin,false);
});
let appB, fileB;
await check('rejection needs a reason, keeps the account non-admin, is final and audited',async()=>{
 fileB=await upload(2); await login(2); appB=(await submit(fields(fileB,{org:'경영학과',title:'조교수'}))).rows[0].id;
 await login(0);
 await rejects(db.query('select review_admin_application($1,false,$2)',[appB,'   ']),/반려 사유/);
 await rejects(db.query('select review_admin_application($1,false,$2)',[appB,'x'.repeat(501)]),/500자/);
 await db.query('select review_admin_application($1,false,$2)',[appB,'증명서 내용을 확인할 수 없습니다.']);
 const row=(await appOf(2))[0];
 assert.deepEqual([row.status,row.reviewed_by,row.review_note],['rejected',ids[0],'증명서 내용을 확인할 수 없습니다.']);
 assert.equal((await profile(2)).is_admin,false);
 await login(0); await rejects(db.query('select review_admin_application($1,true,null)',[appB]),/이미 처리/);
});
await check('approval makes the applicant an admin with the applied organization',async()=>{
 await login(0); await db.query('select review_admin_application($1,true,$2)',[appA,'확인 완료']);
 assert.deepEqual(await profile(1),{is_admin:true,is_operator:false,org:'컴퓨터공학과'});
 await login(1); assert.equal((await db.query('select is_admin() v')).rows[0].v,true);
 await login(0); await rejects(db.query('select review_admin_application($1,false,$2)',[appA,'번복']),/이미 처리/);
 await login(1); await rejects(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,`${ids[1]}/${crypto.randomUUID()}.pdf`,'{}']),/row-level security/);
 await login(1); await rejects(submit(fields(fileA)),/이미 관리자/);
});
await check('a rejected applicant waits 24 hours before applying again',async()=>{
 const again=await upload(2); await login(2);
 await rejects(submit(fields(again)),/24시간/);
 await system(); await db.query("update admin_applications set reviewed_at=now()-interval '25 hours' where user_id=$1",[ids[2]]);
 await login(2); const second=(await submit(fields(again,{org:'경영학과',title:'조교수'}))).rows[0].id;
 assert.notEqual(second,appB);
 assert.equal((await appOf(2)).length,2);
 appB=second; fileB=again;
});
await check('certificates are readable only by owner and operator; deletion follows the decision',async()=>{
 await login(0); assert.equal((await db.query('select name from storage.objects where name=$1',[fileB])).rows.length,1);
 await login(3); assert.equal((await db.query('select name from storage.objects where name=$1',[fileB])).rows.length,0);
 await login(1); assert.equal((await db.query('select name from storage.objects where name=$1',[fileB])).rows.length,0);
 await login(0); assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[fileB])).rows.length,0);
 await login(2); assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[fileB])).rows.length,0);
 const orphan=await upload(3); await login(0); assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[orphan])).rows.length,0);
 await login(3); assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[orphan])).rows.length,1);
 await login(0);
 await rejects(db.query('select mark_admin_document_deleted($1)',[appB]),/검토 중인/);
 await rejects(db.query('select mark_admin_document_deleted($1)',[appA]),/아직 삭제되지 않았습니다/);
 assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[fileA])).rows.length,1);
 await db.query('select mark_admin_document_deleted($1)',[appA]);
 await db.query('select mark_admin_document_deleted($1)',[appA]);
 const a=(await appOf(1))[0]; assert.equal(a.doc_path,null); assert.ok(a.doc_deleted_at);
 await login(4); await rejects(db.query('select mark_admin_document_deleted($1)',[appA]),/운영자만/);
});
await check('operator lists applications with verification state and revokes admins only under the rules',async()=>{
 await login(0);
 const list=(await db.query('select * from list_admin_applications()')).rows;
 assert.equal(list[0].status,'pending'); assert.equal(list[0].email_confirmed,false);
 assert.equal(list.length,3);
 await rejects(db.query('select revoke_admin($1)',[ids[0]]),/본인/);
 await rejects(db.query('select revoke_admin($1)',[ids[5]]),/운영자는 앱에서/);
 await rejects(db.query('select revoke_admin($1)',[ids[3]]),/관리자 계정이 아닙니다/);
 await login(4); await rejects(db.query('select revoke_admin($1)',[ids[1]]),/운영자만/);
 await system();
 await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values('pw','대기','학교','기간','active','2026-09-01','2026-10-01',$1,'pending')",[ids[4]]);
 await login(0);
 const admins=(await db.query('select * from list_admins()')).rows;
 assert.equal(admins[0].is_operator,true);
 assert.equal(admins.find(a=>a.user_id===ids[4]).pending_projects,1);
 await rejects(db.query('select revoke_admin($1)',[ids[4]]),/승인 대기 중인 프로젝트/);
 await system(); await db.query("update projects set approval_status='approved' where id='pw'");
 await login(0); await db.query('select revoke_admin($1)',[ids[4]]);
 assert.equal((await profile(4)).is_admin,false);
 await login(0); await db.query('select revoke_admin($1)',[ids[1]]);
 assert.equal((await profile(1)).is_admin,false);
});
await check('every decision is audited and the audit log is visible to the operator only',async()=>{
 await login(0); const rows=(await db.query('select action from admin_audit_log order by id')).rows.map(r=>r.action);
 assert.deepEqual(rows,['application_rejected','application_approved','admin_revoked','admin_revoked']);
 await login(4); assert.equal((await db.query('select id from admin_audit_log')).rows.length,0);
 await login(3); assert.equal((await db.query('select id from admin_audit_log')).rows.length,0);
 await rejects(db.query("insert into admin_audit_log(action) values('admin_revoked')"),/permission denied/);
});
await db.close(); console.log(`${count} admin-application checks passed`);
