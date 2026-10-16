// node tests/evaluation-percentiles.test.mjs <directory containing @electric-sql/pglite>
// 평가 점수 상위 %: 서비스 전체 사용자(최종 평가 공개된 사람) 기준, 10명 미만이면 비공개, 개별 점수는 내보내지 않음.
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
await db.exec(readFileSync(new URL('../supabase/migrations/2610011200_evaluation_percentiles.sql', import.meta.url), 'utf8'));

// 기본값은 테스트 모드(받은 평가 모두 공개). 정식 공개 조건(동료 2명 이상이 모두 제출)을 검사하려고 끈다.
await db.query("update app_settings set value = false where key = 'evaluation_prototype_enabled'");

let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(userId) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId ?? '']);
  if (userId) await db.exec('set role authenticated');
}

// 사용자 13명(0~12). 0~11은 3명씩 4개 프로젝트, 12는 평가가 끝나지 않은 프로젝트.
const users = Array.from({ length: 13 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
for (const id of users) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
const memberOf = new Map(); // `${project}:${user index}` -> member id
async function addProject(projectId, userIdx) {
  await login(null);
  await db.query("insert into projects(id,name,org,period,status) values($1,$1,'학교','2026-2','done')", [projectId]);
  for (const i of userIdx) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i]]); // members.user_id는 트리거가 auth.uid()로 채운다
    const { rows } = await db.query("insert into members(project_id,name,role,major,student,avatar,color) values($1,'팀원','역할','전공','1','A','#000') returning id", [projectId]);
    memberOf.set(`${projectId}:${i}`, rows[0].id);
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)");
}
// 받은 사람 i의 점수: 역할·소통·협업·품질 = min(10,i), 마감 = 10 - min(10,i). 사용자 10과 11은 동점.
const s = (i) => Math.min(10, i);
async function evaluateAll(projectId, userIdx) {
  await login(null);
  for (const from of userIdx) {
    const { rows } = await db.query("insert into peer_evaluation_submissions(project_id,evaluator_id,phase) values($1,$2,'final') returning id", [projectId, memberOf.get(`${projectId}:${from}`)]);
    for (const to of userIdx) if (to !== from) {
      await db.query("insert into peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality) values($1,$2,$3,$4,'final',$5,$6,$5,$5,$5)",
        [rows[0].id, projectId, memberOf.get(`${projectId}:${from}`), memberOf.get(`${projectId}:${to}`), s(to), 10 - s(to)]);
    }
  }
}
const percentiles = async (projectId = null, memberId = null) => (await db.query('select evaluation_percentiles($1,$2) as r', [projectId, memberId])).rows[0].r;

for (const [p, idx] of [['pa', [0, 1, 2]], ['pb', [3, 4, 5]], ['pc', [6, 7, 8]], ['pd', [9, 10, 11]], ['pe', [12, 0, 1]]]) await addProject(p, idx);
await evaluateAll('pa', [0, 1, 2]); await evaluateAll('pb', [3, 4, 5]); await evaluateAll('pc', [6, 7, 8]);
// pe: 한 명만 제출 → 아무도 공개 조건을 못 채움(비교 집단에 들어가지 않음)
await login(null);
{
  const { rows } = await db.query("insert into peer_evaluation_submissions(project_id,evaluator_id,phase) values('pe',$1,'final') returning id", [memberOf.get('pe:0')]);
  await db.query("insert into peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality) values($1,'pe',$2,$3,'final',0,0,0,0,0)", [rows[0].id, memberOf.get('pe:0'), memberOf.get('pe:12')]);
}

await check('비교 인원이 10명 미만(9명)이면 상위 %를 내지 않는다', async () => {
  await login(users[5]);
  assert.deepEqual(await percentiles(), { available: false, population: 9 });
});

await evaluateAll('pd', [9, 10, 11]);

await check('내 전체 평균의 위치: 가장 높으면 상위 9%(12명 중 1등), 동점은 같은 순위, 가장 낮으면 100%', async () => {
  await login(users[11]);
  const top = await percentiles();
  assert.equal(top.available, true);
  assert.equal(top.population, 12);
  assert.equal(top.overall, 9);
  await login(users[10]);
  assert.equal((await percentiles()).overall, 9); // 11과 동점
  await login(users[0]);
  const bottom = await percentiles();
  assert.equal(bottom.overall, 100);
  assert.equal(bottom.criteria.role, 100);
  assert.equal(bottom.criteria.deadline, 9); // 마감 준수는 반대로 가장 높다(10점, 12명 중 1등)
});

await check('다른 팀원: 그 프로젝트에서 보이는 점수의 위치(점수 1 → 12명 중 11등 → 상위 92%)', async () => {
  await login(users[0]);
  const r = await percentiles('pa', memberOf.get('pa:1'));
  assert.equal(r.available, true);
  assert.equal(r.overall, 92);
  assert.equal(r.criteria.role, 92);
});

await check('같은 프로젝트가 아니면 다른 사람의 위치를 볼 수 없다', async () => {
  await login(users[3]);
  await assert.rejects(percentiles('pa', memberOf.get('pa:1')), /참여자만/);
});

await check('평가가 끝나지 않은 사람은 비교 집단에 없고, 본인도 상위 %가 없다', async () => {
  await login(users[12]);
  assert.deepEqual(await percentiles(), { available: false, population: 12 });
  await login(users[1]);
  assert.deepEqual(await percentiles('pe', memberOf.get('pe:12')), { available: false, population: 12 });
});

await check('사용자별 평균 점수 목록은 직접 조회할 수 없다(순위 비율만 공개)', async () => {
  await login(users[0]);
  await assert.rejects(db.query('select * from evaluation_user_averages()'), /permission denied/);
});

await check('프로젝트와 팀원은 함께 지정해야 한다', async () => {
  await login(users[0]);
  await assert.rejects(percentiles('pa', null), /잘못된 요청/);
});

await check('로그인하지 않으면 조회할 수 없다', async () => {
  await login(null);
  await db.exec('set role anon');
  await assert.rejects(percentiles(), /permission denied/);
});

console.log(`${count} evaluation percentile checks passed`);
