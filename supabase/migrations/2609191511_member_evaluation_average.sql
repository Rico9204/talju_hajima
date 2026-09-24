-- 다른 팀원의 프로필을 볼 때도, 그 사람의 최종 평가가 "정산 완료"(동료 2명
-- 이상 전원 제출, 또는 테스트 모드 켜짐)됐다면 평점 평균을 볼 수 있도록 함.
-- 지금까지는 visible_evaluation_members가 본인 행만 my_evaluation_average로
-- 채우고 다른 멤버는 항상 0으로 지워버렸음. 개별 평가자·코멘트는 여전히
-- 비공개 — 여기서 노출하는 건 평균 점수뿐.

create or replace function public.member_evaluation_average(p_project_id text, p_member_id uuid, p_phase text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare expected integer; received integer; result jsonb;
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
   return jsonb_build_object('count', 0, 'score', null, 'criteria', null, 'comments', '[]'::jsonb, 'available', false);
 end if;
 select jsonb_build_object('count', count(*), 'available', true,
 'score', avg((role+deadline+communication+collaboration+quality)::numeric/5),
 'criteria', jsonb_build_object('role', avg(role), 'deadline', avg(deadline), 'communication', avg(communication), 'collaboration', avg(collaboration), 'quality', avg(quality)),
 -- 코멘트는 본인 것도 아닌 이상 절대 노출하지 않음 (평균 점수만 공개 대상).
 'comments', '[]'::jsonb)
 into result from peer_evaluations where project_id = p_project_id and phase = p_phase and recipient_id = p_member_id;
 return result;
end $$;
revoke all on function public.member_evaluation_average(text,uuid,text) from public, anon;
grant execute on function public.member_evaluation_average(text,uuid,text) to authenticated;

create or replace function public.visible_evaluation_members(p_project_id text default null)
returns setof public.members language plpgsql stable security definer set search_path = public as $$
declare m public.members; a jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_project_id is not null and not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 for m in select * from members where (p_project_id is null and user_id=auth.uid()) or (p_project_id is not null and project_id=p_project_id) loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0; m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  if p_project_id is not null then
   -- 프로젝트 단위 조회(팀 관리 화면 등)일 때는 정산 완료된 멤버라면
   -- 본인이 아니어도 평균을 채운다.
   a := public.member_evaluation_average(m.project_id, m.id, 'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  elsif m.user_id=auth.uid() then
   -- p_project_id가 null인 호출(내 전체 프로젝트 합산 요약)은 원래대로
   -- 본인 행만 채움 — 이 경로는 이번 변경과 무관.
   a:=public.my_evaluation_average(m.project_id,'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  end if;
  return next m;
 end loop;
end $$;
revoke all on function public.visible_evaluation_members(text) from public, anon;
grant execute on function public.visible_evaluation_members(text) to authenticated;
