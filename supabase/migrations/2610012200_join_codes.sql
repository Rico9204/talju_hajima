-- ===== 프로젝트 참여 코드: 6시간마다 바뀌고, 유효한 코드로만 참여 =====
-- (feat/rotating-join-code의 기능을 옮기며 강화) 예전에는 프로젝트 id만 알면 누구나 팀원으로 참여할 수 있었다
-- (members 추가 규칙이 "로그인했는지"만 확인, 프로젝트 목록은 모든 사용자가 읽음).
-- 이제 참여는 join_project_with_code()로만 하고, 코드는 팀원만 볼 수 있는 별도 표에 둔다.

-- 코드는 projects와 따로 둔다: projects는 모든 로그인 사용자가 읽으므로 칸으로 두면 코드가 그대로 보인다.
create table if not exists public.project_join_codes (
  project_id text primary key references public.projects(id) on delete cascade,
  code text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create unique index if not exists project_join_codes_code_idx on public.project_join_codes (lower(code));
alter table public.project_join_codes enable row level security;
-- 읽기·쓰기 모두 아래 함수로만(정책 없음).
revoke all on public.project_join_codes from public, anon, authenticated;

-- 코드: 프로젝트 이름 앞부분(최대 12자, 알아보기 쉽게) + 임의 6자(헷갈리는 0/O/1/I 제외 32자).
-- 임의 부분은 gen_random_uuid()의 난수 바이트에서 뽑는다(random()은 예측 가능). 32는 256의 약수라 치우침 없음.
create or replace function public.new_project_join_code(p_name text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  slug text := regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^a-z0-9가-힣]+', '-', 'g');
  bytes bytea;
  random_part text;
  candidate text;
begin
  slug := left(regexp_replace(slug, '(^-+|-+$)', '', 'g'), 12);
  slug := regexp_replace(slug, '-+$', '');
  if slug = '' then slug := 'project'; end if;
  loop
    bytes := uuid_send(gen_random_uuid());
    random_part := '';
    for i in 0..5 loop -- 0~5번째 바이트는 버전 비트가 없는 순수 난수
      random_part := random_part || substr(chars, get_byte(bytes, i) % 32 + 1, 1);
    end loop;
    candidate := slug || '-' || random_part;
    exit when not exists (select 1 from public.project_join_codes where lower(code) = lower(candidate));
  end loop;
  return candidate;
end $$;
revoke all on function public.new_project_join_code(text) from public, anon, authenticated;

-- 새 코드로 바꾸고(없으면 만들고) 돌려준다. 권한 검사는 부르는 함수가 한다.
create or replace function public.reset_project_join_code(p_project_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare row public.project_join_codes;
begin
  insert into public.project_join_codes(project_id, code, generated_at, expires_at)
  select p.id, public.new_project_join_code(p.name), now(), now() + interval '6 hours' from public.projects p where p.id = p_project_id
  on conflict (project_id) do update set code = excluded.code, generated_at = excluded.generated_at, expires_at = excluded.expires_at
  returning * into row;
  if row.project_id is null then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  return jsonb_build_object('joinCode', row.code, 'joinCodeExpiresAt', row.expires_at);
end $$;
revoke all on function public.reset_project_join_code(text) from public, anon, authenticated;

-- 팀원(또는 관리자)이 지금 쓸 수 있는 코드를 본다. 6시간이 지났으면 이때 새로 만든다.
create or replace function public.get_or_rotate_join_code(p_project_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare row public.project_join_codes;
begin
  if not (exists (select 1 from public.members m where m.project_id = p_project_id and m.user_id = auth.uid()) or public.is_admin()) then
    raise exception '프로젝트 참여자만 참여 코드를 확인할 수 있습니다.' using errcode = '42501';
  end if;
  select * into row from public.project_join_codes where project_id = p_project_id for update;
  if row.project_id is null or row.expires_at <= now() then
    return public.reset_project_join_code(p_project_id);
  end if;
  return jsonb_build_object('joinCode', row.code, 'joinCodeExpiresAt', row.expires_at);
end $$;
revoke all on function public.get_or_rotate_join_code(text) from public, anon;
grant execute on function public.get_or_rotate_join_code(text) to authenticated;

-- 팀장·부팀장(또는 관리자)이 지금 바로 새 코드로 바꾼다(이전 코드는 즉시 무효).
create or replace function public.rotate_project_join_code(p_project_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not (public.is_project_manager(p_project_id) or public.is_admin()) then
    raise exception '팀장 또는 부팀장만 참여 코드를 갱신할 수 있습니다.' using errcode = '42501';
  end if;
  return public.reset_project_join_code(p_project_id);
end $$;
revoke all on function public.rotate_project_join_code(text) from public, anon;
grant execute on function public.rotate_project_join_code(text) to authenticated;

-- 유효한 코드의 프로젝트 정보(참여 전 확인 화면용). 없으면 null, 만료됐으면 안내 오류. 프로젝트 id로는 찾지 않는다.
create or replace function public.lookup_project_by_join_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.project_join_codes; p public.projects;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into c from public.project_join_codes where lower(code) = lower(btrim(coalesce(p_code, '')));
  if c.project_id is null then return null; end if;
  if c.expires_at <= now() then
    raise exception '참여 코드가 만료되었습니다(유효시간 6시간). 팀장에게 새 참여 코드를 요청하세요.';
  end if;
  select * into p from public.projects where id = c.project_id;
  return jsonb_build_object('id', p.id, 'name', p.name, 'org', p.org, 'period', p.period, 'status', p.status,
    'start_date', p.start_date, 'end_date', p.end_date, 'approval_status', p.approval_status);
end $$;
revoke all on function public.lookup_project_by_join_code(text) from public, anon;
grant execute on function public.lookup_project_by_join_code(text) to authenticated;

-- 첫 팀원(프로젝트를 만든 사람) 말고는 팀원 행을 직접 넣지 못한다 — 참여는 아래 함수로만.
create or replace function public.project_has_members(p_project_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where project_id = p_project_id)
$$;
revoke all on function public.project_has_members(text) from public, anon;
grant execute on function public.project_has_members(text) to authenticated;

drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
  with check (not public.project_has_members(project_id));

-- 코드로 참여. 이름·아바타는 내 계정 프로필에서, 색은 참여 순서로 정한다. 참여한 프로젝트 id를 돌려준다.
create or replace function public.join_project_with_code(p_code text, p_major text, p_student text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  c public.project_join_codes;
  prof public.profiles;
  member_count integer;
  colors constant text[] := array['#2563eb', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#06b6d4'];
  display text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into c from public.project_join_codes where lower(code) = lower(btrim(coalesce(p_code, ''))) for share;
  if c.project_id is null then raise exception '해당 참여 코드의 프로젝트를 찾을 수 없어요.'; end if;
  if c.expires_at <= now() then
    raise exception '참여 코드가 만료되었습니다(유효시간 6시간). 팀장에게 새 참여 코드를 요청하세요.';
  end if;
  if exists (select 1 from public.members where project_id = c.project_id and user_id = auth.uid()) then
    raise exception '이미 참여한 프로젝트입니다.';
  end if;
  select * into prof from public.profiles where id = auth.uid();
  display := coalesce(nullif(btrim(prof.display_name), ''), '사용자');
  select count(*) into member_count from public.members where project_id = c.project_id;
  insert into public.members(project_id, name, role, major, student, avatar, tasks_done, tasks_total, activities, score, eval_count,
    online, responsibilities, color, criteria_role, criteria_deadline, criteria_communication, criteria_collaboration, criteria_quality, is_leader)
  values (c.project_id, display, '팀원', coalesce(nullif(btrim(left(p_major, 100)), ''), '전공 미지정'), coalesce(nullif(btrim(left(p_student, 50)), ''), '-'),
    coalesce(nullif(btrim(prof.avatar_initial), ''), left(display, 1)), 0, 0, 0, 0, 0, true, '{}', colors[member_count % 6 + 1], 0, 0, 0, 0, 0, false);
  return c.project_id;
end $$;
revoke all on function public.join_project_with_code(text, text, text) from public, anon;
grant execute on function public.join_project_with_code(text, text, text) to authenticated;
