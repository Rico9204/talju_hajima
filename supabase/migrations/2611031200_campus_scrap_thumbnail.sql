-- ===== 캠퍼스 소식 스크랩에 포스터 주소 저장 =====
-- 스크랩 탭은 저장된 값만 보여 주므로, 포스터도 스크랩할 때 함께 저장한다. 이전 스크랩은 비어 있다.
alter table public.campus_scrapped_notices add column if not exists thumbnail text;
