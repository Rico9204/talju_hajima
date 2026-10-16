-- ===== 팀장 위임: 대상을 팀원 id로 찾는다 =====
-- 기존 transfer_leadership(p_project_id, p_target_name)은 참여 당시 이름(members.name)으로 찾는데,
-- 팀 화면은 팀원 id를 보내고 있어 위임이 항상 실패했다(이름을 바꾼 팀원도 찾을 수 없었다).
-- 이름 대신 id로 찾는 함수를 추가한다. 검사·교체 방식은 기존 함수와 같다(기존 함수는 그대로 둔다).
create or replace function public.transfer_leadership_to_member(p_project_id text, p_target_member_id uuid)
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
    where project_id = p_project_id and id = p_target_member_id and not is_leader;
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
revoke all on function public.transfer_leadership_to_member(text, uuid) from public, anon;
grant execute on function public.transfer_leadership_to_member(text, uuid) to authenticated;
