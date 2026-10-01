-- ===== 일정 작성자: 작성자별 일정 필터용 (Temporary_Merge의 "참여자별 일정 필터" 이식) =====
-- 팀 일정에는 누가 만들었는지 기록이 없었다. 새 일정부터 만든 사람(그 프로젝트의 내 팀원 행)을 남긴다.
-- 값은 화면이 보내는 것이 아니라 트리거가 로그인한 사용자로 정하고, 수정으로 바꿀 수 없다.
alter table public.schedule_events add column if not exists created_by_member_id uuid references public.members(id) on delete set null;

-- 개인 일정은 소유자가 곧 만든 사람이다(기존 일정도 채운다). 기존 팀 일정은 알 수 없으므로 비워 둔다.
-- app.move_only: 수정 시각(updated_at)을 건드리지 않게(stamp_dashboard_activity) — 채우기만 하고 "수정됨"으로 보이지 않도록.
select set_config('app.move_only', 'on', false);
update public.schedule_events set created_by_member_id = owner_member_id
where created_by_member_id is null and scope = 'personal' and owner_member_id is not null;
select set_config('app.move_only', '', false);

create or replace function public.set_schedule_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_member_id := (select m.id from public.members m where m.project_id = new.project_id and m.user_id = auth.uid() limit 1);
    if new.created_by_member_id is null and new.scope = 'personal' then new.created_by_member_id := new.owner_member_id; end if;
  else
    new.created_by_member_id := old.created_by_member_id;
  end if;
  return new;
end $$;
revoke all on function public.set_schedule_creator() from public, anon, authenticated;

drop trigger if exists schedule_set_creator on public.schedule_events;
create trigger schedule_set_creator before insert or update on public.schedule_events
for each row execute function public.set_schedule_creator();
