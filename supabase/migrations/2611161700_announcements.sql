-- ===== 관리자 공지: 기간과 대상(전체 또는 고른 프로젝트)을 정해 작은 팝업으로 알린다 =====
-- 쓰기는 관리자 전용 RPC로만 한다(표 직접 쓰기 권한 없음). 읽기는 대상(전체이거나 내가 참여한 프로젝트)만 보인다.
-- "다시 보지 않기"는 사용자별로 서버에 기록해, 다른 기기·브라우저에서도 다시 뜨지 않는다.
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  start_date date not null,
  end_date date not null,
  target_all boolean not null default true,
  project_ids text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (target_all or cardinality(project_ids) > 0)
);
create index if not exists announcements_period_idx on public.announcements (end_date, start_date);

create table if not exists public.announcement_dismissals (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;
revoke all on table public.announcements from anon, authenticated;
revoke all on table public.announcement_dismissals from anon, authenticated;
grant select on table public.announcements to authenticated;
grant select on table public.announcement_dismissals to authenticated;

-- 관리자는 모든 공지를 관리하고, 그 밖의 사람은 전체 공지이거나 내가 참여한 프로젝트를 대상으로 한 공지만 본다.
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using (
  public.is_admin()
  or target_all
  or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (announcements.project_ids))
);
drop policy if exists announcement_dismissals_select on public.announcement_dismissals;
create policy announcement_dismissals_select on public.announcement_dismissals for select to authenticated using (user_id = auth.uid());

create or replace function public.create_announcement(
  p_title text, p_body text, p_start date, p_end date, p_target_all boolean, p_project_ids text[]
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  ids text[] := coalesce(p_project_ids, '{}');
  new_id bigint;
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 공지를 보낼 수 있습니다.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then raise exception '공지 제목을 입력해 주세요.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception '공지 내용을 입력해 주세요.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception '공지 기간을 올바르게 입력해 주세요.'; end if;
  if p_end - p_start > 366 then raise exception '공지 기간은 최대 1년까지 정할 수 있습니다.'; end if;
  if p_target_all then
    ids := '{}';
  else
    if cardinality(ids) = 0 then raise exception '공지 대상 프로젝트를 한 개 이상 고르거나 전체를 선택해 주세요.'; end if;
    if (select count(*) from public.projects where id = any (ids)) <> (select count(distinct x) from unnest(ids) x) then
      raise exception '존재하지 않는 프로젝트가 대상에 들어 있습니다.';
    end if;
  end if;
  insert into public.announcements(title, body, start_date, end_date, target_all, project_ids, created_by)
  values (btrim(p_title), btrim(p_body), p_start, p_end, p_target_all, ids, auth.uid())
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.create_announcement(text, text, date, date, boolean, text[]) from public, anon;
grant execute on function public.create_announcement(text, text, date, date, boolean, text[]) to authenticated;

create or replace function public.delete_announcement(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 공지를 지울 수 있습니다.'; end if;
  delete from public.announcements where id = p_id;
  if not found then raise exception '공지를 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.delete_announcement(bigint) from public, anon;
grant execute on function public.delete_announcement(bigint) to authenticated;

-- "다시 보지 않기": 내가 볼 수 있는 공지에만 기록한다(남의 공지 번호를 넣어 존재 여부를 알아내지 못하게).
create or replace function public.dismiss_announcement(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (
    select 1 from public.announcements a
    where a.id = p_id
      and (a.target_all or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (a.project_ids)))
  ) then raise exception '공지를 찾을 수 없습니다.'; end if;
  insert into public.announcement_dismissals(announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.dismiss_announcement(bigint) from public, anon;
grant execute on function public.dismiss_announcement(bigint) to authenticated;
