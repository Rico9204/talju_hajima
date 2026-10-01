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
await db.exec(readFileSync(new URL('../supabase/migrations/2610012100_rotating_join_code.sql', import.meta.url), 'utf8'));

const userIds = [0, 1, 2, 3].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0: 관리자, 1: 팀장, 2: 팀원, 3: 제3자
for (const id of userIds) {
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"테스터\"}')", [id, `${id}@example.test`]);
}
await db.query('update profiles set is_admin=true where id=$1', [userIds[0]]);

async function login(i) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userIds[i]]);
  await db.exec('set role authenticated');
}

const rejects = (fn, pattern) => assert.rejects(fn, pattern);
const rpc = async (i, sql, params = []) => {
  await login(i);
  return (await db.query(sql, params)).rows;
};

// 1. 같은 이름으로 2개의 프로젝트 생성 시 join_code와 id가 중복되지 않음
await login(1);
const p1Res = await db.query(`
  insert into projects (id, name, org, period, status, start_date, end_date, requested_admin_id, approval_status)
  values ('project-alpha-1', '캡스톤 프로젝트', '컴공과', '2026', 'active', '2026-09-01', '2026-12-31', $1, 'approved')
  returning id, name, join_code, join_code_expires_at
`, [userIds[0]]);
const p1 = p1Res.rows[0];

const p2Res = await db.query(`
  insert into projects (id, name, org, period, status, start_date, end_date, requested_admin_id, approval_status)
  values ('project-alpha-2', '캡스톤 프로젝트', '컴공과', '2026', 'active', '2026-09-01', '2026-12-31', $1, 'approved')
  returning id, name, join_code, join_code_expires_at
`, [userIds[0]]);
const p2 = p2Res.rows[0];

assert.ok(p1.join_code, 'p1에 join_code가 자동 생성되어야 함');
assert.ok(p2.join_code, 'p2에 join_code가 자동 생성되어야 함');
assert.notEqual(p1.join_code, p2.join_code, '이름이 같아도 join_code는 달라야 함');
assert.ok(p1.join_code.includes('캡스톤'), 'join_code에 프로젝트 이름 슬러그가 반영되어야 함');

// 팀장 멤버 등록 (p1)
await db.query(`
  insert into members (project_id, user_id, name, role, major, student, avatar, color, is_leader)
  values ($1, $2, '팀장', '팀장', '컴공', '20210001', '팀', '#2563eb', true)
`, [p1.id, userIds[1]]);

// 2. lookup_project_by_join_code: 유효 시간(6시간) 내 정상 조회
const lookedUp = await rpc(3, 'select lookup_project_by_join_code($1) as data', [p1.join_code]);
assert.equal(lookedUp[0].data.id, p1.id);
assert.equal(lookedUp[0].data.join_code, p1.join_code);

// 3. 만료된 경우 (join_code_expires_at <= now()) lookup_project_by_join_code 호출 시 에러
await login(1);
await db.query("update projects set join_code_expires_at = now() - interval '1 minute' where id = $1", [p1.id]);
await rejects(
  rpc(3, 'select lookup_project_by_join_code($1) as data', [p1.join_code]),
  /참여 코드가 만료되었습니다/
);

// 4. get_or_rotate_join_code: 만료된 상태에서 팀원이 조회하면 자동으로 새 코드로 회전됨
const autoRotated = await rpc(1, 'select get_or_rotate_join_code($1) as data', [p1.id]);
const newCode = autoRotated[0].data.join_code;
assert.notEqual(newCode, p1.join_code, '만료 후 get_or_rotate 시 새 코드로 변경되어야 함');

// 이제 새 코드로 조회하면 성공
const lookedUpNew = await rpc(3, 'select lookup_project_by_join_code($1) as data', [newCode]);
assert.equal(lookedUpNew[0].data.id, p1.id);

// 관리자로 프로젝트 승인
await login(0);
await db.query("select review_project($1, 'approved')", [p1.id]);

// 부팀장 멤버 등록 (userIds[2])
await login(2);
const viceMemberId = (await db.query(`
  insert into members (project_id, name, role, major, student, avatar, color)
  values ($1, '부팀장', '팀원', '컴공', '20210002', '부', '#8b5cf6')
  returning id
`, [p1.id])).rows[0].id;

// 팀장(userIds[1])이 부팀장 임명
await login(1);
await db.query('select set_vice_leader($1, true)', [viceMemberId]);

// 일반 팀원 등록 (userIds[3])
await login(3);
await db.query(`
  insert into members (project_id, name, role, major, student, avatar, color)
  values ($1, '일반팀원', '팀원', '컴공', '20210003', '원', '#10b981')
`, [p1.id]);

// 5. rotate_project_join_code 권한 검증:
// - 일반 팀원(userIds[3]) 호출 시 실패
await rejects(
  rpc(3, 'select rotate_project_join_code($1) as data', [p1.id]),
  /팀장 또는 부팀장만/
);

// - 팀장(userIds[1]) 수동 갱신 성공
const leaderRotate = await rpc(1, 'select rotate_project_join_code($1) as data', [p1.id]);
assert.ok(leaderRotate[0].data.join_code);
assert.notEqual(leaderRotate[0].data.join_code, newCode);

// - 부팀장(userIds[2]) 수동 갱신 성공
const viceLeaderRotate = await rpc(2, 'select rotate_project_join_code($1) as data', [p1.id]);
assert.ok(viceLeaderRotate[0].data.join_code);
assert.notEqual(viceLeaderRotate[0].data.join_code, leaderRotate[0].data.join_code);

console.log('PASS rotating-join-code tests all completed successfully');
