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
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function login(i) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[i===null?"":ids[i]]); await db.exec("set role authenticated"); }
const entries = [ids[1],ids[2]].map((recipient_id)=>({recipient_id,role:5,deadline:5,communication:5,collaboration:5,quality:5,comment:"피드백"}));
const submit=(phase="midterm",rows=entries,project="long")=>db.query("select submit_peer_evaluations($1,$2,$3::jsonb)",[project,phase,JSON.stringify(rows)]);
await login(0);
await check("reject final evaluation before completion",()=>assert.rejects(submit("final"),/상태/));
await check("reject null phase",()=>assert.rejects(submit(null),/유형/));
await check("reject self evaluation",()=>assert.rejects(submit("midterm",[{...entries[0],recipient_id:ids[0]},entries[1]]),/대상/));
await check("reject duplicate recipients",()=>assert.rejects(submit("midterm",[entries[0],entries[0]]),/대상/));
await check("reject foreign project recipient",()=>assert.rejects(submit("midterm",[{...entries[0],recipient_id:ids[3]},entries[1]]),/대상/));
await check("reject missing recipient",()=>assert.rejects(submit("midterm",[entries[0]]),/목록/));
await check("reject out-of-range score",()=>assert.rejects(submit("midterm",[{...entries[0],role:11},entries[1]]),/정수/));
await check("reject fractional score",()=>assert.rejects(submit("midterm",[{...entries[0],role:4.5},entries[1]]),/정수/));
await check("reject missing score",()=>assert.rejects(submit("midterm",[{...entries[0],role:null},entries[1]]),/정수/));
await check("reject wrong pool total",()=>assert.rejects(submit("midterm",[{...entries[0],role:4},entries[1]]),/총점/));
await check("rollback overlong comment",()=>assert.rejects(submit("midterm",[{...entries[0],comment:"가".repeat(151)},entries[1]]),/check constraint/));
await check("failed submission leaves no partial rows",async()=>assert.equal((await db.query("select * from peer_evaluation_submissions")).rows.length,0));
await check("save midterm evaluation",()=>submit());
await check("reject repeat submission",()=>assert.rejects(submit(),/이미/));
await check("author reads persisted complete submission",async()=>assert.equal((await db.query("select * from peer_evaluations")).rows.length,2));
await check("midterm does not change reputation",async()=>assert.equal(Number((await db.query("select sum(eval_count) as n from members")).rows[0].n),0));
await login(1);
await check("midterm recipient only sees their own feedback",async()=> {
  const rows=(await db.query("select * from peer_evaluations")).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].recipient_id,ids[1]);
});
await check("recipient cannot see author submission marker",async()=>assert.equal((await db.query("select * from peer_evaluation_submissions")).rows.length,0));
await check("nonleader cannot complete project",()=>assert.rejects(db.query("select complete_evaluation_project('long')"),/팀장/));
await check("direct update denied",()=>assert.rejects(db.query("update peer_evaluations set role=1"),/permission denied/));
await check("direct insert denied",()=>assert.rejects(db.query("insert into peer_evaluation_submissions(project_id,evaluator_id,phase) values('long',$1,'final')",[ids[1]]),/permission denied/));
await login(3);
await check("outsider reads no evaluation rows",async()=>assert.equal((await db.query("select * from peer_evaluations")).rows.length,0));
await check("outsider cannot submit",()=>assert.rejects(submit(),/참여자/));
await check("short project skips midterm",()=>assert.rejects(submit("midterm",[{...entries[0],recipient_id:ids[4]}],"short"),/2주/));
await login(null);
await check("unauthenticated request cannot submit",()=>assert.rejects(submit(),/참여자/));
await login(0);
await check("leader can complete project",()=>db.query("select complete_evaluation_project('long')"));
await check("completed project rejects midterm",()=>assert.rejects(submit(),/상태/));
await check("final can be submitted independently of midterm",()=>submit("final"));
await check("final updates reputation",async()=> {
  const row=(await db.query("select eval_count,score from members where id=$1",[ids[1]])).rows[0];
  assert.equal(row.eval_count,1); assert.equal(Number(row.score),5);
});
await login(1);
await check("final evaluations visible to team",async()=>assert.equal((await db.query("select * from peer_evaluations where phase='final'")).rows.length,2));
await login(3);
await check("final evaluations hidden from outsiders",async()=>assert.equal((await db.query("select * from peer_evaluations where phase='final'")).rows.length,0));
await check("short project can complete and submit final",async()=> {
  await db.query("select complete_evaluation_project('short')");
  await submit("final",[{...entries[0],recipient_id:ids[4]}],"short");
});
await db.close();
console.log(passed + " database integration checks passed.");
