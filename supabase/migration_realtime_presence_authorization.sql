-- Private Realtime authorization. Do not call the app's generic
-- is_project_member() helper from realtime.messages policies: Realtime runs
-- its authorization check with a different schema context. This function
-- explicitly qualifies public.members and fixes its search_path instead.
--
-- The application opens exactly these private channel topic families:
-- Presence plus two Postgres Changes subscriptions for chat. A private
-- channel also requires SELECT authorization at join time, even if the
-- channel's events are separately protected by the source table's RLS.
create or replace function public.can_access_project_realtime_topic(p_topic text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_topic ~ '^(presence|chat_messages|message_reads):.+$'
    and exists (
      select 1
      from public.members m
      where m.project_id = (regexp_match(p_topic, '^(presence|chat_messages|message_reads):(.+)$'))[2]
        and m.user_id = auth.uid()
    );
$$;

revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;

drop policy if exists project_members_receive_presence on realtime.messages;
drop policy if exists project_members_receive_project_realtime on realtime.messages;
drop policy if exists project_members_track_presence on realtime.messages;

create policy project_members_receive_project_realtime
on realtime.messages
for select
to authenticated
using (
  public.can_access_project_realtime_topic(realtime.topic())
);

create policy project_members_track_presence
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and public.can_access_project_realtime_topic(realtime.topic())
);
