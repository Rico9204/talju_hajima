-- Emoji input and reactions for task-board comments.
-- Run this after the task comment migrations. Safe to run repeatedly.

create table if not exists task_comment_reactions (
  comment_id bigint not null references task_comments(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id, emoji)
);
create index if not exists task_comment_reactions_comment_idx on task_comment_reactions (comment_id);

create or replace function public.can_access_task_comment(p_comment_id bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.task_comments c
    join public.tasks t on t.id = c.task_id
    join public.members mine on mine.project_id = t.project_id
    where c.id = p_comment_id and mine.user_id = (select auth.uid())
  );
$$;
revoke all on function public.can_access_task_comment(bigint) from public;
grant execute on function public.can_access_task_comment(bigint) to authenticated;

-- Any project member can react to a comment, including someone else's
-- comment; p_member_id must still be the authenticated user's own row.
create or replace function public.can_react_to_task_comment(p_comment_id bigint, p_member_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.task_comments c
    join public.tasks t on t.id = c.task_id
    join public.members reactor on reactor.id = p_member_id and reactor.project_id = t.project_id
    where c.id = p_comment_id and reactor.user_id = (select auth.uid())
  );
$$;
revoke all on function public.can_react_to_task_comment(bigint, uuid) from public;
grant execute on function public.can_react_to_task_comment(bigint, uuid) to authenticated;

alter table task_comment_reactions enable row level security;
drop policy if exists task_comment_reactions_select on task_comment_reactions;
drop policy if exists task_comment_reactions_insert on task_comment_reactions;
drop policy if exists task_comment_reactions_delete on task_comment_reactions;
create policy task_comment_reactions_select on task_comment_reactions for select to authenticated
  using (public.can_access_task_comment(comment_id));
create policy task_comment_reactions_insert on task_comment_reactions for insert to authenticated
  with check (
    public.can_react_to_task_comment(comment_id, member_id)
  );
create policy task_comment_reactions_delete on task_comment_reactions for delete to authenticated
  using (
    public.can_react_to_task_comment(comment_id, member_id)
  );

-- Allow the new private Realtime topic. Postgres Changes still enforces the
-- source table's RLS policy for every event delivered to a client.
create or replace function public.can_access_project_realtime_topic(p_topic text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.members m
    where p_topic ~ '^(presence|chat_messages|message_reads|task_comment_reactions):[^:]+$'
      and m.project_id = split_part(p_topic, ':', 2)
      and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;
revoke all on table task_comment_reactions from anon, authenticated;
grant select, insert, delete on table task_comment_reactions to authenticated;
