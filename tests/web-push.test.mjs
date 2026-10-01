// node tests/web-push.test.mjs <directory containing @electric-sql/pglite>
// 웹 푸시: 구독 저장 검증, 받을 사람 계산(볼 권한 있는 팀원만, 작성자 제외), 알림 실패가 저장을 막지 않음.
// PGlite에는 pg_net이 없어서, 같은 모양의 가짜 net.http_post가 보낸 요청을 기록한다.
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
// 마이그레이션 단독 파일도 이미 적용된 스키마 위에서 안전해야 한다.
await db.exec(readFileSync(new URL('../supabase/migrations/2610011300_web_push.sql', import.meta.url), 'utf8'));
// 가짜 pg_net
await db.exec(`
create schema net;
create table net.sent(id bigint generated always as identity, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
`);

let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(userId) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId ?? '']);
  if (userId) await db.exec('set role authenticated');
}
// 슈퍼유저로 쓰되 auth.uid()는 그 사용자(트리거가 작성자를 알 수 있게)
async function as(userId, sql, params) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  return db.query(sql, params);
}

const users = Array.from({ length: 5 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
for (const id of users) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query("insert into projects(id,name,org,period,status) values('p','캡스톤','학교','2026-2','active'),('q','다른팀','학교','2026-2','active')");
const member = [];
for (const [i, project] of [[0, 'p'], [1, 'p'], [2, 'p'], [3, 'p'], [4, 'q']]) {
  const { rows } = await as(users[i], "insert into members(project_id,name,role,major,student,avatar,color) values($1,$2,'역할','전공','1','A','#000') returning id", [project, `팀원${i}`]);
  member[i] = rows[0].id;
}
const endpoint = (i) => `https://fcm.googleapis.com/fcm/send/test-${i}`;
const keys = { p256dh: 'B' + 'x'.repeat(86), auth: 'a'.repeat(22) };
const sent = async () => (await db.query('select body, headers from net.sent order by id')).rows;
const recipientsOf = (row) => row.body.subscriptions.map((s) => s.endpoint).sort();
const clearSent = () => db.exec('reset role; delete from net.sent');
const addTask = (i, title = '보고서') => as(users[i], "insert into tasks(project_id,title,assignee,avatar,priority,due,status,color) values('p',$1,'팀원','A','mid','10/10','todo','#000')", [title]);

await check('구독은 알려진 브라우저 푸시 서비스 주소만 저장한다', async () => {
  await login(users[0]);
  await assert.rejects(db.query('select save_push_subscription($1,$2,$3)', ['https://evil.example/push', keys.p256dh, keys.auth]), /지원하지 않는/);
  await assert.rejects(db.query('select save_push_subscription($1,$2,$3)', ['http://fcm.googleapis.com/fcm/send/x', keys.p256dh, keys.auth]), /지원하지 않는/);
  await assert.rejects(db.query('select save_push_subscription($1,$2,$3)', [endpoint(0), '<script>', keys.auth]), /키 형식/);
  for (let i = 0; i < 5; i++) {
    await login(users[i]);
    await db.query('select save_push_subscription($1,$2,$3)', [endpoint(i), keys.p256dh, keys.auth]);
  }
});

await check('구독은 본인 것만 보이고, 직접 쓰거나 설정(비밀값)을 읽을 수 없다', async () => {
  await login(users[1]);
  assert.deepEqual((await db.query('select endpoint from push_subscriptions')).rows.map((r) => r.endpoint), [endpoint(1)]);
  await assert.rejects(db.query("insert into push_subscriptions(endpoint,user_id,p256dh,auth) values('https://fcm.googleapis.com/x',$1,'a','b')", [users[1]]), /permission denied/);
  await assert.rejects(db.query('select * from push_config'), /permission denied/);
});

await check('보낼 곳 설정이 없으면 아무것도 보내지 않는다', async () => {
  await addTask(0);
  assert.equal((await sent()).length, 0);
});

await db.exec("reset role; insert into push_config(endpoint, secret) values ('https://app.test/api/push', '" + 's'.repeat(40) + "')");

await check('새 과제: 같은 프로젝트 팀원에게만, 만든 사람은 빼고, 비밀값 헤더와 함께', async () => {
  await clearSent();
  await addTask(0, '중간 보고서');
  const rows = await sent();
  assert.equal(rows.length, 1);
  assert.deepEqual(recipientsOf(rows[0]), [endpoint(1), endpoint(2), endpoint(3)]);
  assert.equal(rows[0].headers['x-push-secret'], 's'.repeat(40));
  assert.equal(rows[0].body.notification.title, '[캡스톤] 새 과제');
  assert.equal(rows[0].body.notification.body, '중간 보고서');
  assert.match(rows[0].body.notification.url, /^\/tasks\/\d+\?project=p$/);
});

await check('일정: 나만 보기 개인 일정은 알리지 않고, 제목 숨김 공유 일정은 "바쁨"으로', async () => {
  await clearSent();
  await as(users[1], "insert into schedule_events(project_id,title,date,type,scope,owner_member_id,visibility) values('p','병원','2026-10-05','other','personal',$1,'private')", [member[1]]);
  assert.equal((await sent()).length, 0);
  await as(users[1], "insert into schedule_events(project_id,title,date,type,scope,owner_member_id,visibility,hide_title) values('p','병원','2026-10-05','other','personal',$1,'shared',true)", [member[1]]);
  const rows = await sent();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body.notification.body, '바쁨 (10/05)');
  assert.deepEqual(recipientsOf(rows[0]), [endpoint(0), endpoint(2), endpoint(3)]);
});

await check('1:1 채팅은 상대방에게만', async () => {
  await clearSent();
  await as(users[0], "insert into chat_messages(project_id,channel_id,sender_id,text) values('p',$1,$2,'비밀 얘기')", [`dm:${member[0]}:${member[1]}`, member[0]]);
  const rows = await sent();
  assert.equal(rows.length, 1);
  assert.deepEqual(recipientsOf(rows[0]), [endpoint(1)]);
  assert.equal(rows[0].body.notification.title, '[캡스톤] 팀원0');
});

await check('단체 채팅방은 방 참여자에게만', async () => {
  await db.exec('reset role');
  const { rows: [group] } = await db.query("insert into chat_groups(project_id,name,created_by) values('p','디자인',$1) returning id", [member[0]]);
  await db.query("insert into chat_group_members(group_id,member_id,project_id) values($1,$2,'p'),($1,$3,'p')", [group.id, member[0], member[2]]);
  await clearSent();
  await as(users[0], "insert into chat_messages(project_id,channel_id,sender_id,text) values('p',$1,$2,'시안 공유')", [`grp:${group.id}`, member[0]]);
  const rows = await sent();
  assert.equal(rows.length, 1);
  assert.deepEqual(recipientsOf(rows[0]), [endpoint(2)]);
});

await check('전체 채팅은 보낸 사람 빼고 팀 전원에게', async () => {
  await clearSent();
  await as(users[3], "insert into chat_messages(project_id,channel_id,sender_id,text) values('p','all',$1,'회의 10분 전')", [member[3]]);
  assert.deepEqual(recipientsOf((await sent())[0]), [endpoint(0), endpoint(1), endpoint(2)]);
});

await check('같은 브라우저에서 다른 계정으로 로그인하면 구독이 그 계정으로 옮겨진다', async () => {
  await login(users[2]);
  await db.query('select save_push_subscription($1,$2,$3)', [endpoint(1), keys.p256dh, keys.auth]);
  await db.exec('reset role');
  assert.equal((await db.query('select user_id from push_subscriptions where endpoint=$1', [endpoint(1)])).rows[0].user_id, users[2]);
});

await check('정리(prune)는 비밀값이 맞을 때만', async () => {
  await login(null);
  await db.exec('set role anon');
  await assert.rejects(db.query('select prune_push_subscriptions($1,$2)', ['wrong', [endpoint(3)]]), /권한/);
  await db.query('select prune_push_subscriptions($1,$2)', ['s'.repeat(40), [endpoint(3)]]);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from push_subscriptions where endpoint=$1', [endpoint(3)])).rows[0].n, 0);
});

await check('구독 삭제는 본인 것만', async () => {
  await login(users[0]);
  await db.query('select delete_push_subscription($1)', [endpoint(4)]); // 남의 것: 아무 일 없음
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from push_subscriptions where endpoint=$1', [endpoint(4)])).rows[0].n, 1);
});

await check('알림 전송이 실패해도 원래 저장은 된다', async () => {
  await db.exec('reset role; drop function net.http_post(text, jsonb, jsonb, jsonb, int)');
  await addTask(0, '전송 실패해도 저장');
  assert.equal((await db.query("select count(*)::int as n from tasks where title='전송 실패해도 저장'")).rows[0].n, 1);
});

console.log(`${count} web push checks passed`);
