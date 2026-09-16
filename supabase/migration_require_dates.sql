-- 이미 배포된 DB에 적용하는 마이그레이션: 신규 프로젝트는 시작일/종료일
-- 필수 (자유 텍스트 기간만 입력하고 날짜를 비워두는 것 방지).
--
-- `not valid`로 추가하므로 기존에 날짜 없이 만들어진 레거시 프로젝트는
-- 이 제약을 검사하지 않고 그대로 남아있는다 (gwanhan.md "아직 안 다룬 것"
-- 항목 — 레거시 데이터 보완은 별도 작업). 신규 insert/update부터만 강제.
-- 기간 길이(예: 2주 미만)에 대한 자동 거부는 의도적으로 두지 않음 — 승인
-- 여부는 관리자 판단에 맡기기로 함.

alter table projects add constraint projects_dates_required
  check (start_date is not null and end_date is not null) not valid;
