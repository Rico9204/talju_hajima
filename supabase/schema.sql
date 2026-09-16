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
  -- Optional reference info (KakaoTalk ID, phone number, etc.) shown to
  -- teammates so they have a way to reach this person outside the app.
  contact text,
  -- Hex color for the profile card banner background. Independent from the
  -- per-project members.color accent (that one is assigned automatically
  -- from a palette and drives other UI); this is a user choice.
  banner_color text,
  -- Custom banner image (stored in the "avatars" bucket, see storage
  -- policies below); takes priority over banner_color when set.
  banner_image_url text,
  -- Profile link chips (GitHub, Instagram, portfolio, ...) as a JSON array
  -- of { id, type, url, label } — see src/lib/links.ts for the shape and
  -- the auto-detect-from-URL logic. jsonb so new platform types never need
  -- a schema change.
  links jsonb not null default '[]'::jsonb,
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
  -- author/avatar stay as a frozen snapshot for rows with no member_id
  -- (legacy rows, or the author has since left the project); when member_id
  -- is set, the UI resolves the *current* name/avatar/avatarUrl from
  -- members/profiles instead of trusting these columns (see TaskDetailPanel).
  member_id uuid references members(id) on delete set null,
  author text not null,
  avatar text not null,
  date date not null default current_date,
  text text not null
);

-- One member may add each supported emoji once to a task comment.
create table if not exists task_comment_reactions (
  comment_id bigint not null references task_comments(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id, emoji)
);
create index if not exists task_comment_reactions_comment_idx on task_comment_reactions (comment_id);

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
do $$ begin
  alter table chat_messages add constraint chat_messages_id_project_unique unique (id, project_id);
exception when duplicate_object then null;
end $$;
create index if not exists chat_messages_channel_idx on chat_messages (project_id, channel_id, created_at);

create table if not exists message_reads (
  message_id bigint not null references chat_messages(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, member_id)
);
do $$ begin
  alter table message_reads add constraint message_reads_message_project_fk
    foreign key (message_id, project_id) references chat_messages(id, project_id) on delete cascade;
exception when duplicate_object then null;
end $$;

create table if not exists message_reactions (
  message_id bigint not null references chat_messages(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);
create index if not exists message_reactions_project_idx on message_reactions (project_id, message_id);
do $$ begin
  alter table message_reactions add constraint message_reactions_message_project_fk
    foreign key (message_id, project_id) references chat_messages(id, project_id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- Private, trigger-managed counters. Clients have no grants on this table;
-- it prevents a member from flooding chat or repeatedly toggling reactions.
create table if not exists chat_write_rate_limits (
  member_id uuid not null references members(id) on delete cascade,
  kind text not null check (kind in ('message', 'reaction')),
  window_started timestamptz not null default now(),
  event_count integer not null default 0 check (event_count >= 0),
  primary key (member_id, kind)
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

-- `all` is team-wide. A DM is readable/writable only when the caller's
-- member id is one of its two UUID segments and both members are in project.
create or replace function public.can_access_chat_channel(p_project_id text, p_channel_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_channel_id = 'all' then exists (
      select 1 from public.members mine
      where mine.project_id = p_project_id and mine.user_id = (select auth.uid())
    )
    when p_channel_id ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'
      and split_part(p_channel_id, ':', 2) <> split_part(p_channel_id, ':', 3)
    then exists (
      select 1
      from public.members mine
      where mine.project_id = p_project_id
        and mine.user_id = (select auth.uid())
        and mine.id::text in (split_part(p_channel_id, ':', 2), split_part(p_channel_id, ':', 3))
        and exists (
          select 1 from public.members first_member
          where first_member.project_id = p_project_id and first_member.id::text = split_part(p_channel_id, ':', 2)
        )
        and exists (
          select 1 from public.members second_member
          where second_member.project_id = p_project_id and second_member.id::text = split_part(p_channel_id, ':', 3)
        )
    )
    else false
  end;
$$;

revoke all on function public.can_access_chat_channel(text, text) from public;
grant execute on function public.can_access_chat_channel(text, text) to authenticated;

create or replace function public.consume_chat_rate_limit(p_member_id uuid, p_kind text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_limit public.chat_write_rate_limits%rowtype;
begin
  insert into public.chat_write_rate_limits (member_id, kind, window_started, event_count)
  values (p_member_id, p_kind, now(), 0)
  on conflict (member_id, kind) do nothing;

  select * into current_limit
  from public.chat_write_rate_limits
  where member_id = p_member_id and kind = p_kind
  for update;

  if current_limit.window_started <= now() - p_window then
    update public.chat_write_rate_limits
    set window_started = now(), event_count = 1
    where member_id = p_member_id and kind = p_kind;
  elsif current_limit.event_count >= p_max then
    raise exception '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' using errcode = 'P0001';
  else
    update public.chat_write_rate_limits
    set event_count = event_count + 1
    where member_id = p_member_id and kind = p_kind;
  end if;
end;
$$;

create or replace function public.enforce_chat_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$ begin
  if not exists (select 1 from public.members m where m.id = new.sender_id and m.user_id = (select auth.uid())) then
    raise exception 'Invalid chat sender.' using errcode = '42501';
  end if;
  perform public.consume_chat_rate_limit(new.sender_id, 'message', 12, interval '30 seconds');
  return new;
end; $$;

create or replace function public.enforce_chat_reaction_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$ begin
  if not exists (select 1 from public.members m where m.id = new.member_id and m.user_id = (select auth.uid())) then
    raise exception 'Invalid reaction member.' using errcode = '42501';
  end if;
  perform public.consume_chat_rate_limit(new.member_id, 'reaction', 30, interval '30 seconds');
  return new;
end; $$;

drop trigger if exists chat_messages_rate_limit on chat_messages;
create trigger chat_messages_rate_limit before insert on chat_messages
for each row execute function public.enforce_chat_message_rate_limit();
drop trigger if exists message_reactions_rate_limit on message_reactions;
create trigger message_reactions_rate_limit before insert on message_reactions
for each row execute function public.enforce_chat_reaction_rate_limit();

alter table chat_write_rate_limits enable row level security;
revoke all on table chat_write_rate_limits from anon, authenticated;
revoke all on function public.consume_chat_rate_limit(uuid, text, integer, interval) from public;
revoke all on function public.enforce_chat_message_rate_limit() from public;
revoke all on function public.enforce_chat_reaction_rate_limit() from public;

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
create policy projects_update on projects for update
  using (is_project_leader(id)) with check (is_project_leader(id));
create policy projects_delete on projects for delete using (is_project_leader(id));

drop policy if exists teams_select on teams;
drop policy if exists teams_insert on teams;
drop policy if exists teams_update on teams;
drop policy if exists teams_delete on teams;
create policy teams_select on teams for select using (is_project_member(project_id));
create policy teams_insert on teams for insert with check (auth.role() = 'authenticated');
create policy teams_update on teams for update
  using (is_project_leader(project_id)) with check (is_project_leader(project_id));
create policy teams_delete on teams for delete using (is_project_leader(project_id));

-- members: select/delete require existing membership. Direct UPDATE is not
-- exposed to clients: account-profile changes use `profiles`, and leadership
-- changes use the narrowly checked transfer_leadership() RPC below. Leaving
-- no UPDATE policy prevents a member from changing another member's role,
-- account link, or project id through a raw client request.
-- Insert just
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
create policy members_delete on members for delete using (is_project_leader(project_id));

create or replace function public.set_member_user_id()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  -- 프로젝트에 이미 리더가 있으면 is_leader를 false로 강제
  -- (createProject는 첫 번째 멤버라 리더 없음 → true 통과,
  --  joinProject는 리더 이미 있음 → 클라이언트가 true 보내도 false로 교정)
  if new.is_leader and exists (
    select 1 from members where project_id = new.project_id and is_leader
  ) then
    new.is_leader := false;
  end if;
  return new;
end;
$$;

drop trigger if exists set_member_user_id_trigger on members;
create trigger set_member_user_id_trigger
  before insert on members
  for each row execute function public.set_member_user_id();

-- is_leader 직접 UPDATE 차단: transfer_leadership RPC만 허용
-- (RPC 내부에서 set_config('app.allow_leader_change','true',true)로 트랜잭션 범위 해제)
create or replace function public.prevent_is_leader_direct_update()
returns trigger language plpgsql as $$
begin
  if new.is_leader <> old.is_leader
     and current_setting('app.allow_leader_change', true) is distinct from 'true'
  then
    raise exception 'is_leader 변경은 transfer_leadership() 함수를 통해서만 가능합니다';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_is_leader_direct_update on members;
create trigger prevent_is_leader_direct_update
  before update on members
  for each row execute function public.prevent_is_leader_direct_update();

-- transfer_leadership: 팀장 검증 + 원자적 교체
-- SECURITY DEFINER로 실행되며 set_config 플래그로 위 트리거를 트랜잭션 내에서만 우회
create or replace function public.transfer_leadership(p_project_id text, p_target_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_id uuid;
  v_target_role text;
begin
  select id, role into v_caller_id, v_caller_role
    from members
    where project_id = p_project_id and user_id = auth.uid() and is_leader;
  if v_caller_id is null then
    raise exception '팀장만 권한을 이전할 수 있습니다';
  end if;

  select id, role into v_target_id, v_target_role
    from members
    where project_id = p_project_id and name = p_target_name and not is_leader;
  if v_target_id is null then
    raise exception '대상 멤버를 찾을 수 없거나 이미 팀장입니다';
  end if;

  perform set_config('app.allow_leader_change', 'true', true);

  -- is_leader와 함께 role 표시 문구도 동기화 (커스텀 역할 문구는 그대로 둠)
  update members set is_leader = false,
    role = case when v_caller_role = '팀장' then '팀원' else v_caller_role end
    where id = v_caller_id;
  update members set is_leader = true,
    role = case when v_target_role in ('참여자', '팀원') then '팀장' else v_target_role end
    where id = v_target_id;
end;
$$;

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
-- Insert additionally requires member_id to be the caller's own member row
-- (same shape as chat_messages_insert) so comments can't be posted as
-- someone else.
drop policy if exists task_comments_select on task_comments;
drop policy if exists task_comments_insert on task_comments;
create policy task_comments_select on task_comments for select using (is_task_project_member(task_id));
create policy task_comments_insert on task_comments for insert
  with check (
    is_task_project_member(task_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );

-- Comment reactions inherit the project membership of their parent task and
-- may only be added/removed by the authenticated member who owns the row.
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

-- This deliberately does not check c.member_id: anyone on the task's team
-- can react to anyone else's comment, but only with their own member id.
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
revoke all on table task_comment_reactions from anon, authenticated;
grant select, insert, delete on table task_comment_reactions to authenticated;

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

-- Chat access is channel-scoped: team members see `all`, while DMs are
-- restricted to the two member ids encoded in the channel id.
alter table chat_messages enable row level security;
alter table message_reads enable row level security;
alter table message_reactions enable row level security;

drop policy if exists chat_messages_select on chat_messages;
drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_select on chat_messages for select to authenticated using (can_access_chat_channel(project_id, channel_id));
create policy chat_messages_insert on chat_messages for insert to authenticated
  with check (
    can_access_chat_channel(project_id, channel_id)
    and exists (select 1 from members m where m.id = sender_id and m.user_id = auth.uid())
  );

drop policy if exists message_reads_select on message_reads;
drop policy if exists message_reads_insert on message_reads;
create policy message_reads_select on message_reads for select to authenticated using (
  exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reads.project_id and can_access_chat_channel(c.project_id, c.channel_id))
);
create policy message_reads_insert on message_reads for insert to authenticated
  with check (
    exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reads.project_id and can_access_chat_channel(c.project_id, c.channel_id))
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );

drop policy if exists message_reactions_select on message_reactions;
drop policy if exists message_reactions_insert on message_reactions;
drop policy if exists message_reactions_delete on message_reactions;
create policy message_reactions_select on message_reactions for select to authenticated using (
  exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reactions.project_id and can_access_chat_channel(c.project_id, c.channel_id))
);
create policy message_reactions_insert on message_reactions for insert to authenticated
  with check (
    exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reactions.project_id and can_access_chat_channel(c.project_id, c.channel_id))
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );
create policy message_reactions_delete on message_reactions for delete to authenticated
  using (
    exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reactions.project_id and can_access_chat_channel(c.project_id, c.channel_id))
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
  );

revoke all on table chat_messages, message_reads, message_reactions from anon, authenticated;
grant select, insert on table chat_messages to authenticated;
grant select, insert on table message_reads to authenticated;
grant select, insert, delete on table message_reactions to authenticated;

-- Realtime: without this, INSERTs into these tables never fire
-- postgres_changes events on the client.
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table message_reads;
alter publication supabase_realtime add table message_reactions;
alter table message_reactions replica identity full;

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

-- Peer evaluation tables, policies and RPCs.
-- Apply in the Supabase SQL editor before deploying the evaluation UI.
begin;
create table if not exists public.peer_evaluation_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  evaluator_id uuid not null references public.members(id),
  phase text not null check (phase in ('midterm', 'final')),
  created_at timestamptz not null default now(),
  unique(project_id, evaluator_id, phase)
);
create table if not exists public.peer_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.peer_evaluation_submissions(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  evaluator_id uuid not null references public.members(id),
  recipient_id uuid not null references public.members(id),
  phase text not null check (phase in ('midterm', 'final')),
  role integer not null check(role between 1 and 10),
  deadline integer not null check(deadline between 1 and 10),
  communication integer not null check(communication between 1 and 10),
  collaboration integer not null check(collaboration between 1 and 10),
  quality integer not null check(quality between 1 and 10),
  comment text not null default '' check(char_length(comment) <= 150),
  created_at timestamptz not null default now(),
  check(evaluator_id <> recipient_id),
  unique(submission_id, recipient_id)
);
alter table public.peer_evaluation_submissions enable row level security;
alter table public.peer_evaluations enable row level security;
revoke all on public.peer_evaluation_submissions, public.peer_evaluations from anon, authenticated;
grant select on public.peer_evaluation_submissions, public.peer_evaluations to authenticated;
drop policy if exists evaluation_submission_read on public.peer_evaluation_submissions;
create policy evaluation_submission_read on public.peer_evaluation_submissions for select to authenticated
using (exists(select 1 from public.members m where m.id = evaluator_id and m.user_id = auth.uid()));
drop policy if exists evaluation_read on public.peer_evaluations;
create policy evaluation_read on public.peer_evaluations for select to authenticated
using (public.is_project_member(project_id) and (
  exists(select 1 from public.members m where m.user_id = auth.uid() and m.id in (evaluator_id, recipient_id))
  or (phase = 'final' and exists(select 1 from public.projects p where p.id = project_id and p.status = 'done'))
));

create or replace function public.submit_peer_evaluations(p_project_id text, p_phase text, p_entries jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.projects%rowtype;
  actor uuid;
  submission uuid;
  expected integer;
  actual integer;
begin
  -- Serialize submission/closure and prevent a second concurrent submission.
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  select id into actor from public.members where project_id = p_project_id and user_id = auth.uid();
  if actor is null then raise exception '프로젝트 참여자만 평가할 수 있습니다.'; end if;
  if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형입니다.'; end if;
  if (p_phase = 'midterm' and p.status <> 'active') or (p_phase = 'final' and p.status <> 'done') then
    raise exception '프로젝트 상태가 변경되었습니다. 새로고침해 주세요.';
  end if;
  if p_phase = 'midterm' and p.end_date - p.start_date < 14 then
    raise exception '2주 미만 프로젝트는 중간 평가를 생략합니다.';
  end if;
  if exists(select 1 from public.peer_evaluation_submissions where project_id = p_project_id and evaluator_id = actor and phase = p_phase) then
    raise exception '이미 제출한 평가입니다.';
  end if;
  -- Lock the membership snapshot while validating all recipients.
  perform id from public.members where project_id = p_project_id for share;
  select count(*) into expected from public.members where project_id = p_project_id and id <> actor and user_id is not null;
  if expected = 0 then raise exception '평가할 동료가 없습니다.'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception '평가 목록이 필요합니다.'; end if;
  if jsonb_array_length(p_entries) <> expected then raise exception '팀원 목록이 변경되었습니다. 새로고침해 주세요.'; end if;
  select count(distinct e.recipient_id) into actual
  from jsonb_to_recordset(p_entries) as e(recipient_id uuid)
  join public.members m on m.id = e.recipient_id and m.project_id = p_project_id and m.id <> actor and m.user_id is not null;
  if actual <> expected then raise exception '평가 대상이 올바르지 않습니다.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) e
    cross join unnest(array['role','deadline','communication','collaboration','quality']) k
    where jsonb_typeof(e->k) is distinct from 'number'
       or (e->>k)::numeric <> trunc((e->>k)::numeric)
       or (e->>k)::numeric not between 1 and 10
  ) then raise exception '점수는 1~10 사이의 정수여야 합니다.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) e
    cross join unnest(array['role','deadline','communication','collaboration','quality']) k
    group by k having sum((e->>k)::integer) <> expected * 5
  ) then raise exception '각 항목의 총점은 동료 수 × 5점이어야 합니다.'; end if;
  insert into public.peer_evaluation_submissions(project_id,evaluator_id,phase)
    values(p_project_id,actor,p_phase) returning id into submission;
  insert into public.peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality,comment)
    select submission,p_project_id,actor,e.recipient_id,p_phase,e.role,e.deadline,e.communication,e.collaboration,e.quality,coalesce(e.comment,'')
    from jsonb_to_recordset(p_entries) as e(recipient_id uuid,role integer,deadline integer,communication integer,collaboration integer,quality integer,comment text);
  -- Only final evaluations contribute to the existing project reputation fields.
  if p_phase = 'final' then
    update public.members m set
      eval_count = a.n, score = a.score,
      criteria_role = a.role, criteria_deadline = a.deadline,
      criteria_communication = a.communication, criteria_collaboration = a.collaboration, criteria_quality = a.quality
    from (
      select recipient_id, count(*)::integer n,
        avg((role+deadline+communication+collaboration+quality)/5.0) score,
        avg(role) role, avg(deadline) deadline, avg(communication) communication,
        avg(collaboration) collaboration, avg(quality) quality
      from public.peer_evaluations where project_id = p_project_id and phase = 'final' group by recipient_id
    ) a where m.id = a.recipient_id;
  end if;
end;
$$;
revoke all on function public.submit_peer_evaluations(text,text,jsonb) from public, anon;
grant execute on function public.submit_peer_evaluations(text,text,jsonb) to authenticated;

create or replace function public.complete_evaluation_project(p_project_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform id from public.projects where id = p_project_id for update;
  if not public.is_project_leader(p_project_id) then raise exception '팀장만 프로젝트를 종료할 수 있습니다.'; end if;
  update public.projects set status = 'done' where id = p_project_id and status = 'active';
end;
$$;
revoke all on function public.complete_evaluation_project(text) from public, anon;
grant execute on function public.complete_evaluation_project(text) to authenticated;
commit;

-- Prototype validation only. Set the helper to SELECT false to restore normal gating.
begin;
create or replace function public.evaluation_prototype_enabled()
returns boolean language sql stable as $$ select true $$;
revoke all on function public.evaluation_prototype_enabled() from public, anon;
grant execute on function public.evaluation_prototype_enabled() to authenticated;

create or replace function public.submit_peer_evaluations(p_project_id text, p_phase text, p_entries jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.projects%rowtype;
  actor uuid;
  submission uuid;
  expected integer;
  actual integer;
begin
  -- Serialize submission/closure and prevent a second concurrent submission.
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  select id into actor from public.members where project_id = p_project_id and user_id = auth.uid();
  if actor is null then raise exception '프로젝트 참여자만 평가할 수 있습니다.'; end if;
  if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형입니다.'; end if;
  if not public.evaluation_prototype_enabled() then
    if (p_phase = 'midterm' and p.status <> 'active') or (p_phase = 'final' and p.status <> 'done') then
      raise exception '프로젝트 상태가 변경되었습니다. 새로고침해 주세요.';
    end if;
    if p_phase = 'midterm' and p.end_date - p.start_date < 14 then
      raise exception '2주 미만 프로젝트는 중간 평가를 생략합니다.';
    end if;
  end if;
  if exists(select 1 from public.peer_evaluation_submissions where project_id = p_project_id and evaluator_id = actor and phase = p_phase) then
    raise exception '이미 제출한 평가입니다.';
  end if;
  -- Lock the membership snapshot while validating all recipients.
  perform id from public.members where project_id = p_project_id for share;
  select count(*) into expected from public.members where project_id = p_project_id and id <> actor and user_id is not null;
  if expected = 0 then raise exception '평가할 동료가 없습니다.'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception '평가 목록이 필요합니다.'; end if;
  if jsonb_array_length(p_entries) <> expected then raise exception '팀원 목록이 변경되었습니다. 새로고침해 주세요.'; end if;
  select count(distinct e.recipient_id) into actual
  from jsonb_to_recordset(p_entries) as e(recipient_id uuid)
  join public.members m on m.id = e.recipient_id and m.project_id = p_project_id and m.id <> actor and m.user_id is not null;
  if actual <> expected then raise exception '평가 대상이 올바르지 않습니다.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) e
    cross join unnest(array['role','deadline','communication','collaboration','quality']) k
    where jsonb_typeof(e->k) is distinct from 'number'
       or (e->>k)::numeric <> trunc((e->>k)::numeric)
       or (e->>k)::numeric not between 1 and 10
  ) then raise exception '점수는 1~10 사이의 정수여야 합니다.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) e
    cross join unnest(array['role','deadline','communication','collaboration','quality']) k
    group by k having sum((e->>k)::integer) <> expected * 5
  ) then raise exception '각 항목의 총점은 동료 수 × 5점이어야 합니다.'; end if;
  insert into public.peer_evaluation_submissions(project_id,evaluator_id,phase)
    values(p_project_id,actor,p_phase) returning id into submission;
  insert into public.peer_evaluations(submission_id,project_id,evaluator_id,recipient_id,phase,role,deadline,communication,collaboration,quality,comment)
    select submission,p_project_id,actor,e.recipient_id,p_phase,e.role,e.deadline,e.communication,e.collaboration,e.quality,coalesce(e.comment,'')
    from jsonb_to_recordset(p_entries) as e(recipient_id uuid,role integer,deadline integer,communication integer,collaboration integer,quality integer,comment text);
  -- Only final evaluations contribute to the existing project reputation fields.
  if p_phase = 'final' then
    update public.members m set
      eval_count = a.n, score = a.score,
      criteria_role = a.role, criteria_deadline = a.deadline,
      criteria_communication = a.communication, criteria_collaboration = a.collaboration, criteria_quality = a.quality
    from (
      select recipient_id, count(*)::integer n,
        avg((role+deadline+communication+collaboration+quality)/5.0) score,
        avg(role) role, avg(deadline) deadline, avg(communication) communication,
        avg(collaboration) collaboration, avg(quality) quality
      from public.peer_evaluations where project_id = p_project_id and phase = 'final' group by recipient_id
    ) a where m.id = a.recipient_id;
  end if;
end;
$$;
revoke all on function public.submit_peer_evaluations(text,text,jsonb) from public, anon;
grant execute on function public.submit_peer_evaluations(text,text,jsonb) to authenticated;


drop policy if exists evaluation_read on public.peer_evaluations;
create policy evaluation_read on public.peer_evaluations for select to authenticated
using (public.is_project_member(project_id) and (
  exists(select 1 from public.members m where m.user_id = auth.uid() and m.id in (evaluator_id, recipient_id))
  or (phase = 'final' and (public.evaluation_prototype_enabled()
    or exists(select 1 from public.projects p where p.id = project_id and p.status = 'done')))
));
commit;


-- Evaluation privacy: apply last.
begin;
drop policy if exists evaluation_read on public.peer_evaluations;
create policy evaluation_read on public.peer_evaluations for select to authenticated
using (exists(select 1 from public.members m where m.id=evaluator_id and m.user_id=auth.uid()));
create or replace function public.my_evaluation_average(p_project_id text, p_phase text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor uuid; expected integer; received integer; result jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형'; end if;
 select id into actor from members where project_id=p_project_id and user_id=auth.uid();
 if actor is null then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 select count(*) into expected from members where project_id=p_project_id and id<>actor and user_id is not null;
 select count(*) into received from peer_evaluations where project_id=p_project_id and phase=p_phase and recipient_id=actor;
 if expected<2 or received<expected then
   return jsonb_build_object('count',0,'score',null,'criteria',null,'comments','[]'::jsonb,'available',false);
 end if;
 select jsonb_build_object('count',count(*),'available',true,
 'score',avg((role+deadline+communication+collaboration+quality)::numeric/5),
 'criteria',jsonb_build_object('role',avg(role),'deadline',avg(deadline),'communication',avg(communication),'collaboration',avg(collaboration),'quality',avg(quality)),
 'comments',case when p_phase='midterm' then coalesce(jsonb_agg(comment) filter (where btrim(comment)<>''),'[]'::jsonb) else '[]'::jsonb end)
 into result from peer_evaluations where project_id=p_project_id and phase=p_phase and recipient_id=actor;
 return result;
end $$;
revoke all on function public.my_evaluation_average(text,text) from public,anon;
grant execute on function public.my_evaluation_average(text,text) to authenticated;
revoke select on public.members from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute
 where attrelid='public.members'::regclass and attnum>0 and not attisdropped
 and attname not in ('score','eval_count','criteria_role','criteria_deadline','criteria_communication','criteria_collaboration','criteria_quality');
 execute 'grant select ('||cols||') on public.members to authenticated';
end $$;
revoke select(score,eval_count,criteria_role,criteria_deadline,criteria_communication,criteria_collaboration,criteria_quality) on public.members from public,anon,authenticated;
create or replace function public.visible_evaluation_members(p_project_id text default null)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members; a jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_project_id is not null and not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 for m in select * from members where (p_project_id is null and user_id=auth.uid()) or (p_project_id is not null and project_id=p_project_id) loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0; m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  if m.user_id=auth.uid() then
   a:=public.my_evaluation_average(m.project_id,'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  end if;
  return next m;
 end loop;
end $$;
revoke all on function public.visible_evaluation_members(text) from public,anon;
grant execute on function public.visible_evaluation_members(text) to authenticated;
update public.peer_evaluations set comment='' where phase='final' and comment<>'';
create or replace function public.discard_final_evaluation_comment() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.phase='final' then new.comment:=''; end if;
 return new;
end $$;
drop trigger if exists peer_evaluation_final_comment_guard on public.peer_evaluations;
create trigger peer_evaluation_final_comment_guard before insert or update of phase,comment
on public.peer_evaluations for each row execute function public.discard_final_evaluation_comment();
commit;

-- Existing rows retain unknown timestamps; do not mark old records as newly created.
begin;
alter table public.files add column if not exists created_at timestamptz;
alter table public.files add column if not exists updated_at timestamptz;
alter table public.files alter column created_at set default now();
alter table public.schedule_events add column if not exists updated_at timestamptz;
create or replace function public.stamp_dashboard_activity() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then new.created_at:=now(); new.updated_at:=null;
 else new.created_at:=old.created_at; new.updated_at:=now(); end if;
 return new;
end $$;
drop trigger if exists files_activity_stamp on public.files;
create trigger files_activity_stamp before insert or update on public.files for each row execute function public.stamp_dashboard_activity();
drop trigger if exists schedule_activity_stamp on public.schedule_events;
create trigger schedule_activity_stamp before insert or update on public.schedule_events for each row execute function public.stamp_dashboard_activity();
create or replace function public.touch_file_activity() returns trigger
language plpgsql set search_path=public as $$
begin
 -- The initial version is part of registration, not a separate modification.
 if (select count(*) from public.file_versions where file_id=new.file_id)>1 then
  update public.files set updated_at=now() where id=new.file_id;
 end if;
 return new;
end $$;
drop trigger if exists file_version_activity on public.file_versions;
create trigger file_version_activity after insert on public.file_versions for each row execute function public.touch_file_activity();
commit;
