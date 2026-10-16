-- 단체 채팅방에 팀원 추가: 그 방에 참여 중인 팀장·부팀장만.
--  * 추가할 사람은 같은 프로젝트 팀원이어야 한다. 이미 참여 중인 사람은 건너뛴다.
--  * 초대한 사람 이름으로 안내 메시지를 남긴다. 새로 들어온 사람 화면에 방이 나타나고,
--    기존 참여자 화면의 인원 수가 갱신되는 신호다(앱은 "…초대했습니다." 메시지를 받으면 방 목록을 다시 받는다).
--  * 새 참여자도 방의 지난 대화를 모두 볼 수 있다(권한은 채널 단위).
begin;

create or replace function public.add_chat_group_members(p_group_id uuid, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.chat_groups%rowtype;
  v_me uuid;
  v_new uuid[];
begin
  select * into g from public.chat_groups where id = p_group_id for update;
  if not found then raise exception '채팅방을 찾을 수 없습니다.'; end if;
  perform id from public.projects where id = g.project_id and status = 'active';
  if not found then raise exception '진행 중인 프로젝트에서만 초대할 수 있습니다.'; end if;
  select m.id into v_me from public.members m
    join public.chat_group_members gm on gm.member_id = m.id and gm.group_id = p_group_id
    where m.project_id = g.project_id and m.user_id = auth.uid() and (m.is_leader or m.is_vice_leader);
  if v_me is null then raise exception '이 방에 참여 중인 팀장 또는 부팀장만 초대할 수 있습니다.'; end if;
  if (select count(*) from public.members where project_id = g.project_id and id = any(coalesce(p_member_ids, '{}')))
     <> (select count(distinct x) from unnest(coalesce(p_member_ids, '{}')) x) then
    raise exception '이 프로젝트의 팀원만 초대할 수 있습니다.';
  end if;
  select array_agg(distinct x) into v_new from unnest(coalesce(p_member_ids, '{}')) x
    where not exists (select 1 from public.chat_group_members gm where gm.group_id = p_group_id and gm.member_id = x);
  if v_new is null then raise exception '새로 초대할 팀원을 선택해 주세요.'; end if;
  insert into public.chat_group_members(group_id, member_id, project_id) select p_group_id, x, g.project_id from unnest(v_new) x;
  insert into public.chat_messages(project_id, channel_id, sender_id, text)
    values (g.project_id, 'grp:' || p_group_id, v_me,
      (select string_agg(name || '님', ', ' order by name) from public.members where id = any(v_new)) || '을 초대했습니다.');
end $$;
revoke all on function public.add_chat_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_chat_group_members(uuid, uuid[]) to authenticated;

commit;
