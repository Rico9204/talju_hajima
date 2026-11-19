// node tests/evaluation-threshold-server.test.mjs <directory containing @electric-sql/pglite>
// 동료 평가: 남에게 보이는 점수의 최소 기준(공개 프로젝트 2개·평가한 동료 4명), 승인 담당 교수의 개별 평가 열람.
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
await db.exec(readFileSync(new URL('../supabase/migrations/2611202000_evaluation_disclosure_threshold.sql', import.meta.url), 'utf8')); // 이미 적용된 스키마 위에서도 안전
await db.query("update app_settings set value = false where key = 'evaluation_prototype_enabled'"); // 정식 공개 조건으로 검사

let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(userId) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId ?? '']);
  if (userId) await db.exec('set role authenticated');
}
// 0 담당 교수(pa·pc·pd 승인), 7 다른 교수(pb 승인), 1~6 학생
const users = Array.from({ length: 8 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
for (const id of users) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin = true where id = any($1::uuid[])', [[users[0], users[7]]]);
const memberOf = new Map();
async function addProject(projectId, userIdx, adminIdx = 0) {
  await login(null);
  await db.query("insert into projects(id,name,org,period,status,requested_admin_id,approval_status) values($1,$1,'학교','2026-2','done',$2,'approved')", [projectId, users[adminIdx]]);
  for (const i of userIdx) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i]]);
    const { rows } = await db.query("insert into members(project_id,name,role,major,student,avatar,color) values($1,$2,'역할','전공','1','A','#000') returning id", [projectId, `학생${i}`]);
    memberOf.set(`${projectId}:${i}`, rows[0].id);
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)");
}
async function evaluate(projectId, userIdx, from = userIdx) {
  await login(null);
  for (const f of from) {
    const { rows } = await db.query("insert into peer_evaluation_submissions(project_id,evaluator_id,phase) values($1,$2,'final') returning id", [projectId, memberOf.get(`${projectId}:${f}`)]);
    for (const to of userIdx) if (to !== f) {
      await db.query("insert into peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality) values($1,$2,$3,$4,'final',7,7,7,7,7)",
        [rows[0].id, projectId, memberOf.get(`${projectId}:${f}`), memberOf.get(`${projectId}:${to}`)]);
    }
  }
}
const otherScore = async (viewer, project, target) => { await login(users[viewer]); return (await db.query("select member_evaluation_average($1,$2,'final') as r", [project, memberOf.get(`${project}:${target}`)])).rows[0].r; };
const stats = async (viewer, target) => { await login(users[viewer]); return (await db.query('select member_participation_stats($1) as r', [users[target]])).rows[0].r; };
const ownRow = async (u, project) => { await login(users[u]); return (await db.query('select score, eval_count from visible_evaluation_members($1) where user_id=$2', [project, users[u]])).rows[0]; };

await addProject('pa', [1, 2, 3]);
await evaluate('pa', [1, 2, 3]);

await check('공개 프로젝트 1개·평가한 동료 2명: 남에게는 숨기고(수집 중) 본인은 본다', async () => {
  const r = await otherScore(2, 'pa', 1);
  assert.equal(r.available, false);
  assert.equal(r.collecting, true);
  assert.equal(r.score, null);
  assert.equal(Number((await ownRow(1, 'pa')).score), 7);
  const st = await stats(2, 1);
  assert.equal(st.evaluationProjects, 1);
  assert.equal(st.evaluationEvaluators, 2);
  assert.equal(st.requiredProjects, 2);
  assert.equal(st.requiredEvaluators, 4);
  assert.equal(st.scorePublic, false);
});

await check('모두 제출하지 않은 프로젝트는 개수에 들어가지 않는다', async () => {
  await addProject('pd', [1, 4, 5]);
  await evaluate('pd', [1, 4, 5], [4]); // 4만 제출
  const st = await stats(2, 1);
  assert.equal(st.evaluationProjects, 1);
  assert.equal(st.evaluationEvaluators, 2);
});

await check('공개 프로젝트 2개지만 평가한 동료 3명이면 아직 숨긴다', async () => {
  await addProject('pc', [1, 2, 6]);
  await evaluate('pc', [1, 2, 6]); // 평가자 2·3·6
  const st = await stats(3, 1);
  assert.deepEqual([st.evaluationProjects, st.evaluationEvaluators, st.scorePublic], [2, 3, false]);
  assert.equal((await otherScore(3, 'pa', 1)).available, false);
});

await check('공개 프로젝트 2개 + 평가한 동료 4명이 되면 남에게도 보인다', async () => {
  await addProject('pb', [1, 4, 5], 7);
  await evaluate('pb', [1, 4, 5]); // 평가자 2·3·4·5·6
  const st = await stats(2, 1);
  assert.deepEqual([st.evaluationProjects, st.evaluationEvaluators, st.scorePublic], [3, 5, true]);
  const r = await otherScore(2, 'pa', 1);
  assert.equal(r.available, true);
  assert.equal(Number(r.score), 7);
});

const raw = async (viewer, project) => { await login(users[viewer]); return (await db.query('select * from admin_project_evaluations($1)', [project])).rows; };
await check('승인 담당 교수는 개별 평가(누가 누구에게 몇 점)를 본다', async () => {
  const rows = await raw(0, 'pa');
  assert.equal(rows.length, 6); // 3명이 서로 2명씩
  assert.ok(rows.every((r) => r.phase === 'final' && r.evaluator_name.startsWith('학생') && r.role === 7));
  assert.equal((await raw(0, 'pd')).length, 2); // 제출이 덜 끝난 것도 그대로
});
await check('다른 교수의 프로젝트·학생·팀원은 개별 평가를 볼 수 없다', async () => {
  await assert.rejects(raw(0, 'pb'), /내가 승인한/);
  await assert.rejects(raw(1, 'pa'), /관리자만/);
  await assert.rejects(raw(2, 'pa'), /관리자만/);
});
console.log(`\n${count} passed`);
await db.close?.();
