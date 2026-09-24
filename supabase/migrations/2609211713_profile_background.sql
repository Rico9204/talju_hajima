-- 이미 배포된 DB에 적용하는 마이그레이션: 로그인 후 전체 앱에 적용되는
-- 커스텀 배경(이미지 업로드 / 그라데이션 프리셋 / 단색 프리셋) 지원.
-- 이미지는 기존 "avatars" 스토리지 버킷(계정 uid 폴더 하위, avatars_own_write
-- 계열 정책 그대로 재사용)에 저장되므로 스토리지 정책 변경은 불필요.
-- 우선순위: background_image_url > background_gradient > background_color > 기본값.

alter table profiles add column if not exists background_color text;
alter table profiles add column if not exists background_gradient text;
alter table profiles add column if not exists background_image_url text;
