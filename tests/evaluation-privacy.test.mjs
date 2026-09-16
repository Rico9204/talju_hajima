// Run: node tests/peer-evaluations.test.mjs <directory containing @electric-sql/pglite>
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.argv[2] || ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table projects(id text primary key,status text,start_date date,end_date date);
create table members(id uuid primary key, project_id text references projects(id),user_id uuid,is_leader boolean default false,
eval_count integer default 0,score numeric default 0,criteria_role numeric default 0,criteria_deadline numeric default 0,
criteria_communication numeric default 0,criteria_collaboration numeric default 0,criteria_quality numeric default 0);
create function is_project_member(p_project_id text) returns boolean language sql security definer set search_path=public as
$$ select exists(select 1 from members where project_id=p_project_id and user_id=auth.uid()) $$;
create function is_project_leader(p_project_id text) returns boolean language sql security definer set search_path=public as
$$ select exists(select 1 from members where project_id=p_project_id and user_id=auth.uid() and is_leader) $$;
grant select on projects,members to authenticated;
insert into projects values ('long','active','2026-09-01','2026-10-01'),('short','active','2026-09-01','2026-09-10');
`);
const ids = [1,2,3,4,5,6].map((n) => "00000000-0000-0000-0000-" + String(n).padStart(12,"0"));
for (let i=0;i<5;i++) {
  await db.query("insert into members(id,project_id,user_id,is_leader) values($1,$2,$1,$3)",[ids[i], i<3?"long":"short",i===0||i===3]);
}
await db.exec(readFileSync(new URL("../supabase/migration_peer_evaluations.sql",import.meta.url),"utf8").replace(/^\uFEFF/,""));

await db.exec(readFileSync(new URL("../supabase/migration_evaluation_prototype.sql",import.meta.url),"utf8").replace(/^\uFEFF/,""));
await db.exec(readFileSync(new URL("../supabase/migration_evaluation_privacy.sql",import.meta.url),"utf8").replace(/^\uFEFF/,""));
async function login(i) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[i===null?"":ids[i]]); await db.exec("set role authenticated"); }
const entriesFor = (actor, phase) => ids.slice(0,3).filter(id => id !== ids[actor]).map((recipient_id,index)=>({recipient_id,role:5,deadline:5,communication:5,collaboration:5,quality:5,comment:"private"}));
const average = async (project="long",phase="midterm") => (await db.query("select my_evaluation_average($1,$2) as a",[project,phase])).rows[0].a;
await login(1);
await db.query("select submit_peer_evaluations('long','midterm',$1::jsonb)",[JSON.stringify(entriesFor(1))]);
await login(0);
assert.equal((await average()).available,false);
assert.equal((await db.query("select * from peer_evaluations")).rows.length,0);
await assert.rejects(db.query("select score from members"),/permission denied/);
assert.ok((await db.query("select id from members")).rows.length);
await login(2);
await db.query("select submit_peer_evaluations('long','midterm',$1::jsonb)",[JSON.stringify(entriesFor(2))]);
await login(0);
assert.equal((await average()).score,5);
assert.equal((await average()).count,2);
assert.equal((await db.query("select * from peer_evaluations")).rows.length,0);
await assert.rejects(average("short"),/참여자/);
await assert.rejects(db.query("select * from visible_evaluation_members('short')"),/참여자/);
for (const i of [0,1,2]) {
 await login(i);
 await db.query("select submit_peer_evaluations('long','final',$1::jsonb)",[JSON.stringify(entriesFor(i))]);
}
await login(0);
const visible=(await db.query("select * from visible_evaluation_members('long')")).rows;
assert.equal(visible.find(m=>m.id===ids[0]).score,'5.0000000000000000');
assert.ok(visible.filter(m=>m.id!==ids[0]).every(m=>Number(m.score)===0 && m.eval_count===0));
assert.ok((await db.query("select * from visible_evaluation_members()")).rows.every(m=>m.user_id===ids[0]));
assert.ok((await db.query("select * from peer_evaluations")).rows.every(r=>r.evaluator_id===ids[0]));
await login(3);
await db.query("select submit_peer_evaluations('short','midterm',$1::jsonb)",[JSON.stringify([{recipient_id:ids[4],role:5,deadline:5,communication:5,collaboration:5,quality:5,comment:""}])]);
await login(4); assert.equal((await average('short')).available,false);
await login(null); await assert.rejects(average(),/로그인/);
console.log('PASS privacy: own averages only, no incoming raw ballots, no direct scores, hidden peer ratings, pending and single-evaluator suppression, outsider and anonymous denied');
await db.close();
