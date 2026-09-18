-- Apply in Supabase SQL Editor to validate persisted project completion.
begin;
create or replace function public.complete_evaluation_project(p_project_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform id from public.projects where id = p_project_id for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  if not public.is_project_leader(p_project_id) then raise exception '팀장만 프로젝트를 종료할 수 있습니다.'; end if;
  update public.projects set status = 'done' where id = p_project_id and status = 'active';
  if not exists (select 1 from public.projects where id = p_project_id and status = 'done') then
    raise exception '프로젝트 종료 상태가 저장되지 않았습니다. 프로젝트 트리거를 확인해 주세요.';
  end if;
end;
$$;
revoke all on function public.complete_evaluation_project(text) from public, anon;
grant execute on function public.complete_evaluation_project(text) to authenticated;
commit;
