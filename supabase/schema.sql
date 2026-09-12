-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- to create the tables the app expects. Safe to re-run (uses IF NOT EXISTS).

create extension if not exists pgcrypto;

-- One row per signed-up account, populated automatically by the trigger
-- below. auth.users itself isn't queryable via the client libraries, so
-- every other table that needs a display name/avatar reads it from here
-- (matching how this schema already denormalizes name/avatar everywhere
-- else instead of joining to a users table).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_initial text not null,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  name text not null,
  org text not null,
  period text not null,
  status text not null check (status in ('active', 'done')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  project_id text primary key references projects(id) on delete cascade,
  team_label text not null,
  team_sub text not null
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  -- null for members without a real account (e.g. seeded demo teammates) —
  -- set to auth.uid() when a real person creates or joins the project.
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null,
  major text not null,
  student text not null,
  avatar text not null,
  tasks_done int not null default 0,
  tasks_total int not null default 0,
  activities int not null default 0,
  score numeric not null default 0,
  eval_count int not null default 0,
  online boolean not null default false,
  responsibilities text[] not null default '{}',
  color text not null,
  criteria_role numeric not null default 0,
  criteria_deadline numeric not null default 0,
  criteria_communication numeric not null default 0,
  criteria_collaboration numeric not null default 0,
  criteria_quality numeric not null default 0,
  is_leader boolean not null default false
);

-- Stops one account from joining (having a linked member row in) the same
-- project twice. Rows with no linked account (user_id is null) are unlimited.
create unique index if not exists members_project_user_unique
  on members (project_id, user_id) where user_id is not null;

create table if not exists folders (
  id bigint generated always as identity primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  color text not null,
  created_by text not null,
  date date not null default current_date
);

create table if not exists files (
  id bigint generated always as identity primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  type text not null check (type in ('pdf', 'doc', 'img', 'ppt', 'xls', 'zip')),
  uploader text not null,
  avatar text not null,
  date date not null default current_date,
  size text not null,
  tag text not null default '기타',
  folder_id bigint references folders(id) on delete set null
);

create table if not exists file_versions (
  id bigint generated always as identity primary key,
  file_id bigint not null references files(id) on delete cascade,
  version text not null,
  uploaded_by text not null,
  date date not null default current_date,
  size text not null,
  note text not null default '',
  current boolean not null default true
);

create table if not exists file_comments (
  id bigint generated always as identity primary key,
  file_id bigint not null references files(id) on delete cascade,
  author text not null,
  avatar text not null,
  date date not null default current_date,
  text text not null
);

create table if not exists tasks (
  id bigint generated always as identity primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  assignee text not null,
  avatar text not null,
  priority text not null check (priority in ('high', 'mid', 'low')),
  due text not null,
  tags text[] not null default '{}',
  status text not null check (status in ('todo', 'inprogress', 'review', 'done')),
  color text not null
);

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

-- Auth is now wired up. Every table below is scoped to "signed-in users who
-- are a member of the project the row belongs to" via the helper functions
-- below, with two deliberate exceptions: (1) `projects` stays readable by
-- any signed-in user so the join screen can preview a project before the
-- viewer is a member of it, and (2) inserts into `projects`/`teams`/`members`
-- happen at a moment when the actor isn't a member yet (creating a project,
-- or joining one), so those specific insert checks are "signed in" rather
-- than "already a member".

create or replace function public.is_project_member(p_project_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from members m where m.project_id = p_project_id and m.user_id = auth.uid()
  );
$$;

-- Deleting a whole project is destructive/irreversible, so it's restricted
-- to the project's leader rather than any member.
create or replace function public.is_project_leader(p_project_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from members m where m.project_id = p_project_id and m.user_id = auth.uid() and m.is_leader
  );
$$;

create or replace function public.is_file_project_member(p_file_id bigint)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from files f
    join members m on m.project_id = f.project_id
    where f.id = p_file_id and m.user_id = auth.uid()
  );
$$;

alter table profiles enable row level security;
alter table projects enable row level security;
alter table teams enable row level security;
alter table members enable row level security;
alter table folders enable row level security;
alter table files enable row level security;
alter table file_versions enable row level security;
alter table file_comments enable row level security;
alter table tasks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_select_own') then
    create policy profiles_select_own on profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_insert_own') then
    create policy profiles_insert_own on profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_update_own') then
    create policy profiles_update_own on profiles for update using (auth.uid() = id);
  end if;
end $$;

drop policy if exists anon_all on projects;
drop policy if exists anon_all on teams;
drop policy if exists anon_all on members;
drop policy if exists anon_all on folders;
drop policy if exists anon_all on files;
drop policy if exists anon_all on file_versions;
drop policy if exists anon_all on file_comments;
drop policy if exists anon_all on tasks;

drop policy if exists projects_select on projects;
drop policy if exists projects_insert on projects;
drop policy if exists projects_update on projects;
drop policy if exists projects_delete on projects;
create policy projects_select on projects for select using (auth.role() = 'authenticated');
create policy projects_insert on projects for insert with check (auth.role() = 'authenticated');
create policy projects_update on projects for update using (is_project_member(id));
create policy projects_delete on projects for delete using (is_project_leader(id));

drop policy if exists teams_select on teams;
drop policy if exists teams_insert on teams;
drop policy if exists teams_update on teams;
drop policy if exists teams_delete on teams;
create policy teams_select on teams for select using (is_project_member(project_id));
create policy teams_insert on teams for insert with check (auth.role() = 'authenticated');
create policy teams_update on teams for update using (is_project_member(project_id));
create policy teams_delete on teams for delete using (is_project_member(project_id));

-- members: select/update/delete require existing membership; insert only
-- allows writing a row for yourself (covers both "become the first/leader
-- member when creating a project" and "join an existing project").
drop policy if exists members_select on members;
drop policy if exists members_insert on members;
drop policy if exists members_update on members;
drop policy if exists members_delete on members;
create policy members_select on members for select using (is_project_member(project_id));
create policy members_insert on members for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy members_update on members for update using (is_project_member(project_id));
create policy members_delete on members for delete using (is_project_member(project_id));

drop policy if exists folders_all on folders;
drop policy if exists files_all on files;
drop policy if exists tasks_all on tasks;
create policy folders_all on folders for all using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy files_all on files for all using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy tasks_all on tasks for all using (is_project_member(project_id)) with check (is_project_member(project_id));

drop policy if exists file_versions_all on file_versions;
drop policy if exists file_comments_all on file_comments;
create policy file_versions_all on file_versions for all
  using (is_file_project_member(file_id)) with check (is_file_project_member(file_id));
create policy file_comments_all on file_comments for all
  using (is_file_project_member(file_id)) with check (is_file_project_member(file_id));

-- Auto-create a profile row (display name + avatar initial) whenever someone
-- signs up. Runs as a trigger (not a client-side insert right after signUp())
-- because if email confirmation is on, there's no session yet at that exact
-- moment for an RLS-checked client insert to succeed.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_initial)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', '사용자'),
    left(coalesce(new.raw_user_meta_data->>'display_name', '사용자'), 1)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chat: readable by any project member; inserting requires the sender/reader
-- to actually be the authenticated user's own member row (so you can't post
-- or mark things read as someone else).
alter table chat_messages enable row level security;
alter table message_reads enable row level security;

drop policy if exists chat_messages_select on chat_messages;
drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_select on chat_messages for select using (is_project_member(project_id));
create policy chat_messages_insert on chat_messages for insert
  with check (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = sender_id and m.user_id = auth.uid())
  );

drop policy if exists message_reads_select on message_reads;
drop policy if exists message_reads_insert on message_reads;
create policy message_reads_select on message_reads for select using (is_project_member(project_id));
create policy message_reads_insert on message_reads for insert
  with check (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );

-- Realtime: without this, INSERTs into these tables never fire
-- postgres_changes events on the client.
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table message_reads;
