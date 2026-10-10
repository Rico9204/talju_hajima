// node tests/evaluation-percentiles.test.mjs <directory containing @electric-sql/pglite>
// CCA(성향 보정 합의 평균) 미리보기: 문서(동료평가_3가지방식_예시요약.md) 예시 숫자가 그대로 나오는지, 내 점수만 돌려주는지.
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
await db.exec(readFileSync(new URL('../supabase/migrations/2610101200_evaluation_cca_preview.sql', import.meta.url), 'utf8'));

let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(userId) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId ?? '']);
  if (userId) await db.exec('set role authenticated');
}

const names = ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z', 'O'];
const user = Object.fromEntries(names.map((n, i) => [n, `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`]));
for (const id of Object.values(user)) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
const member = {};
async function addProject(projectId, people) {
  await login(null);
  await db.query("insert into projects(id,name,org,period,status) values($1,$1,'학교','2026-2','done')", [projectId]);
  for (const n of people) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user[n]]); // members.user_id는 트리거가 auth.uid()로 채운다
    const { rows } = await db.query("insert into members(project_id,name,role,major,student,avatar,color) values($1,$2,'역할','전공','1','A','#000') returning id", [projectId, n]);
    member[`${projectId}:${n}`] = rows[0].id;
  }
}
// ratings[준 사람][받은 사람] = 점수(5개 항목 모두 같은 값으로 넣는다 → 항목별 CCA도 종합 점수와 같아야 함)
async function evaluate(projectId, ratings) {
  await login(null);
  for (const [from, row] of Object.entries(ratings)) {
    const { rows } = await db.query("insert into peer_evaluation_submissions(project_id,evaluator_id,phase) values($1,$2,'final') returning id", [projectId, member[`${projectId}:${from}`]]);
    for (const [to, v] of Object.entries(row)) {
      await db.query("insert into peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality) values($1,$2,$3,$4,'final',$5,$5,$5,$5,$5)",
        [rows[0].id, projectId, member[`${projectId}:${from}`], member[`${projectId}:${to}`], v]);
    }
  }
}
const cca = async (projectId) => (await db.query("select cca_evaluation_average($1,'final') as r", [projectId])).rows[0].r;
const raw = async (projectId) => (await db.query("select my_evaluation_average($1,'final') as r", [projectId])).rows[0].r;
const round1 = (v) => Math.round(Number(v) * 10) / 10;

await addProject('five', ['A', 'B', 'C', 'D', 'E']);
await evaluate('five', {
  A: { B: 8, C: 6, D: 6, E: 2 },
  B: { A: 10, C: 9, D: 9, E: 8 },
  C: { A: 10, B: 10, D: 10, E: 10 },
  D: { A: 7, B: 5, C: 3, E: 1 },
  E: { A: 2, B: 6, C: 7, D: 10 },
});
await addProject('three', ['X', 'Y', 'Z']);
await evaluate('three', { X: { Y: 9, Z: 8 }, Y: { X: 10, Z: 1 }, Z: { X: 7, Y: 8 } });

await check('미리보기가 꺼져 있으면(기본값) 계산을 거절하고, 켜고 끄는 것은 관리자만', async () => {
  await login(user.A);
  assert.equal((await db.query('select evaluation_method_preview_enabled() as v')).rows[0].v, false);
  await assert.rejects(cca('five'), /꺼져 있습니다/);
  await assert.rejects(db.query('select set_evaluation_method_preview_enabled(true)'), /관리자만/);
  await login(null);
  await db.query("update profiles set is_admin = true where id = $1", [user.O]);
  await login(user.O);
  await db.query('select set_evaluation_method_preview_enabled(true)');
  await login(user.A);
  assert.equal((await db.query('select evaluation_method_preview_enabled() as v')).rows[0].v, true);
});

await check('5명 팀: 문서 예시와 같은 점수(A 7.5, B 7.8, C 7.0, D 7.8, E 5.1), 현재 방식 점수는 그대로', async () => {
  const expected = { A: [7.5, 7.3], B: [7.8, 7.3], C: [7.0, 6.3], D: [7.8, 8.8], E: [5.1, 5.3] };
  for (const [n, [ccaScore, rawScore]] of Object.entries(expected)) {
    await login(user[n]);
    const r = await cca('five');
    assert.equal(r.method, 'cca');
    assert.equal(r.available, true);
    assert.equal(round1(r.score), ccaScore, `${n} CCA`);
    assert.equal(round1((await raw('five')).score), rawScore, `${n} 현재 방식`);
    for (const k of ['role', 'deadline', 'communication', 'collaboration', 'quality']) assert.equal(round1(r.criteria[k]), ccaScore, `${n} ${k}`);
  }
});

await check('A가 받은 E의 보복 점수는 다른 평가자 기준(8.0) − 3 = 5.0으로 제한된다(평균 7.5)', async () => {
  await login(user.A);
  assert.equal(round1((await cca('five')).score), 7.5); // 제한이 없으면 (8+7+10+2.75)/4 = 6.9
});

await check('3명 팀: 평가자가 2명이면 제한 없이 보정만(X 9.2, Y 7.7, Z 4.7)', async () => {
  for (const [n, v] of [['X', 9.2], ['Y', 7.7], ['Z', 4.7]]) {
    await login(user[n]);
    assert.equal(round1((await cca('three')).score), v, n);
  }
});

await check('다른 프로젝트 사람은 조회할 수 없고, 로그인하지 않으면 거절', async () => {
  await login(user.O);
  await assert.rejects(cca('five'), /참여자만/);
  await login(null);
  await db.exec('set role anon');
  await assert.rejects(cca('five'), /permission denied/);
});

console.log(`${count} CCA preview checks passed`);
