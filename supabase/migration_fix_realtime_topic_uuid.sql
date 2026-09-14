-- Fix the Realtime authorization helper's topic parsing. Project ids are
-- stored as text in this schema, so only accept the app's known channel
-- families and one colon-free project id segment. This prevents policy
-- evaluation errors from surfacing to clients as a generic "transfer failure".
create or replace function public.can_access_project_realtime_topic(p_topic text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.members m
      where p_topic ~ '^(presence|chat_messages|message_reads):[^:]+$'
        and m.project_id = split_part(p_topic, ':', 2)
        and m.user_id = auth.uid()
    );
$$;

revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;
