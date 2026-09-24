-- Harden direct client mutations. The application does not directly update
-- members: profile edits target profiles, and leader transfer goes through a
-- SECURITY DEFINER RPC that validates the caller. Removing the broad policy
-- closes the raw-API path that let any project member change another member.

drop policy if exists members_update on members;

-- Project and team metadata are shared state; only the project leader may
-- change or remove them. This matches the existing deleteProject leadership
-- check and prevents ordinary members from using the REST API directly.
drop policy if exists projects_update on projects;
create policy projects_update on projects
for update using (is_project_leader(id)) with check (is_project_leader(id));

drop policy if exists teams_update on teams;
create policy teams_update on teams
for update using (is_project_leader(project_id)) with check (is_project_leader(project_id));

drop policy if exists teams_delete on teams;
create policy teams_delete on teams
for delete using (is_project_leader(project_id));
