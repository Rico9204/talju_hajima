-- Run this once, after schema.sql, on a fresh database (Supabase SQL editor).
-- Seeds the two sample projects/teams so the app looks the same as the old
-- in-memory mock data did. Re-running will duplicate members/folders/files/
-- tasks rows since those don't have natural unique keys — safe to re-run only
-- the `projects`/`teams` inserts (they use ON CONFLICT DO NOTHING).
--
-- Wrapped in one transaction so the whole seed either fully applies or not
-- at all. Folder/file ids needed by later inserts are threaded through via
-- CTEs within a single statement (see below) rather than temp tables, since
-- temp tables are connection-scoped and can disappear between statements
-- when run through a pooled connection (e.g. Supabase's SQL editor).
begin;

insert into projects (id, name, org, period, status, start_date, end_date) values
  ('heritage', '지역 문화유산 디지털 아카이브', '역사문화학과 · 3분반', '2026-2학기 · 진행 중', 'active', '2026-09-01', '2026-12-12'),
  ('dialect', '지역 방언 조사 프로젝트', '국어국문학과 · 2분반', '2026-1학기 · 2026-06-21 종료', 'done', '2026-03-02', '2026-06-21')
on conflict (id) do nothing;

insert into teams (project_id, team_label, team_sub) values
  ('heritage', '지역 문화유산 디지털 아카이브 팀', '총 5명 · 역사문화학과 3분반 · 2026-2학기'),
  ('dialect', '지역 방언 조사 프로젝트 팀', '총 4명 · 국어국문학과 2분반 · 2026-1학기 (종료)')
on conflict (project_id) do nothing;

insert into members
  (project_id, name, role, major, student, avatar, tasks_done, tasks_total, activities, score, eval_count, online, responsibilities, color, criteria_role, criteria_deadline, criteria_communication, criteria_collaboration, criteria_quality, is_leader)
values
  ('heritage', '김지수', '팀장', '역사문화학과 3학년', '2021123456', '김', 5, 7, 38, 8.8, 3, true, array['자료 수집 총괄','발표 자료 제작','일정 관리'], '#2563eb', 9.0, 8.6, 8.4, 9.2, 8.8, true),
  ('heritage', '박민준', '기록 담당', '문헌정보학과 3학년', '2021234567', '박', 4, 6, 29, 8.2, 3, true, array['문헌 정리','인터뷰 기록','참고문헌 관리'], '#f59e0b', 8.4, 8.0, 8.2, 8.2, 8.0, false),
  ('heritage', '이서연', '디자인 담당', '시각디자인학과 2학년', '2022345678', '이', 3, 5, 22, 7.8, 3, false, array['인포그래픽 제작','포스터 디자인','웹 레이아웃'], '#22c55e', 7.6, 7.4, 8.0, 8.2, 7.8, false),
  ('heritage', '정하늘', '조사 담당', '역사문화학과 3학년', '2021456789', '정', 4, 6, 31, 8.4, 3, false, array['현장 답사','사진 촬영','지역 주민 인터뷰'], '#8b5cf6', 8.6, 8.2, 8.0, 8.8, 8.4, false),
  ('heritage', '최현우', '편집 담당', '미디어커뮤니케이션학과 2학년', '2022567890', '최', 2, 5, 15, 7.2, 3, true, array['영상 편집','SNS 콘텐츠','최종 보고서 편집'], '#ef4444', 7.0, 6.8, 7.2, 7.8, 7.2, false),
  ('dialect', '김지수', '참여자', '역사문화학과 3학년', '2021123456', '김', 8, 8, 24, 9.0, 2, false, array['설문 설계','녹취 전사'], '#2563eb', 9.0, 9.0, 9.0, 9.0, 9.0, false),
  ('dialect', '박민준', '조사 총괄', '문헌정보학과 3학년', '2021234567', '박', 8, 8, 33, 9.2, 2, true, array['현지 화자 섭외','일정 관리','보고서 총괄'], '#f59e0b', 9.4, 9.2, 9.0, 9.2, 9.2, true),
  ('dialect', '오유진', '분석 담당', '국어국문학과 2학년', '2022654321', '오', 7, 8, 27, 8.8, 2, false, array['어휘 분류','비교 분석','최종 보고서 작성'], '#2563eb', 8.8, 8.4, 9.0, 9.0, 8.8, false),
  ('dialect', '한소민', '촬영·기록 담당', '국어국문학과 2학년', '2022789012', '한', 6, 8, 19, 8.0, 2, false, array['인터뷰 촬영','녹취 자료 정리'], '#8b5cf6', 7.8, 7.6, 8.2, 8.4, 8.0, false);

-- Folders and files reference each other via generated ids. Rather than
-- stashing ids in temp tables (which are connection-scoped and can vanish
-- between statements when run through a pooled connection, e.g. Supabase's
-- SQL editor), everything below is chained through a single WITH statement
-- so ids are passed along within one query.
with
  fold_h_field as (
    insert into folders (project_id, name, color, created_by, date)
    values ('heritage', '현장조사', '#8b5cf6', '정하늘', '2026-09-01') returning id
  ),
  fold_h_plan as (
    insert into folders (project_id, name, color, created_by, date)
    values ('heritage', '기획·발표', '#22c55e', '이서연', '2026-09-03') returning id
  ),
  fold_h_data as (
    insert into folders (project_id, name, color, created_by, date)
    values ('heritage', '데이터', '#f59e0b', '박민준', '2026-08-30') returning id
  ),
  fold_d_field as (
    insert into folders (project_id, name, color, created_by, date)
    values ('dialect', '현지조사', '#8b5cf6', '한소민', '2026-04-20') returning id
  ),
  fold_d_report as (
    insert into folders (project_id, name, color, created_by, date)
    values ('dialect', '분석·보고서', '#2563eb', '오유진', '2026-05-10') returning id
  ),
  file_h1 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'heritage', '문화유산_현장조사_보고서.pdf', 'pdf', '김지수', '김', '2026-09-09'::date, '2.4 MB', '보고서', id from fold_h_field
    returning id
  ),
  file_h2 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'heritage', '디지털_아카이브_기획안.pptx', 'ppt', '이서연', '이', '2026-09-08'::date, '8.7 MB', '기획', id from fold_h_plan
    returning id
  ),
  file_h3 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'heritage', '문화재_목록_데이터.xlsx', 'xls', '정하늘', '정', '2026-09-07'::date, '340 KB', '데이터', id from fold_h_data
    returning id
  ),
  file_h4 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'heritage', '현장사진_모음.zip', 'zip', '정하늘', '정', '2026-09-06'::date, '156 MB', '사진', id from fold_h_field
    returning id
  ),
  file_h5 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    values ('heritage', '중간발표_피드백_정리.docx', 'doc', '김지수', '김', '2026-09-05'::date, '128 KB', '회의록', null)
    returning id
  ),
  file_d1 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'dialect', '방언조사_최종보고서.pdf', 'pdf', '오유진', '오', '2026-06-19'::date, '3.1 MB', '보고서', id from fold_d_report
    returning id
  ),
  file_d2 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'dialect', '인터뷰_녹취_전사본.docx', 'doc', '김지수', '김', '2026-05-02'::date, '540 KB', '전사', id from fold_d_field
    returning id
  ),
  file_d3 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'dialect', '어휘_분류_데이터.xlsx', 'xls', '오유진', '오', '2026-05-12'::date, '210 KB', '데이터', id from fold_d_report
    returning id
  ),
  file_d4 as (
    insert into files (project_id, name, type, uploader, avatar, date, size, tag, folder_id)
    select 'dialect', '현지인터뷰_촬영본.zip', 'zip', '한소민', '한', '2026-04-22'::date, '89 MB', '영상', id from fold_d_field
    returning id
  ),
  versions as (
    insert into file_versions (file_id, version, uploaded_by, date, size, note, current)
    select id, 'v3', '김지수', '2026-09-09'::date, '2.4 MB', '최종 수정 — 4장 보완', true from file_h1
    union all select id, 'v2', '김지수', '2026-09-05'::date, '2.1 MB', '2, 3장 추가', false from file_h1
    union all select id, 'v1', '박민준', '2026-09-01'::date, '1.3 MB', '초안 작성', false from file_h1
    union all select id, 'v2', '이서연', '2026-09-08'::date, '8.7 MB', '디자인 개선 및 내용 보완', true from file_h2
    union all select id, 'v1', '이서연', '2026-09-03'::date, '5.2 MB', '초안 발표 자료', false from file_h2
    union all select id, 'v4', '정하늘', '2026-09-07'::date, '340 KB', '52개 항목 추가 (강화군 지역)', true from file_h3
    union all select id, 'v3', '정하늘', '2026-09-04'::date, '290 KB', '오류 수정 및 분류 체계 변경', false from file_h3
    union all select id, 'v2', '박민준', '2026-09-02'::date, '210 KB', '초기 목록 구성', false from file_h3
    union all select id, 'v1', '박민준', '2026-08-30'::date, '85 KB', '형식 틀 생성', false from file_h3
    union all select id, 'v2', '정하늘', '2026-09-06'::date, '156 MB', '인천 강화 지역 추가 촬영분 포함', true from file_h4
    union all select id, 'v1', '정하늘', '2026-09-01'::date, '94 MB', '1차 답사 사진', false from file_h4
    union all select id, 'v1', '김지수', '2026-09-05'::date, '128 KB', '교수님 피드백 및 팀 내 논의 사항 정리', true from file_h5
    union all select id, 'v2', '오유진', '2026-06-19'::date, '3.1 MB', '최종 제출본', true from file_d1
    union all select id, 'v1', '오유진', '2026-06-10'::date, '2.6 MB', '초안', false from file_d1
    union all select id, 'v1', '김지수', '2026-05-02'::date, '540 KB', '1차 인터뷰 5건 전사 완료', true from file_d2
    union all select id, 'v1', '오유진', '2026-05-12'::date, '210 KB', '지역별 방언 어휘 분류 완료', true from file_d3
    union all select id, 'v1', '한소민', '2026-04-22'::date, '89 MB', '1차 현지 촬영분', true from file_d4
    returning file_id
  ),
  comments as (
    insert into file_comments (file_id, author, avatar, date, text)
    select id, '박민준', '박', '2026-09-09'::date, '4장 통계 수치 출처만 각주로 추가해주시면 좋을 것 같아요.' from file_h1
    union all select id, '이서연', '이', '2026-09-09'::date, '사진 배치는 좋은데 3장 캡션 오타가 하나 보여요 (강화도→강화군).' from file_h1
    union all select id, '김지수', '김', '2026-09-08'::date, '색감 훨씬 좋아졌어요! 이대로 중간발표 자료에 반영할게요.' from file_h2
    union all select id, '최현우', '최', '2026-09-06'::date, '편집 들어갈게요. 흔들린 사진 몇 장은 제외해도 될까요?' from file_h4
    union all select id, '박민준', '박', '2026-06-19'::date, '고생하셨습니다! 결론부 요약만 조금 더 짧게 가면 완벽할 것 같아요.' from file_d1
    returning file_id
  )
select count(*) from versions;

insert into tasks (project_id, title, assignee, avatar, priority, due, tags, status, color) values
  ('heritage', '프로젝트 기획안 작성', '김지수', '김', 'high', '09/01', array['기획'], 'done', '#2563eb'),
  ('heritage', '문헌 조사 및 선행 연구 정리', '박민준', '박', 'high', '09/05', array['조사'], 'done', '#f59e0b'),
  ('heritage', '강화도 현장 답사 계획 수립', '정하늘', '정', 'high', '09/10', array['답사'], 'done', '#8b5cf6'),
  ('heritage', '문화재 목록 데이터 정리 (인천)', '박민준', '박', 'high', '09/20', array['데이터'], 'inprogress', '#f59e0b'),
  ('heritage', '디지털 아카이브 구조 설계', '이서연', '이', 'high', '09/22', array['설계'], 'inprogress', '#22c55e'),
  ('heritage', '현장 사진 분류 및 편집', '최현우', '최', 'mid', '09/18', array['사진'], 'review', '#ef4444'),
  ('heritage', '인터뷰 녹취 정리 (3건)', '박민준', '박', 'mid', '09/24', array['기록'], 'review', '#f59e0b'),
  ('heritage', '중간 발표 슬라이드 제작', '이서연', '이', 'high', '10/01', array['발표'], 'todo', '#22c55e'),
  ('heritage', '웹 전시 페이지 초안', '이서연', '이', 'mid', '10/08', array['설계'], 'todo', '#22c55e'),
  ('heritage', '최종 보고서 초안 작성', '김지수', '김', 'high', '10/15', array['보고서'], 'todo', '#2563eb'),
  ('dialect', '방언 조사 지역 선정', '박민준', '박', 'high', '03/10', array['기획'], 'done', '#f59e0b'),
  ('dialect', '설문·인터뷰 문항 설계', '김지수', '김', 'high', '03/20', array['설계'], 'done', '#2563eb'),
  ('dialect', '현지 화자 섭외', '박민준', '박', 'high', '04/05', array['섭외'], 'done', '#f59e0b'),
  ('dialect', '1차 인터뷰 촬영', '한소민', '한', 'high', '04/20', array['촬영'], 'done', '#8b5cf6'),
  ('dialect', '녹취 전사 (1차)', '김지수', '김', 'mid', '05/01', array['전사'], 'done', '#2563eb'),
  ('dialect', '어휘 분류 체계 수립', '오유진', '오', 'mid', '05/10', array['분석'], 'done', '#2563eb'),
  ('dialect', '비교 분석 및 통계 정리', '오유진', '오', 'high', '05/25', array['분석'], 'done', '#2563eb'),
  ('dialect', '최종 보고서 작성', '오유진', '오', 'high', '06/15', array['보고서'], 'done', '#2563eb');

commit;
