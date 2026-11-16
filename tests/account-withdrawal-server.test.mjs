// node tests/account-withdrawal-server.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2611162100_account_withdrawal.sql', import.meta.url), 'utf8'));

const ids = [0, 1, 2, 3].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`); // 0 운영자, 1 일반 사용자, 2 프로젝트 참여자, 3 다른 일반 사용자
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_operator=true, is_admin=true where id=$1', [ids[0]]);
await db.query("insert into projects(id,name,org,period,status) values('pa','A','o','p','active')");
await db.query("insert into members(project_id,user_id,name,avatar,role,major,student,color) values('pa',$1,'참여자','참','member','m','s','#2563eb')", [ids[2]]);
await db.query("update members set user_id=$1 where project_id='pa'", [ids[2]]); // members.user_id는 가입 경로의 트리거가 비워 두므로 시험용으로 채운다
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);
const rpc = async (i, sql, params) => { await login(i); return (await db.query(sql, params)).rows; };
const system = async (sql, params) => { await db.exec('reset role'); return (await db.query(sql, params)).rows; };
const withdrawn = async () => (await system('select user_id from account_withdrawals order by user_id')).map((r) => r.user_id);

await check('탈퇴 신청: 참여한 프로젝트가 있거나 운영자면 거절, 사유 500자 제한', async () => {
  await rejects(rpc(2, "select withdraw_my_account('')"), /참여 중인 프로젝트/);
  await rejects(rpc(0, "select withdraw_my_account('')"), /운영자/);
  await rejects(rpc(1, 'select withdraw_my_account($1)', ['x'.repeat(501)]), /500자/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec('set role authenticated');
  await rejects(db.query("select withdraw_my_account('')"), /로그인이 필요/); // auth.uid()가 없는 호출
  assert.deepEqual(await withdrawn(), []);
});
await check('탈퇴 신청: 사유는 선택(없어도 됨), 이메일·이름이 기록되고 두 번은 신청할 수 없다', async () => {
  await rpc(1, 'select withdraw_my_account($1)', ['  사유  ']);
  await rpc(3, "select withdraw_my_account('')");
  const row = (await system('select email, display_name, reason from account_withdrawals where user_id = $1', [ids[1]]))[0];
  assert.equal(row.email, `${ids[1]}@example.test`);
  assert.equal(row.reason, '사유');
  assert.equal((await system('select reason from account_withdrawals where user_id = $1', [ids[3]]))[0].reason, '');
  await rejects(rpc(1, "select withdraw_my_account('')"), /이미 탈퇴 신청/);
});
await check('목록은 운영자만 읽을 수 있고, 표를 직접 고칠 수 없다', async () => {
  assert.equal((await rpc(0, 'select * from account_withdrawals')).length, 2);
  assert.equal((await rpc(1, 'select * from account_withdrawals')).length, 0);
  assert.equal((await rpc(2, 'select * from account_withdrawals')).length, 0);
  await rejects(rpc(1, "insert into account_withdrawals(user_id,email) values($1,'x')", [ids[2]]), /permission denied/);
  await rejects(rpc(0, "update account_withdrawals set requested_at = now() - interval '30 days'"), /permission denied/);
  await rejects(rpc(0, 'delete from account_withdrawals'), /permission denied/);
});
await check('복구 신청 함수는 사용자 권한으로는 부를 수 없다(서버 권한 전용)', async () => {
  await rejects(rpc(1, 'select request_account_recovery($1)', [ids[1]]), /permission denied/);
  await rejects(rpc(0, 'select request_account_recovery($1)', [ids[1]]), /permission denied/);
});
await check('복구 신청: 접수되면 한 번만, 14일이 지나면 못 한다', async () => {
  await rejects(system('select request_account_recovery($1)', [ids[2]]), /탈퇴 신청된 계정이 아닙니다/);
  await system('select request_account_recovery($1)', [ids[1]]);
  assert.ok((await system('select recovery_requested_at from account_withdrawals where user_id = $1', [ids[1]]))[0].recovery_requested_at);
  await rejects(system('select request_account_recovery($1)', [ids[1]]), /이미 복구를 신청/);
  await system("update account_withdrawals set requested_at = now() - interval '15 days' where user_id = $1", [ids[3]]);
  await rejects(system('select request_account_recovery($1)', [ids[3]]), /14일/);
});
await check('복구 처리는 운영자만: 거절하면 탈퇴 신청으로 돌아가고 재신청 불가, 승인하면 탈퇴 신청이 없어진다', async () => {
  await rejects(rpc(1, 'select approve_account_recovery($1)', [ids[1]]), /운영자만/);
  await rejects(rpc(1, 'select reject_account_recovery($1)', [ids[1]]), /운영자만/);
  await rejects(rpc(0, 'select approve_account_recovery($1)', [ids[3]]), /복구 신청을 찾을 수 없/); // 복구를 신청하지 않은 계정
  await rpc(0, 'select reject_account_recovery($1)', [ids[1]]);
  const after = (await system('select recovery_requested_at, recovery_rejected_at from account_withdrawals where user_id = $1', [ids[1]]))[0];
  assert.equal(after.recovery_requested_at, null);
  assert.ok(after.recovery_rejected_at);
  await rejects(system('select request_account_recovery($1)', [ids[1]]), /거절/);
  // 승인 경로는 다른 계정으로: 새로 탈퇴 신청 → 복구 신청 → 승인
  await system('delete from account_withdrawals where user_id = $1', [ids[3]]);
  await rpc(3, "select withdraw_my_account('')");
  await system('select request_account_recovery($1)', [ids[3]]);
  await rpc(0, 'select approve_account_recovery($1)', [ids[3]]);
  assert.ok(!(await withdrawn()).includes(ids[3]));
});
await check('탈퇴 승인(정보 삭제): 운영자만, 14일이 지나야 하고, 복구 신청이 접수된 계정은 안 된다', async () => {
  await rejects(rpc(1, 'select approve_account_withdrawal($1)', [ids[1]]), /운영자만/);
  await rejects(rpc(0, 'select approve_account_withdrawal($1)', [ids[1]]), /14일/);
  await rejects(rpc(0, 'select approve_account_withdrawal($1)', [ids[2]]), /탈퇴 신청을 찾을 수 없/);
  await system("update account_withdrawals set requested_at = now() - interval '15 days' where user_id = $1", [ids[1]]);
  // 복구가 접수된 상태에서는 14일이 지나도 지울 수 없다
  await system('update account_withdrawals set recovery_requested_at = now(), recovery_rejected_at = null where user_id = $1', [ids[1]]);
  await rejects(rpc(0, 'select approve_account_withdrawal($1)', [ids[1]]), /복구 신청이 접수/);
  await system('update account_withdrawals set recovery_requested_at = null where user_id = $1', [ids[1]]);
  await rpc(0, 'select approve_account_withdrawal($1)', [ids[1]]);
  assert.equal((await system('select count(*)::int as n from auth.users where id = $1', [ids[1]]))[0].n, 0);
  assert.equal((await system('select count(*)::int as n from profiles where id = $1', [ids[1]]))[0].n, 0);
  assert.ok(!(await withdrawn()).includes(ids[1]));
  assert.equal((await system('select count(*)::int as n from auth.users where id = $1', [ids[2]]))[0].n, 1); // 다른 계정은 그대로
});
console.log(`\n${count} passed`);
await db.close?.();
