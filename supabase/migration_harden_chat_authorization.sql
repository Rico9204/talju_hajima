-- Security hardening for team chat.
-- Run this after schema.sql and the chat/reaction migrations. It is safe to
-- run more than once and deliberately removes legacy read/reaction rows that
-- do not belong to the message's project or channel.

-- A composite parent key prevents a valid message id from being paired with a
-- different project id in read receipts or reactions.
do $$ begin
  alter table chat_messages add constraint chat_messages_id_project_unique unique (id, project_id);
exception when duplicate_object then null;
end $$;

create table if not exists message_reactions (
  message_id bigint not null references chat_messages(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);
create index if not exists message_reactions_project_idx on message_reactions (project_id, message_id);

-- Repair rows produced before project/message integrity was enforced. A row
-- is retained only when its reader/reactor is a member of the message project.
update message_reads r
set project_id = c.project_id
from chat_messages c, members m
where r.message_id = c.id
  and m.id = r.member_id
  and r.project_id <> c.project_id
  and m.project_id = c.project_id;

delete from message_reads r
using chat_messages c
where r.message_id = c.id
  and (
    r.project_id <> c.project_id
    or not exists (
      select 1 from members m
      where m.id = r.member_id and m.project_id = c.project_id
    )
  );

update message_reactions r
set project_id = c.project_id
from chat_messages c, members m
where r.message_id = c.id
  and m.id = r.member_id
  and r.project_id <> c.project_id
  and m.project_id = c.project_id;

delete from message_reactions r
using chat_messages c
where r.message_id = c.id
  and (
    r.project_id <> c.project_id
    or not exists (
      select 1 from members m
      where m.id = r.member_id and m.project_id = c.project_id
    )
  );

do $$ begin
  alter table message_reads add constraint message_reads_message_project_fk
    foreign key (message_id, project_id) references chat_messages(id, project_id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table message_reactions add constraint message_reactions_message_project_fk
    foreign key (message_id, project_id) references chat_messages(id, project_id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- `all` is team-wide. A direct-message channel is valid only for the two
-- project members encoded as UUIDs in its `dm:<member-id>:<member-id>` id.
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
          where first_member.project_id = p_project_id
            and first_member.id::text = split_part(p_channel_id, ':', 2)
        )
        and exists (
          select 1 from public.members second_member
          where second_member.project_id = p_project_id
            and second_member.id::text = split_part(p_channel_id, ':', 3)
        )
    )
    else false
  end;
$$;
revoke all on function public.can_access_chat_channel(text, text) from public;
grant execute on function public.can_access_chat_channel(text, text) to authenticated;

-- Trigger-managed write counters. Clients cannot read or modify this table.
create table if not exists chat_write_rate_limits (
  member_id uuid not null references members(id) on delete cascade,
  kind text not null check (kind in ('message', 'reaction')),
  window_started timestamptz not null default now(),
  event_count integer not null default 0 check (event_count >= 0),
  primary key (member_id, kind)
);

create or replace function public.consume_chat_rate_limit(p_member_id uuid, p_kind text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_limit public.chat_write_rate_limits%rowtype;
begin
  insert into public.chat_write_rate_limits (member_id, kind, window_started, event_count)
  values (p_member_id, p_kind, now(), 0)
  on conflict (member_id, kind) do nothing;

  select * into current_limit
  from public.chat_write_rate_limits
  where member_id = p_member_id and kind = p_kind
  for update;

  if current_limit.window_started <= now() - p_window then
    update public.chat_write_rate_limits
    set window_started = now(), event_count = 1
    where member_id = p_member_id and kind = p_kind;
  elsif current_limit.event_count >= p_max then
    raise exception 'Too many chat requests. Please try again shortly.' using errcode = 'P0001';
  else
    update public.chat_write_rate_limits
    set event_count = event_count + 1
    where member_id = p_member_id and kind = p_kind;
  end if;
end;
$$;

create or replace function public.enforce_chat_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.members m where m.id = new.sender_id and m.user_id = (select auth.uid())) then
    raise exception 'Invalid chat sender.' using errcode = '42501';
  end if;
  perform public.consume_chat_rate_limit(new.sender_id, 'message', 12, interval '30 seconds');
  return new;
end;
$$;

create or replace function public.enforce_chat_reaction_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.members m where m.id = new.member_id and m.user_id = (select auth.uid())) then
    raise exception 'Invalid reaction member.' using errcode = '42501';
  end if;
  perform public.consume_chat_rate_limit(new.member_id, 'reaction', 30, interval '30 seconds');
  return new;
end;
$$;

drop trigger if exists chat_messages_rate_limit on chat_messages;
create trigger chat_messages_rate_limit before insert on chat_messages
for each row execute function public.enforce_chat_message_rate_limit();
drop trigger if exists message_reactions_rate_limit on message_reactions;
create trigger message_reactions_rate_limit before insert on message_reactions
for each row execute function public.enforce_chat_reaction_rate_limit();

alter table chat_write_rate_limits enable row level security;
revoke all on table chat_write_rate_limits from anon, authenticated;
revoke all on function public.consume_chat_rate_limit(uuid, text, integer, interval) from public;
revoke all on function public.enforce_chat_message_rate_limit() from public;
revoke all on function public.enforce_chat_reaction_rate_limit() from public;

-- RLS now follows the actual message channel, not just project membership.
alter table chat_messages enable row level security;
alter table message_reads enable row level security;
alter table message_reactions enable row level security;

drop policy if exists chat_messages_select on chat_messages;
drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_select on chat_messages for select to authenticated
  using (public.can_access_chat_channel(project_id, channel_id));
create policy chat_messages_insert on chat_messages for insert to authenticated
  with check (
    public.can_access_chat_channel(project_id, channel_id)
    and exists (select 1 from public.members m where m.id = sender_id and m.user_id = (select auth.uid()))
  );

drop policy if exists message_reads_select on message_reads;
drop policy if exists message_reads_insert on message_reads;
create policy message_reads_select on message_reads for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages c
      where c.id = message_id
        and c.project_id = message_reads.project_id
        and public.can_access_chat_channel(c.project_id, c.channel_id)
    )
  );
create policy message_reads_insert on message_reads for insert to authenticated
  with check (
    exists (
      select 1 from public.chat_messages c
      where c.id = message_id
        and c.project_id = message_reads.project_id
        and public.can_access_chat_channel(c.project_id, c.channel_id)
    )
    and exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()))
  );

drop policy if exists message_reactions_select on message_reactions;
drop policy if exists message_reactions_insert on message_reactions;
drop policy if exists message_reactions_delete on message_reactions;
create policy message_reactions_select on message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages c
      where c.id = message_id
        and c.project_id = message_reactions.project_id
        and public.can_access_chat_channel(c.project_id, c.channel_id)
    )
  );
create policy message_reactions_insert on message_reactions for insert to authenticated
  with check (
    exists (
      select 1 from public.chat_messages c
      where c.id = message_id
        and c.project_id = message_reactions.project_id
        and public.can_access_chat_channel(c.project_id, c.channel_id)
    )
    and exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()))
  );
create policy message_reactions_delete on message_reactions for delete to authenticated
  using (
    exists (
      select 1 from public.chat_messages c
      where c.id = message_id
        and c.project_id = message_reactions.project_id
        and public.can_access_chat_channel(c.project_id, c.channel_id)
    )
    and exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()))
  );

revoke all on table chat_messages, message_reads, message_reactions from anon, authenticated;
grant select, insert on table chat_messages to authenticated;
grant select, insert on table message_reads to authenticated;
grant select, insert, delete on table message_reactions to authenticated;
