-- transfer_leadership이 is_leader만 바꾸고 role 표시 문구("팀장"/"팀원")는
-- 그대로 둬서, 위임 후에도 옛 팀장이 "팀장"으로, 새 팀장이 "팀원"으로 표시되던
-- 문제 수정. migration_security_members.sql 적용 후 이 스크립트만 추가로
-- 실행하면 됩니다 (CREATE OR REPLACE라 재실행해도 안전합니다).

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

  update members set is_leader = false,
    role = case when v_caller_role = '팀장' then '팀원' else v_caller_role end
    where id = v_caller_id;
  update members set is_leader = true,
    role = case when v_target_role in ('참여자', '팀원') then '팀장' else v_target_role end
    where id = v_target_id;
end;
$$;
