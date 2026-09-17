-- Real immutable binary files, version trees, promotion and pins.
begin;
alter table public.file_versions add column if not exists parent_version_id bigint;
alter table public.file_versions add column if not exists storage_path text;
alter table public.file_versions add column if not exists original_name text;
alter table public.file_versions add column if not exists mime_type text not null default 'application/octet-stream';
alter table public.file_versions add column if not exists byte_size bigint;
alter table public.file_versions add column if not exists pinned boolean not null default false;
alter table public.file_versions add column if not exists file_type text;
update public.file_versions v set file_type=f.type from public.files f where v.file_id=f.id and v.file_type is null;

create unique index if not exists file_versions_file_id_id on public.file_versions(file_id,id);
do $$ begin
  alter table public.file_versions add constraint file_version_parent_same_file
    foreign key(file_id,parent_version_id) references public.file_versions(file_id,id);
exception when duplicate_object then null; end $$;
create unique index if not exists file_versions_storage_path on public.file_versions(storage_path) where storage_path is not null;
-- Preserve legacy history as a linear chain; there are no recoverable bytes for it.
with history as (
  select id, lag(id) over(partition by file_id order by id) parent_id
  from public.file_versions where storage_path is null
) update public.file_versions v set parent_version_id=h.parent_id
  from history h where v.id=h.id and v.parent_version_id is null;
with ranked as (
  select id,row_number() over(partition by file_id order by id desc) n
  from public.file_versions where current
) update public.file_versions v set current=false from ranked r where v.id=r.id and r.n>1;
create unique index if not exists file_versions_one_current on public.file_versions(file_id) where current;

insert into storage.buckets(id,name,public,file_size_limit)
values('workspace-files','workspace-files',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;

-- All version mutations go through the checked transactional functions below.
revoke insert,update,delete on public.files,public.file_versions from anon,authenticated;
grant select on public.files,public.file_versions to authenticated;

create or replace function public.register_workspace_version(
  p_project_id text,p_file_id bigint,p_base_version_id bigint,p_folder_id bigint,
  p_name text,p_type text,p_path text,p_note text
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
  if p_path is null or split_part(p_path,'/',1)<>p_project_id or split_part(p_path,'/',2)<>auth.uid()::text then
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

create or replace function public.promote_workspace_version(p_file_id bigint,p_version_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare project_id_value text; v public.file_versions%rowtype;
begin
  select project_id into project_id_value from public.files where id=p_file_id;
  perform id from public.projects where id=project_id_value and status='active' for update;
  if not found or not public.is_project_member(project_id_value) then raise exception '진행 중인 프로젝트의 참여자만 버전을 변경할 수 있습니다.'; end if;
  perform id from public.files where id=p_file_id for update;
  select * into v from public.file_versions where id=p_version_id and file_id=p_file_id;
  if not found or v.storage_path is null then raise exception '원본 파일이 있는 버전을 선택해 주세요.'; end if;
  update public.file_versions set current=false where file_id=p_file_id and current;
  update public.file_versions set current=true where id=v.id;
  update public.files set size=v.size,uploader=v.uploaded_by,date=v.date,type=coalesce(v.file_type,type) where id=p_file_id;
end $$;

create or replace function public.pin_workspace_version(p_file_id bigint,p_version_id bigint,p_pinned boolean)
returns void language plpgsql security definer set search_path=public as $$
declare project_id_value text;
begin
  select project_id into project_id_value from public.files where id=p_file_id;
  perform id from public.projects where id=project_id_value and status='active' for update;
  if not found or not public.is_project_member(project_id_value) then raise exception '진행 중인 프로젝트의 참여자만 핀을 변경할 수 있습니다.'; end if;
  update public.file_versions set pinned=p_pinned where file_id=p_file_id and id=p_version_id;
  if not found then raise exception '버전을 찾을 수 없습니다.'; end if;
end $$;

revoke all on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text) from public,anon;
revoke all on function public.promote_workspace_version(bigint,bigint) from public,anon;
revoke all on function public.pin_workspace_version(bigint,bigint,boolean) from public,anon;
grant execute on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text) to authenticated;
grant execute on function public.promote_workspace_version(bigint,bigint) to authenticated;
grant execute on function public.pin_workspace_version(bigint,bigint,boolean) to authenticated;

drop policy if exists workspace_binary_read on storage.objects;
drop policy if exists workspace_binary_insert on storage.objects;
drop policy if exists workspace_binary_cleanup on storage.objects;
create policy workspace_binary_read on storage.objects for select to authenticated using (
  bucket_id='workspace-files' and public.is_project_member(split_part(name,'/',1))
);
create policy workspace_binary_insert on storage.objects for insert to authenticated with check (
  bucket_id='workspace-files' and split_part(name,'/',2)=auth.uid()::text
  and public.is_project_member(split_part(name,'/',1))
  and exists(select 1 from public.projects p where p.id=split_part(name,'/',1) and p.status='active')
);
-- Linked objects are immutable: no update policy, no deletion of stored versions.
create policy workspace_binary_cleanup on storage.objects for delete to authenticated using (
  bucket_id='workspace-files' and split_part(name,'/',2)=auth.uid()::text
  and public.is_project_member(split_part(name,'/',1))
  and not exists(select 1 from public.file_versions v where v.storage_path=name)
);
commit;
