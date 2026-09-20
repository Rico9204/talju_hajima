-- migration_board_reply_fix.sql에서 별칭 없이 post_id/parent_comment_id만
-- 쓰도록 고쳤던 게 실제로는 버그였다 — 서브쿼리 안에서 이 이름들이 새로
-- 삽입되는 행이 아니라 subquery의 parent 별칭 컬럼으로 잘못 해석되어,
-- "parent.id = parent.parent_comment_id"(항상 거짓) 같은 조건이 되어버려
-- 대댓글이 절대 통과할 수 없었다. 새로 삽입되는 행은 테이블 이름으로 다시
-- 명시적으로 구분한다.
begin;
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.board_posts p where p.id = board_comments.post_id)
    and (
      board_comments.parent_comment_id is null
      or exists (
        select 1 from public.board_comments parent
        where parent.id = board_comments.parent_comment_id
          and parent.post_id = board_comments.post_id
          and parent.parent_comment_id is null
      )
    )
  );
commit;
