-- 파일 댓글을 특정 버전에 남길 수 있게 함(version_id null = 파일 전체 댓글).
alter table public.file_comments add column if not exists version_id bigint references public.file_versions(id) on delete set null;
create or replace function public.stamp_file_comment_author()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor public.members%rowtype; pid text;
begin
  select project_id into pid from public.files where id=new.file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found then raise exception '진행 중인 프로젝트에만 댓글을 작성할 수 있습니다.'; end if;
  select * into actor from public.members where project_id=pid and user_id=auth.uid();
  if not found then raise exception '프로젝트 참여자만 댓글을 작성할 수 있습니다.'; end if;
  -- 버전에 남기는 댓글은 같은 파일의 버전이어야 한다.
  if new.version_id is not null and not exists (select 1 from public.file_versions v where v.id=new.version_id and v.file_id=new.file_id) then
    raise exception '이 파일의 버전이 아닙니다.';
  end if;
  new.member_id:=actor.id; new.author:=actor.name; new.avatar:=actor.avatar;
  return new;
end $$;
drop trigger if exists file_comment_author on public.file_comments;
create trigger file_comment_author before insert on public.file_comments for each row execute function public.stamp_file_comment_author();

notify pgrst,'reload schema';
