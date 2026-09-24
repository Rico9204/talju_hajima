-- 참여 프로젝트/함께한 동료를 프로젝트 종료 시점에 결산되도록 변경.
create or replace function public.member_participation_stats(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_project_count integer; v_collaborator_count integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_user_id is distinct from auth.uid() and not public.shares_project_with(p_user_id) then
    raise exception '조회할 수 없는 사용자입니다.';
  end if;
  -- 종료(done)된 프로젝트만 결산에 반영한다. 진행 중인 프로젝트는 종료 시점에 +1.
  select count(distinct m.project_id) into v_project_count
  from public.members m join public.projects p on p.id = m.project_id
  where m.user_id = p_user_id and p.status = 'done';
  -- 함께한 동료: 종료된 프로젝트들에서 만난 서로 다른 사람 수(중복 제외).
  select count(distinct coalesce(m.user_id::text, 'row:' || m.id::text)) into v_collaborator_count
  from public.members m join public.projects p on p.id = m.project_id
  where p.status = 'done'
    and m.project_id in (select project_id from public.members where user_id = p_user_id)
    and m.user_id is distinct from p_user_id;
  return jsonb_build_object('projectCount', coalesce(v_project_count, 0), 'collaboratorCount', coalesce(v_collaborator_count, 0));
end $$;
revoke all on function public.member_participation_stats(uuid) from public,anon;
grant execute on function public.member_participation_stats(uuid) to authenticated;

notify pgrst,'reload schema';
