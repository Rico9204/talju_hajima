-- 이미 배포된 DB에 적용하는 마이그레이션: AdminPanel에서 관리자가 "자기가
-- 속하지 않은 프로젝트"의 팀원까지 조회/강퇴할 수 있게 하고 (gwanhan.md
-- "팀원 초대/제외: 관리자는 모든 프로젝트" 행), 그 과정에서 발견된 기존
-- 버그 두 개를 함께 고친다. migration_admin.sql / migration_project_approval.sql
-- 이 먼저 적용되어 있어야 함.

-- 1) members 테이블에 authenticated 역할의 기본 GRANT 자체가 빠져 있었음
--    (RLS 정책과 별개로, 그 이전 단계인 테이블 접근 권한이 아예 없던 상태).
--    언제/왜 빠졌는지는 불명 — 이 프로젝트 배포 이력 어디에도 members를
--    revoke하는 구문이 없음. 재발 시 이 GRANT부터 다시 실행할 것.
grant select, insert, update, delete on table public.members to authenticated;

-- 2) members_select: 프로젝트 멤버만 그 프로젝트의 팀원 목록을 볼 수 있었음.
--    관리자가 AdminProjectMembers.tsx에서 남의 프로젝트 팀원을 보려면
--    is_admin() 예외가 필요.
drop policy if exists members_select on members;
create policy members_select on members for select using (is_project_member(project_id) or is_admin());

-- 3) profiles_select_own: 마찬가지로 관리자가 그 팀원들의 profiles 행(이름·
--    아바타 등)을 읽으려면 같은 예외가 필요. shares_project_with(id)만으론
--    관리자가 속하지 않은 프로젝트의 팀원 프로필은 안 읽힘.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (
  auth.uid() = id or shares_project_with(id) or is_admin()
);

-- 4) members_update: 이전에는 UPDATE 정책이 아예 없었음 (댓글 참고 —
--    members.user_id는 트리거로만 설정되고 리더십 이전은 transfer_leadership()
--    RPC로만 가능해서 일반 UPDATE 경로를 열 필요가 없었음). 그대로 유지.
drop policy if exists members_update on members;
create policy members_update on members for update using (is_project_member(project_id));

-- 5) projects_update: migration_project_approval.sql의 버전
--    (`is_project_leader(id) or is_admin()`)은 관리자가 프로젝트를 무조건
--    승인/반려할 수 있었음. CreateProjectModal에서 조장이 특정 관리자를
--    지정해 승인을 요청하는 기능이 추가되면서, 그 지정과 무관한 관리자는
--    막도록 좁힘 — requested_admin_id가 null(미지정/관리자 생성)이거나
--    본인 앞으로 지정된 경우만 허용.
drop policy if exists projects_update on projects;
create policy projects_update on projects for update using (
  is_project_leader(id)
  or (is_admin() and (requested_admin_id is null or requested_admin_id = auth.uid()))
);

-- 6) peer_evaluations → members 외래키에 ON DELETE CASCADE가 없어서, 동료
--    평가 기록이 있는 멤버는 강퇴(members DELETE)가 FK 위반(23503)으로
--    막혔음. 컬럼명(recipient_id/evaluator_id 등)에 의존하지 않고, members를
--    참조하는 peer_evaluations의 모든 외래키를 찾아 CASCADE로 재생성한다.
--    주의: peer_evaluations는 이 저장소의 schema.sql/migration 어디에도
--    정의가 없는 테이블 — 현재 앱 코드(PeerEvaluation.tsx 포함) 어디서도
--    읽거나 쓰지 않는, 이전 버전에서 남은 것으로 보이는 레거시 테이블.
--    강퇴 시 함께 지워져도 지금 동작 중인 어떤 점수 계산에도 영향 없음.
do $$
declare
  con record;
begin
  for con in
    select fk.conname, att.attname as local_col
    from pg_constraint fk
    join pg_class rel on rel.oid = fk.conrelid
    join pg_class frel on frel.oid = fk.confrelid
    join unnest(fk.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute att on att.attrelid = fk.conrelid and att.attnum = k.attnum
    where fk.contype = 'f'
      and rel.relname = 'peer_evaluations'
      and frel.relname = 'members'
  loop
    execute format('alter table peer_evaluations drop constraint %I', con.conname);
    execute format(
      'alter table peer_evaluations add constraint %I foreign key (%I) references members(id) on delete cascade',
      con.conname, con.local_col
    );
  end loop;
end $$;
