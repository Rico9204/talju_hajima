-- 과제 보드/일정/워크스페이스 변경사항을 실시간으로 반영. 채팅이 이미 쓰는
-- private 채널 + realtime.messages 인증 패턴을 그대로 재사용한다.
-- can_access_project_realtime_topic()이 지금까지 schema.sql에는 없고
-- migration_realtime_presence_authorization.sql / migration_fix_realtime_topic_uuid.sql
-- 로만 적용돼 있었으므로, 여기서 정규식을 확장하며 함께 정리한다.
begin;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tasks') then
    alter publication supabase_realtime add table tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='schedule_events') then
    alter publication supabase_realtime add table schedule_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='files') then
    alter publication supabase_realtime add table files;
  end if;
end $$;

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
      where p_topic ~ '^(presence|chat_messages|message_reads|task_comment_reactions|tasks|schedule_events|files):[^:]+$'
        and m.project_id = split_part(p_topic, ':', 2)
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

commit;
