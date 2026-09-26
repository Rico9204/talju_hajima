-- 단체 채팅방: 팀장·부팀장이 팀원을 골라 만드는 채팅방. 채널 id는 'grp:<그룹 uuid>'.
--  * 방과 참여자 목록은 그 방의 참여자만 읽을 수 있다. 앱에서 직접 쓰지 못하고 create_chat_group 으로만 만든다.
--  * 메시지·읽음·반응·채팅 도구의 권한은 모두 can_access_chat_channel 하나를 거치므로 거기에 'grp:' 분기만 더한다.
--  * 방을 만들면 만든 사람 이름으로 첫 메시지를 남긴다. 초대받은 사람 화면에 실시간으로 방이 나타나게 하는 신호다.
begin;

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  primary key (group_id, member_id)
);
create index if not exists chat_group_members_member_idx on public.chat_group_members(member_id);
create index if not exists chat_groups_project_idx on public.chat_groups(project_id);

-- 내 member id가 이 방의 참여자인가. RLS 정책 안에서 자기 표를 다시 읽지 않도록 security definer.
create or replace function public.is_chat_group_member(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_group_members gm
    join public.members mine on mine.id = gm.member_id
    where gm.group_id = p_group_id and mine.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_chat_group_member(uuid) from public, anon;
grant execute on function public.is_chat_group_member(uuid) to authenticated;

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
revoke insert, update, delete on public.chat_groups, public.chat_group_members from anon, authenticated;
drop policy if exists chat_groups_read on public.chat_groups;
create policy chat_groups_read on public.chat_groups for select to authenticated using (public.is_chat_group_member(id));
drop policy if exists chat_group_members_read on public.chat_group_members;
create policy chat_group_members_read on public.chat_group_members for select to authenticated using (public.is_chat_group_member(group_id));

create or replace function public.can_access_chat_channel(p_project_id text, p_channel_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_channel_id = 'all' then exists (
      select 1 from public.members mine
      where mine.project_id = p_project_id and mine.user_id = (select auth.uid())
    )
    when p_channel_id ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'
      and split_part(p_channel_id, ':', 2) <> split_part(p_channel_id, ':', 3)
    then exists (
      select 1
      from public.members mine
      where mine.project_id = p_project_id
        and mine.user_id = (select auth.uid())
        and mine.id::text in (split_part(p_channel_id, ':', 2), split_part(p_channel_id, ':', 3))
        and exists (
          select 1 from public.members first_member
          where first_member.project_id = p_project_id and first_member.id::text = split_part(p_channel_id, ':', 2)
        )
        and exists (
          select 1 from public.members second_member
          where second_member.project_id = p_project_id and second_member.id::text = split_part(p_channel_id, ':', 3)
        )
    )
    when p_channel_id ~ '^grp:[0-9a-f-]{36}$' then exists (
      select 1 from public.chat_group_members gm
      join public.members mine on mine.id = gm.member_id
      where gm.group_id::text = substr(p_channel_id, 5)
        and gm.project_id = p_project_id
        and mine.project_id = p_project_id
        and mine.user_id = (select auth.uid())
    )
    else false
  end;
$$;
revoke all on function public.can_access_chat_channel(text, text) from public;
grant execute on function public.can_access_chat_channel(text, text) to authenticated;

-- 팀장·부팀장만. 나를 포함해 3명 이상(2명이면 1:1 채팅), 모두 이 프로젝트의 팀원이어야 한다.
-- ponytail: 방은 프로젝트당 50개까지. 이름 변경·나가기·삭제는 아직 없다.
create or replace function public.create_chat_group(p_project_id text, p_name text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_ids uuid[];
  v_group uuid;
begin
  perform id from public.projects where id = p_project_id and status = 'active' for update;
  if not found then raise exception '진행 중인 프로젝트에서만 채팅방을 만들 수 있습니다.'; end if;
  select id into v_me from public.members
    where project_id = p_project_id and user_id = auth.uid() and (is_leader or is_vice_leader);
  if v_me is null then raise exception '팀장 또는 부팀장만 단체 채팅방을 만들 수 있습니다.'; end if;
  if char_length(v_name) not between 1 and 30 then raise exception '채팅방 이름은 1~30자로 입력해 주세요.'; end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_member_ids, '{}') || v_me) x;
  if cardinality(v_ids) < 3 then raise exception '나를 제외하고 2명 이상 선택해 주세요.'; end if;
  if (select count(*) from public.members where project_id = p_project_id and id = any(v_ids)) <> cardinality(v_ids) then
    raise exception '이 프로젝트의 팀원만 초대할 수 있습니다.';
  end if;
  if (select count(*) from public.chat_groups where project_id = p_project_id) >= 50 then
    raise exception '채팅방은 프로젝트당 50개까지 만들 수 있습니다.';
  end if;
  insert into public.chat_groups(project_id, name, created_by) values (p_project_id, v_name, v_me) returning id into v_group;
  insert into public.chat_group_members(group_id, member_id, project_id) select v_group, x, p_project_id from unnest(v_ids) x;
  insert into public.chat_messages(project_id, channel_id, sender_id, text)
    values (p_project_id, 'grp:' || v_group, v_me, format('“%s” 단체 채팅방을 만들었습니다.', v_name));
  return v_group;
end $$;
revoke all on function public.create_chat_group(text, text, uuid[]) from public, anon;
grant execute on function public.create_chat_group(text, text, uuid[]) to authenticated;

commit;
