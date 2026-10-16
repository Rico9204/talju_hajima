-- ===== 평가 점수 상위 % (서비스 전체 사용자 기준) =====
-- 비교 집단: 최종 평가가 공개된 모든 사용자. 사람마다 전체 프로젝트의 최종 평가 평균(평가 건수 가중,
-- 화면의 "내 평가 요약"과 같은 방식). 공개 조건은 member_evaluation_average와 같다(동료 2명 이상이 모두 제출, 또는 테스트 모드).
-- 사용자별 평균은 돌려주지 않는 내부 함수로만 계산하고, 밖으로는 순위 비율(상위 N%)만 낸다.
create or replace function public.evaluation_user_averages()
returns table(user_id uuid, score numeric, role numeric, deadline numeric, communication numeric, collaboration numeric, quality numeric)
language sql stable security definer set search_path = public as $$
  with published as (
    select m.id, m.project_id, m.user_id
    from members m
    cross join lateral (
      select count(*) as expected from members o where o.project_id = m.project_id and o.id <> m.id and o.user_id is not null
    ) x
    where m.user_id is not null
      and (public.evaluation_prototype_enabled()
        or (x.expected >= 2
          and (select count(*) from peer_evaluations e where e.project_id = m.project_id and e.phase = 'final' and e.recipient_id = m.id) >= x.expected))
  )
  select p.user_id,
    avg((e.role + e.deadline + e.communication + e.collaboration + e.quality)::numeric / 5),
    avg(e.role), avg(e.deadline), avg(e.communication), avg(e.collaboration), avg(e.quality)
  from published p
  join peer_evaluations e on e.project_id = p.project_id and e.phase = 'final' and e.recipient_id = p.id
  group by p.user_id
$$;
revoke all on function public.evaluation_user_averages() from public, anon, authenticated;

-- 상위 N%: 나보다 점수가 높은 사람 수 + 1을 비교 인원으로 나눈 비율(올림, 1~100). 같은 점수는 같은 순위.
-- 인자 없음: 내 전체 평균의 위치.
-- (프로젝트, 팀원): 그 프로젝트에서 공개된 그 팀원 점수(프로필에 보이는 값)의 위치. 참여자만 조회할 수 있고,
--   보는 사람이 함께하지 않은 프로젝트의 점수는 쓰지 않는다.
-- 비교 인원이 10명 미만이면 순위가 사실상 점수를 드러내므로 available=false.
-- ponytail: 호출마다 전체 사용자 평균을 다시 계산한다. 사용자가 많아지면 결산 시점에 캐시 표로 옮긴다.
create or replace function public.evaluation_percentiles(p_project_id text default null, p_member_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a jsonb;
  t_score numeric; t_role numeric; t_deadline numeric; t_communication numeric; t_collaboration numeric; t_quality numeric;
  population integer;
  c_score integer; c_role integer; c_deadline integer; c_communication integer; c_collaboration integer; c_quality integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if (p_project_id is null) <> (p_member_id is null) then raise exception '잘못된 요청입니다.'; end if;

  if p_project_id is null then
    select u.score, u.role, u.deadline, u.communication, u.collaboration, u.quality
      into t_score, t_role, t_deadline, t_communication, t_collaboration, t_quality
      from public.evaluation_user_averages() u where u.user_id = auth.uid();
  else
    a := public.member_evaluation_average(p_project_id, p_member_id, 'final'); -- 참여자 확인·공개 조건 포함
    if (a->>'available')::boolean and a->>'score' is not null then
      t_score := (a->>'score')::numeric;
      t_role := (a->'criteria'->>'role')::numeric; t_deadline := (a->'criteria'->>'deadline')::numeric;
      t_communication := (a->'criteria'->>'communication')::numeric; t_collaboration := (a->'criteria'->>'collaboration')::numeric;
      t_quality := (a->'criteria'->>'quality')::numeric;
    end if;
  end if;

  select count(*),
    count(*) filter (where u.score > t_score), count(*) filter (where u.role > t_role),
    count(*) filter (where u.deadline > t_deadline), count(*) filter (where u.communication > t_communication),
    count(*) filter (where u.collaboration > t_collaboration), count(*) filter (where u.quality > t_quality)
  into population, c_score, c_role, c_deadline, c_communication, c_collaboration, c_quality
  from public.evaluation_user_averages() u;

  if population < 10 or t_score is null then
    return jsonb_build_object('available', false, 'population', population);
  end if;
  return jsonb_build_object(
    'available', true,
    'population', population,
    'overall', least(100, greatest(1, ceil(100.0 * (c_score + 1) / population)))::int,
    'criteria', jsonb_build_object(
      'role', least(100, greatest(1, ceil(100.0 * (c_role + 1) / population)))::int,
      'deadline', least(100, greatest(1, ceil(100.0 * (c_deadline + 1) / population)))::int,
      'communication', least(100, greatest(1, ceil(100.0 * (c_communication + 1) / population)))::int,
      'collaboration', least(100, greatest(1, ceil(100.0 * (c_collaboration + 1) / population)))::int,
      'quality', least(100, greatest(1, ceil(100.0 * (c_quality + 1) / population)))::int));
end $$;
revoke all on function public.evaluation_percentiles(text, uuid) from public, anon;
grant execute on function public.evaluation_percentiles(text, uuid) to authenticated;
