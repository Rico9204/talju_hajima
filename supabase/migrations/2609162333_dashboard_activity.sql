-- Existing rows retain unknown timestamps; do not mark old records as newly created.
begin;
alter table public.files add column if not exists created_at timestamptz;
alter table public.files add column if not exists updated_at timestamptz;
alter table public.files alter column created_at set default now();
alter table public.schedule_events add column if not exists updated_at timestamptz;
create or replace function public.stamp_dashboard_activity() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then new.created_at:=now(); new.updated_at:=null;
 else new.created_at:=old.created_at; new.updated_at:=now(); end if;
 return new;
end $$;
drop trigger if exists files_activity_stamp on public.files;
create trigger files_activity_stamp before insert or update on public.files for each row execute function public.stamp_dashboard_activity();
drop trigger if exists schedule_activity_stamp on public.schedule_events;
create trigger schedule_activity_stamp before insert or update on public.schedule_events for each row execute function public.stamp_dashboard_activity();
create or replace function public.touch_file_activity() returns trigger
language plpgsql set search_path=public as $$
begin
 -- The initial version is part of registration, not a separate modification.
 if (select count(*) from public.file_versions where file_id=new.file_id)>1 then
  update public.files set updated_at=now() where id=new.file_id;
 end if;
 return new;
end $$;
drop trigger if exists file_version_activity on public.file_versions;
create trigger file_version_activity after insert on public.file_versions for each row execute function public.touch_file_activity();
commit;
