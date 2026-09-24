-- 동시 편집(바로 수정) Realtime: 프로젝트 참여자만 collab_presence(presence)와 collab_doc(broadcast)를 쓸 수 있다.
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
      where (
          p_topic ~ '^(presence|collab_presence|chat_messages|message_reads|task_comment_reactions|tasks|schedule_events|files):[^:]+$'
          or p_topic ~ '^collab_doc:[^:]+:[0-9]+:[0-9]+:(main|pin)$'
        )
        and m.project_id = split_part(p_topic, ':', 2)
        and m.user_id = auth.uid()
    );
$$;
revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;

drop policy if exists project_members_broadcast_collab on realtime.messages;
create policy project_members_broadcast_collab
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'collab_doc:%'
  and public.can_access_project_realtime_topic(realtime.topic())
);
