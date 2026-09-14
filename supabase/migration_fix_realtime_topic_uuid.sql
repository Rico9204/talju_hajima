-- Fix the Realtime authorization helper's topic parsing. Realtime topics are
-- text, while members.project_id is UUID; compare UUID values only after the
-- topic has passed a strict UUID format check. This prevents policy evaluation
-- errors from surfacing to clients as a generic "transfer failure".
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
      where m.project_id = case
        when p_topic ~* '^(presence|chat_messages|message_reads):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(p_topic, ':', 2)::uuid
        else null
      end
        and m.user_id = auth.uid()
    );
$$;

revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;
