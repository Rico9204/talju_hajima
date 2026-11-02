-- ===== 동료 평가 공식 점수 방식: 원점수 평균 / CCA (관리자가 전체 적용) =====
-- 관리자가 "공식 점수 방식: CCA"를 켜면 내 평균(my_evaluation_average), 팀원 평균(member_evaluation_average),
-- 그리고 이 둘을 쓰는 프로필·대시보드·업적(visible_evaluation_members)과 상위 %(evaluation_user_averages)가 모두 CCA로 계산된다.
-- 저장된 원점수(peer_evaluations)는 그대로이고, 끄면 바로 원점수 평균으로 돌아간다.
-- 점수 계산은 evaluation_scores_by_method 한곳에서 한다(권한 확인 없음, 밖에서 직접 부를 수 없음).
insert into public.app_settings (key, value) values ('evaluation_score_cca', false)
  on conflict (key) do nothing;

create or replace function public.evaluation_score_cca_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'evaluation_score_cca'), false)
$$;
revoke all on function public.evaluation_score_cca_enabled() from public, anon;
grant execute on function public.evaluation_score_cca_enabled() to authenticated;

create or replace function public.set_evaluation_score_cca_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 변경할 수 있습니다.'; end if;
  insert into public.app_settings (key, value) values ('evaluation_score_cca', p_enabled)
    on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.set_evaluation_score_cca_enabled(boolean) from public, anon;
grant execute on function public.set_evaluation_score_cca_enabled(boolean) to authenticated;

create or replace function public.evaluation_official_method()
returns text language sql stable security definer set search_path = public as $$
  select case when public.evaluation_score_cca_enabled() then 'cca' else 'raw' end
$$;
revoke all on function public.evaluation_official_method() from public, anon, authenticated;

-- 한 팀원이 받은 점수 {score, criteria}. raw = 받은 점수 평균, cca = 성향 보정 합의 평균
-- (계산식은 2610101200_evaluation_cca_preview.sql 설명과 같다). 받은 평가가 없으면 score는 null.
create or replace function public.evaluation_scores_by_method(p_project_id text, p_member_id uuid, p_phase text, p_method text, p_limit numeric default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare scores jsonb;
begin
  if p_method = 'cca' then
    with ev as (
      select evaluator_id as e, recipient_id as r,
        (role + deadline + communication + collaboration + quality)::numeric / 5 as total,
        role::numeric as role, deadline::numeric as deadline, communication::numeric as communication,
        collaboration::numeric as collaboration, quality::numeric as quality
      from public.peer_evaluations where project_id = p_project_id and phase = p_phase
    ),
    long as (
      select e, r, k, v from ev cross join lateral (values
        ('total', total), ('role', role), ('deadline', deadline), ('communication', communication),
        ('collaboration', collaboration), ('quality', quality)) as t(k, v)
    ),
    centered as (
      select e, r, k, v - avg(v) over (partition by e, k) + avg(v) over (partition by k) as c from long
    ),
    mine as (select e, k, c from centered where r = p_member_id),
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
    if scores is null then
      return jsonb_build_object('method', 'cca', 'score', null, 'criteria', jsonb_build_object('role', null, 'deadline', null, 'communication', null, 'collaboration', null, 'quality', null));
    end if;
    return jsonb_build_object('method', 'cca', 'score', scores->'total', 'criteria', scores - 'total');
  end if;
  select jsonb_build_object('method', 'raw',
    'score', avg((role + deadline + communication + collaboration + quality)::numeric / 5),
    'criteria', jsonb_build_object('role', avg(role), 'deadline', avg(deadline), 'communication', avg(communication), 'collaboration', avg(collaboration), 'quality', avg(quality)))
    into scores
  from public.peer_evaluations where project_id = p_project_id and phase = p_phase and recipient_id = p_member_id;
  return scores;
end $$;
revoke all on function public.evaluation_scores_by_method(text, uuid, text, text, numeric) from public, anon, authenticated;

create or replace function public.my_evaluation_average(p_project_id text, p_phase text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor uuid; expected integer; received integer; result jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형'; end if;
 select id into actor from members where project_id=p_project_id and user_id=auth.uid();
 if actor is null then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 select count(*) into expected from members where project_id=p_project_id and id<>actor and user_id is not null;
 select count(*) into received from peer_evaluations where project_id=p_project_id and phase=p_phase and recipient_id=actor;
 if not public.evaluation_prototype_enabled() and (expected<2 or received<expected) then
   return jsonb_build_object('count',0,'score',null,'criteria',null,'comments','[]'::jsonb,'available',false,'method',public.evaluation_official_method());
 end if;
 select jsonb_build_object('count',count(*),'available',true,
 'comments',case when p_phase='midterm' then coalesce(jsonb_agg(comment) filter (where btrim(comment)<>''),'[]'::jsonb) else '[]'::jsonb end)
 into result from peer_evaluations where project_id=p_project_id and phase=p_phase and recipient_id=actor;
 return result || public.evaluation_scores_by_method(p_project_id, actor, p_phase, public.evaluation_official_method());
end $$;
revoke all on function public.my_evaluation_average(text,text) from public, anon;
grant execute on function public.my_evaluation_average(text,text) to authenticated;

create or replace function public.member_evaluation_average(p_project_id text, p_member_id uuid, p_phase text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare expected integer; received integer;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형'; end if;
 if not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 if not exists (select 1 from members where id = p_member_id and project_id = p_project_id) then
   raise exception '멤버를 찾을 수 없습니다.';
 end if;
 select count(*) into expected from members where project_id = p_project_id and id <> p_member_id and user_id is not null;
 select count(*) into received from peer_evaluations where project_id = p_project_id and phase = p_phase and recipient_id = p_member_id;
 if not public.evaluation_prototype_enabled() and (expected < 2 or received < expected) then
   return jsonb_build_object('count', 0, 'score', null, 'criteria', null, 'comments', '[]'::jsonb, 'available', false, 'method', public.evaluation_official_method());
 end if;
 return jsonb_build_object('count', received, 'available', true, 'comments', '[]'::jsonb)
   || public.evaluation_scores_by_method(p_project_id, p_member_id, p_phase, public.evaluation_official_method());
end $$;
revoke all on function public.member_evaluation_average(text,uuid,text) from public, anon;
grant execute on function public.member_evaluation_average(text,uuid,text) to authenticated;

-- 상위 %의 비교 집단: 사람마다 프로젝트별 공식 점수를 받은 평가 수로 가중 평균(원점수일 때는 예전 계산과 같다).
-- ponytail: CCA일 때는 프로젝트마다 팀 전체 점수를 다시 계산한다. 사용자가 많아지면 결산 시점에 캐시 표로 옮긴다.
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
  ),
  per_project as (
    select p.user_id, n.n, public.evaluation_scores_by_method(p.project_id, p.id, 'final', public.evaluation_official_method()) as s
    from published p
    cross join lateral (select count(*)::numeric as n from peer_evaluations e where e.project_id = p.project_id and e.phase = 'final' and e.recipient_id = p.id) n
    where n.n > 0
  )
  select user_id,
    sum((s->>'score')::numeric * n) / sum(n),
    sum((s->'criteria'->>'role')::numeric * n) / sum(n),
    sum((s->'criteria'->>'deadline')::numeric * n) / sum(n),
    sum((s->'criteria'->>'communication')::numeric * n) / sum(n),
    sum((s->'criteria'->>'collaboration')::numeric * n) / sum(n),
    sum((s->'criteria'->>'quality')::numeric * n) / sum(n)
  from per_project
  group by user_id
$$;
revoke all on function public.evaluation_user_averages() from public, anon, authenticated;

-- 점수 방식 비교(미리보기): 공식 방식과 관계없이 고른 방식으로 내 평균을 계산한다. 미리보기가 켜져 있을 때만.
create or replace function public.evaluation_average_preview(p_project_id text, p_phase text, p_method text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb; actor uuid;
begin
  if not public.evaluation_method_preview_enabled() then raise exception '점수 방식 미리보기가 꺼져 있습니다.'; end if;
  if p_method is null or p_method not in ('raw', 'cca') then raise exception '점수 방식은 raw 또는 cca 이어야 합니다.'; end if;
  base := public.my_evaluation_average(p_project_id, p_phase); -- 로그인·참여자·평가 유형 확인과 공개 조건
  if not coalesce((base->>'available')::boolean, false) or coalesce((base->>'count')::int, 0) = 0 then
    return base || jsonb_build_object('method', p_method);
  end if;
  select id into actor from public.members where project_id = p_project_id and user_id = auth.uid();
  return base || public.evaluation_scores_by_method(p_project_id, actor, p_phase, p_method);
end $$;
revoke all on function public.evaluation_average_preview(text, text, text) from public, anon;
grant execute on function public.evaluation_average_preview(text, text, text) to authenticated;

create or replace function public.cca_evaluation_average(p_project_id text, p_phase text, p_limit numeric default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb; actor uuid;
begin
  if not public.evaluation_method_preview_enabled() then raise exception '점수 방식 미리보기가 꺼져 있습니다.'; end if;
  base := public.my_evaluation_average(p_project_id, p_phase);
  if not coalesce((base->>'available')::boolean, false) or coalesce((base->>'count')::int, 0) = 0 then
    return base || jsonb_build_object('method', 'cca');
  end if;
  select id into actor from public.members where project_id = p_project_id and user_id = auth.uid();
  return base || public.evaluation_scores_by_method(p_project_id, actor, p_phase, 'cca', p_limit);
end $$;
revoke all on function public.cca_evaluation_average(text, text, numeric) from public, anon;
grant execute on function public.cca_evaluation_average(text, text, numeric) to authenticated;
