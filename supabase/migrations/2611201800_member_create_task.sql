-- ===== 과제 만들기: 팀원도 가능(본인이 담당자에 들어 있을 때만) =====
-- 팀장·부팀장은 누구에게나 과제를 배정할 수 있고, 팀원은 본인이 포함된 과제만 만든다(다른 팀원을 함께 넣는 것은 가능).
-- 과제와 담당자를 한 번에 검사해야 해서 직접 쓰기(tasks_insert는 팀장·부팀장만) 대신 이 함수로만 만든다.
-- 새 과제는 늘 예정(todo)에서 시작하고, 종료된 프로젝트에는 만들 수 없다(승인 전 프로젝트는 approved_project_write가 막는다).
create or replace function public.create_task(
  p_project_id text, p_title text, p_assignee_ids uuid[], p_priority text default 'mid', p_due text default '', p_tags text[] default '{}'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  ids uuid[] := array(select distinct x from unnest(coalesce(p_assignee_ids, '{}')) x where x is not null);
  me public.members;
  first_member public.members;
  clean_title text := btrim(coalesce(p_title, ''));
  clean_tags text[];
  new_id bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into me from public.members where project_id = p_project_id and user_id = auth.uid();
  if not found then raise exception '프로젝트 참여자만 과제를 만들 수 있습니다.'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and status = 'active') then
    raise exception '종료된 프로젝트에는 과제를 만들 수 없습니다.';
  end if;
  if char_length(clean_title) = 0 then raise exception '과제 제목을 입력해주세요.'; end if;
  if char_length(clean_title) > 200 then raise exception '과제 제목은 200자까지 입력할 수 있습니다.'; end if;
  if cardinality(ids) = 0 then raise exception '담당자를 한 명 이상 선택해주세요.'; end if;
  if cardinality(ids) > 50 then raise exception '담당자는 50명까지 지정할 수 있습니다.'; end if;
  if (select count(*) from public.members where project_id = p_project_id and id = any (ids)) <> cardinality(ids) then
    raise exception '담당자는 이 프로젝트의 팀원 중에서 골라주세요.';
  end if;
  if not public.is_project_manager(p_project_id) and not (me.id = any (ids)) then
    raise exception '팀원은 본인이 담당자에 포함된 과제만 만들 수 있습니다.';
  end if;
  if coalesce(p_priority, '') not in ('high', 'mid', 'low') then raise exception '우선순위를 올바르게 골라주세요.'; end if;
  if coalesce(p_due, '') !~ '^(\d{4}-\d{2}-\d{2})?$' then raise exception '마감일 형식이 올바르지 않습니다.'; end if;
  clean_tags := array(select distinct left(btrim(t), 30) from unnest(coalesce(p_tags, '{}')) t where btrim(t) <> '');
  if cardinality(clean_tags) > 20 then raise exception '태그는 20개까지 달 수 있습니다.'; end if;
  -- 카드에 보이는 대표 담당자: 고른 순서의 첫 번째
  select * into first_member from public.members
  where id = (select x from unnest(p_assignee_ids) with ordinality u(x, n) where x is not null order by n limit 1);
  insert into public.tasks(project_id, title, assignee, avatar, priority, due, tags, status, color)
  values (p_project_id, clean_title, first_member.name, first_member.avatar, p_priority, coalesce(p_due, ''), clean_tags, 'todo', first_member.color)
  returning id into new_id;
  insert into public.task_assignees(task_id, member_id) select new_id, x from unnest(ids) x;
  return new_id;
end $$;
revoke all on function public.create_task(text, text, uuid[], text, text, text[]) from public, anon;
grant execute on function public.create_task(text, text, uuid[], text, text, text[]) to authenticated;
