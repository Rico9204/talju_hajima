-- One-time migration to run against an ALREADY-deployed database that was
-- created before authentication existed (i.e. it already has projects/teams/
-- members/folders/files/file_versions/file_comments/tasks with the old
-- anon_all RLS policies). A fresh database should just use schema.sql
-- instead, which already includes all of this.
--
-- Paste this whole file into a new Supabase SQL editor query and run it once.

-- 1) profiles table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_initial text not null,
  created_at timestamptz not null default now()
);

-- 2) link members to real accounts
alter table members add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists members_project_user_unique
  on members (project_id, user_id) where user_id is not null;

-- 3) membership-check helper functions
create or replace function public.is_project_member(p_project_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from members m where m.project_id = p_project_id and m.user_id = auth.uid()
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

-- 4) enable RLS + replace policies
alter table profiles enable row level security;

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
create policy projects_delete on projects for delete using (is_project_member(id));

drop policy if exists teams_select on teams;
drop policy if exists teams_insert on teams;
drop policy if exists teams_update on teams;
drop policy if exists teams_delete on teams;
create policy teams_select on teams for select using (is_project_member(project_id));
create policy teams_insert on teams for insert with check (auth.role() = 'authenticated');
create policy teams_update on teams for update using (is_project_member(project_id));
create policy teams_delete on teams for delete using (is_project_member(project_id));

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

-- 5) auto-create a profile row on signup
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
