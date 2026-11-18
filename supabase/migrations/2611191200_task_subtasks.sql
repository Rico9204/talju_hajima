-- ===== 세부 업무: 체크리스트 항목마다 담당자(그 과제의 담당자 중 한 명, 비워 둘 수 있음) =====
-- 추가·수정·삭제는 팀장·부팀장 또는 과제 담당자. 완료 표시는 그 세부 업무의 담당자(담당자가 없으면 과제 담당자 누구나)와 팀장·부팀장.

alter table public.task_checklist_items add column if not exists assignee_member_id uuid references public.members(id) on delete set null;

drop policy if exists task_checklist_items_write on public.task_checklist_items;
create policy task_checklist_items_write on public.task_checklist_items for all
  using (public.is_task_project_manager(task_id) or public.is_task_assignee(task_id))
  with check (public.is_task_project_manager(task_id) or public.is_task_assignee(task_id));

create or replace function public.guard_task_checklist_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_member_id is not null
     and (tg_op = 'INSERT' or new.assignee_member_id is distinct from old.assignee_member_id)
     and not exists (select 1 from public.task_assignees where task_id = new.task_id and member_id = new.assignee_member_id) then
    raise exception '세부 업무 담당자는 이 과제의 담당자 중에서 정해 주세요.';
  end if;
  if tg_op = 'UPDATE' and new.done is distinct from old.done and old.assignee_member_id is not null
     and not public.is_task_project_manager(new.task_id)
     and not exists (select 1 from public.members where id = old.assignee_member_id and user_id = auth.uid()) then
    raise exception '세부 업무 담당자나 팀장·부팀장만 완료 표시를 바꿀 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists guard_task_checklist_item_trigger on public.task_checklist_items;
create trigger guard_task_checklist_item_trigger before insert or update on public.task_checklist_items
  for each row execute function public.guard_task_checklist_item();
