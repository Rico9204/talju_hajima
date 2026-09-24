begin;
alter table public.file_comments add column if not exists member_id uuid references public.members(id) on delete set null;
-- Names cannot safely identify legacy authors. Preserve their original initials.
create or replace function public.stamp_file_comment_author()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor public.members%rowtype; pid text;
begin
  select project_id into pid from public.files where id=new.file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found then raise exception '진행 중인 프로젝트에만 댓글을 작성할 수 있습니다.'; end if;
  select * into actor from public.members where project_id=pid and user_id=auth.uid();
  if not found then raise exception '프로젝트 참여자만 댓글을 작성할 수 있습니다.'; end if;
  new.member_id:=actor.id; new.author:=actor.name; new.avatar:=actor.avatar;
  return new;
end $$;
drop trigger if exists file_comment_author on public.file_comments;
create trigger file_comment_author before insert on public.file_comments for each row execute function public.stamp_file_comment_author();
-- Comments have no direct edit/delete UI; prohibit identity spoofing after insert.
revoke update,delete on public.file_comments from anon,authenticated;
-- Emoji input and reactions for task-board comments.
-- Run this after the task comment migrations. Safe to run repeatedly.

create table if not exists file_comment_reactions (
  comment_id bigint not null references file_comments(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id, emoji)
);
create index if not exists file_comment_reactions_comment_idx on file_comment_reactions (comment_id);

create or replace function public.can_access_file_comment(p_comment_id bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.file_comments c
    join public.files t on t.id = c.file_id
    join public.members mine on mine.project_id = t.project_id
    where c.id = p_comment_id and mine.user_id = (select auth.uid())
  );
$$;
revoke all on function public.can_access_file_comment(bigint) from public;
grant execute on function public.can_access_file_comment(bigint) to authenticated;

-- Any project member can react to a comment, including someone else's
-- comment; p_member_id must still be the authenticated user's own row.
create or replace function public.can_react_to_file_comment(p_comment_id bigint, p_member_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.file_comments c
    join public.files t on t.id = c.file_id
    join public.members reactor on reactor.id = p_member_id and reactor.project_id = t.project_id
    where c.id = p_comment_id and reactor.user_id = (select auth.uid())
      and exists(select 1 from public.projects p where p.id=t.project_id and p.status='active')
  );
$$;
revoke all on function public.can_react_to_file_comment(bigint, uuid) from public;
grant execute on function public.can_react_to_file_comment(bigint, uuid) to authenticated;

alter table file_comment_reactions enable row level security;
drop policy if exists file_comment_reactions_select on file_comment_reactions;
drop policy if exists file_comment_reactions_insert on file_comment_reactions;
drop policy if exists file_comment_reactions_delete on file_comment_reactions;
create policy file_comment_reactions_select on file_comment_reactions for select to authenticated
  using (public.can_access_file_comment(comment_id));
create policy file_comment_reactions_insert on file_comment_reactions for insert to authenticated
  with check (
    public.can_react_to_file_comment(comment_id, member_id)
  );
create policy file_comment_reactions_delete on file_comment_reactions for delete to authenticated
  using (
    public.can_react_to_file_comment(comment_id, member_id)
  );


revoke all on table public.file_comment_reactions from anon,authenticated;
grant select,insert,delete on table public.file_comment_reactions to authenticated;
commit;
