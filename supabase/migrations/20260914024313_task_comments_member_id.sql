-- 과제 댓글에 프로필 사진이 반영 안 되던 문제 수정.
--
-- task_comments가 author/avatar를 작성 시점 텍스트로만 저장해서(초기 이니셜
-- 문자만 있고 avatar_url 자체가 없음), 이후 사용자가 프로필 사진을 올려도
-- 이미 작성된(그리고 앞으로 작성될) 댓글에는 절대 반영될 수 없는 구조였음.
-- chat_messages(sender_id로 members를 참조해 항상 최신 이름/아바타를 보여주는
-- 방식)와 동일하게, member_id를 추가해 클라이언트가 team.members에서 최신
-- avatarUrl을 조회해 보여주도록 변경. 기존 댓글은 member_id가 비어 있으니
-- 계속 예전처럼 이니셜 텍스트로 표시됨 — 이 마이그레이션은 앞으로 작성되는
-- 댓글부터 적용됨.

alter table task_comments add column if not exists member_id uuid references members(id) on delete set null;

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments for insert
  with check (
    is_task_project_member(task_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );
