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
await db.exec(readFileSync(new URL('../supabase/migrations/2610041400_workspace_folder_move_and_order.sql', import.meta.url), 'utf8')); // 이미 반영된 DB에 다시 실행해도 안전한지

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
for (const i of [1, 2]) { await login(i); await asFixture("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',$2)", [`사용자${i}`, i === 1]); }
await login(1); await asFixture("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('q','사용자1','팀원','','','팀','#123456',true)");
await login(0); await db.query("select review_project('p','approved')"); await db.query("select review_project('q','approved')");
const folder = async (who, pid, parent) => { await login(who); return (await db.query("insert into folders(project_id,name,color,created_by,parent_id) values($1,'폴더','#123456','사용자',$2) returning id", [pid, parent])).rows[0].id; };
const file = async (pid, folderId) => { await system(); return (await db.query("insert into files(project_id,name,type,uploader,avatar,size,folder_id) values($1,'보고서.pdf','pdf','사용자','팀','1 KB',$2) returning id", [pid, folderId])).rows[0].id; };
const move = async (who, id, parent) => { await login(who); await db.query('select move_workspace_folder($1,$2)', [id, parent]); };
const reorder = async (who, kind, list) => { await login(who); await db.query('select reorder_workspace_items($1,$2)', [kind, list]); };
const parentOf = async (id) => { await system(); return (await db.query('select parent_id from folders where id=$1', [id])).rows[0].parent_id; };

const a = await folder(2, 'p', null), b = await folder(2, 'p', null), a1 = await folder(2, 'p', a), a11 = await folder(2, 'p', a1);
await check('폴더를 다른 폴더 안으로, 다시 루트로 옮길 수 있다(하위 폴더도 함께 따라간다)', async () => {
  await move(1, a, b);
  assert.equal(await parentOf(a), b);
  assert.equal(await parentOf(a11), a1);
  await move(2, a, null);
  assert.equal(await parentOf(a), null);
});
await check('자기 자신이나 하위 폴더 안으로는 옮길 수 없다', async () => {
  await rejects(move(1, a, a), /자기 자신이나 하위 폴더/);
  await rejects(move(1, a, a11), /자기 자신이나 하위 폴더/);
});
await check('옮긴 뒤 하위 트리가 10단계를 넘으면 막고, 딱 10단계는 된다', async () => {
  let deep = null; const chain = [];
  for (let d = 1; d <= 8; d++) { deep = await folder(2, 'p', deep); chain.push(deep); } // 8단계 사슬
  await rejects(move(1, a, deep), /최대 10단계/); // 8 + a(3단계 트리) = 11
  await move(1, a1, chain[7]); // a1(2단계 트리) 8 + 2 = 10
  assert.equal(await parentOf(a1), chain[7]);
  assert.equal(await parentOf(a11), a1);
  await move(1, a1, a);
});
await check('다른 프로젝트의 폴더, 없는 폴더로는 옮길 수 없고 외부인·종료된 프로젝트는 막힌다', async () => {
  const other = await folder(1, 'q', null);
  await rejects(move(1, a, other), /옮길 폴더를 찾을 수 없습니다/);
  await rejects(move(1, a, 999999), /옮길 폴더를 찾을 수 없습니다/);
  await rejects(move(3, a, b), /참여자만 폴더를 옮길/);
  await system(); await db.query("update projects set status='done' where id='q'");
  const q2 = await (async () => { await system(); return (await db.query("insert into folders(project_id,name,color,created_by) values('q','폴더','#123456','사용자') returning id")).rows[0].id; })();
  await rejects(move(1, q2, other), /참여자만 폴더를 옮길/);
  await system(); await db.query("update projects set status='active' where id='q'");
});
await check('폴더를 앱에서 직접 고쳐 옮길 수는 없다(서버 함수로만)', async () => {
  await rejects((async () => { await login(1); await db.query('update folders set parent_id=$1 where id=$2', [b, a]); })(), /permission denied/);
  assert.equal(await parentOf(a), null);
});
await check('같은 상위 폴더의 폴더 순서를 바꾸고, 옮기면 새 위치의 맨 뒤로 간다', async () => {
  const c = await folder(2, 'p', null);
  await reorder(2, 'folder', [c, a, b]);
  await system();
  const order = async (parent) => { await system(); return (await db.query("select id from folders where project_id='p' and parent_id is not distinct from $1 order by sort_order nulls last, id", [parent])).rows.map((r) => r.id); };
  assert.deepEqual((await order(null)).slice(0, 3), [c, a, b]);
  const b1 = await folder(2, 'p', b), b2 = await folder(2, 'p', b); // 순서 없는 하위 폴더 둘(만든 순서)
  await move(1, c, b);
  assert.deepEqual(await order(b), [b1, b2, c]);
  await move(1, b1, null);
  assert.equal((await order(null)).at(-1), b1);
});
await check('일부만 보내면 보낸 것이 앞, 나머지는 지금 순서대로 그 뒤(번호가 겹치지 않음)', async () => {
  await system();
  const roots = (await db.query("select id from folders where project_id='p' and parent_id is null order by sort_order nulls last, id")).rows.map((r) => r.id);
  const last = roots.at(-1);
  await reorder(2, 'folder', [last]);
  await system();
  const after = (await db.query("select id, sort_order from folders where project_id='p' and parent_id is null order by sort_order nulls last, id")).rows;
  assert.deepEqual(after.map((r) => r.id), [last, ...roots.slice(0, -1)]);
  assert.deepEqual(after.map((r) => r.sort_order), after.map((_, i) => i + 1));
});
await check('다른 상위 폴더·다른 프로젝트·없는 id·중복이 섞이면 순서를 바꾸지 않는다', async () => {
  await rejects(reorder(1, 'folder', [a, a1]), /같은 폴더 안의 항목끼리만/);
  const other = await folder(1, 'q', null);
  await rejects(reorder(1, 'folder', [a, other]), /찾을 수 없습니다/);
  await rejects(reorder(1, 'folder', [a, 999999]), /찾을 수 없습니다/);
  await rejects(reorder(1, 'folder', [a, b, a]), /두 번/);
  await rejects(reorder(1, 'shape', [a]), /바꿀 수 없는 종류/);
  await rejects(reorder(3, 'folder', [a, b]), /참여자만 순서를/);
});
await check('파일 순서를 바꿔도 수정 시각은 그대로고, 다른 폴더로 옮기면 순서가 비워진다', async () => {
  const f1 = await file('p', a), f2 = await file('p', a), f3 = await file('p', b);
  await system();
  const before = (await db.query('select updated_at from files where id=$1', [f1])).rows[0].updated_at;
  await reorder(2, 'file', [f2, f1]);
  await system();
  const rows = (await db.query('select id, sort_order, updated_at from files where id = any($1) order by sort_order', [[f1, f2]])).rows;
  assert.deepEqual(rows.map((r) => [r.id, r.sort_order]), [[f2, 1], [f1, 2]]);
  assert.equal(String(rows.find((r) => r.id === f1).updated_at), String(before));
  await rejects(reorder(2, 'file', [f1, f3]), /같은 폴더 안의 항목끼리만/);
  await login(2); await db.query('select move_workspace_file($1,$2)', [f1, b]);
  await system();
  assert.equal((await db.query('select sort_order from files where id=$1', [f1])).rows[0].sort_order, null);
});
console.log(count + ' workspace-folder-move checks passed');
