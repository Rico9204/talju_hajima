-- ===== 동료 평가: 신규 사용자 점수 보호 + 승인 담당 교수의 원자료 열람 =====
-- 1) 남에게 보이는 점수의 최소 기준: 결과가 공개된 종료 평가 프로젝트 2개 이상 + 나를 평가한 서로 다른 동료 4명 이상.
--    첫 프로젝트 한 번의 점수가 그대로 꼬리표가 되지 않게 한다. 기준 미달이면 남에게는 "협업 기록 수집 중"(점수·신뢰도·상위 % 없음),
--    본인에게는 계속 보인다. 테스트 모드(evaluation_prototype_enabled)에서는 기준을 적용하지 않는다.
-- 2) 프로젝트를 승인한 담당 교수(requested_admin_id)는 성적 반영을 위해 그 프로젝트의 개별 평가(누가 누구에게 몇 점)를 볼 수 있다.
--    팀장·팀원에게는 여전히 공개하지 않는다.

-- 결과가 공개된(2명 이상이 평가하고 모두 제출한) 종료 평가 프로젝트 수와, 그 평가를 한 서로 다른 동료 수.
create or replace function public.evaluation_record_progress(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select m.id, m.project_id,
      (select count(*) from public.members o where o.project_id = m.project_id and o.id <> m.id and o.user_id is not null) as expected
    from public.members m
    where m.user_id = p_user_id
  ),
  published as (
    select x.id, x.project_id from mine x
    where x.expected >= 2
      and (select count(*) from public.peer_evaluations e where e.project_id = x.project_id and e.phase = 'final' and e.recipient_id = x.id) >= x.expected
  )
  select jsonb_build_object(
    'projects', (select count(*) from published),
    'evaluators', (select count(distinct ev.user_id) from published x
      join public.peer_evaluations e on e.project_id = x.project_id and e.phase = 'final' and e.recipient_id = x.id
      join public.members ev on ev.id = e.evaluator_id
      where ev.user_id is not null),
    'requiredProjects', 2,
    'requiredEvaluators', 4)
$$;
revoke all on function public.evaluation_record_progress(uuid) from public, anon, authenticated;

create or replace function public.evaluation_score_public(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare progress jsonb;
begin
  if public.evaluation_prototype_enabled() then return true; end if;
  progress := public.evaluation_record_progress(p_user_id);
  return (progress->>'projects')::int >= (progress->>'requiredProjects')::int
     and (progress->>'evaluators')::int >= (progress->>'requiredEvaluators')::int;
end $$;
revoke all on function public.evaluation_score_public(uuid) from public, anon, authenticated;

-- 다른 팀원의 프로젝트 점수: 이 프로젝트에서 공개 조건을 넘어도, 그 사람이 기준(2개·4명)에 못 미치면 남에게는 숨긴다.
-- (팀 화면·프로필·상위 %가 모두 이 함수를 거친다. 본인 점수는 my_evaluation_average와 본인 행이라 그대로 보인다.)
create or replace function public.member_evaluation_average(p_project_id text, p_member_id uuid, p_phase text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare expected integer; received integer; target_user uuid;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형'; end if;
 if not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 select user_id into target_user from members where id = p_member_id and project_id = p_project_id;
 if not found then raise exception '멤버를 찾을 수 없습니다.'; end if;
 select count(*) into expected from members where project_id = p_project_id and id <> p_member_id and user_id is not null;
 select count(*) into received from peer_evaluations where project_id = p_project_id and phase = p_phase and recipient_id = p_member_id;
 if not public.evaluation_prototype_enabled() and (expected < 2 or received < expected) then
   return jsonb_build_object('count', 0, 'score', null, 'criteria', null, 'comments', '[]'::jsonb, 'available', false, 'method', public.evaluation_official_method());
 end if;
 if target_user is distinct from auth.uid() and not public.evaluation_score_public(target_user) then
   return jsonb_build_object('count', 0, 'score', null, 'criteria', null, 'comments', '[]'::jsonb, 'available', false, 'collecting', true, 'method', public.evaluation_official_method());
 end if;
 return jsonb_build_object('count', received, 'available', true, 'comments', '[]'::jsonb)
   || public.evaluation_scores_by_method(p_project_id, p_member_id, p_phase, public.evaluation_official_method());
end $$;
revoke all on function public.member_evaluation_average(text,uuid,text) from public, anon;
grant execute on function public.member_evaluation_average(text,uuid,text) to authenticated;

-- 프로필의 참여 통계에 기준 진행 상황을 함께 준다(남의 프로필에서 "협업 기록 수집 중 · 프로젝트 1/2 · 평가한 동료 3/4").
create or replace function public.member_participation_stats(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_project_count integer; v_collaborator_count integer; v_progress jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_user_id is distinct from auth.uid() and not public.shares_project_with(p_user_id) then
    raise exception '조회할 수 없는 사용자입니다.';
  end if;
  -- 종료(done)된 프로젝트만 결산에 반영한다. 진행 중인 프로젝트는 종료 시점에 +1.
  select count(distinct m.project_id) into v_project_count
  from public.members m join public.projects p on p.id = m.project_id
  where m.user_id = p_user_id and p.status = 'done';
  -- 함께한 동료: 종료된 프로젝트들에서 만난 서로 다른 사람 수(중복 제외).
  select count(distinct coalesce(m.user_id::text, 'row:' || m.id::text)) into v_collaborator_count
  from public.members m join public.projects p on p.id = m.project_id
  where p.status = 'done'
    and m.project_id in (select project_id from public.members where user_id = p_user_id)
    and m.user_id is distinct from p_user_id;
  v_progress := public.evaluation_record_progress(p_user_id);
  return jsonb_build_object('projectCount', coalesce(v_project_count, 0), 'collaboratorCount', coalesce(v_collaborator_count, 0),
    'evaluationProjects', (v_progress->>'projects')::int, 'evaluationEvaluators', (v_progress->>'evaluators')::int,
    'requiredProjects', (v_progress->>'requiredProjects')::int, 'requiredEvaluators', (v_progress->>'requiredEvaluators')::int,
    'scorePublic', public.evaluation_score_public(p_user_id));
end $$;
revoke all on function public.member_participation_stats(uuid) from public,anon;
grant execute on function public.member_participation_stats(uuid) to authenticated;

-- 승인 담당 교수의 개별 평가 열람(성적 반영용). 중간 점검 코멘트도 함께, 종료 평가 코멘트는 저장하지 않으므로 비어 있다.
create or replace function public.admin_project_evaluations(p_project_id text)
returns table(phase text, evaluator_id uuid, evaluator_name text, recipient_id uuid, recipient_name text,
  role integer, deadline integer, communication integer, collaboration integer, quality integer, comment text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 조회할 수 있습니다.'; end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.requested_admin_id = auth.uid()) then
    raise exception '내가 승인한 프로젝트의 평가만 볼 수 있습니다.';
  end if;
  return query
    select e.phase, e.evaluator_id, ev.name, e.recipient_id, rc.name,
      e.role, e.deadline, e.communication, e.collaboration, e.quality, e.comment, e.created_at
    from public.peer_evaluations e
    join public.members ev on ev.id = e.evaluator_id
    join public.members rc on rc.id = e.recipient_id
    where e.project_id = p_project_id
    order by e.phase, rc.name, ev.name;
end $$;
revoke all on function public.admin_project_evaluations(text) from public, anon;
grant execute on function public.admin_project_evaluations(text) to authenticated;
