-- 워크스페이스 폴더 안에 폴더(하위 폴더)를 만들 수 있게 한다.
--  * parent_id null = 워크스페이스 루트의 폴더.
--  * 상위 폴더는 같은 프로젝트의 폴더여야 한다(복합 외래키). 하위 폴더가 있는 폴더는 지울 수 없다.
--  * 깊이는 최대 10단계(루트 폴더가 1단계). 순환·끝없는 사슬로 인한 부하를 막는다.
--  * 폴더 자체의 이동(parent_id 변경)은 아직 없다. folders 표는 앱에서 직접 수정할 수 없고(update 권한 회수),
--    이동 기능을 만들 때는 서버 함수에서 순환과 "옮긴 뒤 하위 트리 전체의 깊이"를 함께 검사해야 한다.
begin;

alter table public.folders add column if not exists parent_id bigint;
create unique index if not exists folders_project_id_id_key on public.folders(project_id, id);
create index if not exists folders_parent_idx on public.folders(parent_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='folders_parent_fk') then
    -- no action(기본값): 프로젝트 삭제로 폴더가 한꺼번에 지워질 때는 문장 끝에 검사하므로 통과한다.
    alter table public.folders add constraint folders_parent_fk
      foreign key (project_id, parent_id) references public.folders(project_id, id);
  end if;
end $$;

create or replace function public.check_folder_depth()
returns trigger language plpgsql set search_path=public as $$
declare cur bigint := new.parent_id; depth int := 1;
begin
  while cur is not null loop
    depth := depth + 1;
    if depth > 10 then raise exception '폴더는 최대 10단계까지만 만들 수 있습니다.'; end if;
    select parent_id into cur from public.folders where id=cur;
  end loop;
  return new;
end $$;
drop trigger if exists workspace_folder_depth on public.folders;
create trigger workspace_folder_depth before insert on public.folders
for each row execute function public.check_folder_depth();

create or replace function public.delete_workspace_folder(p_folder_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.folders%rowtype;
begin
  select project_id into pid from public.folders where id=p_folder_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.folders where id=p_folder_id for update;
  if not found then raise exception '폴더가 존재하지 않습니다.'; end if;
  if not public.is_project_manager(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장, 부팀장 또는 생성자만 폴더를 삭제할 수 있습니다.';
  end if;
  if exists(select 1 from public.folders where parent_id=p_folder_id) then
    raise exception '하위 폴더가 있는 폴더는 삭제할 수 없습니다. 하위 폴더를 먼저 삭제해 주세요.';
  end if;
  if exists(select 1 from public.files where folder_id=p_folder_id) then
    raise exception '파일이 있는 폴더는 삭제할 수 없습니다. 파일을 먼저 삭제해 주세요.';
  end if;
  delete from public.folders where id=p_folder_id;
end $$;
revoke all on function public.delete_workspace_folder(bigint) from public, anon;
grant execute on function public.delete_workspace_folder(bigint) to authenticated;

commit;
