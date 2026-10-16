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
await db.exec(readFileSync(new URL('../supabase/migrations/2609242300_board_post_reports.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/2609242330_board_reports_operator_only.sql', import.meta.url), 'utf8'));

const ids = [0, 1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0 작성자, 1·2 신고자, 3 운영자, 4 일반 관리자
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true, is_operator=true where id=$1', [ids[3]]);
await db.query('update profiles set is_admin=true where id=$1', [ids[4]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);
const rpc = async (i, sql, params) => { await login(i); return (await db.query(sql, params)).rows; };

await login(0);
const postId = (await db.query("insert into board_posts(category,title,content,author_user_id) values('free','글','내용',$1) returning id", [ids[0]])).rows[0].id;
const report = (who, reason = 'spam', detail = '') => rpc(who, 'select report_board_post($1,$2,$3) as id', [postId, reason, detail]);

let r1;
await check('신고: 본인 글·잘못된 사유·없는 글은 거절', async () => {
  await rejects(report(0), /본인 게시글/);
  await rejects(report(1, 'nope'), /사유/);
  await rejects(rpc(1, "select report_board_post(999999,'spam','') as id"), /찾을 수 없/);
  await rejects(report(1, 'spam', 'x'.repeat(501)), /500자/);
});
await check('신고: 1인 1회, 다른 사용자는 각각 가능', async () => {
  r1 = (await report(1, 'abuse', '욕설이 있어요'))[0].id;
  await rejects(report(1, 'spam'), /이미 신고/);
  await report(2, 'spam');
});
await check('신고 내용은 신고자 본인과 운영자만 볼 수 있고, 직접 쓸 수 없다', async () => {
  await login(1); assert.equal((await db.query('select * from board_post_reports')).rows.length, 1);
  await login(0); assert.equal((await db.query('select * from board_post_reports')).rows.length, 0); // 작성자는 못 봄
  await login(4); assert.equal((await db.query('select * from board_post_reports')).rows.length, 0); // 일반 관리자는 못 봄
  await login(3); assert.equal((await db.query('select * from board_post_reports')).rows.length, 2);
  await login(1);
  await rejects(db.query("insert into board_post_reports(post_id,reporter_user_id,reason) values($1,$2,'spam')", [postId, ids[2]]), /permission denied/);
  await rejects(db.query("update board_post_reports set status='dismissed'"), /permission denied/);
  await rejects(db.query('delete from board_post_reports'), /permission denied/);
});
await check('처리는 운영자만(일반 관리자 불가), 처리 후 상태와 처리자가 기록된다', async () => {
  await rejects(rpc(1, "select review_board_report($1,'dismissed')", [r1]), /운영자만/);
  await rejects(rpc(4, "select review_board_report($1,'dismissed')", [r1]), /운영자만/);
  await rejects(rpc(3, "select review_board_report($1,'open')", [r1]), /올바르지 않은/);
  await rpc(3, "select review_board_report($1,'resolved')", [r1]);
  const row = (await db.query('select status,reviewed_by from board_post_reports where id=$1', [r1])).rows[0];
  assert.equal(row.status, 'resolved'); assert.equal(row.reviewed_by, ids[3]);
});
await check('하루 20건 제한', async () => {
  await login(0);
  const posts = [];
  for (let i = 0; i < 21; i++) posts.push((await db.query("insert into board_posts(category,title,content,author_user_id) values('free','글','내용',$1) returning id", [ids[0]])).rows[0].id);
  await login(3);
  for (const p of posts.slice(0, 20)) await db.query("select report_board_post($1,'spam','')", [p]);
  await rejects(db.query("select report_board_post($1,'spam','')", [posts[20]]), /하루/);
});
await check('게시글이 삭제돼도 신고 기록은 스냅샷과 함께 남는다', async () => {
  await login(0);
  const gone = (await db.query("insert into board_posts(category,title,content,author_user_id) values('free','지울 글','본문 내용',$1) returning id", [ids[0]])).rows[0].id;
  await rpc(1, "select report_board_post($1,'other','') as id", [gone]);
  await login(0); await db.query('delete from board_posts where id=$1', [gone]);
  await login(3);
  const row = (await db.query("select post_id, post_title, post_excerpt from board_post_reports where post_title='지울 글'")).rows[0];
  assert.equal(row.post_id, null); assert.equal(row.post_excerpt, '본문 내용');
});
console.log(count + ' board-report checks passed');
