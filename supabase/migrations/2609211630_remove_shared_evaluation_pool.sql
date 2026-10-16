-- Follow-up for deployments that already applied 2609211600.
-- Both midterm and final evaluations now use independent 0–10 scores.
create or replace function public.submit_peer_evaluations(p_project_id text, p_phase text, p_entries jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype; actor uuid; submission uuid; expected integer; actual integer;
begin
  select * into p from public.projects where id=p_project_id for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  select id into actor from public.members where project_id=p_project_id and user_id=auth.uid();
  if actor is null then raise exception '프로젝트 참여자만 평가할 수 있습니다.'; end if;
  if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형입니다.'; end if;
  if not public.evaluation_prototype_enabled() then
    if (p_phase='midterm' and p.status<>'active') or (p_phase='final' and p.status<>'done') then raise exception '프로젝트 상태가 변경되었습니다. 새로고침해 주세요.'; end if;
    if p_phase='midterm' and p.end_date-p.start_date<14 then raise exception '2주 미만 프로젝트는 중간 평가를 생략합니다.'; end if;
  end if;
  if exists(select 1 from public.peer_evaluation_submissions where project_id=p_project_id and evaluator_id=actor and phase=p_phase) then raise exception '이미 제출한 평가입니다.'; end if;
  perform id from public.members where project_id=p_project_id for share;
  select count(*) into expected from public.members where project_id=p_project_id and id<>actor and user_id is not null;
  if expected=0 then raise exception '평가할 동료가 없습니다.'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)<>expected then raise exception '평가 대상이 올바르지 않습니다.'; end if;
  select count(distinct e.recipient_id) into actual from jsonb_to_recordset(p_entries) as e(recipient_id uuid) join public.members m on m.id=e.recipient_id and m.project_id=p_project_id and m.id<>actor and m.user_id is not null;
  if actual<>expected then raise exception '평가 대상이 올바르지 않습니다.'; end if;
  if exists(select 1 from jsonb_array_elements(p_entries) e cross join unnest(array['role','deadline','communication','collaboration','quality']) k where jsonb_typeof(e->k) is distinct from 'number' or (e->>k)::numeric<>trunc((e->>k)::numeric) or (e->>k)::numeric not between 0 and 10) then raise exception '점수는 0~10 사이의 정수여야 합니다.'; end if;
  insert into public.peer_evaluation_submissions(project_id,evaluator_id,phase) values(p_project_id,actor,p_phase) returning id into submission;
  insert into public.peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality,comment) select submission,p_project_id,actor,e.recipient_id,p_phase,e.role,e.deadline,e.communication,e.collaboration,e.quality,coalesce(e.comment,'') from jsonb_to_recordset(p_entries) as e(recipient_id uuid,role integer,deadline integer,communication integer,collaboration integer,quality integer,comment text);
  if p_phase='final' then update public.members m set eval_count=a.n,score=a.score,criteria_role=a.role,criteria_deadline=a.deadline,criteria_communication=a.communication,criteria_collaboration=a.collaboration,criteria_quality=a.quality from (select recipient_id,count(*)::integer n,avg((role+deadline+communication+collaboration+quality)/5.0) score,avg(role) role,avg(deadline) deadline,avg(communication) communication,avg(collaboration) collaboration,avg(quality) quality from public.peer_evaluations where project_id=p_project_id and phase='final' group by recipient_id) a where m.id=a.recipient_id; end if;
end $$;
revoke all on function public.submit_peer_evaluations(text,text,jsonb) from public,anon;
grant execute on function public.submit_peer_evaluations(text,text,jsonb) to authenticated;
