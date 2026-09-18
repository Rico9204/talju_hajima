-- Apply after the current main schema/migrations. Repeatable; no automatic deletion job is installed.
begin;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists org text;
alter table public.profiles add column if not exists email text;
alter table public.projects add column if not exists approval_status text not null default 'approved';
alter table public.projects add column if not exists requested_admin_id uuid references auth.users(id) on delete set null;
alter table public.projects add column if not exists completed_at timestamptz;
update public.profiles p set email=u.email from auth.users u where p.id=u.id and p.email is null;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select is_admin from public.profiles where id=auth.uid()),false)
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

-- Account type is never accepted from editable signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name,avatar_initial,is_admin,org,email)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name','사용자'),
 left(coalesce(new.raw_user_meta_data->>'display_name','사용자'),1),false,
 nullif(new.raw_user_meta_data->>'org',''),new.email);
 return new;
end $$;
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') then
  if tg_op='INSERT' then new.is_admin:=false;
  elsif new.is_admin is distinct from old.is_admin then
   raise exception '관리자 권한은 운영자만 변경할 수 있습니다.';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists prevent_profile_privilege_escalation_trigger on public.profiles;
create trigger prevent_profile_privilege_escalation_trigger before insert or update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

create or replace function public.set_project_approval_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null then
  if new.start_date is null or new.end_date is null or new.end_date<new.start_date then
   raise exception '올바른 시작일과 종료일을 입력해 주세요.';
  end if;
  if not public.is_admin() and (new.requested_admin_id is null or not exists
   (select 1 from public.profiles where id=new.requested_admin_id and is_admin)) then
   raise exception '승인을 요청할 관리자를 선택해 주세요.';
  end if;
  new.approval_status:=case when public.is_admin() then 'approved' else 'pending' end;
  new.status:='active'; new.completed_at:=null;
 end if;
 return new;
end $$;
drop trigger if exists set_project_approval_status_trigger on public.projects;
create trigger set_project_approval_status_trigger before insert on public.projects
for each row execute function public.set_project_approval_status();

-- Direct REST updates cannot self-approve, change the reviewer or bypass the completion RPC.
create or replace function public.guard_project_governance()
returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') and
  (new.id is distinct from old.id or new.approval_status is distinct from old.approval_status
   or new.requested_admin_id is distinct from old.requested_admin_id
   or new.status is distinct from old.status or new.completed_at is distinct from old.completed_at) then
  raise exception '승인과 종료 상태는 전용 기능으로만 변경할 수 있습니다.';
 end if;
 if (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date)
  and (new.start_date is null or new.end_date is null or new.end_date<new.start_date) then
  raise exception '올바른 시작일과 종료일을 입력해 주세요.';
 end if;
 return new;
end $$;
drop trigger if exists project_governance_guard on public.projects;
create trigger project_governance_guard before update on public.projects
for each row execute function public.guard_project_governance();
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
using(public.is_project_leader(id) or public.is_admin())
with check(public.is_project_leader(id) or public.is_admin());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using(public.is_admin());
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using(id=auth.uid() or public.shares_project_with(id) or public.is_admin());
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
using(public.is_project_member(project_id) or public.is_admin());
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
using(user_id=auth.uid() or public.is_project_member(project_id) or public.is_admin());
-- Preserve main's column-level evaluation privacy grants; do not GRANT SELECT *.
revoke select on public.members from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute
 where attrelid='public.members'::regclass and attnum>0 and not attisdropped
 and attname not in ('score','eval_count','criteria_role','criteria_deadline','criteria_communication','criteria_collaboration','criteria_quality');
 execute 'grant select ('||cols||') on public.members to authenticated';
end $$;
revoke select(score,eval_count,criteria_role,criteria_deadline,criteria_communication,criteria_collaboration,criteria_quality)
on public.members from public,anon,authenticated;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
revoke update,delete on public.members from authenticated;

create or replace function public.search_admin_profiles(q text)
returns table(id uuid,display_name text,org text,email text)
language sql stable security definer set search_path=public as $$
 select p.id,p.display_name,p.org,p.email from public.profiles p
 where auth.uid() is not null and p.is_admin and length(btrim(q)) between 1 and 100
 and (p.display_name ilike '%'||btrim(q)||'%' or p.org ilike '%'||btrim(q)||'%' or p.email ilike '%'||btrim(q)||'%')
 order by p.display_name,p.id limit 10
$$;
revoke all on function public.search_admin_profiles(text) from public,anon;
grant execute on function public.search_admin_profiles(text) to authenticated;

create or replace function public.review_project(p_project_id text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects;
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 승인할 수 있습니다.'; end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception '잘못된 승인 상태입니다.'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
 if p.requested_admin_id is not null and p.requested_admin_id<>auth.uid() then raise exception '지정된 관리자만 처리할 수 있습니다.'; end if;
 if p.approval_status<>'pending' then raise exception '이미 처리된 승인 요청입니다.'; end if;
 update public.projects set approval_status=p_status where id=p_project_id;
end $$;
revoke all on function public.review_project(text,text) from public,anon;
grant execute on function public.review_project(text,text) to authenticated;

create or replace function public.complete_evaluation_project(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects;
begin
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not (public.is_project_leader(p_project_id) or public.is_admin()) then
  raise exception '팀장 또는 관리자만 프로젝트를 종료할 수 있습니다.';
 end if;
 if p.approval_status<>'approved' then raise exception '승인된 프로젝트만 종료할 수 있습니다.'; end if;
 update public.projects set status='done',completed_at=coalesce(completed_at,now()) where id=p_project_id and status='active';
 if not exists(select 1 from public.projects where id=p_project_id and status='done') then
  raise exception '프로젝트 종료 상태가 저장되지 않았습니다. 프로젝트 트리거를 확인해 주세요.';
 end if;
end $$;
revoke all on function public.complete_evaluation_project(text) from public,anon;
grant execute on function public.complete_evaluation_project(text) to authenticated;

create or replace function public.kick_project_member(p_member_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m public.members; pid text;
begin
 select project_id into pid from public.members where id=p_member_id;
 perform id from public.projects where id=pid and status='active' and approval_status='approved' for update;
 if not found then raise exception '진행 중인 승인된 프로젝트에서만 팀원을 제외할 수 있습니다.'; end if;
 select * into m from public.members where id=p_member_id for update;
 if not found then raise exception '팀원을 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not(public.is_admin() or public.is_project_leader(pid)) then raise exception '팀장 또는 관리자만 팀원을 제외할 수 있습니다.'; end if;
 if m.is_leader or m.user_id=auth.uid() then raise exception '팀장 또는 본인은 제외할 수 없습니다.'; end if;
 -- Deleting evaluation participants would change other members' scores and anonymity thresholds.
 if exists(select 1 from public.peer_evaluations where evaluator_id=m.id or recipient_id=m.id)
 or exists(select 1 from public.peer_evaluation_submissions where evaluator_id=m.id) then
  raise exception '평가 기록이 있는 팀원은 평가 보존을 위해 제외할 수 없습니다.';
 end if;
 delete from public.members where id=m.id;
end $$;
revoke all on function public.kick_project_member(uuid) from public,anon;
grant execute on function public.kick_project_member(uuid) to authenticated;

-- Admin roster access is deliberately separate from the existing private evaluation RPC.
create or replace function public.admin_project_members(p_project_id text)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members;
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 조회할 수 있습니다.'; end if;
 for m in select * from public.members where project_id=p_project_id order by is_leader desc,name loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0;
  m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  return next m;
 end loop;
end $$;
revoke all on function public.admin_project_members(text) from public,anon;
grant execute on function public.admin_project_members(text) to authenticated;

-- Also secure installations that previously applied coffe's unguarded cleanup functions.
do $$ begin
 if to_regprocedure('public.archive_and_cleanup_project(text)') is not null then
  revoke all on function public.archive_and_cleanup_project(text) from public,anon,authenticated;
 end if;
 if to_regprocedure('public.cleanup_completed_projects()') is not null then
  revoke all on function public.cleanup_completed_projects() from public,anon,authenticated;
 end if;
end $$;
-- Guard writes even when they arrive through existing SECURITY DEFINER RPCs.
create or replace function public.guard_approved_project_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb; pid text;
begin
 if auth.uid() is null or public.is_admin() then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
 pid:=row_data->>'project_id';
 if pid is null and row_data ? 'file_id' then
  select project_id into pid from public.files where id=(row_data->>'file_id')::bigint;
 elsif pid is null and row_data ? 'task_id' then
  select project_id into pid from public.tasks where id=(row_data->>'task_id')::bigint;
 elsif pid is null and tg_table_name='file_comment_reactions' then
  select f.project_id into pid from public.files f join public.file_comments c on c.file_id=f.id where c.id=(row_data->>'comment_id')::bigint;
 elsif pid is null and tg_table_name='task_comment_reactions' then
  select t.project_id into pid from public.tasks t join public.task_comments c on c.task_id=t.id where c.id=(row_data->>'comment_id')::bigint;
 end if;
 if exists(select 1 from public.projects where id=pid and approval_status<>'approved') then
  raise exception '관리자 승인 후 사용할 수 있습니다.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['folders','files','file_versions','file_comments','file_comment_reactions',
 'tasks','task_assignees','task_checklist_items','task_comments','task_comment_reactions',
 'schedule_events','chat_messages','message_reads','message_reactions','peer_evaluations','peer_evaluation_submissions'] loop
  execute format('drop trigger if exists approved_project_write on public.%I',t);
  execute format('create trigger approved_project_write before insert or update or delete on public.%I for each row execute function public.guard_approved_project_write()',t);
 end loop;
end $$;
drop policy if exists workspace_approval_write on storage.objects;
create policy workspace_approval_write on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'workspace-files' or exists(select 1 from public.projects p
where p.id=public.workspace_storage_project(objects.name) and p.approval_status='approved'));

create or replace function public.guard_schedule_update()
returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.projects where id=old.project_id and status='done') then
  raise exception '종료된 프로젝트의 일정은 변경할 수 없습니다.';
 end if;
 if tg_op='UPDATE' and (new.project_id is distinct from old.project_id
 or new.scope is distinct from old.scope or new.owner_member_id is distinct from old.owner_member_id) then
  raise exception '일정 소유자와 범위는 변경할 수 없습니다.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists schedule_update_guard on public.schedule_events;
create trigger schedule_update_guard before update or delete on public.schedule_events
for each row execute function public.guard_schedule_update();

-- Keep original-file cleanup entries after their project is deleted.
alter table public.workspace_delete_queue drop constraint if exists workspace_delete_queue_project_id_fkey;
drop policy if exists workspace_cleanup_read on public.workspace_delete_queue;
create policy workspace_cleanup_read on public.workspace_delete_queue for select to authenticated
using(public.is_admin() or (public.is_project_member(project_id) and (deleted_by=auth.uid() or public.is_project_leader(project_id))));
-- Storage DELETE also needs SELECT visibility after project membership has disappeared.
drop policy if exists workspace_pending_cleanup_read on storage.objects;
create policy workspace_pending_cleanup_read on storage.objects for select to authenticated
using(bucket_id='workspace-files'
 and exists(select 1 from public.workspace_delete_queue q where q.storage_path=objects.name)
 and not exists(select 1 from public.file_versions v where v.storage_path=objects.name));
create or replace function public.finish_workspace_cleanup(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not(public.is_admin() or public.is_project_member(p_project_id)) then raise exception '정리 권한이 없습니다.'; end if;
 delete from public.workspace_delete_queue q where q.project_id=p_project_id
 and (public.is_admin() or q.deleted_by=auth.uid() or public.is_project_leader(p_project_id))
 and not exists(select 1 from storage.objects o where o.bucket_id='workspace-files' and o.name=q.storage_path);
end $$;
create or replace function public.queue_deleted_project_files()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null then
  insert into public.workspace_delete_queue(storage_path,project_id,deleted_by)
  select v.storage_path,old.id,auth.uid() from public.file_versions v join public.files f on f.id=v.file_id
  where f.project_id=old.id and v.storage_path is not null on conflict(storage_path) do nothing;
 end if;
 return old;
end $$;
drop trigger if exists queue_deleted_project_files on public.projects;
create trigger queue_deleted_project_files before delete on public.projects
for each row execute function public.queue_deleted_project_files();
create or replace function public.delete_managed_project(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 프로젝트를 삭제할 수 있습니다.'; end if;
 delete from public.projects where id=p_project_id;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.delete_managed_project(text) from public,anon;
grant execute on function public.delete_managed_project(text) to authenticated;
notify pgrst,'reload schema';
commit;
