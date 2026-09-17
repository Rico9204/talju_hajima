-- Fix name resolving to projects.name inside the correlated subquery.
-- Apply after migration_workspace_storage_unicode.sql. No data is changed.
begin;
drop policy if exists workspace_binary_insert on storage.objects;
create policy workspace_binary_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'workspace-files'
  and public.workspace_storage_owner(objects.name) = auth.uid()::text
  and public.is_project_member(public.workspace_storage_project(objects.name))
  and exists (
    select 1 from public.projects p
    where p.id = public.workspace_storage_project(objects.name)
      and p.status = 'active'
  )
);
commit;
