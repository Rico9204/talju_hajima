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
// 마이그레이션 단독 파일도 이미 적용된 스키마 위에서 안전해야 한다.
await db.exec(readFileSync(new URL('../supabase/migrations/2609242150_board_poll.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/2609242200_board_poll_hardening.sql', import.meta.url), 'utf8'));

const ids = [0, 1, 2, 3].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0 작성자, 1·2 투표자, 3 관리자
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=$1', [ids[3]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);
const rpc = async (i, sql, params) => { await login(i); return (await db.query(sql, params)).rows; };

await login(0);
const post = async (title) => (await db.query("insert into board_posts(category,title,content,author_user_id) values('free',$1,'내용',$2) returning id", [title, ids[0]])).rows[0].id;
const p1 = await post('공개 투표'); const p2 = await post('익명 투표');
const create = async (postId, opts, extra = [false, false, null], who = 0) =>
  (await rpc(who, 'select create_board_poll($1,$2,$3::text[],$4,$5,$6) as id', [postId, '질문', opts, ...extra]))[0].id;
const optionIds = async (pollId) => (await db.query('select id from board_poll_options where poll_id=$1 order by sort_order', [pollId])).rows.map((r) => r.id);
const vote = (who, pollId, opts) => rpc(who, 'select cast_board_poll_vote($1,$2::bigint[])', [pollId, opts]);
const view = async (who, pollId) => rpc(who, 'select * from board_poll_votes_view($1::bigint[])', [[pollId]]);

let pub, anon, pubOpts, anonOpts;
await check('투표 생성은 작성자·관리자만, 항목 2~10개, 마감은 미래', async () => {
  await rejects(create(p1, ['가', '나'], [false, false, null], 1), /작성자만/);
  await rejects(create(p1, ['가']), /2~10개/);
  await rejects(create(p1, ['가', '나'], [false, false, '2020-01-01T00:00:00Z']), /이후/);
  pub = await create(p1, ['가', '나', '다'], [false, false, null]);
  anon = await create(p2, ['가', '나'], [true, true, null], 3); // 관리자가 익명·복수 투표 생성
  await rejects(create(p1, ['가', '나']), /이미 투표/);
  pubOpts = await optionIds(pub); anonOpts = await optionIds(anon);
  assert.equal(pubOpts.length, 3);
});
await check('테이블 직접 쓰기는 모두 막힌다(투표·항목·득표수 조작)', async () => {
  await login(1);
  await rejects(db.query('insert into board_poll_votes(poll_id,option_id,user_id) values($1,$2,$3)', [pub, pubOpts[0], ids[1]]), /permission denied/);
  await login(0);
  await rejects(db.query('update board_polls set closed=false where id=$1', [pub]), /permission denied/);
  await rejects(db.query('update board_poll_options set votes_count=99 where id=$1', [pubOpts[0]]), /permission denied/);
  await rejects(db.query("insert into board_poll_options(poll_id,text) values($1,'끼워넣기')", [pub]), /permission denied/);
  await rejects(db.query("insert into board_polls(post_id,question) values($1,'직접')", [p1]), /permission denied/);
});
await check('단일 선택 제한과 다른 투표의 항목 차단, 재투표는 바꿔치기', async () => {
  await rejects(vote(1, pub, [pubOpts[0], pubOpts[1]]), /복수 선택/);
  await rejects(vote(1, pub, [anonOpts[0]]), /올바르지 않은/);
  await vote(1, pub, [pubOpts[0]]);
  await vote(1, pub, [pubOpts[1]]);
  await vote(2, pub, [pubOpts[1]]);
  const counts = (await db.query('select votes_count from board_poll_options where poll_id=$1 order by sort_order', [pub])).rows.map((r) => r.votes_count);
  assert.deepEqual(counts, [0, 2, 0]);
});
await check('기명 투표는 투표자를 보여주고, 총 참여 인원을 계산할 수 있다', async () => {
  const rows = await view(2, pub);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.user_id).sort(), [ids[1], ids[2]].sort());
  assert.equal(new Set(rows.map((r) => r.voter_ref)).size, 2);
});
await check('익명 투표는 다른 사람의 user_id를 내려주지 않고, 직접 조회도 본인 표만', async () => {
  await vote(1, anon, [anonOpts[0], anonOpts[1]]); // 복수 허용
  await vote(2, anon, [anonOpts[0]]);
  const rows = await view(2, anon);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.filter((r) => r.user_id !== null).map((r) => r.user_id), [ids[2]]); // 내 표만 신원 표시
  assert.equal(new Set(rows.map((r) => r.voter_ref)).size, 2); // 참여 인원은 2명
  await login(2);
  const direct = (await db.query('select user_id from board_poll_votes where poll_id=$1', [anon])).rows;
  assert.deepEqual(direct.map((r) => r.user_id), [ids[2]]);
});
await check('마감하면 투표할 수 없다(작성자·관리자만 마감)', async () => {
  await rejects(rpc(1, 'select close_board_poll($1)', [pub]), /작성자 또는 관리자/);
  await rpc(0, 'select close_board_poll($1)', [pub]);
  await rejects(vote(1, pub, [pubOpts[2]]), /마감/);
  await rejects(vote(2, pub, []), /마감/);
});
console.log(count + ' board-poll-server checks passed');
