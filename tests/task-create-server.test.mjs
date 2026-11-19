// node tests/task-create-server.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2611201800_member_create_task.sql', import.meta.url), 'utf8')); // 이미 적용된 스키마 위에서도 안전

// 0 팀장, 1 부팀장, 2 팀원, 3 다른 팀원, 4 다른 프로젝트 팀원, 5 외부인
const ids = [0, 1, 2, 3, 4, 5].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query("insert into projects(id,name,org,period,status) values('p','P','o','p','active'),('q','Q','o','p','active'),('done','D','o','p','done')");
const roles = [['p', 0, true, false], ['p', 1, false, true], ['p', 2, false, false], ['p', 3, false, false], ['q', 4, false, false], ['done', 2, false, false]];
const memberIds = {};
await db.exec('set session_replication_role = replica'); // 시험 데이터만: 팀장·부팀장 표시를 직접 넣는다(평소에는 전용 함수로만 바뀜)
for (const [project, i, leader, vice] of roles) {
  const row = (await db.query("insert into members(project_id,name,avatar,role,major,student,color,is_leader,is_vice_leader) values($1,$2,'A','member','m','s','#2563eb',$3,$4) returning id", [project, `사용자${i}`, leader, vice])).rows[0];
  await db.query('update members set user_id=$1, is_leader=$3, is_vice_leader=$4 where id=$2', [ids[i], row.id, leader, vice]); // 넣을 때의 팀장 표시는 트리거가 정리하므로 다시 채운다
  memberIds[`${project}${i}`] = row.id;
}
await db.exec('set session_replication_role = origin');
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
const create = async (i, project, assignees, over = {}) => {
  await login(i);
  const a = { title: '과제', priority: 'mid', due: '', tags: [], ...over };
  return (await db.query('select create_task($1,$2,$3::uuid[],$4,$5,$6::text[]) as id', [project, a.title, assignees, a.priority, a.due, a.tags])).rows[0].id;
};
const rejects = (promise, pattern) => assert.rejects(promise, pattern);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
const [L, V, M, M2] = [memberIds.p0, memberIds.p1, memberIds.p2, memberIds.p3];

await check('팀장·부팀장은 누구에게나 배정해 만들 수 있다', async () => {
  assert.ok(await create(0, 'p', [M]));
  assert.ok(await create(1, 'p', [M, M2]));
});
await check('팀원은 본인이 포함될 때만, 다른 팀원도 함께 넣을 수 있다', async () => {
  await rejects(create(2, 'p', [M2]), /본인이 담당자에 포함/);
  await rejects(create(2, 'p', [L, V]), /본인이 담당자에 포함/);
  const id = await create(2, 'p', [M2, M, M]); // 중복은 한 번만, 대표 담당자는 고른 순서의 첫 번째
  await login(0);
  const task = (await db.query('select status, assignee from tasks where id=$1', [id])).rows[0];
  assert.deepEqual(task, { status: 'todo', assignee: '사용자3' });
  assert.equal((await db.query('select count(*)::int n from task_assignees where task_id=$1', [id])).rows[0].n, 2);
});
await check('외부인·다른 프로젝트 팀원·종료된 프로젝트는 거부', async () => {
  await rejects(create(5, 'p', [M]), /참여자만/);
  await rejects(create(4, 'p', [M]), /참여자만/);
  await rejects(create(0, 'p', [memberIds.q4]), /팀원 중에서/); // 다른 프로젝트 팀원을 담당자로
  await rejects(create(2, 'done', [memberIds.done2]), /종료된 프로젝트/);
});
await check('입력 검증: 제목·담당자·우선순위·마감일·태그', async () => {
  await rejects(create(0, 'p', [M], { title: '  ' }), /제목/);
  await rejects(create(0, 'p', [M], { title: 'x'.repeat(201) }), /200자/);
  await rejects(create(0, 'p', []), /한 명 이상/);
  await rejects(create(0, 'p', [M], { priority: 'urgent' }), /우선순위/);
  await rejects(create(0, 'p', [M], { due: '12월 5일' }), /마감일/);
  await rejects(create(0, 'p', [M], { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }), /20개/);
  const id = await create(0, 'p', [M], { title: ' 발표 ', priority: 'high', due: '2026-12-05', tags: [' 발표 ', '발표', ''] });
  await login(0);
  assert.deepEqual((await db.query('select title, priority, due, tags from tasks where id=$1', [id])).rows[0], { title: '발표', priority: 'high', due: '2026-12-05', tags: ['발표'] });
});
await check('직접 쓰기는 여전히 팀장·부팀장만(팀원은 create_task로만)', async () => {
  await login(2);
  await rejects(db.query("insert into tasks(project_id,title,assignee,avatar,priority,due,status,color) values('p','몰래','x','x','mid','','todo','#000')"), /row-level security/);
});
console.log(`\n${count} passed`);
await db.close?.();
