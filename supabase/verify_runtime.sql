-- Run in the Supabase SQL Editor after applying schema.sql or a deployment patch.
-- This query is read-only. Every `ready` value should be true before deploying.
with required_functions(label, signature) as (
  values
    ('workspace version registration', 'public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text,text[])'),
    ('peer evaluation submission', 'public.submit_peer_evaluations(text,text,jsonb)'),
    ('project completion', 'public.complete_evaluation_project(text)'),
    ('my evaluation average', 'public.my_evaluation_average(text,text)'),
    ('visible evaluation members', 'public.visible_evaluation_members(text)'),
    ('vice leader assignment', 'public.set_vice_leader(uuid,boolean)'),
    ('project manager check', 'public.is_project_manager(text)'),
    ('operator check', 'public.is_operator()'),
    ('admin application submission', 'public.submit_admin_application(text,text,text,text,text,text,boolean)'),
    ('admin application review', 'public.review_admin_application(uuid,boolean,text)'),
    ('admin certificate cleanup', 'public.mark_admin_document_deleted(uuid)'),
    ('admin application list', 'public.list_admin_applications(text)'),
    ('admin roster', 'public.list_admins()'),
    ('admin revoke', 'public.revoke_admin(uuid)')
), checks as (
  select 'function'::text as kind, label as item, to_regprocedure(signature) is not null as ready
  from required_functions
  union all
  select 'storage bucket', bucket_id, exists(select 1 from storage.buckets where id = bucket_id)
  from (values ('avatars'), ('workspace-files'), ('admin-verification')) as required_buckets(bucket_id)
  union all
  select 'workspace storage policy', policy_name,
    exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = policy_name)
  from (values ('workspace_binary_insert'), ('workspace_binary_read'), ('workspace_binary_cleanup'), ('admin_verification_insert'), ('admin_verification_select')) as required_policies(policy_name)
)
select kind, item, ready, case when ready then 'ready' else 'apply schema or the matching migration' end as action
from checks
order by ready, kind, item;
