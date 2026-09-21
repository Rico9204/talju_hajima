-- Run in the Supabase SQL Editor after applying schema.sql or a deployment patch.
-- This query is read-only. Every `ready` value should be true before deploying.
with required_functions(label, signature) as (
  values
    ('workspace version registration', 'public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text,text[])'),
    ('peer evaluation submission', 'public.submit_peer_evaluations(text,text,jsonb)'),
    ('project completion', 'public.complete_evaluation_project(text)'),
    ('my evaluation average', 'public.my_evaluation_average(text,text)'),
    ('visible evaluation members', 'public.visible_evaluation_members(text)')
), checks as (
  select 'function'::text as kind, label as item, to_regprocedure(signature) is not null as ready
  from required_functions
  union all
  select 'storage bucket', bucket_id, exists(select 1 from storage.buckets where id = bucket_id)
  from (values ('avatars'), ('workspace-files')) as required_buckets(bucket_id)
  union all
  select 'workspace storage policy', policy_name,
    exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = policy_name)
  from (values ('workspace_binary_insert'), ('workspace_binary_read'), ('workspace_binary_cleanup')) as required_policies(policy_name)
)
select kind, item, ready, case when ready then 'ready' else 'apply schema or the matching migration' end as action
from checks
order by ready, kind, item;
