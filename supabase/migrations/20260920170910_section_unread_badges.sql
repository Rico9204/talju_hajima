-- 과제 보드/일정/워크스페이스에 새로 등록된 내용이 있으면 좌측 메뉴에 알림
-- 배지로 표시하기 위한 "마지막으로 본 시각" 저장 컬럼. default now()라서
-- 신규 멤버 행(가입 시점)과 이 마이그레이션 적용 시점의 기존 멤버 행 모두
-- 가입/적용 이전 콘텐츠까지 전부 "새 항목"으로 뜨는 걸 방지한다.
alter table public.members add column if not exists tasks_viewed_at timestamptz not null default now();
alter table public.members add column if not exists schedule_viewed_at timestamptz not null default now();
alter table public.members add column if not exists workspace_viewed_at timestamptz not null default now();
alter table public.tasks add column if not exists created_at timestamptz not null default now();

create or replace function public.mark_section_viewed(p_project_id text, p_section text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_section not in ('tasks','schedule','workspace') then raise exception '잘못된 섹션입니다.'; end if;
  if p_section = 'tasks' then
    update public.members set tasks_viewed_at = now() where project_id = p_project_id and user_id = auth.uid();
  elsif p_section = 'schedule' then
    update public.members set schedule_viewed_at = now() where project_id = p_project_id and user_id = auth.uid();
  else
    update public.members set workspace_viewed_at = now() where project_id = p_project_id and user_id = auth.uid();
  end if;
end $$;
revoke all on function public.mark_section_viewed(text,text) from public,anon;
grant execute on function public.mark_section_viewed(text,text) to authenticated;

-- visible_evaluation_members/admin_project_members return whole `members` rows
-- (returns setof public.members), so the three *_viewed_at columns above would
-- otherwise leak every teammate's last-viewed timestamps to everyone else who
-- calls these RPCs. Keep them visible only to the row's own owner.
create or replace function public.visible_evaluation_members(p_project_id text default null)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members; a jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_project_id is not null and not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 for m in select * from members where (p_project_id is null and user_id=auth.uid()) or (p_project_id is not null and project_id=p_project_id) loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0; m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  if p_project_id is not null then
   a := public.member_evaluation_average(m.project_id, m.id, 'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  elsif m.user_id=auth.uid() then
   a:=public.my_evaluation_average(m.project_id,'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  end if;
  if m.user_id is distinct from auth.uid() then
   m.tasks_viewed_at:=null; m.schedule_viewed_at:=null; m.workspace_viewed_at:=null;
  end if;
  return next m;
 end loop;
end $$;
revoke all on function public.visible_evaluation_members(text) from public,anon;
grant execute on function public.visible_evaluation_members(text) to authenticated;

create or replace function public.admin_project_members(p_project_id text)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members;
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 조회할 수 있습니다.'; end if;
 for m in select * from public.members where project_id=p_project_id order by is_leader desc,name loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0;
  m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  m.tasks_viewed_at:=null; m.schedule_viewed_at:=null; m.workspace_viewed_at:=null;
  return next m;
 end loop;
end $$;
revoke all on function public.admin_project_members(text) from public,anon;
grant execute on function public.admin_project_members(text) to authenticated;

notify pgrst,'reload schema';
