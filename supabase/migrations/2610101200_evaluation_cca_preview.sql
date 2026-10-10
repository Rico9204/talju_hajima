-- ===== 동료 평가 점수 방식 미리보기: CCA(성향 보정 합의 평균) =====
-- 저장된 원점수는 그대로 두고, 화면에서 "현재 방식 / CCA"를 바꿔 볼 수 있도록 내 평균만 CCA로 계산해 돌려준다.
-- 참여자 확인·공개 조건·코멘트는 my_evaluation_average를 그대로 쓰고, 점수(score·criteria)만 바꾼다.
-- 다른 사람의 점수는 돌려주지 않는다(계산에는 팀의 모든 평가가 필요해서 security definer).
--
-- CCA (점수 = 5개 항목 평균 X, 항목별 점수도 같은 식):
--   보정 점수 C = X − (그 평가자가 준 점수들의 평균) + (팀에서 오간 모든 점수의 평균)
--   나를 평가한 사람이 3명 이상이면, 각 C를 "나를 평가한 다른 사람들 C의 중앙값 ± p_limit" 안으로 제한
--   최종 = 제한한 C들의 평균, 마지막에 0~10으로 자름
-- 미리보기는 관리자가 켜야 쓸 수 있다(기본 꺼짐). 원점수와 CCA를 함께 보면 작은 팀에서 다른 팀원끼리 준 점수의 합을
-- 역산할 수 있어서, 비교·검토할 때만 켠다. 꺼져 있으면 화면에 토글이 없고 DB도 계산을 거절한다.
insert into public.app_settings (key, value) values ('evaluation_method_preview_enabled', false)
  on conflict (key) do nothing;

create or replace function public.evaluation_method_preview_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'evaluation_method_preview_enabled'), false)
$$;
revoke all on function public.evaluation_method_preview_enabled() from public, anon;
grant execute on function public.evaluation_method_preview_enabled() to authenticated;

create or replace function public.set_evaluation_method_preview_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 변경할 수 있습니다.'; end if;
  insert into public.app_settings (key, value) values ('evaluation_method_preview_enabled', p_enabled)
    on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.set_evaluation_method_preview_enabled(boolean) from public, anon;
grant execute on function public.set_evaluation_method_preview_enabled(boolean) to authenticated;

create or replace function public.cca_evaluation_average(p_project_id text, p_phase text, p_limit numeric default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  base jsonb;
  actor uuid;
  scores jsonb;
begin
  if not public.evaluation_method_preview_enabled() then raise exception '점수 방식 미리보기가 꺼져 있습니다.'; end if;
  base := public.my_evaluation_average(p_project_id, p_phase); -- 로그인·참여자·평가 유형 확인과 공개 조건을 여기서 함께
  if not coalesce((base->>'available')::boolean, false) or coalesce((base->>'count')::int, 0) = 0 then
    return base || jsonb_build_object('method', 'cca');
  end if;
  select id into actor from public.members where project_id = p_project_id and user_id = auth.uid();

  with ev as (
    select evaluator_id as e, recipient_id as r,
      (role + deadline + communication + collaboration + quality)::numeric / 5 as total,
      role::numeric as role, deadline::numeric as deadline, communication::numeric as communication,
      collaboration::numeric as collaboration, quality::numeric as quality
    from public.peer_evaluations where project_id = p_project_id and phase = p_phase
  ),
  long as ( -- (평가자, 받은 사람, 항목) 한 줄씩. total = 5개 항목 평균
    select e, r, k, v from ev cross join lateral (values
      ('total', total), ('role', role), ('deadline', deadline), ('communication', communication),
      ('collaboration', collaboration), ('quality', quality)) as t(k, v)
  ),
  centered as ( -- C = X − 평가자 평균 + 팀 평균 (항목마다)
    select e, r, k, v - avg(v) over (partition by e, k) + avg(v) over (partition by k) as c from long
  ),
  mine as (select e, k, c from centered where r = actor),
  limited as (
    select m.k,
      case when (select count(*) from mine o where o.k = m.k) >= 3 then
        least(greatest(m.c, med - p_limit), med + p_limit)
      else m.c end as c
    from mine m
    cross join lateral (
      select (percentile_cont(0.5) within group (order by o.c))::numeric as med from mine o where o.k = m.k and o.e <> m.e
    ) x
  )
  select jsonb_object_agg(k, least(10, greatest(0, avg_c))) into scores
  from (select k, avg(c) as avg_c from limited group by k) s;

  return base || jsonb_build_object('method', 'cca', 'score', scores->'total', 'criteria', scores - 'total');
end $$;
revoke all on function public.cca_evaluation_average(text, text, numeric) from public, anon;
grant execute on function public.cca_evaluation_average(text, text, numeric) to authenticated;
