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
  -- Account-wide profile fields (photo, school, major, student id) — one
  -- value per person, shown the same way in every project they're in.
  -- `members` still carries its own copies of major/student/avatar for
  -- accounts-less/seeded teammates; for a real account, the mapping layer
  -- prefers these columns over the members-row ones whenever a profiles row
  -- exists (see mapMember). `school` has no members-table fallback — it's
  -- new, only used to look up majors.odcloud.kr, not displayed elsewhere.
  avatar_url text,
  school text,
  major text,
  student text,
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
  -- null for members without a real account (e.g. seeded demo teammates).
  -- Force-set to auth.uid() by the set_member_user_id trigger below on every
  -- insert, regardless of what the client sends — comparing a client-supplied
  -- user_id against auth.uid() in the members_insert RLS policy turned out to
  -- be unreliable specifically for INSERTs coming through PostgREST (verified:
  -- the same equality check passes when run directly in the SQL editor, but
  -- fails for the identical value submitted via the app's REST call), so the
  -- trigger sidesteps that comparison entirely instead of depending on it.
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null,
  major text not null,
  student text not null,
  avatar text not null,
  -- null unless the member has uploaded a real profile photo; falls back to
  -- the `avatar` initial everywhere it's rendered (see src/components/Avatar.tsx).
  avatar_url text,
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

-- 일정 이벤트. scope에 따라 personal/team으로 나뉘며,
-- personal일 때만 owner_member_id와 visibility가 의미를 가진다. tasks보다
-- 먼저 선언 — tasks가 이 테이블을 FK로 참조한다.
create table if not exists schedule_events (
  id bigint generated always as identity primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  date date not null,
  type text not null check (type in ('deadline', 'meeting', 'presentation', 'other')),
  scope text not null check (scope in ('personal', 'team')),
  -- scope='team'이면 항상 null. scope='personal'이면 이 일정의 주인.
  owner_member_id uuid references members(id) on delete cascade,
  -- scope='personal'일 때만 사용. 'private'=나만 보기, 'shared'=팀에 공유.
  visibility text check (visibility in ('private', 'shared')),
  -- scope='personal' and visibility='shared'일 때만 의미 있음.
  -- true면 팀원에게는 제목 대신 "바쁨"으로 표시 (일정별로 등록 시 선택).
  hide_title boolean not null default false,
  created_at timestamptz not null default now(),

  constraint personal_fields_consistent check (
    (scope = 'team' and owner_member_id is null and visibility is null)
    or
    (scope = 'personal' and owner_member_id is not null and visibility is not null)
  )
);

create index if not exists schedule_events_project_idx
  on schedule_events (project_id, date);

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
  color text not null,
  -- nullable: a task isn't necessarily on either calendar. Set/cleared
  -- together with the schedule_events row via toggleTaskTeamSchedule /
  -- toggleTaskPersonalSchedule in ProjectContext.tsx.
  team_schedule_event_id bigint references schedule_events(id) on delete set null,
  personal_schedule_event_id bigint references schedule_events(id) on delete set null
);

-- Multiple assignees per task. References members(id) rather than storing
-- names (like the rest of this schema denormalizes actor name/avatar)
-- because assignment needs to survive a member's display name changing, and
-- "is this member assigned" is checked constantly for the RLS policies below.
create table if not exists task_assignees (
  task_id bigint not null references tasks(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (task_id, member_id)
);

create table if not exists task_checklist_items (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  text text not null,
  done boolean not null default false
);

create table if not exists task_comments (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  author text not null,
  avatar text not null,
  date date not null default current_date,
  text text not null
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

create or replace function public.is_task_assignee(p_task_id bigint)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = p_task_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_task_project_member(p_task_id bigint)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from tasks t
    join members m on m.project_id = t.project_id
    where t.id = p_task_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_task_project_leader(p_task_id bigint)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from tasks t
    join members m on m.project_id = t.project_id
    where t.id = p_task_id and m.user_id = auth.uid() and m.is_leader
  );
$$;

-- Profiles are account-wide, not project-scoped, so "can see this profile"
-- can't reuse is_project_member directly — it's "shares at least one
-- project with the viewer" instead. Needed so a teammate's name/photo/major
-- (now sourced from profiles, not the per-project members row) is visible
-- to the rest of their project(s), not just to themselves.
create or replace function public.shares_project_with(target_user_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from members m1
    join members m2 on m1.project_id = m2.project_id
    where m1.user_id = auth.uid() and m2.user_id = target_user_id
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
alter table task_assignees enable row level security;
alter table task_checklist_items enable row level security;
alter table task_comments enable row level security;
alter table schedule_events enable row level security;

drop policy if exists profiles_select_own on profiles;
drop policy if exists profiles_insert_own on profiles;
drop policy if exists profiles_update_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id or shares_project_with(id));
create policy profiles_insert_own on profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on profiles for update using (auth.uid() = id);

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

-- members: select/update/delete require existing membership. Insert just
-- requires being signed in (covers both "become the first/leader member when
-- creating a project" and "join an existing project") — the set_member_user_id
-- trigger below is what actually guarantees a member row can only ever be
-- attributed to the signed-in user, not this policy (see the long comment on
-- the members.user_id column for why the check moved out of RLS).
drop policy if exists members_select on members;
drop policy if exists members_insert on members;
drop policy if exists members_update on members;
drop policy if exists members_delete on members;
create policy members_select on members for select using (is_project_member(project_id));
create policy members_insert on members for insert
  with check (auth.role() = 'authenticated');
create policy members_update on members for update using (is_project_member(project_id));
create policy members_delete on members for delete using (is_project_member(project_id));

create or replace function public.set_member_user_id()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_member_user_id_trigger on members;
create trigger set_member_user_id_trigger
  before insert on members
  for each row execute function public.set_member_user_id();

drop policy if exists folders_all on folders;
drop policy if exists files_all on files;
create policy folders_all on folders for all using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy files_all on files for all using (is_project_member(project_id)) with check (is_project_member(project_id));

-- tasks: any member can see the board, but only the leader creates/edits
-- task metadata or deletes a task — matches ProjectContext.tsx's addTask/
-- updateTaskDetails/moveTaskStatus/deleteTask, all of which check isLeader.
-- UPDATE also allows the assignee themselves through, since
-- toggleTaskPersonalSchedule (assignee-only) writes personal_schedule_event_id
-- on this same row; RLS can't restrict that to just the one column, so an
-- assignee technically could update other fields via a raw API call too —
-- accepted trade-off rather than building column-level checks for this.
drop policy if exists tasks_all on tasks;
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tasks_delete on tasks;
create policy tasks_select on tasks for select using (is_project_member(project_id));
create policy tasks_insert on tasks for insert with check (is_project_leader(project_id));
create policy tasks_update on tasks for update using (is_project_leader(project_id) or is_task_assignee(id));
create policy tasks_delete on tasks for delete using (is_project_leader(project_id));

-- task_assignees: leader manages who's assigned (part of updateTaskDetails).
drop policy if exists task_assignees_select on task_assignees;
drop policy if exists task_assignees_write on task_assignees;
create policy task_assignees_select on task_assignees for select using (is_task_project_member(task_id));
create policy task_assignees_write on task_assignees for all
  using (is_task_project_leader(task_id)) with check (is_task_project_leader(task_id));

-- task_checklist_items: only the task's assignee(s) manage their own
-- checklist — matches toggleTaskChecklistItem/addTaskChecklistItem.
drop policy if exists task_checklist_items_select on task_checklist_items;
drop policy if exists task_checklist_items_write on task_checklist_items;
create policy task_checklist_items_select on task_checklist_items for select using (is_task_project_member(task_id));
create policy task_checklist_items_write on task_checklist_items for all
  using (is_task_assignee(task_id)) with check (is_task_assignee(task_id));

-- task_comments: open to any project member, like chat — matches
-- addTaskComment, which only requires being a signed-in team member.
drop policy if exists task_comments_select on task_comments;
drop policy if exists task_comments_insert on task_comments;
create policy task_comments_select on task_comments for select using (is_task_project_member(task_id));
create policy task_comments_insert on task_comments for insert with check (is_task_project_member(task_id));

-- schedule_events: team-scope events are leader-managed; personal-scope
-- events are owned by the one member they belong to. Select additionally
-- lets a shared personal event be seen by the whole team.
drop policy if exists schedule_events_select on schedule_events;
drop policy if exists schedule_events_insert on schedule_events;
drop policy if exists schedule_events_update on schedule_events;
drop policy if exists schedule_events_delete on schedule_events;
create policy schedule_events_select on schedule_events for select using (
  is_project_member(project_id)
  and (
    scope = 'team'
    or visibility = 'shared'
    or exists (select 1 from members m where m.id = owner_member_id and m.user_id = auth.uid())
  )
);
create policy schedule_events_insert on schedule_events for insert with check (
  is_project_member(project_id)
  and (
    (scope = 'team' and is_project_leader(project_id))
    or
    (scope = 'personal' and exists (
      select 1 from members m
      where m.id = owner_member_id and m.project_id = project_id and m.user_id = auth.uid()
    ))
  )
);
create policy schedule_events_update on schedule_events for update using (
  (scope = 'team' and is_project_leader(project_id))
  or
  (scope = 'personal' and exists (
    select 1 from members m
    where m.id = owner_member_id and m.project_id = project_id and m.user_id = auth.uid()
  ))
);
create policy schedule_events_delete on schedule_events for delete using (
  (scope = 'team' and is_project_leader(project_id))
  or
  (scope = 'personal' and exists (
    select 1 from members m
    where m.id = owner_member_id and m.project_id = project_id and m.user_id = auth.uid()
  ))
);

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

-- Profile photo storage. Public bucket (avatars aren't sensitive and need to
-- be viewable by teammates without a signed-URL round trip) — writes are
-- still locked down below to "your own folder only".
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
drop policy if exists avatars_own_write on storage.objects;
drop policy if exists avatars_own_update on storage.objects;
drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_own_write on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_own_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_own_delete on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
