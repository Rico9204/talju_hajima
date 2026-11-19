-- ===== 파일 버전마다 올린 사람의 계정 ID =====
-- uploaded_by(이름)만으로는 이름이 같거나 바뀐 경우 "원작자가 아닌 다른 팀원이 고친 버전"을 가릴 수 없다.
-- 버전은 늘 로그인한 사용자로 저장되므로(업로드·바로 수정·오피스 콜백 모두) 기본값 auth.uid()로 채운다.
-- 예전 버전은 비어 있고, 화면은 그때 이름으로 비교한다. 탈퇴한 계정이 지워지면 비운다.
alter table public.file_versions add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null;
alter table public.file_versions alter column uploaded_by_user_id set default auth.uid();
