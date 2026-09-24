-- 이미 배포된 DB에 적용하는 마이그레이션: 프로필(사진/이름/학과/학번)을
-- 프로젝트별이 아니라 계정 단위로 통일. migration_auth.sql이 먼저
-- 적용되어 있어야 함.

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists major text;
alter table profiles add column if not exists student text;

create or replace function public.shares_project_with(target_user_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from members m1
    join members m2 on m1.project_id = m2.project_id
    where m1.user_id = auth.uid() and m2.user_id = target_user_id
  );
$$;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id or shares_project_with(id));

-- One-time backfill: carry over any avatar already uploaded under the old
-- per-project members.avatar_url so testing it before this migration isn't
-- lost.
update profiles p
set avatar_url = m.avatar_url
from members m
where m.user_id = p.id and m.avatar_url is not null and p.avatar_url is null;
