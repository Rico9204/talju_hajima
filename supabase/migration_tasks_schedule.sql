-- 이미 배포된 DB에 적용하는 마이그레이션 (요약: 개인/팀 일정 + 과제 상세
-- 기능 — 담당자 다중화, 체크리스트, 댓글, 일정 연동). migration_auth.sql이
-- 먼저 적용되어 있어야 함 (is_project_member/is_project_leader 재사용).
-- 새 프로젝트는 이 파일 대신 schema.sql만 실행하면 됨 (이미 다 포함됨).

create table if not exists schedule_events (
  id bigint generated always as identity primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  date date not null,
  type text not null check (type in ('deadline', 'meeting', 'presentation', 'other')),
  scope text not null check (scope in ('personal', 'team')),
  owner_member_id uuid references members(id) on delete cascade,
  visibility text check (visibility in ('private', 'shared')),
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

alter table tasks add column if not exists team_schedule_event_id bigint references schedule_events(id) on delete set null;
alter table tasks add column if not exists personal_schedule_event_id bigint references schedule_events(id) on delete set null;

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

alter table task_assignees enable row level security;
alter table task_checklist_items enable row level security;
alter table task_comments enable row level security;
alter table schedule_events enable row level security;

drop policy if exists tasks_all on tasks;
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tasks_delete on tasks;
create policy tasks_select on tasks for select using (is_project_member(project_id));
create policy tasks_insert on tasks for insert with check (is_project_leader(project_id));
create policy tasks_update on tasks for update using (is_project_leader(project_id) or is_task_assignee(id));
create policy tasks_delete on tasks for delete using (is_project_leader(project_id));

drop policy if exists task_assignees_select on task_assignees;
drop policy if exists task_assignees_write on task_assignees;
create policy task_assignees_select on task_assignees for select using (is_task_project_member(task_id));
create policy task_assignees_write on task_assignees for all
  using (is_task_project_leader(task_id)) with check (is_task_project_leader(task_id));

drop policy if exists task_checklist_items_select on task_checklist_items;
drop policy if exists task_checklist_items_write on task_checklist_items;
create policy task_checklist_items_select on task_checklist_items for select using (is_task_project_member(task_id));
create policy task_checklist_items_write on task_checklist_items for all
  using (is_task_assignee(task_id)) with check (is_task_assignee(task_id));

drop policy if exists task_comments_select on task_comments;
drop policy if exists task_comments_insert on task_comments;
create policy task_comments_select on task_comments for select using (is_task_project_member(task_id));
create policy task_comments_insert on task_comments for insert with check (is_task_project_member(task_id));

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
