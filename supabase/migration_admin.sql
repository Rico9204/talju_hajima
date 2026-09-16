-- 이미 배포된 DB에 적용하는 마이그레이션: 계정 단위 관리자 플래그 추가 +
-- 그에 맞춰 members/projects 삭제 권한을 gwanhan.md의 매트릭스대로 조임.
--
-- 최초 관리자는 SQL 에디터에서 아래처럼 수동으로 지정한다 (가입은 일반
-- 회원가입과 동일, 이후 이 UPDATE만 실행):
--   update profiles set is_admin = true where id = '<해당 계정의 auth.users.id>';

alter table profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- 기존 members_delete 정책은 is_project_member만 확인해 아무 멤버나 다른
-- 멤버를 삭제할 수 있었음 (팀원 제외는 조장/관리자만 가능해야 함 — 매트릭스
-- "팀원 초대/제외" 행).
drop policy if exists members_delete on members;
create policy members_delete on members for delete
  using (is_project_leader(project_id) or is_admin());

-- 기존 projects_delete 정책은 조장이면 삭제 가능했음. 매트릭스는 "프로젝트
-- 삭제: 관리자만" — 조장의 삭제 권한을 제거.
drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete
  using (is_admin());
