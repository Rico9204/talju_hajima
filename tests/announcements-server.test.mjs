// node tests/announcements-server.test.mjs <directory containing @electric-sql/pglite>
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
// 마이그레이션 단독 파일도 이미 적용된 스키마 위에서 안전해야 한다(예전 파일을 다시 돌린 뒤 새 파일을 두 번 돌려도).
await db.exec(readFileSync(new URL('../supabase/migrations/2611161700_announcements.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/2611201600_announcement_scopes.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/2611201600_announcement_scopes.sql', import.meta.url), 'utf8'));

// 0 운영자(관리자 겸), 1 pa 참여자, 2 비참여자, 3 pb 참여자, 4 교수 관리자(pa·pc의 승인 담당), 5 다른 교수 관리자(pb의 승인 담당)
const ids = [0, 1, 2, 3, 4, 5].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true, is_operator=true where id=$1', [ids[0]]);
await db.query("update profiles set is_admin=true, display_name='김교수' where id=$1", [ids[4]]);
await db.query('update profiles set is_admin=true where id=$1', [ids[5]]);
await db.query("insert into projects(id,name,org,period,status,requested_admin_id,approval_status) values('pa','A','o','p','active',$1,'approved'),('pb','B','o','p','active',$2,'approved'),('pc','C','o','p','active',$1,'pending')", [ids[4], ids[5]]);
await db.query("insert into members(project_id,user_id,name,avatar,role,major,student,color) values('pa',$1,'참여자','참','member','m','s','#2563eb'),('pb',$2,'다른','다','member','m','s','#2563eb')", [ids[1], ids[3]]);
// members.user_id는 가입 경로의 트리거가 비워 두므로, 시험용으로 직접 채운다.
await db.query("update members set user_id=$1 where project_id='pa'", [ids[1]]);
await db.query("update members set user_id=$1 where project_id='pb'", [ids[3]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);
const rpc = async (i, sql, params) => { await login(i); return (await db.query(sql, params)).rows; };
const today = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text as d")).rows[0].d;
const create = (who, over = {}) => {
  const a = { title: '제목', body: '내용', start: today, end: today, all: true, ids: [], priority: 'normal', ...over };
  return rpc(who, 'select create_announcement($1,$2,$3::date,$4::date,$5,$6::text[],$7) as id', [a.title, a.body, a.start, a.end, a.all, a.ids, a.priority]);
};
const visible = async (i) => (await rpc(i, 'select id from announcements order by id')).map((r) => r.id);

await check('관리자·운영자만 만들고 지울 수 있다', async () => {
  await rejects(create(1), /관리자만/);
  await rejects(rpc(1, 'select delete_announcement(1)'), /관리자만/);
  await rejects(rpc(1, "insert into announcements(title,body,start_date,end_date) values('x','y',now(),now())"), /permission denied/);
});
await check('입력 검증: 제목·내용·기간·중요도·대상', async () => {
  await rejects(create(0, { title: '  ' }), /제목/);
  await rejects(create(0, { body: '' }), /내용/);
  await rejects(create(0, { start: '2026-02-02', end: '2026-02-01' }), /기간/);
  await rejects(create(0, { start: '2026-01-01', end: '2027-06-01' }), /1년/);
  await rejects(create(0, { priority: 'loud' }), /중요도/);
  await rejects(create(4, { all: false, ids: [] }), /대상/);
});
await check('시스템 공지(전체)는 운영자만, 교수 관리자는 보낼 수 없다', async () => {
  await rejects(create(4), /운영자만/);
  await rejects(create(5), /운영자만/);
});
await check('프로젝트 공지는 내가 승인 담당이고 승인한 프로젝트에만', async () => {
  await rejects(create(4, { all: false, ids: ['pb'] }), /내가 승인한/); // 다른 교수의 프로젝트
  await rejects(create(4, { all: false, ids: ['pa', 'pb'] }), /내가 승인한/); // 하나라도 섞이면 거부
  await rejects(create(4, { all: false, ids: ['pc'] }), /내가 승인한/); // 아직 승인 전
  await rejects(create(4, { all: false, ids: ['nope'] }), /내가 승인한/);
  await rejects(create(0, { all: false, ids: ['pa'] }), /내가 승인한/); // 운영자라도 남이 승인 담당인 프로젝트에는 못 보낸다
});
let allId, paId, pbId;
await check('시스템 공지는 모두에게, 프로젝트 공지는 그 프로젝트 참여자·쓴 교수·운영자에게만 보인다', async () => {
  allId = (await create(0, { priority: 'urgent' }))[0].id;
  paId = (await create(4, { title: 'A만', all: false, ids: ['pa', 'pa'], priority: 'important' }))[0].id;
  pbId = (await create(5, { title: 'B만', all: false, ids: ['pb'] }))[0].id;
  assert.deepEqual(await visible(1), [allId, paId]);
  assert.deepEqual(await visible(2), [allId]);
  assert.deepEqual(await visible(3), [allId, pbId]);
  assert.deepEqual(await visible(4), [allId, paId]); // 다른 교수의 공지는 안 보인다
  assert.deepEqual(await visible(0), [allId, paId, pbId]);
  const [row] = await rpc(1, 'select priority, author_name, project_ids from announcements where id=$1', [paId]);
  assert.deepEqual(row, { priority: 'important', author_name: '김교수', project_ids: ['pa'] }); // 대상 중복은 한 번만
});
await check('확인했어요: 받는 공지에만, 본인 기록만 보이고, 확인 인원 수는 쓴 교수·운영자만', async () => {
  await rejects(rpc(2, 'select mark_announcement_read($1)', [paId]), /찾을 수 없/); // 대상이 아닌 공지
  await rejects(rpc(4, 'select mark_announcement_read($1)', [paId]), /찾을 수 없/); // 쓴 교수는 받는 사람이 아니다
  await rpc(1, 'select mark_announcement_read($1)', [paId]);
  await rpc(1, 'select mark_announcement_read($1)', [paId]); // 두 번 눌러도 오류 없음
  await rpc(2, 'select mark_announcement_read($1)', [allId]);
  assert.equal((await rpc(1, 'select * from announcement_reads')).length, 1);
  assert.equal((await rpc(3, 'select * from announcement_reads')).length, 0);
  await rejects(rpc(1, 'insert into announcement_reads(announcement_id,user_id) values($1,$2)', [paId, ids[1]]), /permission denied/);
  assert.deepEqual(await rpc(4, 'select * from announcement_read_counts()'), [{ announcement_id: paId, recipients: 1, reads: 1 }]);
  assert.deepEqual((await rpc(5, 'select * from announcement_read_counts()')).map((r) => r.announcement_id), [pbId]);
  assert.equal((await rpc(0, 'select * from announcement_read_counts()')).length, 2); // 운영자는 프로젝트 공지 모두(시스템 공지는 세지 않음)
  assert.deepEqual(await rpc(1, 'select * from announcement_read_counts()'), []); // 팀원은 확인 인원 수를 못 본다
});
await check('다시 보지 않기: 내가 볼 수 있는 공지에만, 사용자별로 기록된다', async () => {
  await rejects(rpc(2, 'select dismiss_announcement($1)', [paId]), /찾을 수 없/);
  await rpc(1, 'select dismiss_announcement($1)', [allId]);
  await rpc(1, 'select dismiss_announcement($1)', [allId]);
  assert.equal((await rpc(1, 'select * from announcement_dismissals')).length, 1);
  assert.equal((await rpc(2, 'select * from announcement_dismissals')).length, 0);
});
await check('삭제: 교수는 자기 공지만, 운영자는 모두. 지우면 확인·숨김 기록도 사라진다', async () => {
  await rejects(rpc(4, 'select delete_announcement($1)', [pbId]), /권한/);
  await rejects(rpc(4, 'select delete_announcement($1)', [allId]), /권한/);
  await rpc(4, 'select delete_announcement($1)', [paId]);
  assert.equal((await rpc(1, 'select * from announcement_reads')).length, 0);
  await rpc(0, 'select delete_announcement($1)', [pbId]);
  await rpc(0, 'select delete_announcement($1)', [allId]);
  assert.equal((await rpc(1, 'select * from announcement_dismissals')).length, 0);
  await rejects(rpc(0, 'select delete_announcement($1)', [allId]), /찾을 수 없/);
});
console.log(`\n${count} passed`);
await db.close?.();
