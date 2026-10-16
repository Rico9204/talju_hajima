begin;
drop policy if exists evaluation_read on public.peer_evaluations;
create policy evaluation_read on public.peer_evaluations for select to authenticated
using (exists(select 1 from public.members m where m.id=evaluator_id and m.user_id=auth.uid()));
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
 if expected<2 or received<expected then
   return jsonb_build_object('count',0,'score',null,'criteria',null,'comments','[]'::jsonb,'available',false);
 end if;
 select jsonb_build_object('count',count(*),'available',true,
 'score',avg((role+deadline+communication+collaboration+quality)::numeric/5),
 'criteria',jsonb_build_object('role',avg(role),'deadline',avg(deadline),'communication',avg(communication),'collaboration',avg(collaboration),'quality',avg(quality)),
 'comments',case when p_phase='midterm' then coalesce(jsonb_agg(comment) filter (where btrim(comment)<>''),'[]'::jsonb) else '[]'::jsonb end)
 into result from peer_evaluations where project_id=p_project_id and phase=p_phase and recipient_id=actor;
 return result;
end $$;
revoke all on function public.my_evaluation_average(text,text) from public,anon;
grant execute on function public.my_evaluation_average(text,text) to authenticated;
revoke select on public.members from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute
 where attrelid='public.members'::regclass and attnum>0 and not attisdropped
 and attname not in ('score','eval_count','criteria_role','criteria_deadline','criteria_communication','criteria_collaboration','criteria_quality');
 execute 'grant select ('||cols||') on public.members to authenticated';
end $$;
revoke select(score,eval_count,criteria_role,criteria_deadline,criteria_communication,criteria_collaboration,criteria_quality) on public.members from public,anon,authenticated;
create or replace function public.visible_evaluation_members(p_project_id text default null)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members; a jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_project_id is not null and not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 for m in select * from members where (p_project_id is null and user_id=auth.uid()) or (p_project_id is not null and project_id=p_project_id) loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0; m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  if m.user_id=auth.uid() then
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
revoke all on function public.visible_evaluation_members(text) from public,anon;
grant execute on function public.visible_evaluation_members(text) to authenticated;
-- Final evaluations are score-only. Existing final comments are removed as well.
update public.peer_evaluations set comment='' where phase='final' and comment<>'';
create or replace function public.discard_final_evaluation_comment() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.phase='final' then new.comment:=''; end if;
 return new;
end $$;
drop trigger if exists peer_evaluation_final_comment_guard on public.peer_evaluations;
create trigger peer_evaluation_final_comment_guard before insert or update of phase,comment
on public.peer_evaluations for each row execute function public.discard_final_evaluation_comment();
commit;
