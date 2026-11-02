-- ===== 게시판 필독: 관리자만, 공지사항 글만 =====
-- 표 전체 UPDATE 권한이 있으면 칼럼 단위 revoke는 효과가 없으므로, 트리거로 직접 수정을 막는다.
-- set_board_post_pinned는 security definer라 그 안에서는 current_user가 함수 주인이고, 사용자의 직접 수정만 authenticated로 보인다.
-- 공지사항에서 다른 분류로 옮기면 필독은 저절로 풀린다.
update public.board_posts set pinned = false where pinned and category <> 'notice';

create or replace function public.board_posts_guard_pinned()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
    and new.pinned is distinct from (case when tg_op = 'UPDATE' then old.pinned else false end) then
    raise exception '필독은 관리자 기능으로만 바꿀 수 있습니다.';
  end if;
  if new.category <> 'notice' then new.pinned := false; end if;
  return new;
end $$;
revoke all on function public.board_posts_guard_pinned() from public, anon, authenticated;

drop trigger if exists board_posts_guard_pinned on public.board_posts;
create trigger board_posts_guard_pinned before insert or update on public.board_posts
  for each row execute function public.board_posts_guard_pinned();

create or replace function public.set_board_post_pinned(p_post_id bigint, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
declare post_category text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 필독을 지정할 수 있습니다.'; end if;
  select category into post_category from public.board_posts where id = p_post_id for update;
  if not found then raise exception '글을 찾을 수 없습니다.'; end if;
  if p_pinned and post_category <> 'notice' then raise exception '필독은 공지사항 글에만 지정할 수 있습니다.'; end if;
  update public.board_posts set pinned = p_pinned where id = p_post_id;
end $$;
revoke all on function public.set_board_post_pinned(bigint, boolean) from public, anon;
grant execute on function public.set_board_post_pinned(bigint, boolean) to authenticated;
