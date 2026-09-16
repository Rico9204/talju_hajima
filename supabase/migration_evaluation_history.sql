-- 이미 배포된 DB에 적용하는 마이그레이션: 정상 종료된 프로젝트의 평가 점수를
-- 계정 단위로 영구 보존하고, 종료 30일 후 프로젝트 데이터를 자동 정리한다.
-- migration_admin.sql (is_admin())이 먼저 적용되어 있어야 함.

-- "프로젝트 종료" 버튼(조장/관리자, ProjectContext.markProjectDone)이 찍는
-- 시각. cleanup_completed_projects()가 이 값 기준으로 30일 경과를 판단한다.
alter table projects add column if not exists completed_at timestamptz;

-- projects에 FK를 걸지 않음 — 프로젝트가 삭제된 뒤에도 이 기록은 남아야
-- 하므로 cascade 대상이 되면 안 됨. member_user_id도 계정이 탈퇴해도 기록
-- 자체는 남기기 위해 on delete set null.
create table if not exists evaluation_history (
  id bigint generated always as identity primary key,
  project_id text not null,
  project_name text not null,
  project_org text not null,
  member_user_id uuid references auth.users(id) on delete set null,
  member_name text not null,
  member_major text not null,
  member_student text not null,
  score numeric not null,
  eval_count int not null,
  criteria_role numeric not null,
  criteria_deadline numeric not null,
  criteria_communication numeric not null,
  criteria_collaboration numeric not null,
  criteria_quality numeric not null,
  archived_at timestamptz not null default now()
);

alter table evaluation_history enable row level security;

drop policy if exists evaluation_history_select on evaluation_history;
create policy evaluation_history_select on evaluation_history for select
  using (member_user_id = auth.uid() or is_admin());

-- 의도적으로 insert/update/delete 정책이 없음: 일반 클라이언트는 이 테이블에
-- 아무것도 쓸 수 없고, 아래 archive_and_cleanup_project()(security definer,
-- handle_new_user()와 동일한 패턴)만 기록을 남길 수 있다. "아무도 수정/삭제
-- 불가"를 RLS가 아니라 애초에 쓰기 경로 자체를 차단해 보장.

create or replace function public.archive_and_cleanup_project(p_project_id text)
returns void language plpgsql security definer as $$
begin
  insert into evaluation_history (
    project_id, project_name, project_org, member_user_id,
    member_name, member_major, member_student,
    score, eval_count,
    criteria_role, criteria_deadline, criteria_communication, criteria_collaboration, criteria_quality
  )
  select
    p.id, p.name, p.org, m.user_id,
    m.name, m.major, m.student,
    m.score, m.eval_count,
    m.criteria_role, m.criteria_deadline, m.criteria_communication, m.criteria_collaboration, m.criteria_quality
  from members m
  join projects p on p.id = m.project_id
  where m.project_id = p_project_id;

  -- teams/members/folders/files/tasks 등은 projects에 대한 FK cascade로 함께 삭제됨.
  delete from projects where id = p_project_id;
end;
$$;

create or replace function public.cleanup_completed_projects()
returns void language plpgsql security definer as $$
declare
  p record;
begin
  for p in
    select id from projects
    where status = 'done' and completed_at is not null and completed_at <= now() - interval '30 days'
  loop
    perform public.archive_and_cleanup_project(p.id);
  end loop;
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('cleanup-completed-projects');
exception when others then
  null;
end;
$$;

select cron.schedule('cleanup-completed-projects', '0 3 * * *', $$select public.cleanup_completed_projects();$$);
