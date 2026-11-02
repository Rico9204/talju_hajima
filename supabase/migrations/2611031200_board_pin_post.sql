-- 게시판 필독 지정: 관리자만, 공지사항 글만. 작성자가 직접 pinned 칸을 고치지 못하게 막고 RPC로만 바꾼다.
revoke update (pinned) on public.board_posts from authenticated;

create or replace function public.set_board_post_pinned(p_post_id bigint, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 필독을 지정할 수 있습니다.'; end if;
  update public.board_posts set pinned = p_pinned where id = p_post_id and (p_pinned = false or category = 'notice');
  if not found then raise exception '필독은 공지사항 글에만 지정할 수 있습니다.'; end if;
end $$;
revoke all on function public.set_board_post_pinned(bigint, boolean) from public, anon;
grant execute on function public.set_board_post_pinned(bigint, boolean) to authenticated;
