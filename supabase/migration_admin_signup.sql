-- 이미 배포된 DB에 적용하는 마이그레이션: 회원가입 시 "관리자/일반" 계정
-- 유형을 직접 선택할 수 있게 하고, 조장이 프로젝트를 만들 때 승인을 요청할
-- 특정 관리자를 소속/이름/이메일로 검색해 지정할 수 있게 한다.
-- migration_admin.sql, migration_project_approval.sql이 먼저 적용되어
-- 있어야 함 (is_admin 컬럼/함수, approval_status 컬럼이 필요).
--
-- 팀장/팀원 구분은 여전히 프로젝트별 members.is_leader 그대로 — 계정 자체의
-- 역할 구분은 "관리자냐 아니냐" 하나뿐이다.

alter table profiles add column if not exists org text;
alter table profiles add column if not exists email text;

-- Backfill for accounts that already existed before this migration — new
-- signups get email set going forward by the updated handle_new_user()
-- below, but existing rows would otherwise stay null forever and be
-- unfindable by search_admin_profiles(). org has no equivalent source to
-- backfill from (it didn't exist anywhere before), so a pre-existing admin
-- has to set their own org from the app (Sidebar profile card) after this.
update profiles set email = u.email
from auth.users u
where u.id = profiles.id and profiles.email is null;

-- 회원가입 폼에서 "관리자로 가입"을 선택하면 signUp()의 options.data로
-- is_admin/org를 함께 보내고, 여기서 그대로 반영한다. email은 검색용으로
-- auth.users에서 복사해둔다 (profiles는 클라이언트에서 직접 조회 가능하지만
-- auth.users는 불가능하므로).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_initial, is_admin, org, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', '사용자'),
    left(coalesce(new.raw_user_meta_data->>'display_name', '사용자'), 1),
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false),
    nullif(new.raw_user_meta_data->>'org', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 보안 수정: profiles_update_own 정책(schema.sql)은 "본인 행인가"만 확인하고
-- "어떤 컬럼을 바꾸는가"는 확인하지 않아서, 로그인한 사용자가 REST API를
-- 직접 호출해 자기 profiles.is_admin을 true로 셀프 승격할 수 있었다
-- (실제로 재현 확인함). auth.uid()가 null인지로 "앱에서 온 요청"과
-- "SQL 에디터에서 관리자가 직접 실행한 요청"을 구분하는, 이 파일의
-- set_project_approval_status()와 동일한 패턴으로 막는다.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.is_admin is distinct from old.is_admin then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_escalation_trigger on profiles;
create trigger prevent_profile_privilege_escalation_trigger
  before update on profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- 조장이 프로젝트 생성 시 지정한, 승인을 처리해야 할 특정 관리자.
alter table projects add column if not exists requested_admin_id uuid references auth.users(id) on delete set null;

-- 승인/반려는 그 요청을 받은 관리자만 처리 가능 (다른 관리자 소관 요청에는
-- 관여하지 않음). requested_admin_id가 없는 행(관리자 본인이 만들었거나
-- 레거시)은 기존처럼 아무 관리자나 가능.
drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (
    is_project_leader(id)
    or (is_admin() and (requested_admin_id is null or requested_admin_id = auth.uid()))
  );

-- 조장이 "승인 요청 관리자" 검색창에서 쓰는 함수. profiles 테이블 전체에
-- select 권한을 열어주는 대신, 관리자 계정의 이름/소속/이메일만 좁게
-- 노출한다 (프로필 사진·연락처·배너 등은 그대로 비공개).
create or replace function public.search_admin_profiles(q text)
returns table(id uuid, display_name text, org text, email text)
language sql security definer stable as $$
  select p.id, p.display_name, p.org, p.email
  from profiles p
  where p.is_admin = true
    and (
      p.display_name ilike '%' || q || '%'
      or p.org ilike '%' || q || '%'
      or p.email ilike '%' || q || '%'
    )
  order by p.display_name
  limit 10;
$$;
