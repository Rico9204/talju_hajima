// node tests/evaluation-score-method.test.mjs <directory containing @electric-sql/pglite>
// 공식 점수 방식(원점수 평균 / CCA): 관리자가 CCA를 켜면 내 평균·팀원 평균·프로필 점수·상위 % 비교 집단이 모두 CCA로 바뀌는지.
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
await db.exec(readFileSync(new URL("../supabase/migrations/2610101200_evaluation_cca_preview.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/2610111200_evaluation_score_method.sql", import.meta.url), "utf8"));

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

const cca = async (projectId) => (await db.query("select cca_evaluation_average($1,'final') as r", [projectId])).rows[0].r;
const mine = async (projectId) => (await db.query("select my_evaluation_average($1,'final') as r", [projectId])).rows[0].r;
const memberAvg = async (projectId, n) => (await db.query("select member_evaluation_average($1,$2,'final') as r", [projectId, member[`${projectId}:${n}`]])).rows[0].r;
const visible = async (projectId) => (await db.query('select name, score::float8 as score, criteria_role::float8 as role from visible_evaluation_members($1)', [projectId])).rows;
const userAverages = async () => { await login(null); return Object.fromEntries((await db.query('select user_id, score::float8 as score from evaluation_user_averages()')).rows.map((r) => [r.user_id, r.score])); };
const setOfficial = async (enabled) => { await login(user.O); await db.query('select set_evaluation_score_cca_enabled($1)', [enabled]); };
const ccaScore = { A: 7.5, B: 7.8, C: 7.0, D: 7.8, E: 5.1 };
const rawScore = { A: 7.3, B: 7.3, C: 6.3, D: 8.8, E: 5.3 };

await login(null);
await db.query('update profiles set is_admin = true where id = $1', [user.O]);

await check('기본은 원점수 평균(method raw), 켜고 끄는 것은 관리자만', async () => {
  await login(user.A);
  assert.equal((await db.query('select evaluation_score_cca_enabled() as v')).rows[0].v, false);
  const r = await mine('five');
  assert.equal(r.method, 'raw');
  assert.equal(round1(r.score), rawScore.A);
  await assert.rejects(db.query('select set_evaluation_score_cca_enabled(true)'), /관리자만/);
  const averages = await userAverages();
  assert.equal(round1(averages[user.B]), rawScore.B);
});

await check('CCA를 켜면 내 평균·팀원 평균·프로필 점수(visible_evaluation_members)가 모두 CCA', async () => {
  await setOfficial(true);
  for (const n of Object.keys(ccaScore)) {
    await login(user[n]);
    const r = await mine('five');
    assert.equal(r.method, 'cca', n);
    assert.equal(round1(r.score), ccaScore[n], `${n} 내 평균`);
    for (const k of ['role', 'deadline', 'communication', 'collaboration', 'quality']) assert.equal(round1(r.criteria[k]), ccaScore[n], `${n} ${k}`);
    const [own] = (await db.query('select score::float8 as score from visible_evaluation_members() where project_id = $1', ['five'])).rows;
    assert.equal(round1(own.score), ccaScore[n], `${n} 내 프로젝트 목록`);
  }
  await login(user.A);
  assert.equal(round1((await memberAvg('five', 'B')).score), ccaScore.B);
  for (const row of await visible('five')) {
    assert.equal(round1(row.score), ccaScore[row.name], `${row.name} 팀원 프로필`);
    assert.equal(round1(row.role), ccaScore[row.name], `${row.name} 항목`);
  }
});

await check('상위 % 비교 집단도 CCA(3명 팀 X 9.2, Y 7.7, Z 4.7)', async () => {
  const averages = await userAverages();
  for (const n of Object.keys(ccaScore)) assert.equal(round1(averages[user[n]]), ccaScore[n], n);
  for (const [n, v] of [['X', 9.2], ['Y', 7.7], ['Z', 4.7]]) assert.equal(round1(averages[user[n]]), v, n);
});

await check('미리보기는 공식 방식과 관계없이 고른 방식으로, 꺼져 있으면 거절', async () => {
  await login(user.A);
  await assert.rejects(db.query("select evaluation_average_preview('five','final','raw')"), /꺼져 있습니다/);
  await login(user.O);
  await db.query('select set_evaluation_method_preview_enabled(true)');
  await login(user.A);
  const preview = async (method) => (await db.query("select evaluation_average_preview('five','final',$1) as r", [method])).rows[0].r;
  assert.equal(round1((await preview('raw')).score), rawScore.A);
  assert.equal((await preview('raw')).method, 'raw');
  assert.equal(round1((await preview('cca')).score), ccaScore.A);
  await assert.rejects(preview('zscore'), /raw 또는 cca/);
  assert.equal(round1((await cca('five')).score), ccaScore.A);
});

await check('내부 계산 함수는 직접 부를 수 없고, 끄면 바로 원점수 평균으로 돌아간다', async () => {
  await login(user.A);
  await assert.rejects(db.query("select evaluation_scores_by_method('five',$1,'final','cca')", [member['five:A']]), /permission denied/);
  await setOfficial(false);
  await login(user.A);
  assert.equal(round1((await mine('five')).score), rawScore.A);
  for (const row of await visible('five')) assert.equal(round1(row.score), rawScore[row.name], row.name);
});

console.log(`${count} evaluation score method checks passed`);
