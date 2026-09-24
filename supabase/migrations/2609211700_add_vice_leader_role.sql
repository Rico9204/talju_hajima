-- 부팀장(vice leader) 역할.
-- 부팀장은 팀장과 같은 일상 운영 권한(과제, 팀 일정, 워크스페이스 파일·폴더 정리)을 갖는다.
-- 팀원 제외, 프로젝트 종료, 팀장 위임은 계속 팀장 전용이고,
-- 부팀장 임명·해임은 해당 프로젝트의 팀장 또는 관리자만 할 수 있다.
begin;

alter table public.members add column if not exists is_vice_leader boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_leader_not_vice' and conrelid = 'public.members'::regclass) then
    alter table public.members add constraint members_leader_not_vice check (not (is_leader and is_vice_leader));
  end if;
end $$;
-- members SELECT 권한은 평가 점수 컬럼을 제외하고 컬럼 단위로 부여되므로 새 컬럼도 따로 열어 준다.
grant select (is_vice_leader) on public.members to authenticated;

-- 팀장 또는 부팀장. is_project_leader()는 팀장 전용 권한(종료·제외 등)을 위해 그대로 둔다.
create or replace function public.is_project_manager(p_project_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.project_id = p_project_id and m.user_id = auth.uid() and (m.is_leader or m.is_vice_leader)
  );
$$;

create or replace function public.is_task_project_manager(p_task_id bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    join public.members m on m.project_id = t.project_id
    where t.id = p_task_id and m.user_id = auth.uid() and (m.is_leader or m.is_vice_leader)
  );
$$;

-- 가입 시 클라이언트가 보낸 is_vice_leader는 항상 무시한다.
create or replace function public.set_member_user_id()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  -- 프로젝트에 이미 리더가 있으면 is_leader를 false로 강제
  -- (createProject는 첫 번째 멤버라 리더 없음 → true 통과,
  --  joinProject는 리더 이미 있음 → 클라이언트가 true 보내도 false로 교정)
  if new.is_leader and exists (
    select 1 from public.members where project_id = new.project_id and is_leader
  ) then
    new.is_leader := false;
  end if;
  new.is_vice_leader := false;
  return new;
end;
$$;

-- is_vice_leader 직접 UPDATE 차단: set_vice_leader / transfer_leadership RPC만 허용
create or replace function public.prevent_is_vice_leader_direct_update()
returns trigger language plpgsql as $$
begin
  if new.is_vice_leader is distinct from old.is_vice_leader
     and current_setting('app.allow_vice_leader_change', true) is distinct from 'true'
  then
    raise exception 'is_vice_leader 변경은 set_vice_leader() 함수를 통해서만 가능합니다';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_is_vice_leader_direct_update on public.members;
create trigger prevent_is_vice_leader_direct_update
  before update on public.members
  for each row execute function public.prevent_is_vice_leader_direct_update();

-- 팀장 위임: 부팀장에게 위임하면 부팀장 표시는 자동으로 해제된다.
create or replace function public.transfer_leadership(p_project_id text, p_target_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_id uuid;
  v_target_role text;
begin
  select id, role into v_caller_id, v_caller_role
    from members
    where project_id = p_project_id and user_id = auth.uid() and is_leader;
  if v_caller_id is null then
    raise exception '팀장만 권한을 이전할 수 있습니다';
  end if;

  select id, role into v_target_id, v_target_role
    from members
    where project_id = p_project_id and name = p_target_name and not is_leader;
  if v_target_id is null then
    raise exception '대상 멤버를 찾을 수 없거나 이미 팀장입니다';
  end if;

  perform set_config('app.allow_leader_change', 'true', true);
  perform set_config('app.allow_vice_leader_change', 'true', true);

  -- is_leader와 함께 role 표시 문구도 동기화 (커스텀 역할 문구는 그대로 둠)
  update members set is_leader = false,
    role = case when v_caller_role = '팀장' then '팀원' else v_caller_role end
    where id = v_caller_id;
  update members set is_leader = true, is_vice_leader = false,
    role = case when v_target_role in ('참여자', '팀원', '부팀장') then '팀장' else v_target_role end
    where id = v_target_id;
end;
$$;

-- 부팀장 임명·해임: 해당 프로젝트의 팀장 또는 관리자만, 진행 중인 승인된 프로젝트에서만.
create or replace function public.set_vice_leader(p_member_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.members; pid text;
begin
  select project_id into pid from public.members where id = p_member_id;
  if pid is null then raise exception '팀원을 찾을 수 없습니다.'; end if;
  if auth.uid() is null or not (public.is_admin() or public.is_project_leader(pid)) then
    raise exception '팀장 또는 관리자만 부팀장을 지정할 수 있습니다.';
  end if;
  perform id from public.projects where id = pid and status = 'active' and approval_status = 'approved' for update;
  if not found then raise exception '진행 중인 승인된 프로젝트에서만 부팀장을 지정할 수 있습니다.'; end if;
  select * into m from public.members where id = p_member_id for update;
  if not found then raise exception '팀원을 찾을 수 없습니다.'; end if;
  if m.is_leader then raise exception '팀장은 부팀장으로 지정할 수 없습니다.'; end if;
  if m.is_vice_leader is not distinct from coalesce(p_enabled, false) then return; end if;

  perform set_config('app.allow_vice_leader_change', 'true', true);
  -- is_vice_leader와 함께 role 표시 문구도 동기화 (커스텀 역할 문구는 그대로 둠)
  update public.members set is_vice_leader = coalesce(p_enabled, false),
    role = case
      when coalesce(p_enabled, false) and role in ('참여자', '팀원') then '부팀장'
      when not coalesce(p_enabled, false) and role = '부팀장' then '팀원'
      else role
    end
    where id = m.id;
end $$;
revoke all on function public.set_vice_leader(uuid, boolean) from public, anon;
grant execute on function public.set_vice_leader(uuid, boolean) to authenticated;

-- 과제: 팀장·부팀장이 만들고 고치고 지운다. 담당자는 기존처럼 자기 과제를 수정할 수 있다.
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_insert on public.tasks for insert with check (public.is_project_manager(project_id));
create policy tasks_update on public.tasks for update using (public.is_project_manager(project_id) or public.is_task_assignee(id));
create policy tasks_delete on public.tasks for delete using (public.is_project_manager(project_id));

drop policy if exists task_assignees_write on public.task_assignees;
create policy task_assignees_write on public.task_assignees for all
  using (public.is_task_project_manager(task_id)) with check (public.is_task_project_manager(task_id));

-- 팀 일정: 팀장·부팀장이 관리한다. 개인 일정은 기존처럼 본인만.
drop policy if exists schedule_events_insert on public.schedule_events;
drop policy if exists schedule_events_update on public.schedule_events;
drop policy if exists schedule_events_delete on public.schedule_events;
create policy schedule_events_insert on public.schedule_events for insert with check (
  public.is_project_member(project_id)
  and (
    (scope = 'team' and public.is_project_manager(project_id))
    or
    (scope = 'personal' and exists (
      select 1 from public.members m
      where m.id = owner_member_id and m.project_id = project_id and m.user_id = auth.uid()
    ))
  )
);
create policy schedule_events_update on public.schedule_events for update using (
  (scope = 'team' and public.is_project_manager(project_id))
  or
  (scope = 'personal' and exists (
    select 1 from public.members m
    where m.id = owner_member_id and m.project_id = project_id and m.user_id = auth.uid()
  ))
);
create policy schedule_events_delete on public.schedule_events for delete using (
  (scope = 'team' and public.is_project_manager(project_id))
  or
  (scope = 'personal' and exists (
    select 1 from public.members m
    where m.id = owner_member_id and m.project_id = project_id and m.user_id = auth.uid()
  ))
);

-- 워크스페이스: 팀장·부팀장은 남의 파일·폴더도 삭제할 수 있다.
create or replace function public.delete_workspace_file(p_file_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.files%rowtype;
begin
  select project_id into pid from public.files where id=p_file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.files where id=p_file_id for update;
  if not found then raise exception '파일이 존재하지 않습니다.'; end if;
  if not public.is_project_manager(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장, 부팀장 또는 최초 업로더만 파일을 삭제할 수 있습니다.';
  end if;
  insert into public.workspace_delete_queue(storage_path,project_id,deleted_by)
    select storage_path,pid,auth.uid() from public.file_versions where file_id=p_file_id and storage_path is not null
    on conflict(storage_path) do nothing;
  delete from public.files where id=p_file_id;
end $$;
create or replace function public.delete_workspace_folder(p_folder_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.folders%rowtype;
begin
  select project_id into pid from public.folders where id=p_folder_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.folders where id=p_folder_id for update;
  if not found then raise exception '폴더가 존재하지 않습니다.'; end if;
  if not public.is_project_manager(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장, 부팀장 또는 생성자만 폴더를 삭제할 수 있습니다.';
  end if;
  if exists(select 1 from public.files where folder_id=p_folder_id) then
    raise exception '파일이 있는 폴더는 삭제할 수 없습니다. 파일을 먼저 삭제해 주세요.';
  end if;
  delete from public.folders where id=p_folder_id;
end $$;
revoke all on function public.delete_workspace_file(bigint), public.delete_workspace_folder(bigint) from public, anon;
grant execute on function public.delete_workspace_file(bigint), public.delete_workspace_folder(bigint) to authenticated;

commit;
