// node tests/project-alerts.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2609270000_my_project_alerts.sql', import.meta.url), 'utf8')); // 다시 실행해도 안전한지

// 0 관리자, 1 팀장(p·q), 2·3·4 팀원(p)
const ids = [0, 1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=$1', [ids[0]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
async function system() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }

for (const pid of ['p', 'q']) {
  await login(1);
  await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')", [pid, ids[0]]);
  await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values($1,'사용자1','팀원','','','팀','#123456',true)", [pid]);
}
const member = {};
for (const i of [2, 3, 4]) {
  await login(i);
  member[i] = (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',false) returning id", [`사용자${i}`])).rows[0].id;
}
await system(); member[1] = (await db.query("select id from members where project_id='p' and user_id=$1", [ids[1]])).rows[0].id;
await login(0); await db.query("select review_project('p','approved')"); await db.query("select review_project('q','approved')");

const alerts = async (who) => { await login(who); return Object.fromEntries((await db.query('select project_id, has_alert from my_project_alerts()')).rows.map((r) => [r.project_id, r.has_alert])); };
const send = async (who, channel, text) => { await login(who); return (await db.query("insert into chat_messages(project_id,channel_id,sender_id,text) values('p',$1,$2,$3) returning id", [channel, member[who], text])).rows[0].id; };

await check('처음에는 알림이 없고, 내가 참여한 프로젝트만 나온다', async () => {
  assert.deepEqual(await alerts(1), { p: false, q: false });
  assert.deepEqual(await alerts(3), { p: false });
});
await check('과제 화면을 본 뒤 새 과제가 생기면 그 프로젝트만 알림, 과제 화면을 보면 사라진다', async () => {
  await system(); await db.query("insert into tasks(project_id,title,assignee,avatar,priority,due,status,color) values('q','새 과제','사용자1','팀','mid','내일','todo','#123456')");
  assert.deepEqual(await alerts(1), { p: false, q: true });
  await login(1); await db.query("select mark_section_viewed('q','tasks')");
  assert.deepEqual(await alerts(1), { p: false, q: false });
});
await check('새 파일도 워크스페이스를 보기 전까지 알림', async () => {
  await system(); await db.query("insert into files(project_id,name,type,uploader,avatar,size) values('q','보고서.pdf','pdf','사용자1','팀','1 KB')");
  assert.equal((await alerts(1)).q, true);
  await login(1); await db.query("select mark_section_viewed('q','workspace')");
  assert.equal((await alerts(1)).q, false);
});
await check('남이 보낸 안 읽은 메시지는 알림, 읽으면 사라지고, 내가 보낸 것·채팅 도구 행동 메시지는 세지 않는다', async () => {
  await send(2, 'all', '[TALJU_CHAT_TOOL_ACTION]:{"pick":1}');
  assert.equal((await alerts(3)).p, false);
  const id = await send(2, 'all', '안녕하세요');
  assert.equal((await alerts(2)).p, false);
  assert.equal((await alerts(3)).p, true);
  await login(3); await db.query("insert into message_reads(message_id,member_id,project_id) values($1,$2,'p')", [id, member[3]]);
  assert.equal((await alerts(3)).p, false);
});
await check('내가 볼 수 없는 단체방의 메시지는 알림이 되지 않는다', async () => {
  await login(1); await db.query("select create_chat_group('p','비밀방',$1::uuid[])", [[member[2], member[4]]]);
  assert.equal((await alerts(4)).p, true); // 참여자: 개설 안내 메시지를 아직 읽지 않았다
  assert.equal((await alerts(3)).p, false); // 비참여자
});
console.log(count + ' project-alerts checks passed');
