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
  -- App-wide background customization, applied behind the glass UI once
  -- logged in. Priority: background_image_url > background_gradient >
  -- background_color > the app default. Image reuses the "avatars" bucket.
  background_color text,
  background_gradient text,
  background_image_url text,
  -- Glass-card intensity for the same background: opacity of the card fill
  -- (0-100, % white) and backdrop blur radius in px. Null falls back to the
  -- app defaults (66 / 18) — see --glass-alpha/--panel-blur-px in index.css.
  glass_opacity integer,
  glass_blur integer,
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
  content text,
  file_data text,
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
  role integer not null check(role between 0 and 10),
  deadline integer not null check(deadline between 0 and 10),
  communication integer not null check(communication between 0 and 10),
  collaboration integer not null check(collaboration between 0 and 10),
  quality integer not null check(quality between 0 and 10),
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
       or (e->>k)::numeric not between 0 and 10
  ) then raise exception '점수는 0~10 사이의 정수여야 합니다.'; end if;
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
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  if not public.is_project_leader(p_project_id) then raise exception '팀장만 프로젝트를 종료할 수 있습니다.'; end if;
  update public.projects set status = 'done' where id = p_project_id and status = 'active';
  if not exists (select 1 from public.projects where id = p_project_id and status = 'done') then
    raise exception '프로젝트 종료 상태가 저장되지 않았습니다. 프로젝트 트리거를 확인해 주세요.';
  end if;
end;
$$;
revoke all on function public.complete_evaluation_project(text) from public, anon;
grant execute on function public.complete_evaluation_project(text) to authenticated;
commit;

-- Prototype/test mode toggle. Backed by app_settings (see near the bottom of
-- this file, after is_admin() is defined) so an admin can flip it at
-- runtime via set_evaluation_prototype_enabled() instead of editing SQL.
begin;
create or replace function public.evaluation_prototype_enabled()
returns boolean language sql stable as $$
  select coalesce((select value from public.app_settings where key = 'evaluation_prototype_enabled'), true)
$$;
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
       or (e->>k)::numeric not between 0 and 10
  ) then raise exception '점수는 0~10 사이의 정수여야 합니다.'; end if;
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
 if not public.evaluation_prototype_enabled() and (expected<2 or received<expected) then
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
-- 프로젝트 단위 조회(팀 관리 화면 등)에서 다른 멤버의 정산 완료된 평점
-- 평균을 계산. 개별 평가자·코멘트는 노출하지 않고 평균만 반환.
create or replace function public.member_evaluation_average(p_project_id text, p_member_id uuid, p_phase text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare expected integer; received integer; result jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_phase is null or p_phase not in ('midterm','final') then raise exception '잘못된 평가 유형'; end if;
 if not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 if not exists (select 1 from members where id = p_member_id and project_id = p_project_id) then
   raise exception '멤버를 찾을 수 없습니다.';
 end if;
 select count(*) into expected from members where project_id = p_project_id and id <> p_member_id and user_id is not null;
 select count(*) into received from peer_evaluations where project_id = p_project_id and phase = p_phase and recipient_id = p_member_id;
 if not public.evaluation_prototype_enabled() and (expected < 2 or received < expected) then
   return jsonb_build_object('count', 0, 'score', null, 'criteria', null, 'comments', '[]'::jsonb, 'available', false);
 end if;
 select jsonb_build_object('count', count(*), 'available', true,
 'score', avg((role+deadline+communication+collaboration+quality)::numeric/5),
 'criteria', jsonb_build_object('role', avg(role), 'deadline', avg(deadline), 'communication', avg(communication), 'collaboration', avg(collaboration), 'quality', avg(quality)),
 'comments', '[]'::jsonb)
 into result from peer_evaluations where project_id = p_project_id and phase = p_phase and recipient_id = p_member_id;
 return result;
end $$;
revoke all on function public.member_evaluation_average(text,uuid,text) from public, anon;
grant execute on function public.member_evaluation_average(text,uuid,text) to authenticated;

create or replace function public.visible_evaluation_members(p_project_id text default null)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members; a jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_project_id is not null and not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 for m in select * from members where (p_project_id is null and user_id=auth.uid()) or (p_project_id is not null and project_id=p_project_id) loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0; m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  if p_project_id is not null then
   a := public.member_evaluation_average(m.project_id, m.id, 'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  elsif m.user_id=auth.uid() then
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


-- Real immutable binary files, version trees, promotion and pins.
begin;
alter table public.file_versions add column if not exists parent_version_id bigint;
alter table public.file_versions add column if not exists storage_path text;
alter table public.file_versions add column if not exists original_name text;
alter table public.file_versions add column if not exists mime_type text not null default 'application/octet-stream';
alter table public.file_versions add column if not exists byte_size bigint;
alter table public.file_versions add column if not exists pinned boolean not null default false;
alter table public.file_versions add column if not exists file_type text;
update public.file_versions v set file_type=f.type from public.files f where v.file_id=f.id and v.file_type is null;

create unique index if not exists file_versions_file_id_id on public.file_versions(file_id,id);
do $$ begin
  alter table public.file_versions add constraint file_version_parent_same_file
    foreign key(file_id,parent_version_id) references public.file_versions(file_id,id);
exception when duplicate_object then null; end $$;
create unique index if not exists file_versions_storage_path on public.file_versions(storage_path) where storage_path is not null;
-- Preserve legacy history as a linear chain; there are no recoverable bytes for it.
with history as (
  select id, lag(id) over(partition by file_id order by id) parent_id
  from public.file_versions where storage_path is null
) update public.file_versions v set parent_version_id=h.parent_id
  from history h where v.id=h.id and v.parent_version_id is null;
with ranked as (
  select id,row_number() over(partition by file_id order by id desc) n
  from public.file_versions where current
) update public.file_versions v set current=false from ranked r where v.id=r.id and r.n>1;
create unique index if not exists file_versions_one_current on public.file_versions(file_id) where current;

insert into storage.buckets(id,name,public,file_size_limit)
values('workspace-files','workspace-files',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;

-- All version mutations go through the checked transactional functions below.
revoke insert,update,delete on public.files,public.file_versions from anon,authenticated;
grant select on public.files,public.file_versions to authenticated;

-- Decode new ASCII-only paths; keep existing three-segment paths readable.
create or replace function public.workspace_storage_project(p_path text)
returns text language plpgsql immutable set search_path=public as $$
begin
  if array_length(string_to_array(p_path,'/'),1)=4 and split_part(p_path,'/',1)='v2' then
    return convert_from(decode(split_part(p_path,'/',2),'hex'),'UTF8');
  elsif array_length(string_to_array(p_path,'/'),1)=3 then
    return split_part(p_path,'/',1);
  end if;
  return null;
exception when others then return null;
end $$;
create or replace function public.workspace_storage_owner(p_path text)
returns text language sql immutable set search_path=public as $$
  select case when array_length(string_to_array(p_path,'/'),1)=4 and split_part(p_path,'/',1)='v2'
    then split_part(p_path,'/',3)
    when array_length(string_to_array(p_path,'/'),1)=3 then split_part(p_path,'/',2) end;
$$;

create or replace function public.register_workspace_version(
  p_project_id text,p_file_id bigint,p_base_version_id bigint,p_folder_id bigint,
  p_name text,p_type text,p_path text,p_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.members%rowtype;
  f public.files%rowtype;
  existing public.file_versions%rowtype;
  head_id bigint;
  new_id bigint;
  n integer;
  bytes bigint;
  mime text;
  size_label text;
  make_current boolean;
begin
  -- Same lock used by project completion: no upload can commit after closure.
  perform id from public.projects where id=p_project_id and status='active' for update;
  if not found then raise exception '진행 중인 프로젝트에만 업로드할 수 있습니다.'; end if;
  select * into actor from public.members where project_id=p_project_id and user_id=auth.uid();
  if not found then raise exception '프로젝트 참여자만 업로드할 수 있습니다.'; end if;
  if p_name is null or length(trim(p_name))=0 or length(p_name)>255 or length(coalesce(p_note,''))>2000 then
    raise exception '파일 이름 또는 메모가 올바르지 않습니다.';
  end if;
  if p_type is null or p_type not in ('pdf','doc','img','ppt','xls','zip') then raise exception '잘못된 파일 유형입니다.'; end if;
  if p_path is null or public.workspace_storage_project(p_path) is distinct from p_project_id or public.workspace_storage_owner(p_path) is distinct from auth.uid()::text then
    raise exception '업로드 경로가 올바르지 않습니다.';
  end if;
  select (metadata->>'size')::bigint,coalesce(metadata->>'mimetype','application/octet-stream')
    into bytes,mime from storage.objects where bucket_id='workspace-files' and name=p_path for update;
  if not found or bytes is null or bytes<0 or bytes>52428800 then raise exception '업로드한 파일을 확인할 수 없습니다 (최대 50MB).'; end if;
  select * into existing from public.file_versions where storage_path=p_path;
  if found then
    if p_file_id is not null and existing.file_id<>p_file_id then raise exception '다른 파일에 등록된 원본입니다.'; end if;
    return jsonb_build_object('file_id',existing.file_id,'version_id',existing.id,'branched',not existing.current);
  end if;
  size_label := case when bytes>=1048576 then round(bytes/1048576.0,2)::text || ' MB' else round(bytes/1024.0,1)::text || ' KB' end;
  if p_file_id is null then
    if p_base_version_id is not null then raise exception '새 파일에는 기준 버전이 없어야 합니다.'; end if;
    if p_folder_id is not null and not exists(select 1 from public.folders where id=p_folder_id and project_id=p_project_id) then
      raise exception '프로젝트의 폴더가 아닙니다.';
    end if;
    insert into public.files(project_id,name,type,uploader,avatar,date,size,tag,folder_id)
      values(p_project_id,p_name,p_type,actor.name,actor.avatar,current_date,size_label,'기타',p_folder_id) returning * into f;
  else
    select * into f from public.files where id=p_file_id and project_id=p_project_id for update;
    if not found then raise exception '프로젝트의 파일이 아닙니다.'; end if;
  end if;
  select id into head_id from public.file_versions where file_id=f.id and current;
  if p_base_version_id is not null and not exists(select 1 from public.file_versions where id=p_base_version_id and file_id=f.id) then
    raise exception '이 파일의 기준 버전이 아닙니다.';
  end if;
  if head_id is not null and p_base_version_id is null then raise exception '기준 버전을 선택해 주세요.'; end if;
  make_current := head_id is not distinct from p_base_version_id;
  select count(*)+1 into n from public.file_versions where file_id=f.id;
  if make_current then update public.file_versions set current=false where file_id=f.id and current; end if;
  insert into public.file_versions(file_id,version,uploaded_by,date,size,note,current,parent_version_id,storage_path,original_name,mime_type,byte_size,file_type)
    values(f.id,'v'||n,actor.name,current_date,size_label,coalesce(p_note,''),make_current,p_base_version_id,p_path,p_name,mime,bytes,p_type)
    returning id into new_id;
  if make_current then
    update public.files set type=p_type,uploader=actor.name,avatar=actor.avatar,date=current_date,size=size_label where id=f.id;
  end if;
  return jsonb_build_object('file_id',f.id,'version_id',new_id,'branched',not make_current);
end $$;

create or replace function public.promote_workspace_version(p_file_id bigint,p_version_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare project_id_value text; v public.file_versions%rowtype;
begin
  select project_id into project_id_value from public.files where id=p_file_id;
  perform id from public.projects where id=project_id_value and status='active' for update;
  if not found or not public.is_project_member(project_id_value) then raise exception '진행 중인 프로젝트의 참여자만 버전을 변경할 수 있습니다.'; end if;
  perform id from public.files where id=p_file_id for update;
  select * into v from public.file_versions where id=p_version_id and file_id=p_file_id;
  if not found or v.storage_path is null then raise exception '원본 파일이 있는 버전을 선택해 주세요.'; end if;
  update public.file_versions set current=false where file_id=p_file_id and current;
  update public.file_versions set current=true where id=v.id;
  update public.files set size=v.size,uploader=v.uploaded_by,date=v.date,type=coalesce(v.file_type,type) where id=p_file_id;
end $$;

create or replace function public.pin_workspace_version(p_file_id bigint,p_version_id bigint,p_pinned boolean)
returns void language plpgsql security definer set search_path=public as $$
declare project_id_value text;
begin
  select project_id into project_id_value from public.files where id=p_file_id;
  perform id from public.projects where id=project_id_value and status='active' for update;
  if not found or not public.is_project_member(project_id_value) then raise exception '진행 중인 프로젝트의 참여자만 핀을 변경할 수 있습니다.'; end if;
  update public.file_versions set pinned=p_pinned where file_id=p_file_id and id=p_version_id;
  if not found then raise exception '버전을 찾을 수 없습니다.'; end if;
end $$;

revoke all on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text) from public,anon;
revoke all on function public.promote_workspace_version(bigint,bigint) from public,anon;
revoke all on function public.pin_workspace_version(bigint,bigint,boolean) from public,anon;
grant execute on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text) to authenticated;
grant execute on function public.promote_workspace_version(bigint,bigint) to authenticated;
grant execute on function public.pin_workspace_version(bigint,bigint,boolean) to authenticated;

drop policy if exists workspace_binary_read on storage.objects;
drop policy if exists workspace_binary_insert on storage.objects;
drop policy if exists workspace_binary_cleanup on storage.objects;
create policy workspace_binary_read on storage.objects for select to authenticated using (
  bucket_id='workspace-files' and public.is_project_member(public.workspace_storage_project(objects.name))
);
create policy workspace_binary_insert on storage.objects for insert to authenticated with check (
  bucket_id='workspace-files' and public.workspace_storage_owner(objects.name)=auth.uid()::text
  and public.is_project_member(public.workspace_storage_project(objects.name))
  and exists(select 1 from public.projects p where p.id=public.workspace_storage_project(objects.name) and p.status='active')
);
-- Linked objects are immutable: no update policy, no deletion of stored versions.
create policy workspace_binary_cleanup on storage.objects for delete to authenticated using (
  bucket_id='workspace-files' and public.workspace_storage_owner(objects.name)=auth.uid()::text
  and public.is_project_member(public.workspace_storage_project(objects.name))
  and not exists(select 1 from public.file_versions v where v.storage_path=objects.name)
);
commit;

-- Apply after workspace versioning and path-policy migrations.
begin;
alter table public.files add column if not exists tags text[] not null default '{}';
update public.files set tags=array[tag] where cardinality(tags)=0 and trim(coalesce(tag,'')) not in ('','기타');
create or replace function public.normalize_workspace_tags(p_tags text[])
returns text[] language plpgsql immutable set search_path=public as $$
declare result text[];
begin
  select coalesce(array_agg(tag order by first_position),array[]::text[]) into result
  from (select btrim(value) tag,min(position) first_position from unnest(p_tags) with ordinality as t(value,position)
    where nullif(btrim(value),'') is not null group by btrim(value)) cleaned;
  if cardinality(result)>10 or exists(select 1 from unnest(result) tag where char_length(tag)>30) then
    raise exception '태그는 최대 10개, 각각 30자까지 입력할 수 있습니다.';
  end if;
  return result;
end $$;
drop function if exists public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text);
create or replace function public.register_workspace_version(
  p_project_id text,p_file_id bigint,p_base_version_id bigint,p_folder_id bigint,
  p_name text,p_type text,p_path text,p_note text,p_tags text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.members%rowtype;
  f public.files%rowtype;
  existing public.file_versions%rowtype;
  head_id bigint;
  new_id bigint;
  n integer;
  bytes bigint;
  mime text;
  size_label text;
  make_current boolean;
  normalized_tags text[];
begin
  -- Same lock used by project completion: no upload can commit after closure.
  perform id from public.projects where id=p_project_id and status='active' for update;
  if not found then raise exception '진행 중인 프로젝트에만 업로드할 수 있습니다.'; end if;
  select * into actor from public.members where project_id=p_project_id and user_id=auth.uid();
  if not found then raise exception '프로젝트 참여자만 업로드할 수 있습니다.'; end if;
  if p_name is null or length(trim(p_name))=0 or length(p_name)>255 or length(coalesce(p_note,''))>2000 then
    raise exception '파일 이름 또는 메모가 올바르지 않습니다.';
  end if;
  if p_type is null or p_type not in ('pdf','doc','img','ppt','xls','zip') then raise exception '잘못된 파일 유형입니다.'; end if;
  if p_path is null or public.workspace_storage_project(p_path) is distinct from p_project_id or public.workspace_storage_owner(p_path) is distinct from auth.uid()::text then
    raise exception '업로드 경로가 올바르지 않습니다.';
  end if;
  select (metadata->>'size')::bigint,coalesce(metadata->>'mimetype','application/octet-stream')
    into bytes,mime from storage.objects where bucket_id='workspace-files' and name=p_path for update;
  if not found or bytes is null or bytes<0 or bytes>52428800 then raise exception '업로드한 파일을 확인할 수 없습니다 (최대 50MB).'; end if;
  select * into existing from public.file_versions where storage_path=p_path;
  if found then
    if p_file_id is not null and existing.file_id<>p_file_id then raise exception '다른 파일에 등록된 원본입니다.'; end if;
    return jsonb_build_object('file_id',existing.file_id,'version_id',existing.id,'branched',not existing.current);
  end if;
  if p_file_id is not null then
    select * into f from public.files where id=p_file_id and project_id=p_project_id for update;
    if not found then raise exception '프로젝트의 파일이 아닙니다.'; end if;
  end if;
  normalized_tags := public.normalize_workspace_tags(coalesce(p_tags,f.tags,array[]::text[]));
  if (p_type='img' or mime like 'image/%' or lower(p_name) ~ '\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|tiff?|ico)$'
    or f.type='img' or exists(select 1 from public.file_versions where file_id=p_file_id and (file_type='img' or mime_type like 'image/%')))
    and cardinality(normalized_tags)=0 then raise exception '이미지에는 태그를 하나 이상 입력해 주세요.'; end if;
  size_label := case when bytes>=1048576 then round(bytes/1048576.0,2)::text || ' MB' else round(bytes/1024.0,1)::text || ' KB' end;
  if p_file_id is null then
    if p_base_version_id is not null then raise exception '새 파일에는 기준 버전이 없어야 합니다.'; end if;
    if p_folder_id is not null and not exists(select 1 from public.folders where id=p_folder_id and project_id=p_project_id) then
      raise exception '프로젝트의 폴더가 아닙니다.';
    end if;
    insert into public.files(project_id,name,type,uploader,avatar,date,size,tag,folder_id)
      values(p_project_id,p_name,p_type,actor.name,actor.avatar,current_date,size_label,'기타',p_folder_id) returning * into f;
  else
    select * into f from public.files where id=p_file_id and project_id=p_project_id for update;
    if not found then raise exception '프로젝트의 파일이 아닙니다.'; end if;
  end if;
  update public.files set tags=normalized_tags,tag=coalesce(normalized_tags[1],'기타') where id=f.id;
  select id into head_id from public.file_versions where file_id=f.id and current;
  if p_base_version_id is not null and not exists(select 1 from public.file_versions where id=p_base_version_id and file_id=f.id) then
    raise exception '이 파일의 기준 버전이 아닙니다.';
  end if;
  if head_id is not null and p_base_version_id is null then raise exception '기준 버전을 선택해 주세요.'; end if;
  make_current := head_id is not distinct from p_base_version_id;
  select count(*)+1 into n from public.file_versions where file_id=f.id;
  if make_current then update public.file_versions set current=false where file_id=f.id and current; end if;
  insert into public.file_versions(file_id,version,uploaded_by,date,size,note,current,parent_version_id,storage_path,original_name,mime_type,byte_size,file_type)
    values(f.id,'v'||n,actor.name,current_date,size_label,coalesce(p_note,''),make_current,p_base_version_id,p_path,p_name,mime,bytes,p_type)
    returning id into new_id;
  if make_current then
    update public.files set type=p_type,uploader=actor.name,avatar=actor.avatar,date=current_date,size=size_label where id=f.id;
  end if;
  return jsonb_build_object('file_id',f.id,'version_id',new_id,'branched',not make_current);
end $$;


revoke all on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text,text[]) from public,anon;
grant execute on function public.register_workspace_version(text,bigint,bigint,bigint,text,text,text,text,text[]) to authenticated;
create or replace function public.set_workspace_file_tags(p_file_id bigint,p_tags text[])
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.files%rowtype; normalized_tags text[];
begin
  select project_id into pid from public.files where id=p_file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 태그를 수정할 수 있습니다.'; end if;
  select * into f from public.files where id=p_file_id for update;
  normalized_tags := public.normalize_workspace_tags(p_tags);
  if (f.type='img' or exists(select 1 from public.file_versions where file_id=p_file_id and (file_type='img' or mime_type like 'image/%')))
    and cardinality(normalized_tags)=0 then raise exception '이미지에는 태그를 하나 이상 입력해 주세요.'; end if;
  update public.files set tags=normalized_tags,tag=coalesce(normalized_tags[1],'기타') where id=p_file_id;
end $$;
revoke all on function public.set_workspace_file_tags(bigint,text[]) from public,anon;
grant execute on function public.set_workspace_file_tags(bigint,text[]) to authenticated;
commit;

-- Existing date-only versions intentionally keep an unknown upload time.
begin;
alter table public.file_versions add column if not exists uploaded_at timestamptz;
alter table public.file_versions alter column uploaded_at set default now();
-- Server-owned timestamp: edits, pins and version promotion preserve it.
create or replace function public.stamp_workspace_upload_time()
returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='INSERT' then new.uploaded_at:=now();
  else new.uploaded_at:=old.uploaded_at; end if;
  return new;
end $$;
drop trigger if exists workspace_upload_time on public.file_versions;
create trigger workspace_upload_time before insert or update on public.file_versions
for each row execute function public.stamp_workspace_upload_time();
commit;

-- Apply after workspace versioning, tags and upload-time migrations.
begin;
alter table public.files add column if not exists owner_user_id uuid;
alter table public.folders add column if not exists owner_user_id uuid;
-- Only recover an original uploader from the first version's verified storage path.
-- Names are not reliable identities; legacy folders remain leader-only.
update public.files f set owner_user_id=public.workspace_storage_owner(v.storage_path)::uuid
from public.file_versions v
where f.owner_user_id is null and v.file_id=f.id
  and v.id=(select min(first.id) from public.file_versions first where first.file_id=f.id)
  and public.workspace_storage_project(v.storage_path)=f.project_id
  and public.workspace_storage_owner(v.storage_path) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
create or replace function public.stamp_workspace_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='INSERT' then new.owner_user_id:=auth.uid();
  else new.owner_user_id:=old.owner_user_id; end if;
  return new;
end $$;
drop trigger if exists workspace_file_owner on public.files;
create trigger workspace_file_owner before insert or update on public.files
for each row execute function public.stamp_workspace_owner();
drop trigger if exists workspace_folder_owner on public.folders;
create trigger workspace_folder_owner before insert or update on public.folders
for each row execute function public.stamp_workspace_owner();
-- Folder mutation must not bypass the RPC's ownership and nonempty checks.
revoke update,delete on public.folders from anon,authenticated;
drop policy if exists folders_all on public.folders;
drop policy if exists workspace_folders_read on public.folders;
drop policy if exists workspace_folders_insert on public.folders;
create policy workspace_folders_read on public.folders for select to authenticated using(public.is_project_member(project_id));
create policy workspace_folders_insert on public.folders for insert to authenticated with check(
  public.is_project_member(project_id) and exists(select 1 from public.projects p where p.id=folders.project_id and p.status='active')
);

-- Metadata deletion is atomic. Binary cleanup uses Storage's API, never SQL DELETE
-- on storage.objects. Keep a durable retry list if the network/API fails.
create table if not exists public.workspace_delete_queue (
  storage_path text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now()
);
alter table public.workspace_delete_queue enable row level security;
revoke all on public.workspace_delete_queue from anon,authenticated;
grant select on public.workspace_delete_queue to authenticated;
drop policy if exists workspace_cleanup_read on public.workspace_delete_queue;
create policy workspace_cleanup_read on public.workspace_delete_queue for select to authenticated using(
  public.is_project_member(project_id) and (deleted_by=auth.uid() or public.is_project_leader(project_id))
);
drop policy if exists workspace_deleted_binary_cleanup on storage.objects;
create policy workspace_deleted_binary_cleanup on storage.objects for delete to authenticated using(
  bucket_id='workspace-files'
  and exists(select 1 from public.workspace_delete_queue q where q.storage_path=objects.name)
  and not exists(select 1 from public.file_versions v where v.storage_path=objects.name)
);
create or replace function public.prevent_deleted_workspace_reuse()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.workspace_delete_queue where storage_path=new.storage_path) then
    raise exception '삭제 중인 원본은 다시 등록할 수 없습니다.';
  end if;
  return new;
end $$;
drop trigger if exists workspace_prevent_deleted_reuse on public.file_versions;
create trigger workspace_prevent_deleted_reuse before insert on public.file_versions
for each row execute function public.prevent_deleted_workspace_reuse();

create or replace function public.delete_workspace_file(p_file_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.files%rowtype;
begin
  select project_id into pid from public.files where id=p_file_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.files where id=p_file_id for update;
  if not found then raise exception '파일이 존재하지 않습니다.'; end if;
  if not public.is_project_leader(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장 또는 최초 업로더만 파일을 삭제할 수 있습니다.';
  end if;
  insert into public.workspace_delete_queue(storage_path,project_id,deleted_by)
    select storage_path,pid,auth.uid() from public.file_versions where file_id=p_file_id and storage_path is not null
    on conflict(storage_path) do nothing;
  delete from public.files where id=p_file_id;
end $$;
create or replace function public.delete_workspace_folder(p_folder_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare pid text; f public.folders%rowtype;
begin
  select project_id into pid from public.folders where id=p_folder_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 삭제할 수 있습니다.'; end if;
  select * into f from public.folders where id=p_folder_id for update;
  if not found then raise exception '폴더가 존재하지 않습니다.'; end if;
  if not public.is_project_leader(pid) and f.owner_user_id is distinct from auth.uid() then
    raise exception '팀장 또는 생성자만 폴더를 삭제할 수 있습니다.';
  end if;
  if exists(select 1 from public.files where folder_id=p_folder_id) then
    raise exception '파일이 있는 폴더는 삭제할 수 없습니다. 파일을 먼저 삭제해 주세요.';
  end if;
  delete from public.folders where id=p_folder_id;
end $$;
create or replace function public.finish_workspace_cleanup(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 정리할 수 있습니다.'; end if;
  delete from public.workspace_delete_queue q where q.project_id=p_project_id
    and (q.deleted_by=auth.uid() or public.is_project_leader(p_project_id))
    and not exists(select 1 from storage.objects o where o.bucket_id='workspace-files' and o.name=q.storage_path);
end $$;
revoke all on function public.delete_workspace_file(bigint), public.delete_workspace_folder(bigint), public.finish_workspace_cleanup(text) from public,anon;
grant execute on function public.delete_workspace_file(bigint), public.delete_workspace_folder(bigint), public.finish_workspace_cleanup(text) to authenticated;
commit;

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

begin;
alter table public.file_versions add column if not exists search_text text not null default '';
alter table public.file_versions add column if not exists search_status text not null default 'pending';
create or replace function public.set_workspace_version_text(p_version_id bigint,p_text text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare pid text;
begin
  select f.project_id into pid from public.file_versions v join public.files f on f.id=v.file_id where v.id=p_version_id;
  perform id from public.projects where id=pid and status='active' for update;
  if not found or not public.is_project_member(pid) then raise exception '진행 중인 프로젝트의 참여자만 본문을 저장할 수 있습니다.'; end if;
  if p_text is null or char_length(p_text)>200000 or p_status is null or p_status not in ('ready','partial','unsupported','failed') then raise exception '검색 본문이 올바르지 않습니다.'; end if;
  update public.file_versions set search_text=p_text,search_status=p_status where id=p_version_id;
end $$;
create or replace function public.register_workspace_search_version(
  p_project_id text,p_file_id bigint,p_base_version_id bigint,p_folder_id bigint,
  p_name text,p_type text,p_path text,p_note text,p_tags text[],p_search_text text,p_search_status text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  result := public.register_workspace_version(p_project_id,p_file_id,p_base_version_id,p_folder_id,p_name,p_type,p_path,p_note,p_tags);
  perform public.set_workspace_version_text((result->>'version_id')::bigint,p_search_text,p_search_status);
  return result;
end $$;
revoke all on function public.set_workspace_version_text(bigint,text,text),public.register_workspace_search_version(text,bigint,bigint,bigint,text,text,text,text,text[],text,text) from public,anon;
grant execute on function public.set_workspace_version_text(bigint,text,text),public.register_workspace_search_version(text,bigint,bigint,bigint,text,text,text,text,text[],text,text) to authenticated;
commit;

-- Consolidated administrator governance integration.
-- Apply after the current main schema/migrations. Repeatable; no automatic deletion job is installed.
begin;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists org text;
alter table public.profiles add column if not exists email text;
alter table public.projects add column if not exists approval_status text not null default 'approved';
alter table public.projects add column if not exists requested_admin_id uuid references auth.users(id) on delete set null;
alter table public.projects add column if not exists completed_at timestamptz;
update public.profiles p set email=u.email from auth.users u where p.id=u.id and p.email is null;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select is_admin from public.profiles where id=auth.uid()),false)
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

-- Account type is never accepted from editable signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name,avatar_initial,is_admin,org,email)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name','사용자'),
 left(coalesce(new.raw_user_meta_data->>'display_name','사용자'),1),false,
 nullif(new.raw_user_meta_data->>'org',''),new.email);
 return new;
end $$;
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') then
  if tg_op='INSERT' then new.is_admin:=false;
  elsif new.is_admin is distinct from old.is_admin then
   raise exception '관리자 권한은 운영자만 변경할 수 있습니다.';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists prevent_profile_privilege_escalation_trigger on public.profiles;
create trigger prevent_profile_privilege_escalation_trigger before insert or update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

create or replace function public.set_project_approval_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null then
  if new.start_date is null or new.end_date is null or new.end_date<new.start_date then
   raise exception '올바른 시작일과 종료일을 입력해 주세요.';
  end if;
  if not public.is_admin() and (new.requested_admin_id is null or not exists
   (select 1 from public.profiles where id=new.requested_admin_id and is_admin)) then
   raise exception '승인을 요청할 관리자를 선택해 주세요.';
  end if;
  new.approval_status:=case when public.is_admin() then 'approved' else 'pending' end;
  new.status:='active'; new.completed_at:=null;
 end if;
 return new;
end $$;
drop trigger if exists set_project_approval_status_trigger on public.projects;
create trigger set_project_approval_status_trigger before insert on public.projects
for each row execute function public.set_project_approval_status();

-- Direct REST updates cannot self-approve, change the reviewer or bypass the completion RPC.
create or replace function public.guard_project_governance()
returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') and
  (new.id is distinct from old.id or new.approval_status is distinct from old.approval_status
   or new.requested_admin_id is distinct from old.requested_admin_id
   or new.status is distinct from old.status or new.completed_at is distinct from old.completed_at) then
  raise exception '승인과 종료 상태는 전용 기능으로만 변경할 수 있습니다.';
 end if;
 if (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date)
  and (new.start_date is null or new.end_date is null or new.end_date<new.start_date) then
  raise exception '올바른 시작일과 종료일을 입력해 주세요.';
 end if;
 return new;
end $$;
drop trigger if exists project_governance_guard on public.projects;
create trigger project_governance_guard before update on public.projects
for each row execute function public.guard_project_governance();
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
using(public.is_project_leader(id) or public.is_admin())
with check(public.is_project_leader(id) or public.is_admin());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using(public.is_admin());
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using(id=auth.uid() or public.shares_project_with(id) or public.is_admin());
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
using(public.is_project_member(project_id) or public.is_admin());
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
using(user_id=auth.uid() or public.is_project_member(project_id) or public.is_admin());
-- Preserve main's column-level evaluation privacy grants; do not GRANT SELECT *.
revoke select on public.members from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute
 where attrelid='public.members'::regclass and attnum>0 and not attisdropped
 and attname not in ('score','eval_count','criteria_role','criteria_deadline','criteria_communication','criteria_collaboration','criteria_quality');
 execute 'grant select ('||cols||') on public.members to authenticated';
end $$;
revoke select(score,eval_count,criteria_role,criteria_deadline,criteria_communication,criteria_collaboration,criteria_quality)
on public.members from public,anon,authenticated;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
revoke update,delete on public.members from authenticated;

create or replace function public.search_admin_profiles(q text)
returns table(id uuid,display_name text,org text,email text)
language sql stable security definer set search_path=public as $$
 select p.id,p.display_name,p.org,p.email from public.profiles p
 where auth.uid() is not null and p.is_admin and length(btrim(q)) between 1 and 100
 and (p.display_name ilike '%'||btrim(q)||'%' or p.org ilike '%'||btrim(q)||'%' or p.email ilike '%'||btrim(q)||'%')
 order by p.display_name,p.id limit 10
$$;
revoke all on function public.search_admin_profiles(text) from public,anon;
grant execute on function public.search_admin_profiles(text) to authenticated;

create or replace function public.review_project(p_project_id text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects;
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 승인할 수 있습니다.'; end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception '잘못된 승인 상태입니다.'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
 if p.requested_admin_id is not null and p.requested_admin_id<>auth.uid() then raise exception '지정된 관리자만 처리할 수 있습니다.'; end if;
 if p.approval_status<>'pending' then raise exception '이미 처리된 승인 요청입니다.'; end if;
 update public.projects set approval_status=p_status where id=p_project_id;
end $$;
revoke all on function public.review_project(text,text) from public,anon;
grant execute on function public.review_project(text,text) to authenticated;

create or replace function public.complete_evaluation_project(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects;
begin
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not (public.is_project_leader(p_project_id) or public.is_admin()) then
  raise exception '팀장 또는 관리자만 프로젝트를 종료할 수 있습니다.';
 end if;
 if p.approval_status<>'approved' then raise exception '승인된 프로젝트만 종료할 수 있습니다.'; end if;
 update public.projects set status='done',completed_at=coalesce(completed_at,now()) where id=p_project_id and status='active';
 if not exists(select 1 from public.projects where id=p_project_id and status='done') then
  raise exception '프로젝트 종료 상태가 저장되지 않았습니다. 프로젝트 트리거를 확인해 주세요.';
 end if;
end $$;
revoke all on function public.complete_evaluation_project(text) from public,anon;
grant execute on function public.complete_evaluation_project(text) to authenticated;

create or replace function public.kick_project_member(p_member_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m public.members; pid text;
begin
 select project_id into pid from public.members where id=p_member_id;
 perform id from public.projects where id=pid and status='active' and approval_status='approved' for update;
 if not found then raise exception '진행 중인 승인된 프로젝트에서만 팀원을 제외할 수 있습니다.'; end if;
 select * into m from public.members where id=p_member_id for update;
 if not found then raise exception '팀원을 찾을 수 없습니다.'; end if;
 if auth.uid() is null or not(public.is_admin() or public.is_project_leader(pid)) then raise exception '팀장 또는 관리자만 팀원을 제외할 수 있습니다.'; end if;
 if m.is_leader or m.user_id=auth.uid() then raise exception '팀장 또는 본인은 제외할 수 없습니다.'; end if;
 -- Deleting evaluation participants would change other members' scores and anonymity thresholds.
 if exists(select 1 from public.peer_evaluations where evaluator_id=m.id or recipient_id=m.id)
 or exists(select 1 from public.peer_evaluation_submissions where evaluator_id=m.id) then
  raise exception '평가 기록이 있는 팀원은 평가 보존을 위해 제외할 수 없습니다.';
 end if;
 delete from public.members where id=m.id;
end $$;
revoke all on function public.kick_project_member(uuid) from public,anon;
grant execute on function public.kick_project_member(uuid) to authenticated;

-- Admin roster access is deliberately separate from the existing private evaluation RPC.
create or replace function public.admin_project_members(p_project_id text)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members;
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 조회할 수 있습니다.'; end if;
 for m in select * from public.members where project_id=p_project_id order by is_leader desc,name loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0;
  m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  return next m;
 end loop;
end $$;
revoke all on function public.admin_project_members(text) from public,anon;
grant execute on function public.admin_project_members(text) to authenticated;

-- Also secure installations that previously applied coffe's unguarded cleanup functions.
do $$ begin
 if to_regprocedure('public.archive_and_cleanup_project(text)') is not null then
  revoke all on function public.archive_and_cleanup_project(text) from public,anon,authenticated;
 end if;
 if to_regprocedure('public.cleanup_completed_projects()') is not null then
  revoke all on function public.cleanup_completed_projects() from public,anon,authenticated;
 end if;
end $$;
-- Guard writes even when they arrive through existing SECURITY DEFINER RPCs.
create or replace function public.guard_approved_project_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb; pid text;
begin
 if auth.uid() is null or public.is_admin() then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
 pid:=row_data->>'project_id';
 if pid is null and row_data ? 'file_id' then
  select project_id into pid from public.files where id=(row_data->>'file_id')::bigint;
 elsif pid is null and row_data ? 'task_id' then
  select project_id into pid from public.tasks where id=(row_data->>'task_id')::bigint;
 elsif pid is null and tg_table_name='file_comment_reactions' then
  select f.project_id into pid from public.files f join public.file_comments c on c.file_id=f.id where c.id=(row_data->>'comment_id')::bigint;
 elsif pid is null and tg_table_name='task_comment_reactions' then
  select t.project_id into pid from public.tasks t join public.task_comments c on c.task_id=t.id where c.id=(row_data->>'comment_id')::bigint;
 end if;
 if exists(select 1 from public.projects where id=pid and approval_status<>'approved') then
  raise exception '관리자 승인 후 사용할 수 있습니다.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['folders','files','file_versions','file_comments','file_comment_reactions',
 'tasks','task_assignees','task_checklist_items','task_comments','task_comment_reactions',
 'schedule_events','chat_messages','message_reads','message_reactions','peer_evaluations','peer_evaluation_submissions'] loop
  execute format('drop trigger if exists approved_project_write on public.%I',t);
  execute format('create trigger approved_project_write before insert or update or delete on public.%I for each row execute function public.guard_approved_project_write()',t);
 end loop;
end $$;
drop policy if exists workspace_approval_write on storage.objects;
create policy workspace_approval_write on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'workspace-files' or exists(select 1 from public.projects p
where p.id=public.workspace_storage_project(objects.name) and p.approval_status='approved'));

create or replace function public.guard_schedule_update()
returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.projects where id=old.project_id and status='done') then
  raise exception '종료된 프로젝트의 일정은 변경할 수 없습니다.';
 end if;
 if tg_op='UPDATE' and (new.project_id is distinct from old.project_id
 or new.scope is distinct from old.scope or new.owner_member_id is distinct from old.owner_member_id) then
  raise exception '일정 소유자와 범위는 변경할 수 없습니다.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists schedule_update_guard on public.schedule_events;
create trigger schedule_update_guard before update or delete on public.schedule_events
for each row execute function public.guard_schedule_update();

-- Keep original-file cleanup entries after their project is deleted.
alter table public.workspace_delete_queue drop constraint if exists workspace_delete_queue_project_id_fkey;
drop policy if exists workspace_cleanup_read on public.workspace_delete_queue;
create policy workspace_cleanup_read on public.workspace_delete_queue for select to authenticated
using(public.is_admin() or (public.is_project_member(project_id) and (deleted_by=auth.uid() or public.is_project_leader(project_id))));
-- Storage DELETE also needs SELECT visibility after project membership has disappeared.
drop policy if exists workspace_pending_cleanup_read on storage.objects;
create policy workspace_pending_cleanup_read on storage.objects for select to authenticated
using(bucket_id='workspace-files'
 and exists(select 1 from public.workspace_delete_queue q where q.storage_path=objects.name)
 and not exists(select 1 from public.file_versions v where v.storage_path=objects.name));
create or replace function public.finish_workspace_cleanup(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not(public.is_admin() or public.is_project_member(p_project_id)) then raise exception '정리 권한이 없습니다.'; end if;
 delete from public.workspace_delete_queue q where q.project_id=p_project_id
 and (public.is_admin() or q.deleted_by=auth.uid() or public.is_project_leader(p_project_id))
 and not exists(select 1 from storage.objects o where o.bucket_id='workspace-files' and o.name=q.storage_path);
end $$;
create or replace function public.queue_deleted_project_files()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null then
  insert into public.workspace_delete_queue(storage_path,project_id,deleted_by)
  select v.storage_path,old.id,auth.uid() from public.file_versions v join public.files f on f.id=v.file_id
  where f.project_id=old.id and v.storage_path is not null on conflict(storage_path) do nothing;
 end if;
 return old;
end $$;
drop trigger if exists queue_deleted_project_files on public.projects;
create trigger queue_deleted_project_files before delete on public.projects
for each row execute function public.queue_deleted_project_files();
create or replace function public.delete_managed_project(p_project_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 프로젝트를 삭제할 수 있습니다.'; end if;
 delete from public.projects where id=p_project_id;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.delete_managed_project(text) from public,anon;
grant execute on function public.delete_managed_project(text) to authenticated;

-- Global app-wide flags. Single row per key today (just the evaluation
-- prototype/test toggle) — see evaluation_prototype_enabled() near the top
-- of this file, which reads from here.
create table if not exists public.app_settings (
  key text primary key,
  value boolean not null
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value)
  values ('evaluation_prototype_enabled', true)
  on conflict (key) do nothing;
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated using (true);
revoke insert, update, delete on public.app_settings from authenticated;

create or replace function public.set_evaluation_prototype_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 변경할 수 있습니다.'; end if;
 insert into public.app_settings (key, value) values ('evaluation_prototype_enabled', p_enabled)
   on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.set_evaluation_prototype_enabled(boolean) from public,anon;
grant execute on function public.set_evaluation_prototype_enabled(boolean) to authenticated;

notify pgrst,'reload schema';
commit;

begin;
-- 과제 보드/일정/워크스페이스에 새로 등록된 내용이 있으면 좌측 메뉴에 알림
-- 배지로 표시하기 위한 "마지막으로 본 시각" 저장 컬럼. default now()라서
-- 신규 멤버 행(가입 시점)과 이 마이그레이션 적용 시점의 기존 멤버 행 모두
-- 가입/적용 이전 콘텐츠까지 전부 "새 항목"으로 뜨는 걸 방지한다.
alter table public.members add column if not exists tasks_viewed_at timestamptz not null default now();
alter table public.members add column if not exists schedule_viewed_at timestamptz not null default now();
alter table public.members add column if not exists workspace_viewed_at timestamptz not null default now();
alter table public.tasks add column if not exists created_at timestamptz not null default now();

create or replace function public.mark_section_viewed(p_project_id text, p_section text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_section not in ('tasks','schedule','workspace') then raise exception '잘못된 섹션입니다.'; end if;
  if p_section = 'tasks' then
    update public.members set tasks_viewed_at = now() where project_id = p_project_id and user_id = auth.uid();
  elsif p_section = 'schedule' then
    update public.members set schedule_viewed_at = now() where project_id = p_project_id and user_id = auth.uid();
  else
    update public.members set workspace_viewed_at = now() where project_id = p_project_id and user_id = auth.uid();
  end if;
end $$;
revoke all on function public.mark_section_viewed(text,text) from public,anon;
grant execute on function public.mark_section_viewed(text,text) to authenticated;

-- visible_evaluation_members/admin_project_members return whole `members` rows
-- (returns setof public.members), so the three *_viewed_at columns above would
-- otherwise leak every teammate's last-viewed timestamps to everyone else who
-- calls these RPCs. Keep them visible only to the row's own owner.
create or replace function public.visible_evaluation_members(p_project_id text default null)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members; a jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_project_id is not null and not public.is_project_member(p_project_id) then raise exception '프로젝트 참여자만 조회할 수 있습니다.'; end if;
 for m in select * from members where (p_project_id is null and user_id=auth.uid()) or (p_project_id is not null and project_id=p_project_id) loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0; m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  if p_project_id is not null then
   a := public.member_evaluation_average(m.project_id, m.id, 'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  elsif m.user_id=auth.uid() then
   a:=public.my_evaluation_average(m.project_id,'final');
   if (a->>'available')::boolean then
    m.score:=(a->>'score')::numeric; m.eval_count:=(a->>'count')::integer;
    m.criteria_role:=(a->'criteria'->>'role')::numeric; m.criteria_deadline:=(a->'criteria'->>'deadline')::numeric;
    m.criteria_communication:=(a->'criteria'->>'communication')::numeric; m.criteria_collaboration:=(a->'criteria'->>'collaboration')::numeric; m.criteria_quality:=(a->'criteria'->>'quality')::numeric;
   end if;
  end if;
  if m.user_id is distinct from auth.uid() then
   m.tasks_viewed_at:=null; m.schedule_viewed_at:=null; m.workspace_viewed_at:=null;
  end if;
  return next m;
 end loop;
end $$;
revoke all on function public.visible_evaluation_members(text) from public,anon;
grant execute on function public.visible_evaluation_members(text) to authenticated;

create or replace function public.admin_project_members(p_project_id text)
returns setof public.members language plpgsql stable security definer set search_path=public as $$
declare m public.members;
begin
 if auth.uid() is null or not public.is_admin() then raise exception '관리자만 조회할 수 있습니다.'; end if;
 for m in select * from public.members where project_id=p_project_id order by is_leader desc,name loop
  m.score:=0; m.eval_count:=0; m.criteria_role:=0; m.criteria_deadline:=0;
  m.criteria_communication:=0; m.criteria_collaboration:=0; m.criteria_quality:=0;
  m.tasks_viewed_at:=null; m.schedule_viewed_at:=null; m.workspace_viewed_at:=null;
  return next m;
 end loop;
end $$;
revoke all on function public.admin_project_members(text) from public,anon;
grant execute on function public.admin_project_members(text) to authenticated;

notify pgrst,'reload schema';
commit;

-- 메인 화면 게시판(공지/자유/팀원모집) — 프로젝트에 속하지 않는, 로그인한
-- 모든 사용자가 함께 보는 전역 커뮤니티 게시판. feature/board 브랜치의
-- localStorage 기반 프로토타입을 실제 Supabase 테이블로 재구현.
begin;

create table if not exists public.board_posts (
  id bigint generated always as identity primary key,
  category text not null check (category in ('notice','free','recruit')),
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  content text not null check (length(content) <= 50000),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  views integer not null default 0,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  tags text[] not null default '{}',
  -- [{id,name,size,kind:'image'|'file',url,mimeType}] — url은 board-attachments
  -- 버킷의 실제 업로드 경로. base64는 절대 저장하지 않는다.
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists board_posts_list_idx on public.board_posts (pinned desc, created_at desc);

create table if not exists public.board_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.board_posts(id) on delete cascade,
  -- null이면 게시글에 바로 달린 댓글, 값이 있으면 그 댓글에 대한 대댓글(1단계만 지원).
  parent_comment_id bigint references public.board_comments(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);

create table if not exists public.board_likes (
  post_id bigint not null references public.board_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_likes enable row level security;

drop policy if exists board_posts_select on public.board_posts;
create policy board_posts_select on public.board_posts for select to authenticated using (true);
drop policy if exists board_posts_insert on public.board_posts;
create policy board_posts_insert on public.board_posts for insert to authenticated
  with check (author_user_id = auth.uid() and (category <> 'notice' or public.is_admin()));
drop policy if exists board_posts_update on public.board_posts;
create policy board_posts_update on public.board_posts for update to authenticated
  using (author_user_id = auth.uid() or public.is_admin())
  with check (author_user_id = auth.uid() and (category <> 'notice' or public.is_admin()));
drop policy if exists board_posts_delete on public.board_posts;
create policy board_posts_delete on public.board_posts for delete to authenticated
  using (author_user_id = auth.uid() or public.is_admin());
-- 조회수/좋아요/댓글수는 트리거와 RPC로만 바뀐다 — 작성자 본인도 직접 수정 불가.
revoke update (views, likes_count, comments_count, author_user_id) on public.board_posts from authenticated;

drop policy if exists board_comments_select on public.board_comments;
create policy board_comments_select on public.board_comments for select to authenticated using (true);
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments for insert to authenticated
  with check (
    author_user_id = auth.uid()
    -- 공지사항 게시글에는 댓글(대댓글 포함)을 달 수 없다.
    and exists (select 1 from public.board_posts p where p.id = board_comments.post_id and p.category <> 'notice')
    and (
      board_comments.parent_comment_id is null
      or exists (
        select 1 from public.board_comments parent
        where parent.id = board_comments.parent_comment_id
          and parent.post_id = board_comments.post_id
          and parent.parent_comment_id is null
      )
    )
  );
drop policy if exists board_comments_delete on public.board_comments;
create policy board_comments_delete on public.board_comments for delete to authenticated
  using (author_user_id = auth.uid() or public.is_admin());

drop policy if exists board_likes_select on public.board_likes;
create policy board_likes_select on public.board_likes for select to authenticated using (true);
drop policy if exists board_likes_insert on public.board_likes;
create policy board_likes_insert on public.board_likes for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists board_likes_delete on public.board_likes;
create policy board_likes_delete on public.board_likes for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.sync_board_post_likes_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.board_posts set likes_count = likes_count + 1 where id = new.post_id;
    return new;
  else
    update public.board_posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists board_likes_sync on public.board_likes;
create trigger board_likes_sync after insert or delete on public.board_likes
for each row execute function public.sync_board_post_likes_count();

create or replace function public.sync_board_post_comments_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.board_posts set comments_count = comments_count + 1 where id = new.post_id;
    return new;
  else
    update public.board_posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists board_comments_sync on public.board_comments;
create trigger board_comments_sync after insert or delete on public.board_comments
for each row execute function public.sync_board_post_comments_count();

create or replace function public.increment_board_post_views(p_post_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  update public.board_posts set views = views + 1 where id = p_post_id;
end $$;
revoke all on function public.increment_board_post_views(bigint) from public,anon;
grant execute on function public.increment_board_post_views(bigint) to authenticated;

-- 게시판 첨부/본문 삽입 이미지 저장용 버킷. avatars와 동일하게 공개 읽기 —
-- 게시판 콘텐츠는 민감 정보가 아니고, 서명 URL 없이 바로 렌더링되어야 함.
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-attachments', 'board-attachments', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

drop policy if exists board_attachments_public_read on storage.objects;
drop policy if exists board_attachments_own_write on storage.objects;
drop policy if exists board_attachments_own_delete on storage.objects;
create policy board_attachments_public_read on storage.objects for select
  using (bucket_id = 'board-attachments');
create policy board_attachments_own_write on storage.objects for insert
  with check (bucket_id = 'board-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy board_attachments_own_delete on storage.objects for delete
  using (bucket_id = 'board-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst,'reload schema';
commit;

-- 과제 보드/일정/워크스페이스 변경사항을 실시간으로 반영. 채팅이 쓰는
-- private 채널 + realtime.messages 인증 패턴을 그대로 재사용한다.
begin;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tasks') then
    alter publication supabase_realtime add table tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='schedule_events') then
    alter publication supabase_realtime add table schedule_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='files') then
    alter publication supabase_realtime add table files;
  end if;
end $$;

-- Private Realtime authorization. Do not call the app's generic
-- is_project_member() helper from realtime.messages policies: Realtime runs
-- its authorization check with a different schema context. This function
-- explicitly qualifies public.members and fixes its search_path instead.
create or replace function public.can_access_project_realtime_topic(p_topic text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.members m
      where p_topic ~ '^(presence|chat_messages|message_reads|task_comment_reactions|tasks|schedule_events|files):[^:]+$'
        and m.project_id = split_part(p_topic, ':', 2)
        and m.user_id = auth.uid()
    );
$$;
revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;

drop policy if exists project_members_receive_presence on realtime.messages;
drop policy if exists project_members_receive_project_realtime on realtime.messages;
drop policy if exists project_members_track_presence on realtime.messages;

create policy project_members_receive_project_realtime
on realtime.messages
for select
to authenticated
using (
  public.can_access_project_realtime_topic(realtime.topic())
);

create policy project_members_track_presence
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and public.can_access_project_realtime_topic(realtime.topic())
);

commit;

-- 일정에 기간(종료일) 지정 기능 추가 — null이면 기존처럼 하루짜리 일정.
begin;
alter table public.schedule_events add column if not exists end_date date;
do $$ begin
  alter table public.schedule_events
    add constraint schedule_events_end_date_after_start check (end_date is null or end_date >= date);
exception when duplicate_object then null;
end $$;
commit;
