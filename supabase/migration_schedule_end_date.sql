-- 일정에 기간(종료일) 지정 기능 추가 — null이면 기존처럼 하루짜리 일정.
begin;
alter table public.schedule_events add column if not exists end_date date;
do $$ begin
  alter table public.schedule_events
    add constraint schedule_events_end_date_after_start check (end_date is null or end_date >= date);
exception when duplicate_object then null;
end $$;
commit;
