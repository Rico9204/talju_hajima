-- 이미 배포된 DB에 적용하는 마이그레이션: 글래스 카드 반투명도/블러 세기를
-- 계정별로 조절 가능하게 함. migration_profile_background.sql이 먼저
-- 적용되어 있어야 함. null이면 앱 기본값(66 / 18)을 사용.

alter table profiles add column if not exists glass_opacity integer;
alter table profiles add column if not exists glass_blur integer;
