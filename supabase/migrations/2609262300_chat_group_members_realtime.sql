-- 단체 채팅방 참여자 변경을 실시간으로 알린다.
-- 이전에는 앱이 "…을 초대했습니다."로 끝나는 메시지를 보고 방 목록을 다시 받았는데, 이 문구는 누구나 직접 입력할 수 있었다.
-- 이제는 chat_group_members 에 행이 추가된 사실(서버 함수만 쓸 수 있음)을 postgres_changes 로 받는다.
-- 구독자에게는 읽기 권한(chat_group_members_read: 그 방의 참여자만)이 적용되므로 다른 방의 참여자 정보는 전달되지 않는다.
begin;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_group_members') then
    alter publication supabase_realtime add table public.chat_group_members;
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
      where (
          p_topic ~ '^(presence|collab_presence|chat_messages|chat_tool_events|chat_group_members|message_reads|task_comment_reactions|tasks|schedule_events|files):[^:]+$'
          or p_topic ~ '^collab_doc:[^:]+:[0-9]+:[0-9]+:(main|pin)$'
        )
        and m.project_id = split_part(p_topic, ':', 2)
        and m.user_id = auth.uid()
    );
$$;
revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;

commit;
