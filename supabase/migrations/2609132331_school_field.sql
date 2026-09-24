-- 이미 배포된 DB에 적용하는 마이그레이션: 계정 프로필에 학교(school) 필드
-- 추가. migration_unified_profile.sql이 먼저 적용되어 있어야 함.

alter table profiles add column if not exists school text;
