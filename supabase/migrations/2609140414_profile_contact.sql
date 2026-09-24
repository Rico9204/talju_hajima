-- 이미 배포된 DB에 적용하는 마이그레이션: 프로필에 연락처(카카오톡 ID,
-- 전화번호 등) 필드 추가. migration_unified_profile.sql이 먼저 적용되어
-- 있어야 함. 기존 profiles RLS 정책(본인만 select/update, 같은 프로젝트
-- 팀원은 select 가능)을 그대로 쓰므로 정책 변경 불필요.

alter table profiles add column if not exists contact text;
