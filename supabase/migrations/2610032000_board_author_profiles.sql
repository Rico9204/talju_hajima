-- ===== 게시판 작성자 이름·사진 =====
-- 프로필은 본인·같은 프로젝트 팀원·관리자만 읽을 수 있어(profiles_select_own), 전역 게시판에서
-- 프로젝트를 함께하지 않는 사람의 글·댓글 작성자가 "탈퇴한 사용자"로 보였다.
-- 게시판에 글·댓글을 쓰거나 공개 투표에 참여한 사람에 한해 이름·사진만 돌려준다(나머지 프로필은 계속 비공개).
-- 원래 읽을 수 있는 프로필(본인·팀원·관리자)은 그대로 돌려준다.
create or replace function public.board_profiles(p_user_ids uuid[])
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(p_user_ids)
    and (
      p.id = auth.uid() or public.shares_project_with(p.id) or public.is_admin()
      or exists (select 1 from public.board_posts b where b.author_user_id = p.id)
      or exists (select 1 from public.board_comments c where c.author_user_id = p.id)
      or exists (select 1 from public.board_poll_votes v join public.board_polls l on l.id = v.poll_id
                 where v.user_id = p.id and not l.is_anonymous)
    );
$$;
revoke all on function public.board_profiles(uuid[]) from public, anon;
grant execute on function public.board_profiles(uuid[]) to authenticated;
