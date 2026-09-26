// node tests/chat-groups.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2609262100_chat_groups.sql', import.meta.url), 'utf8')); // 이미 반영된 DB에 다시 실행해도 안전한지

// 0 관리자, 1 팀장, 2 부팀장, 3·4 팀원, 5 다른 프로젝트 사람
const ids = [0, 1, 2, 3, 4, 5].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=$1', [ids[0]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
async function system() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);

for (const [pid, owner] of [['p', 1], ['q', 5]]) {
  await login(owner);
  await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values($1,'프로젝트','학교','기간','active','2026-09-01','2026-10-01',$2,'approved')", [pid, ids[0]]);
}
const member = {};
for (const i of [1, 2, 3, 4]) {
  await login(i);
  member[i] = (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',$2) returning id", [`사용자${i}`, i === 1])).rows[0].id;
}
await login(5); member[5] = (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('q','사용자5','팀원','','','팀','#123456',true) returning id")).rows[0].id;
await login(0); await db.query("select review_project('p','approved')"); await db.query("select review_project('q','approved')");
await login(1); await db.query('select set_vice_leader($1,true)', [member[2]]);

const create = async (who, name, memberIds) => { await login(who); return (await db.query('select create_chat_group($1,$2,$3::uuid[]) id', ['p', name, memberIds])).rows[0].id; };
const channelMessages = async (who, channel) => { await login(who); return (await db.query('select text from chat_messages where channel_id=$1', [channel])).rows; };
const send = async (who, channel, text) => { await login(who); await db.query("insert into chat_messages(project_id,channel_id,sender_id,text) values('p',$1,$2,$3)", [channel, member[who], text]); };

let group;
await check('팀장·부팀장은 단체방을 만들 수 있고, 만든 사람 이름의 첫 메시지가 남는다', async () => {
  group = await create(1, '발표 준비', [member[2], member[3]]);
  const rows = await channelMessages(3, `grp:${group}`);
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /발표 준비/);
  await create(2, '부팀장 방', [member[3], member[4]]);
});
await check('일반 팀원은 단체방을 만들 수 없다', async () => {
  await rejects(create(3, '몰래 방', [member[1], member[4]]), /팀장 또는 부팀장만/);
});
await check('나 포함 3명 미만, 다른 프로젝트 사람, 빈 이름은 막힌다', async () => {
  await rejects(create(1, '둘이서', [member[3]]), /2명 이상/);
  await rejects(create(1, '둘이서', [member[3], member[3], member[1]]), /2명 이상/);
  await rejects(create(1, '섞인 방', [member[3], member[5]]), /이 프로젝트의 팀원만/);
  await rejects(create(1, '   ', [member[3], member[4]]), /1~30자/);
});
await check('참여자는 읽고 쓸 수 있고, 초대받지 않은 팀원·외부인은 읽지도 쓰지도 못한다', async () => {
  await send(3, `grp:${group}`, '안녕하세요');
  assert.equal((await channelMessages(2, `grp:${group}`)).length, 2);
  assert.equal((await channelMessages(4, `grp:${group}`)).length, 0);
  await rejects(send(4, `grp:${group}`, '끼어들기'), /row-level security/);
  assert.equal((await channelMessages(5, `grp:${group}`)).length, 0);
});
await check('방 목록·참여자 목록도 참여자에게만 보이고, 앱에서 직접 만들거나 참여자를 추가할 수 없다', async () => {
  await login(4);
  assert.equal((await db.query('select id from chat_groups where id=$1', [group])).rows.length, 0);
  assert.equal((await db.query('select member_id from chat_group_members where group_id=$1', [group])).rows.length, 0);
  await rejects(db.query('insert into chat_group_members(group_id,member_id,project_id) values($1,$2,$3)', [group, member[4], 'p']), /permission denied/);
  await rejects(db.query("insert into chat_groups(project_id,name) values('p','직접')"), /permission denied/);
  await login(3);
  assert.equal((await db.query('select member_id from chat_group_members where group_id=$1', [group])).rows.length, 3);
});
await check('형식이 틀린 grp: 채널은 누구도 접근하지 못한다', async () => {
  await rejects(send(1, 'grp:not-a-uuid', '틀린 채널'), /row-level security/);
  await rejects(send(1, 'grp:' + '-'.repeat(36), '틀린 채널'), /row-level security/);
});
const invite = async (who, groupId, memberIds) => { await login(who); await db.query('select add_chat_group_members($1,$2::uuid[])', [groupId, memberIds]); };
await check('방에 있는 팀장·부팀장은 팀원을 추가할 수 있고, 추가된 사람은 지난 대화까지 본다', async () => {
  await invite(2, group, [member[4], member[3]]); // 이미 있는 3은 건너뛴다
  await login(4);
  assert.equal((await db.query('select member_id from chat_group_members where group_id=$1', [group])).rows.length, 4);
  const rows = await channelMessages(4, `grp:${group}`);
  assert.ok(rows.some((r) => r.text === '안녕하세요'));
  assert.match(rows.at(-1).text, /사용자4님을 초대했습니다/);
});
await check('일반 팀원, 방에 없는 팀장·부팀장, 다른 프로젝트 사람 추가, 새 사람 없음은 막힌다', async () => {
  const other = await create(1, '팀장만 있는 방', [member[3], member[4]]); // 부팀장(2)은 참여하지 않은 방
  await rejects(invite(3, group, [member[1]]), /참여 중인 팀장 또는 부팀장만/);
  await rejects(invite(2, other, [member[2]]), /참여 중인 팀장 또는 부팀장만/);
  await rejects(invite(1, other, [member[5]]), /이 프로젝트의 팀원만/);
  await rejects(invite(1, other, [member[3]]), /새로 초대할 팀원/);
  await rejects(invite(1, other, []), /새로 초대할 팀원/);
});
await check('종료된 프로젝트에서는 만들 수 없다', async () => {
  await system(); await db.query("update projects set status='done' where id='p'");
  await rejects(create(1, '늦은 방', [member[3], member[4]]), /진행 중인 프로젝트/);
});
console.log(count + ' chat-groups checks passed');
