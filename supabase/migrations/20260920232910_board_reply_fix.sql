-- 대댓글이 등록되지 않던 문제 수정. board_comments_insert 정책의 서브쿼리에서
-- 새로 삽입되는 행을 "board_comments.post_id"처럼 테이블 이름으로 재참조했는데,
-- 같은 테이블을 별칭(parent)으로 서브쿼리하는 상황과 얽혀 모호하게 해석될 수
-- 있었음. 별칭 없이 컬럼명만 쓰도록 바꿔 새 행을 명확히 가리키게 한다.
begin;
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.board_posts p where p.id = post_id)
    and (
      parent_comment_id is null
      or exists (
        select 1 from public.board_comments parent
        where parent.id = parent_comment_id
          and parent.post_id = post_id
          and parent.parent_comment_id is null
      )
    )
  );
commit;
