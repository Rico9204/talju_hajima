-- 프로젝트 생성 시 첫 멤버(팀장)까지 팀원으로 강등되던 버그 수정.
--
-- 원인: 이전에 권한 상승 취약점을 검증하려고 DB에 직접 적용했던 트리거
-- (enforce_member_defaults, set_member_leader_role)가 코드는 git으로
-- 되돌렸음에도 DB에는 그대로 남아 있었음. 특히 tr_enforce_member_defaults는
-- INSERT마다 무조건 role='팀원', is_leader=false로 덮어쓰는데, Postgres가
-- 같은 이벤트의 트리거를 이름 알파벳순으로 실행하다 보니 이 트리거
-- (tr_...)가 set_member_user_id_trigger(set_...)보다 나중에 실행되며 앞서
-- 올바르게 계산된 값을 전부 무효화하고 있었음.
--
-- 지금 공식 설계는 set_member_user_id_trigger 하나로 충분함(클라이언트가
-- 보낸 role/is_leader를 신뢰하되, "이미 리더가 있으면 false로 교정"만 함).
-- 아래 두 트리거/함수는 leftover이므로 제거.

drop trigger if exists tr_enforce_member_defaults on members;
drop function if exists public.enforce_member_defaults();

drop trigger if exists set_member_leader_role_trigger on members;
drop function if exists public.set_member_leader_role();

-- members_update 정책도 같은 leftover로 is_project_leader(project_id)로
-- 바뀌어 있었음. is_leader 필드 자체는 prevent_is_leader_direct_update
-- 트리거가 별도로 막고 있으므로, 나머지 필드는 원래 설계대로 프로젝트
-- 멤버 누구나 갱신 가능해야 함 (schema.sql 기준으로 되돌림).
drop policy if exists members_update on members;
create policy members_update on members for update using (is_project_member(project_id));
