-- ===== 새 과제는 "예정"(todo)에서 시작 =====
-- 과제 흐름: 예정 → 진행 중 → 검토 중(팀원까지) → 완료(팀장·부팀장, guard_task_status).
-- 검토 중·완료로 바로 만들면 이 흐름과 완료 수가 어긋나므로, 사용자가 만드는 과제는 예정으로만 받는다.
-- 로그인 사용자가 아닌 관리 작업(seed 등, auth.uid() 없음)은 막지 않는다.
create or replace function public.guard_task_insert_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.status <> 'todo' then
    raise exception '새 과제는 예정 단계에서 시작합니다.';
  end if;
  return new;
end $$;
drop trigger if exists guard_task_insert_status_trigger on public.tasks;
create trigger guard_task_insert_status_trigger before insert on public.tasks
  for each row execute function public.guard_task_insert_status();
