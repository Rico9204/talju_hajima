-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- to create the tables the app expects. Safe to re-run (uses IF NOT EXISTS).

create extension if not exists pgcrypto;

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
  is_leader boolean not null default false
);

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

-- Row Level Security is required by Supabase for anon-key access. The app has
-- no login yet, so these policies are intentionally wide open (any anon
-- request can read/write everything). TODO: once auth is added, replace these
-- with policies scoped to auth.uid() / team membership.
alter table projects enable row level security;
alter table teams enable row level security;
alter table members enable row level security;
alter table folders enable row level security;
alter table files enable row level security;
alter table file_versions enable row level security;
alter table file_comments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'projects' and policyname = 'anon_all') then
    create policy anon_all on projects for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'teams' and policyname = 'anon_all') then
    create policy anon_all on teams for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'members' and policyname = 'anon_all') then
    create policy anon_all on members for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'folders' and policyname = 'anon_all') then
    create policy anon_all on folders for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'files' and policyname = 'anon_all') then
    create policy anon_all on files for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'file_versions' and policyname = 'anon_all') then
    create policy anon_all on file_versions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'file_comments' and policyname = 'anon_all') then
    create policy anon_all on file_comments for all using (true) with check (true);
  end if;
end $$;
