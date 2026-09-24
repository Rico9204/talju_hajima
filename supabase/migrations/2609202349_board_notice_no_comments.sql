-- 공지사항 게시글에는 댓글(대댓글 포함) 작성을 막는다 — 화면에서 폼을
-- 숨기는 것과 별개로, API를 직접 호출해도 서버에서 거부되도록 함.
begin;
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.board_posts p where p.id = board_comments.post_id and p.category <> 'notice')
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
