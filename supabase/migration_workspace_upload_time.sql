-- Existing date-only versions intentionally keep an unknown upload time.
begin;
alter table public.file_versions add column if not exists uploaded_at timestamptz;
alter table public.file_versions alter column uploaded_at set default now();
-- Server-owned timestamp: edits, pins and version promotion preserve it.
create or replace function public.stamp_workspace_upload_time()
returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='INSERT' then new.uploaded_at:=now();
  else new.uploaded_at:=old.uploaded_at; end if;
  return new;
end $$;
drop trigger if exists workspace_upload_time on public.file_versions;
create trigger workspace_upload_time before insert or update on public.file_versions
for each row execute function public.stamp_workspace_upload_time();
commit;
