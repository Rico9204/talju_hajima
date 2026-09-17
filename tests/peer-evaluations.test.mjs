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
await db.exec(readFileSync(new URL("../supabase/migration_project_completion.sql",import.meta.url),"utf8"));
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
await check("completion persists in a fresh project query",async()=>assert.equal((await db.query("select status from projects where id='long'")).rows[0].status,"done"));
await check("repeated completion is idempotent",()=>db.query("select complete_evaluation_project('long')"));
await check("missing project is rejected",()=>assert.rejects(db.query("select complete_evaluation_project('missing')"),/찾을 수/));
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

await db.exec("reset role");
await db.exec(readFileSync(new URL("../supabase/migration_evaluation_prototype.sql",import.meta.url),"utf8").replace(/^\uFEFF/,""));
await db.query("insert into members(id,project_id,user_id) values($1,'short',$1)",[ids[5]]);
await db.exec("update projects set status='active' where id='short'");
await login(4);
const prototypeEntries=[ids[3],ids[5]].map(recipient_id=>({...entries[0],recipient_id}));
await check("prototype mode enabled for authenticated clients",async()=>assert.equal((await db.query("select evaluation_prototype_enabled() as enabled")).rows[0].enabled,true));
await check("prototype final can be submitted before completion",()=>submit("final",prototypeEntries,"short"));
await check("prototype final submission does not complete project",async()=>assert.equal((await db.query("select status from projects where id='short'")).rows[0].status,"active"));
await check("prototype short project midterm can be submitted independently",()=>submit("midterm",prototypeEntries,"short"));
await check("prototype still rejects duplicate submissions",()=>assert.rejects(submit("final",prototypeEntries,"short"),/이미/));
await login(5);
await check("prototype final is visible to other teammates while active",async()=>assert.equal((await db.query("select * from peer_evaluations where phase='final' and evaluator_id=$1",[ids[4]])).rows.length,2));
await check("prototype midterm still private to recipient",async()=>assert.equal((await db.query("select * from peer_evaluations where phase='midterm' and evaluator_id=$1",[ids[4]])).rows.length,1));
await login(1);
await check("prototype permits midterm after completion",()=>submit("midterm",[{...entries[0],recipient_id:ids[0]},entries[1]]));
await check("prototype still rejects nonmembers",()=>assert.rejects(submit("final",prototypeEntries,"short"),/참여자/));
await db.exec("reset role");
await db.exec("create or replace function public.evaluation_prototype_enabled() returns boolean language sql stable as 'select false'");
await login(5);
await check("normal mode restores final status restriction",()=>assert.rejects(submit("final",prototypeEntries,"short"),/상태/));
await check("normal mode restores short project restriction",()=>assert.rejects(submit("midterm",prototypeEntries,"short"),/2주/));
await check("normal mode hides teammates premature final evaluations",async()=>assert.equal((await db.query("select * from peer_evaluations where phase='final' and evaluator_id=$1",[ids[4]])).rows.length,1));
await db.exec("reset role");
await db.exec(readFileSync(new URL("../supabase/migration_evaluation_zero_scores.sql",import.meta.url),"utf8"));
await login(2);
const zeroEntries = [ids[0], ids[1]].map((recipient_id, i) => ({
  recipient_id, role: i * 10, deadline: i * 10, communication: i * 10,
  collaboration: i * 10, quality: i * 10, comment: "",
}));
await check("zero score migration preserves normal phase gating",()=>assert.rejects(submit("midterm",zeroEntries),/상태/));
await check("negative scores are rejected",()=>assert.rejects(submit("final",[{...zeroEntries[0],role:-1},zeroEntries[1]]),/정수/));
await check("zero scores still require balanced totals",()=>assert.rejects(submit("final",[{...zeroEntries[0],role:0},{...zeroEntries[1],role:0}]),/총점/));
await check("zero and ten scores save successfully",()=>submit("final",zeroEntries));
await check("zero scores persist and contribute to averages",async()=> {
  const row=(await db.query("select * from peer_evaluations where evaluator_id=$1 and recipient_id=$2 and phase='final'",[ids[2],ids[0]])).rows[0];
  for (const key of ['role','deadline','communication','collaboration','quality']) assert.equal(row[key],0);
  const member=(await db.query("select score,eval_count from members where id=$1",[ids[0]])).rows[0];
  assert.equal(Number(member.score),0); assert.equal(member.eval_count,1);
});
await db.exec("reset role");
await db.exec(`
  create function block_project_completion() returns trigger language plpgsql as $$
  begin return old; end $$;
  create trigger block_completion before update on projects for each row execute function block_project_completion();
`);
await login(3);
await check("a trigger suppressing completion cannot report success",()=>assert.rejects(db.query("select complete_evaluation_project('short')"),/저장되지/));
await check("failed completion remains active after reload",async()=>assert.equal((await db.query("select status from projects where id='short'")).rows[0].status,"active"));
await db.close();
console.log(passed + " database integration checks passed.");
