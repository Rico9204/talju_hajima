// node tests/chat-tools-server.test.mjs <directory containing @electric-sql/pglite>
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
await db.exec(readFileSync(new URL('../supabase/migrations/2609242100_chat_tools_server.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/2609250200_chat_tool_create_atomic.sql', import.meta.url), 'utf8'));

// 0 관리자, 1 만든 사람(팀장), 2·3 팀원, 4 프로젝트 밖
const ids = [0, 1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`);
for (const id of ids) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"display_name\":\"사용자\"}')", [id, `${id}@example.test`]);
await db.query('update profiles set is_admin=true where id=$1', [ids[0]]);
let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
async function login(i) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]); await db.exec('set role authenticated'); }
const rejects = (fn, pattern) => assert.rejects(fn, pattern);
async function rpc(i, sql, params) { await login(i); return (await db.query(sql, params)).rows[0].r; }

await login(1);
await db.query("insert into projects(id,name,org,period,status,start_date,end_date,requested_admin_id,approval_status) values('p','프로젝트','학교','기간','active','2026-09-01','2026-10-01',$1,'approved')", [ids[0]]);
const mem = [];
for (const i of [1, 2, 3]) {
  await login(i);
  mem[i] = (await db.query("insert into members(project_id,name,role,major,student,avatar,color,is_leader) values('p',$1,'팀원','','','팀','#123456',$2) returning id", [`사용자${i}`, i === 1])).rows[0].id;
}
await login(0); await db.query("select review_project('p','approved')");

async function post(i, payload) {
  await login(i);
  return (await db.query("insert into chat_messages(project_id,channel_id,sender_id,text) values('p','all',$1,$2) returning id", [mem[i], '[TALJU_CHAT_TOOL]:' + JSON.stringify(payload)])).rows[0].id;
}
const pick = (msg, who, itemId) => rpc(who, 'select chat_tool_act($1,$2,$3::jsonb) as r', [msg, 'draw_pick', JSON.stringify({ itemId })]);

const drawMsg = await post(1, { type: 'draw', server: true, data: { title: '커피' } });
const drawItems = JSON.stringify({ items: [{ label: '당첨', isWinner: true }, { label: '꽝', isWinner: false }, { label: '꽝', isWinner: false }] });
await check('제비뽑기: 만든 사람만 준비하고, 정답 테이블은 직접 읽을 수 없다', async () => {
  await rejects(rpc(2, 'select chat_tool_init($1,$2::jsonb) as r', [drawMsg, drawItems]), /만든 사람만/);
  const init = await rpc(1, 'select chat_tool_init($1,$2::jsonb) as r', [drawMsg, drawItems]);
  assert.equal(init.event, 'init'); assert.equal(init.data.total, 3); assert.equal(init.data.winnerCount, 1);
  assert.equal(JSON.stringify(init).includes('isWinner'), false); // 준비 이벤트는 정답을 담지 않는다
  await rejects(db.query('select * from chat_tool_secrets'), /permission denied/);
  await rejects(rpc(1, 'select chat_tool_init($1,$2::jsonb) as r', [drawMsg, drawItems]), /이미 준비/);
});
await check('제비뽑기: 서버가 알려준 결과가 3장 중 당첨 1장, 같은 제비는 한 번만', async () => {
  const seen = [];
  for (const id of [1, 2, 3]) { const ev = await pick(drawMsg, 2, id); seen.push(ev.data); assert.equal(ev.actorMemberId, mem[2]); }
  assert.equal(seen.filter((d) => d.isWinner).length, 1);
  await rejects(pick(drawMsg, 3, 1), /이미 열린/);
  await rejects(pick(drawMsg, 3, 99), /없는 제비/);
});
await check('제비뽑기: 전체 공개는 만든 사람만, 두 번 눌러도 같은 이벤트', async () => {
  await rejects(rpc(2, 'select chat_tool_act($1,$2,$3::jsonb) as r', [drawMsg, 'draw_reveal_all', '{}']), /만든 사람만/);
  const ev = await rpc(1, 'select chat_tool_act($1,$2,$3::jsonb) as r', [drawMsg, 'draw_reveal_all', '{}']);
  assert.equal(ev.data.items.length, 3);
  const again = await rpc(1, 'select chat_tool_act($1,$2,$3::jsonb) as r', [drawMsg, 'draw_reveal_all', '{}']);
  assert.equal(again.id, ev.id);
});
await check('이벤트는 참여자만 조회하고 직접 쓸 수 없다', async () => {
  await login(2); assert.ok((await db.query('select 1 from chat_tool_events where message_id=$1', [drawMsg])).rows.length >= 5);
  await login(4); assert.equal((await db.query('select 1 from chat_tool_events')).rows.length, 0);
  await rejects(rpc(4, 'select chat_tool_act($1,$2,$3::jsonb) as r', [drawMsg, 'draw_pick', '{"itemId":1}']), /찾을 수 없|참여자/);
  await login(2);
  await rejects(db.query("insert into chat_tool_events(message_id,project_id,kind,event) values($1,'p','draw','draw_pick')", [drawMsg]), /permission denied/);
});

const participants = [0, 1, 2, 3].map((n) => ({ id: `m${n}`, name: `이름${n}`, avatar: '가', color: '#111' }));
const ladderMsg = await post(1, { type: 'ladder', server: true, data: { title: '사다리', participants, results: ['A', 'B', 'C', 'D'] } });
await check('사다리: 서버가 선을 만들고, 모든 참가자가 서로 다른 결과에 도착', async () => {
  const init = await rpc(1, "select chat_tool_init($1,'{}'::jsonb) as r", [ladderMsg]);
  assert.ok(init.data.lines.length > 0); assert.equal(init.data.matches.length, 4);
  assert.deepEqual(init.data.matches.map((m) => m.resultText).sort(), ['A', 'B', 'C', 'D']);
  for (const l of init.data.lines) assert.ok(l.fromCol >= 0 && l.fromCol <= 2 && l.step >= 0 && l.step < init.data.numSteps);
  const a = await rpc(2, "select chat_tool_act($1,'ladder_reveal','{}'::jsonb) as r", [ladderMsg]);
  const b = await rpc(3, "select chat_tool_act($1,'ladder_reveal','{}'::jsonb) as r", [ladderMsg]);
  assert.equal(a.id, b.id);
});

const rouletteMsg = await post(1, { type: 'roulette', server: true, data: { title: '점심', options: [{ id: 'o1', text: 'a', color: '#1' }, { id: 'o2', text: 'b', color: '#2' }, { id: 'o3', text: 'c', color: '#3' }] } });
await check('룰렛: 서버가 항목 중 하나를 정하고 첫 결과만 인정', async () => {
  await rejects(rpc(2, "select chat_tool_act($1,'roulette_spin','{}'::jsonb) as r", [rouletteMsg]), /준비되지/);
  await rpc(1, "select chat_tool_init($1,'{}'::jsonb) as r", [rouletteMsg]);
  const first = await rpc(2, "select chat_tool_act($1,'roulette_spin','{}'::jsonb) as r", [rouletteMsg]);
  assert.ok(['o1', 'o2', 'o3'].includes(first.data.winnerOptionId));
  const second = await rpc(3, "select chat_tool_act($1,'roulette_spin','{}'::jsonb) as r", [rouletteMsg]);
  assert.equal(second.id, first.id); assert.equal(second.data.winnerOptionId, first.data.winnerOptionId);
});
await check('server 표시가 없는 옛 도구 메시지는 서버 함수를 쓸 수 없다', async () => {
  const legacy = await post(1, { type: 'roulette', data: { title: '옛', options: [] } });
  await rejects(rpc(1, "select chat_tool_init($1,'{}'::jsonb) as r", [legacy]), /서버 처리 도구가 아닙니다/);
});
const toolText = (payload) => '[TALJU_CHAT_TOOL]:' + JSON.stringify(payload);
const countMessages = async () => { await login(1); return (await db.query("select count(*)::int as n from chat_messages where project_id='p'")).rows[0].n; };
await check('chat_tool_create: 메시지 등록과 준비를 한 번에, 준비가 실패하면 메시지도 남지 않음', async () => {
  const before = await countMessages();
  const ok = await rpc(1, "select chat_tool_create('p','all',$1,$2::jsonb) as r", [toolText({ type: 'draw', server: true, data: { title: '원자' } }), drawItems]);
  assert.equal(ok.event.event, 'init'); assert.equal(ok.message.sender_id, mem[1]);
  assert.equal(await countMessages(), before + 1);
  await rejects(rpc(1, "select chat_tool_create('p','all',$1,'{}'::jsonb) as r", [toolText({ type: 'draw', server: true, data: { title: '항목 없음' } })]), /2~50개/);
  await rejects(rpc(1, "select chat_tool_create('p','all',$1,'{}'::jsonb) as r", [toolText({ type: 'roulette', server: true, data: { title: '옵션 없음' } })]), /2~20개/);
  await rejects(rpc(1, "select chat_tool_create('p','all',$1,'{}'::jsonb) as r", [toolText({ type: 'ladder', server: true, data: { title: '참가자 없음' } })]), /2~20명/);
  assert.equal(await countMessages(), before + 1); // 실패한 3건은 메시지도 남지 않음
});
await check('chat_tool_create: 프로젝트 밖 사용자·접근 못 하는 채널은 거절', async () => {
  await rejects(rpc(4, "select chat_tool_create('p','all',$1,$2::jsonb) as r", [toolText({ type: 'draw', server: true, data: { title: 'x' } }), drawItems]), /참여자만/);
  await rejects(rpc(1, "select chat_tool_create('p',$1,$2,$3::jsonb) as r", [`dm:${mem[2]}:${mem[3]}`, toolText({ type: 'draw', server: true, data: { title: 'x' } }), drawItems]), /row-level security|찾을 수 없/);
});
console.log(count + ' chat-tools-server checks passed');
