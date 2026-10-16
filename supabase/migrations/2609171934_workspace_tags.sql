-- Apply after workspace versioning and path-policy migrations.
begin;
alter table public.files add column if not exists tags text[] not null default '{}';
update public.files set tags=array[tag] where cardinality(tags)=0 and trim(coalesce(tag,'')) not in ('','기타');
create or replace function public.normalize_workspace_tags(p_tags text[])
returns text[] language plpgsql immutable set search_path=public as $$
declare result text[];
begin
  select coalesce(array_agg(tag order by first_position),array[]::text[]) into result
  from (select btrim(value) tag,min(position) first_position from unnest(p_tags) with ordinality as t(value,position)
    where nullif(btrim(value),'') is not null group by btrim(value)) cleaned;
  if cardinality(result)>10 or exists(select 1 from unnest(result) tag where char_length(tag)>30) then
    raise exception '태그는 최대 10개, 각각 30자까지 입력할 수 있습니다.';
  end if;
  return result;
end $$;
drop function if exists public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text);
create or replace function public.register_workspace_version(
  p_project_id text,p_file_id bigint,p_base_version_id bigint,p_folder_id bigint,
  p_name text,p_type text,p_path text,p_note text,p_tags text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.members%rowtype;
  f public.files%rowtype;
  existing public.file_versions%rowtype;
  head_id bigint;
  new_id bigint;
  n integer;
  bytes bigint;
  mime text;
  size_label text;
  make_current boolean;
  normalized_tags text[];
begin
  -- Same lock used by project completion: no upload can commit after closure.
  perform id from public.projects where id=p_project_id and status='active' for update;
  if not found then raise exception '진행 중인 프로젝트에만 업로드할 수 있습니다.'; end if;
  select * into actor from public.members where project_id=p_project_id and user_id=auth.uid();
  if not found then raise exception '프로젝트 참여자만 업로드할 수 있습니다.'; end if;
  if p_name is null or length(trim(p_name))=0 or length(p_name)>255 or length(coalesce(p_note,''))>2000 then
    raise exception '파일 이름 또는 메모가 올바르지 않습니다.';
  end if;
  if p_type is null or p_type not in ('pdf','doc','img','ppt','xls','zip') then raise exception '잘못된 파일 유형입니다.'; end if;
  if p_path is null or public.workspace_storage_project(p_path) is distinct from p_project_id or public.workspace_storage_owner(p_path) is distinct from auth.uid()::text then
    raise exception '업로드 경로가 올바르지 않습니다.';
  end if;
  select (metadata->>'size')::bigint,coalesce(metadata->>'mimetype','application/octet-stream')
    into bytes,mime from storage.objects where bucket_id='workspace-files' and name=p_path for update;
  if not found or bytes is null or bytes<0 or bytes>52428800 then raise exception '업로드한 파일을 확인할 수 없습니다 (최대 50MB).'; end if;
  select * into existing from public.file_versions where storage_path=p_path;
  if found then
    if p_file_id is not null and existing.file_id<>p_file_id then raise exception '다른 파일에 등록된 원본입니다.'; end if;
    return jsonb_build_object('file_id',existing.file_id,'version_id',existing.id,'branched',not existing.current);
  end if;
  if p_file_id is not null then
    select * into f from public.files where id=p_file_id and project_id=p_project_id for update;
    if not found then raise exception '프로젝트의 파일이 아닙니다.'; end if;
  end if;
  normalized_tags := public.normalize_workspace_tags(coalesce(p_tags,f.tags,array[]::text[]));
  if (p_type='img' or mime like 'image/%' or lower(p_name) ~ '\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|tiff?|ico)$'
    or f.type='img' or exists(select 1 from public.file_versions where file_id=p_file_id and (file_type='img' or mime_type like 'image/%')))
    and cardinality(normalized_tags)=0 then raise exception '이미지에는 태그를 하나 이상 입력해 주세요.'; end if;
  size_label := case when bytes>=1048576 then round(bytes/1048576.0,2)::text || ' MB' else round(bytes/1024.0,1)::text || ' KB' end;
  if p_file_id is null then
    if p_base_version_id is not null then raise exception '새 파일에는 기준 버전이 없어야 합니다.'; end if;
    if p_folder_id is not null and not exists(select 1 from public.folders where id=p_folder_id and project_id=p_project_id) then
      raise exception '프로젝트의 폴더가 아닙니다.';
    end if;
    insert into public.files(project_id,name,type,uploader,avatar,date,size,tag,folder_id)
      values(p_project_id,p_name,p_type,actor.name,actor.avatar,current_date,size_label,'기타',p_folder_id) returning * into f;
  else
    select * into f from public.files where id=p_file_id and project_id=p_project_id for update;
    if not found then raise exception '프로젝트의 파일이 아닙니다.'; end if;
  end if;
  update public.files set tags=normalized_tags,tag=coalesce(normalized_tags[1],'기타') where id=f.id;
  select id into head_id from public.file_versions where file_id=f.id and current;
  if p_base_version_id is not null and not exists(select 1 from public.file_versions where id=p_base_version_id and file_id=f.id) then
    raise exception '이 파일의 기준 버전이 아닙니다.';
  end if;
  if head_id is not null and p_base_version_id is null then raise exception '기준 버전을 선택해 주세요.'; end if;
  make_current := head_id is not distinct from p_base_version_id;
  select count(*)+1 into n from public.file_versions where file_id=f.id;
  if make_current then update public.file_versions set current=false where file_id=f.id and current; end if;
  insert into public.file_versions(file_id,version,uploaded_by,date,size,note,current,parent_version_id,storage_path,original_name,mime_type,byte_size,file_type)
    values(f.id,'v'||n,actor.name,current_date,size_label,coalesce(p_note,''),make_current,p_base_version_id,p_path,p_name,mime,bytes,p_type)
    returning id into new_id;
  if make_current then
    update public.files set type=p_type,uploader=actor.name,avatar=actor.avatar,date=current_date,size=size_label where id=f.id;
  end if;
  return jsonb_build_object('file_id',f.id,'version_id',new_id,'branched',not make_current);
end $$;


revoke all on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text,text[]) from public,anon;
grant execute on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text,text[]) to authenticated;
create or replace function public.set_workspace_file_tags(p_file_id bigint,p_tags text[])
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.files%rowtype; normalized_tags text[];
begin
  select project_id into pid from public.files where id=p_file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 태그를 수정할 수 있습니다.'; end if;
  select * into f from public.files where id=p_file_id for update;
  normalized_tags := public.normalize_workspace_tags(p_tags);
  if (f.type='img' or exists(select 1 from public.file_versions where file_id=p_file_id and (file_type='img' or mime_type like 'image/%')))
    and cardinality(normalized_tags)=0 then raise exception '이미지에는 태그를 하나 이상 입력해 주세요.'; end if;
  update public.files set tags=normalized_tags,tag=coalesce(normalized_tags[1],'기타') where id=p_file_id;
end $$;
revoke all on function public.set_workspace_file_tags(bigint,text[]) from public,anon;
grant execute on function public.set_workspace_file_tags(bigint,text[]) to authenticated;
commit;
