-- 워크스페이스 파일을 다른 폴더(또는 워크스페이스 루트)로 옮긴다.
-- files 표는 앱에서 직접 수정할 수 없으므로(버전·검색 무결성) 이동도 서버 함수로만 한다.
--  * 진행 중인 프로젝트의 참여자라면 누구나 옮길 수 있다(업로드와 같은 기준, 삭제보다 약한 동작).
--  * 대상 폴더는 같은 프로젝트의 폴더여야 한다. null = 워크스페이스 루트.
--  * 옮기는 것은 내용 수정이 아니므로 대시보드 "최근 활동"의 수정 시각(updated_at)을 바꾸지 않는다.
begin;

-- 수정 시각 기록 트리거: 이 트랜잭션이 "이동만"이라고 표시하면 updated_at을 그대로 둔다.
create or replace function public.stamp_dashboard_activity() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then new.created_at:=now(); new.updated_at:=null;
 elsif coalesce(current_setting('app.move_only', true), '') = 'on' then new.created_at:=old.created_at; new.updated_at:=old.updated_at;
 else new.created_at:=old.created_at; new.updated_at:=now(); end if;
 return new;
end $$;

create or replace function public.move_workspace_file(p_file_id bigint, p_folder_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; cur bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select project_id, folder_id into pid, cur from public.files where id=p_file_id;
  if pid is null then raise exception '파일이 존재하지 않습니다.'; end if;
  perform id from public.projects where id=pid and status='active' for share;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 파일을 옮길 수 있습니다.'; end if;
  if p_folder_id is not null and not exists(select 1 from public.folders where id=p_folder_id and project_id=pid) then
    raise exception '옮길 폴더를 찾을 수 없습니다.';
  end if;
  if cur is not distinct from p_folder_id then return; end if;
  perform set_config('app.move_only', 'on', true);
  update public.files set folder_id=p_folder_id where id=p_file_id;
  perform set_config('app.move_only', '', true);
end $$;
revoke all on function public.move_workspace_file(bigint, bigint) from public, anon;
grant execute on function public.move_workspace_file(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
