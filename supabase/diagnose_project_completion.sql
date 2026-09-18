-- Read-only inspection for the deployed completion function and project triggers.
select pg_get_functiondef('public.complete_evaluation_project(text)'::regprocedure);

select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
where t.tgrelid = 'public.projects'::regclass and not t.tgisinternal;
