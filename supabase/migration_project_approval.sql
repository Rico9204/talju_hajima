-- 이미 배포된 DB에 적용하는 마이그레이션: 프로젝트 생성 승인 워크플로.
-- migration_admin.sql (is_admin/is_admin() 함수)이 먼저 적용되어 있어야 함.
--
-- 관리자가 만든 프로젝트는 바로 approved로 시작하고, 그 외(조장)가 만든
-- 프로젝트는 pending으로 시작해 관리자가 승인/반려한다. 클라이언트가 보낸
-- 값은 트리거가 무시하고 항상 서버에서 auth.uid() 기준으로 재계산한다.

alter table projects add column if not exists approval_status text
  not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected'));

-- Only overrides when the insert comes from an authenticated app request
-- (auth.uid() set). Inserts run with no session — the SQL editor, seed.sql —
-- keep whatever approval_status the statement sent (default 'approved'),
-- so seeding/fixing data manually doesn't get forced into 'pending'.
create or replace function public.set_project_approval_status()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.approval_status := case when is_admin() then 'approved' else 'pending' end;
  end if;
  return new;
end;
$$;

drop trigger if exists set_project_approval_status_trigger on projects;
create trigger set_project_approval_status_trigger
  before insert on projects
  for each row execute function public.set_project_approval_status();

-- 기존 projects_update 정책은 is_project_member만 확인해 조원도 프로젝트
-- 정보를 수정할 수 있었음 (매트릭스 "프로젝트 정보 수정: 관리자/조장만" 행).
-- 이 정책 하나로 조장의 정보수정 + 관리자의 승인/반려/종료처리를 모두 커버.
drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (is_project_leader(id) or is_admin());
