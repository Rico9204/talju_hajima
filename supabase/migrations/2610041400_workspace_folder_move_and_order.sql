-- ===== 워크스페이스 폴더 이동·직접 정렬 (migrations/2610041400_workspace_folder_move_and_order.sql 과 동일) =====
-- 폴더를 다른 폴더 안이나 상위로 옮기고, 폴더·파일의 순서를 끌어서 바꿀 수 있게 한다.
--  * 진행 중인 프로젝트의 참여자라면 누구나 옮기고 순서를 바꿀 수 있다(파일 이동과 같은 기준).
--  * 폴더 이동: 같은 프로젝트의 폴더 안(또는 루트, null)으로만. 자기 자신·하위 폴더 안으로는 못 옮기고,
--    옮긴 뒤 하위 트리 전체가 10단계를 넘으면 막는다. 같은 프로젝트의 폴더 이동은 프로젝트 행을 잠가 한 번에 하나씩
--    처리한다(두 사람이 동시에 서로의 안으로 옮겨 순환이 생기는 것을 막는다). 옮긴 폴더는 새 위치의 맨 뒤로 간다
--    (새 위치의 폴더들에 지금 보이는 순서대로 번호를 매긴 뒤 그 다음 번호). 옮긴 파일은 순서가 비워져 "직접 정렬"의 맨 위에 보인다.
--  * 순서(sort_order): 같은 상위 폴더의 폴더들, 같은 폴더의 파일들끼리만. 화면이 보낸 id 순서대로 1, 2, 3…을 매기고,
--    보내지 않은 같은 폴더의 항목은 그 뒤에 이어 매긴다.
--    순서가 없는(null) 폴더는 순서가 있는 폴더 뒤에 만든 순서대로, 파일은 화면에서 "직접 정렬"일 때 맨 위에 최신순으로 보인다.
--  * 순서 바꾸기는 내용 수정이 아니므로 대시보드 "최근 활동"의 수정 시각(updated_at)을 바꾸지 않는다.

alter table public.folders add column if not exists sort_order integer;
alter table public.files add column if not exists sort_order integer;

create or replace function public.move_workspace_folder(p_folder_id bigint, p_parent_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; cur bigint; anc bigint; above int := 0; height int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select project_id, parent_id into pid, cur from public.folders where id=p_folder_id;
  if pid is null then raise exception '폴더가 존재하지 않습니다.'; end if;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 폴더를 옮길 수 있습니다.'; end if;
  if p_parent_id is not null and not exists(select 1 from public.folders where id=p_parent_id and project_id=pid) then
    raise exception '옮길 폴더를 찾을 수 없습니다.';
  end if;
  if cur is not distinct from p_parent_id then return; end if;
  -- 새 상위 폴더에서 루트까지 올라가며 자기 자신을 만나면 순환이다. 올라간 단계 수 = 새 상위 폴더의 깊이.
  anc := p_parent_id;
  while anc is not null loop
    if anc = p_folder_id then raise exception '폴더를 자기 자신이나 하위 폴더 안으로 옮길 수 없습니다.'; end if;
    above := above + 1;
    if above > 10 then raise exception '폴더는 최대 10단계까지만 만들 수 있습니다.'; end if;
    select parent_id into anc from public.folders where id=anc;
  end loop;
  -- 옮기는 폴더부터 가장 깊은 하위 폴더까지의 단계 수(자기 포함).
  with recursive tree(id, lvl) as (
    select p_folder_id, 1
    union all
    select f.id, tree.lvl + 1 from public.folders f join tree on f.parent_id = tree.id where tree.lvl < 11
  )
  select max(lvl) into height from tree;
  if above + height > 10 then raise exception '폴더는 최대 10단계까지만 만들 수 있습니다.'; end if;
  -- 새 위치의 폴더들에 지금 보이는 순서대로 번호를 매기고, 옮긴 폴더는 그 맨 뒤에 둔다.
  update public.folders f set sort_order = o.rn
  from (select id, row_number() over (order by sort_order nulls last, id) as rn
        from public.folders where project_id=pid and parent_id is not distinct from p_parent_id and id<>p_folder_id) o
  where f.id = o.id;
  update public.folders set parent_id=p_parent_id,
    sort_order=(select count(*) + 1 from public.folders where project_id=pid and parent_id is not distinct from p_parent_id and id<>p_folder_id)
  where id=p_folder_id;
end $$;
revoke all on function public.move_workspace_folder(bigint, bigint) from public, anon;
grant execute on function public.move_workspace_folder(bigint, bigint) to authenticated;

-- 파일을 옮기면 새 폴더의 순서에는 아직 자리가 없다(null → 직접 정렬에서 맨 위). 나머지는 기존 정의와 같다.
create or replace function public.move_workspace_file(p_file_id bigint, p_folder_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; cur bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select project_id, folder_id into pid, cur from public.files where id=p_file_id;
  if pid is null then raise exception '파일이 존재하지 않습니다.'; end if;
  perform id from public.projects where id=pid and status='active' for share;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 파일을 옮길 수 있습니다.'; end if;
  if p_folder_id is not null and not exists(select 1 from public.folders where id=p_folder_id and project_id=pid) then
    raise exception '옮길 폴더를 찾을 수 없습니다.';
  end if;
  if cur is not distinct from p_folder_id then return; end if;
  perform set_config('app.move_only', 'on', true);
  update public.files set folder_id=p_folder_id, sort_order=null where id=p_file_id;
  perform set_config('app.move_only', '', true);
end $$;
revoke all on function public.move_workspace_file(bigint, bigint) from public, anon;
grant execute on function public.move_workspace_file(bigint, bigint) to authenticated;

-- p_kind: 'folder' 또는 'file'. p_ids는 모두 같은 프로젝트·같은 상위 폴더(파일은 같은 폴더)에 있어야 한다.
create or replace function public.reorder_workspace_items(p_kind text, p_ids bigint[])
returns void language plpgsql security definer set search_path=public as $$
declare n int := coalesce(array_length(p_ids, 1), 0); found_rows int; projects int; parents int; pid text; parent bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_kind not in ('folder', 'file') then raise exception '순서를 바꿀 수 없는 종류입니다.'; end if;
  if n = 0 then return; end if;
  if n > 2000 then raise exception '한 번에 2000개까지만 순서를 바꿀 수 있습니다.'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> n then raise exception '같은 항목이 두 번 들어 있습니다.'; end if;
  if p_kind = 'folder' then
    select count(*), count(distinct project_id), count(distinct coalesce(parent_id, -1)), min(project_id), min(parent_id)
      into found_rows, projects, parents, pid, parent from public.folders where id = any(p_ids);
  else
    select count(*), count(distinct project_id), count(distinct coalesce(folder_id, -1)), min(project_id), min(folder_id)
      into found_rows, projects, parents, pid, parent from public.files where id = any(p_ids);
  end if;
  if found_rows <> n or projects <> 1 then raise exception '순서를 바꿀 항목을 찾을 수 없습니다.'; end if;
  if parents <> 1 then raise exception '같은 폴더 안의 항목끼리만 순서를 바꿀 수 있습니다.'; end if;
  perform id from public.projects where id=pid and status='active' for share;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 순서를 바꿀 수 있습니다.'; end if;
  -- 보낸 항목은 1..n, 보내지 않은 같은 폴더의 항목(그사이 팀원이 새로 만든 것 등)은 그 뒤에 지금 순서대로 이어 매긴다(번호가 겹치지 않게).
  if p_kind = 'folder' then
    update public.folders f set sort_order = o.ord from unnest(p_ids) with ordinality o(id, ord) where f.id = o.id;
    update public.folders f set sort_order = n + o.rn
    from (select id, row_number() over (order by sort_order nulls last, id) as rn from public.folders
          where project_id = pid and parent_id is not distinct from parent and id <> all(p_ids)) o
    where f.id = o.id;
  else
    perform set_config('app.move_only', 'on', true);
    update public.files f set sort_order = o.ord from unnest(p_ids) with ordinality o(id, ord) where f.id = o.id;
    update public.files f set sort_order = n + o.rn
    from (select id, row_number() over (order by sort_order nulls last, id) as rn from public.files
          where project_id = pid and folder_id is not distinct from parent and id <> all(p_ids)) o
    where f.id = o.id;
    perform set_config('app.move_only', '', true);
  end if;
end $$;
revoke all on function public.reorder_workspace_items(text, bigint[]) from public, anon;
grant execute on function public.reorder_workspace_items(text, bigint[]) to authenticated;
