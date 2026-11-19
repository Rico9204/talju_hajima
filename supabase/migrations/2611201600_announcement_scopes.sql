-- ===== 공지 나누기: 시스템 공지(운영자) / 프로젝트 공지(승인 담당 관리자), 중요도, 확인 기록 =====
-- 시스템 공지(target_all): 운영자만 보내고 모든 사용자의 메인 화면에 뜬다.
-- 프로젝트 공지: 관리자(교수 등)가 "자기가 승인 담당이고 승인한" 프로젝트에만 보내고, 그 프로젝트 안에서만 뜬다.
-- 확인했어요(announcement_reads)는 본인 것만 보이고, 확인 인원 수는 쓴 관리자와 운영자만 announcement_read_counts()로 본다.
alter table public.announcements add column if not exists priority text not null default 'normal';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_priority_check') then
    alter table public.announcements add constraint announcements_priority_check check (priority in ('normal', 'important', 'urgent'));
  end if;
end $$;
alter table public.announcements add column if not exists author_name text not null default '';

create table if not exists public.announcement_reads (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;
revoke all on table public.announcement_reads from anon, authenticated;
grant select on table public.announcement_reads to authenticated;
drop policy if exists announcement_reads_select on public.announcement_reads;
create policy announcement_reads_select on public.announcement_reads for select to authenticated using (user_id = auth.uid());

-- 볼 수 있는 공지: 운영자는 모두, 쓴 사람은 자기 공지, 그 밖에는 시스템 공지이거나 내가 참여한 프로젝트가 대상인 공지.
-- (관리자라고 남의 프로젝트 공지까지 보이지 않는다.)
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using (
  public.is_operator()
  or created_by = auth.uid()
  or target_all
  or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (announcements.project_ids))
);

drop function if exists public.create_announcement(text, text, date, date, boolean, text[]);
create or replace function public.create_announcement(
  p_title text, p_body text, p_start date, p_end date, p_target_all boolean, p_project_ids text[], p_priority text default 'normal'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  ids text[] := coalesce(p_project_ids, '{}');
  author text;
  new_id bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not (public.is_admin() or public.is_operator()) then raise exception '관리자만 공지를 보낼 수 있습니다.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then raise exception '공지 제목을 입력해 주세요.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '공지 내용을 입력해 주세요.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception '공지 기간을 올바르게 입력해 주세요.'; end if;
  if p_end - p_start > 366 then raise exception '공지 기간은 최대 1년까지 정할 수 있습니다.'; end if;
  if coalesce(p_priority, '') not in ('normal', 'important', 'urgent') then raise exception '공지 중요도를 올바르게 골라 주세요.'; end if;
  if p_target_all then
    if not public.is_operator() then raise exception '전체 사용자 공지(시스템 공지)는 운영자만 보낼 수 있습니다.'; end if;
    ids := '{}';
  else
    if not public.is_admin() then raise exception '프로젝트 공지는 관리자만 보낼 수 있습니다.'; end if;
    if cardinality(ids) = 0 then raise exception '공지 대상 프로젝트를 한 개 이상 골라 주세요.'; end if;
    if exists (select 1 from unnest(ids) x where not exists (
      select 1 from public.projects p where p.id = x and p.requested_admin_id = auth.uid() and p.approval_status = 'approved')) then
      raise exception '내가 승인한 프로젝트에만 공지를 보낼 수 있습니다.';
    end if;
    ids := array(select distinct x from unnest(ids) x);
  end if;
  select nullif(btrim(display_name), '') into author from public.profiles where id = auth.uid();
  insert into public.announcements(title, body, start_date, end_date, target_all, project_ids, created_by, priority, author_name)
  values (btrim(p_title), btrim(p_body), p_start, p_end, p_target_all, ids, auth.uid(), p_priority, coalesce(author, '관리자'))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.create_announcement(text, text, date, date, boolean, text[], text) from public, anon;
grant execute on function public.create_announcement(text, text, date, date, boolean, text[], text) to authenticated;

-- 지우기: 운영자는 모든 공지, 관리자는 자기가 쓴 공지만.
create or replace function public.delete_announcement(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_admin() or public.is_operator()) then raise exception '관리자만 공지를 지울 수 있습니다.'; end if;
  delete from public.announcements where id = p_id and (public.is_operator() or created_by = auth.uid());
  if not found then raise exception '공지를 찾을 수 없거나 지울 권한이 없습니다.'; end if;
end $$;
revoke all on function public.delete_announcement(bigint) from public, anon;
grant execute on function public.delete_announcement(bigint) to authenticated;

-- "확인했어요": 내가 받는 공지(시스템 공지이거나 내가 참여한 프로젝트 대상)에만 기록한다.
create or replace function public.mark_announcement_read(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (
    select 1 from public.announcements a
    where a.id = p_id and (a.target_all or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (a.project_ids)))
  ) then
    raise exception '공지를 찾을 수 없습니다.';
  end if;
  insert into public.announcement_reads(announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.mark_announcement_read(bigint) from public, anon;
grant execute on function public.mark_announcement_read(bigint) to authenticated;

-- 확인 인원 수(프로젝트 공지만): 대상 프로젝트 팀원 수와 그중 확인한 사람 수. 쓴 관리자와 운영자만 받는다.
create or replace function public.announcement_read_counts()
returns table(announcement_id bigint, recipients integer, reads integer)
language sql stable security definer set search_path = public as $$
  select a.id,
    (select count(distinct m.user_id)::integer from public.members m where m.project_id = any (a.project_ids) and m.user_id is not null),
    (select count(*)::integer from public.announcement_reads r where r.announcement_id = a.id
       and exists (select 1 from public.members m where m.user_id = r.user_id and m.project_id = any (a.project_ids)))
  from public.announcements a
  where not a.target_all and (a.created_by = auth.uid() or public.is_operator());
$$;
revoke all on function public.announcement_read_counts() from public, anon;
grant execute on function public.announcement_read_counts() to authenticated;
