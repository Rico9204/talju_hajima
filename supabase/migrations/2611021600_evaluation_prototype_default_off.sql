-- ===== 동료평가 테스트 모드 기본값 끄기 =====
-- 테스트 모드가 켜져 있으면 전원 제출·최소 인원 조건 없이 평균과 코멘트가 공개되어, 2인 팀에서는 누가 준 점수인지 그대로 드러난다.
-- 값이 없을 때의 기본을 꺼짐으로 바꾸고, 지금 켜져 있는 값도 끈다. 검증이 필요하면 관리자 패널에서 다시 켤 수 있다.
create or replace function public.evaluation_prototype_enabled()
returns boolean language sql stable as $$
  select coalesce((select value from public.app_settings where key = 'evaluation_prototype_enabled'), false)
$$;
revoke all on function public.evaluation_prototype_enabled() from public, anon;
grant execute on function public.evaluation_prototype_enabled() to authenticated;

update public.app_settings set value = false where key = 'evaluation_prototype_enabled';
