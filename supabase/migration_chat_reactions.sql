-- Chat emoji reactions. A member can use each supported emoji once per message.
create table if not exists message_reactions (
  message_id bigint not null references chat_messages(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);
create index if not exists message_reactions_project_idx on message_reactions (project_id, message_id);

alter table message_reactions enable row level security;

drop policy if exists message_reactions_select on message_reactions;
drop policy if exists message_reactions_insert on message_reactions;
drop policy if exists message_reactions_delete on message_reactions;
create policy message_reactions_select on message_reactions for select using (is_project_member(project_id));
create policy message_reactions_insert on message_reactions for insert
  with check (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
    and exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reactions.project_id)
  );
create policy message_reactions_delete on message_reactions for delete
  using (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );

do $$ begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table message_reactions;
  end if;
end $$;
alter table message_reactions replica identity full;
