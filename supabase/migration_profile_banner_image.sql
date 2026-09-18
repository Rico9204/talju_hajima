-- 이미 배포된 DB에 적용하는 마이그레이션: 프로필 카드 배너에 커스텀 이미지
-- 업로드 지원. migration_profile_banner_color.sql이 먼저 적용되어 있어야 함.
-- 이미지는 기존 "avatars" 스토리지 버킷(계정 uid 폴더 하위, avatars_own_write
-- 계열 정책 그대로 재사용)에 저장되므로 스토리지 정책 변경은 불필요.

alter table profiles add column if not exists banner_image_url text;
