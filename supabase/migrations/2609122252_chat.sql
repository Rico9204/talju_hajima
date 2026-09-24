-- One-time migration to add chat to an already-deployed database (run after
-- migration_auth.sql, which creates is_project_member() that this reuses).
-- A fresh database should just use schema.sql instead, which already
-- includes all of this.
--
-- Paste this whole file into a new Supabase SQL editor query and run it once.

-- channel_id is 'all' for the whole-team channel, or 'dm:<lesser member
-- id>:<greater member id>' for a 1:1 — the two member ids sorted as text so
-- both sides land on the same channel id regardless of who's viewing.
create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  project_id text not null references projects(id) on delete cascade,
  channel_id text not null,
  sender_id uuid not null references members(id) on delete cascade,
  text text not null default '',
  file_id bigint references files(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_channel_idx on chat_messages (project_id, channel_id, created_at);

create table if not exists message_reads (
  message_id bigint not null references chat_messages(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, member_id)
);

alter table chat_messages enable row level security;
alter table message_reads enable row level security;

create policy chat_messages_select on chat_messages for select using (is_project_member(project_id));
create policy chat_messages_insert on chat_messages for insert
  with check (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = sender_id and m.user_id = auth.uid())
  );

create policy message_reads_select on message_reads for select using (is_project_member(project_id));
create policy message_reads_insert on message_reads for insert
  with check (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );

-- Without this, INSERTs into these tables never fire postgres_changes
-- events on the client (realtime subscriptions silently do nothing).
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table message_reads;
