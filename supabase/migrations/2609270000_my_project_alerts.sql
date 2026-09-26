-- 메인 화면 프로젝트 목록의 알림 점: 내가 참여한 프로젝트마다 "확인하지 않은 것이 있는가".
-- 앱의 알림 기준과 같다(ProjectContext의 chatUnread·tasksUnread·scheduleUnread·workspaceUnread).
--  * 채팅: 내가 볼 수 있는 채널의 남이 보낸 메시지 중 내가 읽지 않은 것(채팅 도구의 행동 메시지 제외)
--  * 과제·일정·워크스페이스: 그 화면을 마지막으로 본 뒤(members.*_viewed_at) 새로 만들어진 것
-- security invoker: 각 표의 읽기 권한(RLS)이 그대로 적용되므로 화면에서 볼 수 없는 것은 세지 않는다.
-- ponytail: 프로젝트마다 exists 네 번. 메시지가 아주 많아져 느려지면 프로젝트별 안 읽음 카운터 표로 바꾼다.
begin;

-- members의 *_viewed_at 칼럼은 앱에 직접 읽기 권한이 없다(칼럼 단위 권한). 내 행만 돌려주는 좁은 창구.
create or replace function public.my_member_views()
returns table (member_id uuid, project_id text, tasks_viewed_at timestamptz, schedule_viewed_at timestamptz, workspace_viewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, project_id, tasks_viewed_at, schedule_viewed_at, workspace_viewed_at
  from public.members where user_id = auth.uid();
$$;
revoke all on function public.my_member_views() from public, anon;
grant execute on function public.my_member_views() to authenticated;

create or replace function public.my_project_alerts()
returns table (project_id text, has_alert boolean)
language sql stable security invoker set search_path = public as $$
  select m.project_id,
    exists (
      select 1 from public.chat_messages c
      where c.project_id = m.project_id and c.sender_id <> m.member_id
        and not starts_with(c.text, '[TALJU_CHAT_TOOL_ACTION]:')
        and not exists (select 1 from public.message_reads r where r.message_id = c.id and r.member_id = m.member_id)
    )
    or exists (select 1 from public.tasks t where t.project_id = m.project_id and t.created_at > m.tasks_viewed_at)
    or exists (select 1 from public.schedule_events e where e.project_id = m.project_id and e.created_at > m.schedule_viewed_at)
    or exists (select 1 from public.files f where f.project_id = m.project_id and f.created_at > m.workspace_viewed_at)
  from public.my_member_views() m;
$$;
revoke all on function public.my_project_alerts() from public, anon;
grant execute on function public.my_project_alerts() to authenticated;

commit;
