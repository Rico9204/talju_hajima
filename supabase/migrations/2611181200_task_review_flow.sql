-- ===== 과제 검토 흐름: 팀원은 "검토 중"까지, 완료·반려는 팀장·부팀장 =====
-- 담당자도 과제를 고칠 수 있으므로(tasks_update), 완료로 옮기기·완료에서 빼기는 트리거로 팀장·부팀장만 허용한다(API 직접 호출도 막힘).
-- 반려는 reject_task_review()로만: 검토 중 → 진행 중 + 반려 사유를 "반려 피드백" 댓글로 남긴다.

alter table public.task_comments add column if not exists kind text not null default 'comment' check (kind in ('comment', 'rejection'));

-- 팀원이 직접 넣는 댓글은 일반 댓글만(반려 피드백을 흉내 내지 못하게).
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert
  with check (
    public.is_task_project_member(task_id)
    and kind = 'comment'
    and exists (select 1 from public.members m where m.id = member_id and m.user_id = auth.uid())
  );

create or replace function public.guard_task_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and 'done' in (old.status, new.status)
     and not public.is_project_manager(new.project_id) then
    raise exception '완료 처리와 완료 취소는 팀장·부팀장만 할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists guard_task_status_trigger on public.tasks;
create trigger guard_task_status_trigger before update of status on public.tasks
  for each row execute function public.guard_task_status();

create or replace function public.reject_task_review(p_task_id bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
  me public.members;
  reason text := btrim(coalesce(p_reason, ''));
  new_id bigint;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception '과제를 찾을 수 없습니다.'; end if;
  if not public.is_project_manager(t.project_id) then raise exception '팀장·부팀장만 반려할 수 있습니다.'; end if;
  if t.status <> 'review' then raise exception '검토 중인 과제만 반려할 수 있습니다.'; end if;
  if reason = '' then raise exception '반려 사유를 입력해주세요.'; end if;
  if length(reason) > 2000 then raise exception '반려 사유는 2000자까지 입력할 수 있습니다.'; end if;
  select * into me from public.members where project_id = t.project_id and user_id = auth.uid();
  update public.tasks set status = 'inprogress' where id = p_task_id;
  insert into public.task_comments(task_id, member_id, author, avatar, date, text, kind)
    values (p_task_id, me.id, me.name, me.avatar, (now() at time zone 'Asia/Seoul')::date, reason, 'rejection')
    returning id into new_id;
  return new_id;
end $$;
revoke all on function public.reject_task_review(bigint, text) from public, anon;
grant execute on function public.reject_task_review(bigint, text) to authenticated;
