-- Cross-project participation counts (프로젝트 참여 횟수/함께한 동료 수) for a
-- member other than yourself — shown on their profile card alongside the
-- current-project-only score from visible_evaluation_members. Counts only,
-- no scores from projects the viewer isn't part of, using the same "shares
-- at least one project with the viewer" visibility rule as profiles_select_own.
create or replace function public.member_participation_stats(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_project_count integer; v_collaborator_count integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_user_id is distinct from auth.uid() and not public.shares_project_with(p_user_id) then
    raise exception '조회할 수 없는 사용자입니다.';
  end if;
  select count(distinct project_id) into v_project_count from public.members where user_id = p_user_id;
  select count(*) into v_collaborator_count from (
    select coalesce(user_id::text, 'row:' || id::text) as k
    from public.members
    where project_id in (select project_id from public.members where user_id = p_user_id)
      and user_id is distinct from p_user_id
  ) t;
  return jsonb_build_object('projectCount', coalesce(v_project_count, 0), 'collaboratorCount', coalesce(v_collaborator_count, 0));
end $$;
revoke all on function public.member_participation_stats(uuid) from public,anon;
grant execute on function public.member_participation_stats(uuid) to authenticated;

notify pgrst,'reload schema';
