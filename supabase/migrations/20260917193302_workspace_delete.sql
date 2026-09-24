-- Apply after workspace versioning, tags and upload-time migrations.
begin;
alter table public.files add column if not exists owner_user_id uuid;
alter table public.folders add column if not exists owner_user_id uuid;
-- Only recover an original uploader from the first version's verified storage path.
-- Names are not reliable identities; legacy folders remain leader-only.
update public.files f set owner_user_id=public.workspace_storage_owner(v.storage_path)::uuid
from public.file_versions v
where f.owner_user_id is null and v.file_id=f.id
  and v.id=(select min(first.id) from public.file_versions first where first.file_id=f.id)
  and public.workspace_storage_project(v.storage_path)=f.project_id
  and public.workspace_storage_owner(v.storage_path) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
create or replace function public.stamp_workspace_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='INSERT' then new.owner_user_id:=auth.uid();
  else new.owner_user_id:=old.owner_user_id; end if;
  return new;
end $$;
drop trigger if exists workspace_file_owner on public.files;
create trigger workspace_file_owner before insert or update on public.files
for each row execute function public.stamp_workspace_owner();
drop trigger if exists workspace_folder_owner on public.folders;
create trigger workspace_folder_owner before insert or update on public.folders
for each row execute function public.stamp_workspace_owner();
-- Folder mutation must not bypass the RPC's ownership and nonempty checks.
revoke update,delete on public.folders from anon,authenticated;
drop policy if exists folders_all on public.folders;
drop policy if exists workspace_folders_read on public.folders;
drop policy if exists workspace_folders_insert on public.folders;
create policy workspace_folders_read on public.folders for select to authenticated using(public.is_project_member(project_id));
create policy workspace_folders_insert on public.folders for insert to authenticated with check(
  public.is_project_member(project_id) and exists(select 1 from public.projects p where p.id=folders.project_id and p.status='active')
);

-- Metadata deletion is atomic. Binary cleanup uses Storage's API, never SQL DELETE
-- on storage.objects. Keep a durable retry list if the network/API fails.
create table if not exists public.workspace_delete_queue (
  storage_path text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now()
);
alter table public.workspace_delete_queue enable row level security;
revoke all on public.workspace_delete_queue from anon,authenticated;
grant select on public.workspace_delete_queue to authenticated;
drop policy if exists workspace_cleanup_read on public.workspace_delete_queue;
create policy workspace_cleanup_read on public.workspace_delete_queue for select to authenticated using(
  public.is_project_member(project_id) and (deleted_by=auth.uid() or public.is_project_leader(project_id))
);
drop policy if exists workspace_deleted_binary_cleanup on storage.objects;
create policy workspace_deleted_binary_cleanup on storage.objects for delete to authenticated using(
  bucket_id='workspace-files'
  and exists(select 1 from public.workspace_delete_queue q where q.storage_path=objects.name)
  and not exists(select 1 from public.file_versions v where v.storage_path=objects.name)
);
create or replace function public.prevent_deleted_workspace_reuse()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.workspace_delete_queue where storage_path=new.storage_path) then
    raise exception '삭제 중인 원본은 다시 등록할 수 없습니다.';
  end if;
  return new;
end $$;
drop trigger if exists workspace_prevent_deleted_reuse on public.file_versions;
create trigger workspace_prevent_deleted_reuse before insert on public.file_versions
for each row execute function public.prevent_deleted_workspace_reuse();

create or replace function public.delete_workspace_file(p_file_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.files%rowtype;
begin
  select project_id into pid from public.files where id=p_file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.files where id=p_file_id for update;
  if not found then raise exception '파일이 존재하지 않습니다.'; end if;
  if not public.is_project_leader(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장 또는 최초 업로더만 파일을 삭제할 수 있습니다.';
  end if;
  insert into public.workspace_delete_queue(storage_path,project_id,deleted_by)
    select storage_path,pid,auth.uid() from public.file_versions where file_id=p_file_id and storage_path is not null
    on conflict(storage_path) do nothing;
  delete from public.files where id=p_file_id;
end $$;
create or replace function public.delete_workspace_folder(p_folder_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.folders%rowtype;
begin
  select project_id into pid from public.folders where id=p_folder_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.folders where id=p_folder_id for update;
  if not found then raise exception '폴더가 존재하지 않습니다.'; end if;
  if not public.is_project_leader(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장 또는 생성자만 폴더를 삭제할 수 있습니다.';
  end if;
  if exists(select 1 from public.files where folder_id=p_folder_id) then
    raise exception '파일이 있는 폴더는 삭제할 수 없습니다. 파일을 먼저 삭제해 주세요.';
  end if;
  delete from public.folders where id=p_folder_id;
end $$;
create or replace function public.finish_workspace_cleanup(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 정리할 수 있습니다.'; end if;
  delete from public.workspace_delete_queue q where q.project_id=p_project_id
    and (q.deleted_by=auth.uid() or public.is_project_leader(p_project_id))
    and not exists(select 1 from storage.objects o where o.bucket_id='workspace-files' and o.name=q.storage_path);
end $$;
revoke all on function public.delete_workspace_file(bigint), public.delete_workspace_folder(bigint), public.finish_workspace_cleanup(text) from public,anon;
grant execute on function public.delete_workspace_file(bigint), public.delete_workspace_folder(bigint), public.finish_workspace_cleanup(text) to authenticated;
commit;
