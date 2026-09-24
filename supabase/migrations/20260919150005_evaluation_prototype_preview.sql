-- 프로토타입(테스트) 모드에서는 프로젝트가 아직 종료하지 않았거나 아직
-- 모든 동료가 평가를 제출하지 않았어도 평판(평균 점수)이 보이도록 함.
--
-- submit_peer_evaluations는 이미 evaluation_prototype_enabled()로 "프로젝트
-- 상태/기간" 제약을 우회하고 있는데, 조회 쪽(my_evaluation_average)은
-- 여전히 "동료 2명 이상 + 전원 제출 완료"를 항상 요구하고 있어서 프로토
-- 타입 모드에서도 평판을 미리 확인할 수 없었음. 제출 쪽과 동일하게
-- 프로토타입 모드에서는 이 요건을 건너뛰도록 맞춤.

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
   return jsonb_build_object('count',0,'score',null,'criteria',null,'comments','[]'::jsonb,'available',false);
 end if;
 select jsonb_build_object('count',count(*),'available',true,
 'score',avg((role+deadline+communication+collaboration+quality)::numeric/5),
 'criteria',jsonb_build_object('role',avg(role),'deadline',avg(deadline),'communication',avg(communication),'collaboration',avg(collaboration),'quality',avg(quality)),
 'comments',case when p_phase='midterm' then coalesce(jsonb_agg(comment) filter (where btrim(comment)<>''),'[]'::jsonb) else '[]'::jsonb end)
 into result from peer_evaluations where project_id=p_project_id and phase=p_phase and recipient_id=actor;
 return result;
end $$;
