-- "동료평가 테스트 모드"를 하드코딩된 true 대신, 관리자가 켜고 끌 수 있는
-- 실제 전역 설정으로 바꿈. 켜져 있으면(현재 기본값 true — 지금 상태 유지):
--   - 평가 제출이 프로젝트 상태/기간 제약 없이 가능 (submit_peer_evaluations)
--   - 평판(평균 점수)이 프로젝트 종료·전원 제출 여부와 무관하게 조회 가능
--     (my_evaluation_average — migration_evaluation_prototype_preview.sql)

create table if not exists public.app_settings (
  key text primary key,
  value boolean not null
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
  values ('evaluation_prototype_enabled', true)
  on conflict (key) do nothing;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated using (true);
-- 직접 테이블 쓰기는 막고, set_evaluation_prototype_enabled(관리자 검증 포함)로만 변경 가능.
revoke insert, update, delete on public.app_settings from authenticated;

create or replace function public.evaluation_prototype_enabled()
returns boolean language sql stable as $$
  select coalesce((select value from public.app_settings where key = 'evaluation_prototype_enabled'), true)
$$;

create or replace function public.set_evaluation_prototype_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '관리자만 변경할 수 있습니다.';
  end if;
  insert into public.app_settings (key, value) values ('evaluation_prototype_enabled', p_enabled)
    on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.set_evaluation_prototype_enabled(boolean) from public, anon;
grant execute on function public.set_evaluation_prototype_enabled(boolean) to authenticated;
