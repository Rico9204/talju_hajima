-- 이미 배포된 DB에 적용하는 마이그레이션.
-- members_insert 정책이 user_id를 직접 비교하는 대신, 트리거가 항상
-- user_id를 auth.uid()로 강제로 채우도록 바꿉니다. (RLS의 등호 비교가
-- PostgREST를 통한 요청에서 신뢰할 수 없게 동작하는 것을 확인해서 우회)

drop policy if exists members_insert on members;
create policy members_insert on members for insert
  with check (auth.role() = 'authenticated');

alter table members alter column user_id drop default;

create or replace function public.set_member_user_id()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_member_user_id_trigger on members;
create trigger set_member_user_id_trigger
  before insert on members
  for each row execute function public.set_member_user_id();

-- 진단 중 만들었던 디버그용 함수 정리
drop function if exists public.debug_auth();
