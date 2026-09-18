-- 이미 배포된 DB에 적용하는 마이그레이션: 프로필 카드 배너 색상 필드 추가.
-- migration_profile_contact.sql이 먼저 적용되어 있어야 함. 기존 profiles
-- RLS 정책을 그대로 쓰므로 정책 변경 불필요.

alter table profiles add column if not exists banner_color text;
