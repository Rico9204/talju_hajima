begin;
alter table public.file_versions add column if not exists search_text text not null default '';
alter table public.file_versions add column if not exists search_status text not null default 'pending';
create or replace function public.set_workspace_version_text(p_version_id bigint,p_text text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare pid text;
begin
  select f.project_id into pid from public.file_versions v join public.files f on f.id=v.file_id where v.id=p_version_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 본문을 저장할 수 있습니다.'; end if;
  if p_text is null or char_length(p_text)>200000 or p_status is null or p_status not in ('ready','partial','unsupported','failed') then raise exception '검색 본문이 올바르지 않습니다.'; end if;
  update public.file_versions set search_text=p_text,search_status=p_status where id=p_version_id;
end $$;
create or replace function public.register_workspace_search_version(
  p_project_id text,p_file_id bigint,p_base_version_id bigint,p_folder_id bigint,
  p_name text,p_type text,p_path text,p_note text,p_tags text[],p_search_text text,p_search_status text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  result := public.register_workspace_version(p_project_id,p_file_id,p_base_version_id,p_folder_id,p_name,p_type,p_path,p_note,p_tags);
  perform public.set_workspace_version_text((result->>'version_id')::bigint,p_search_text,p_search_status);
  return result;
end $$;
revoke all on function public.set_workspace_version_text(bigint,text,text),public.register_workspace_search_version(text,bigint,bigint,bigint,text,text,text,text,text[],text,text) from public,anon;
grant execute on function public.set_workspace_version_text(bigint,text,text),public.register_workspace_search_version(text,bigint,bigint,bigint,text,text,text,text,text[],text,text) to authenticated;
commit;
