-- 2610012100_rotating_join_code.sql
-- 프로젝트 참여코드 6시간 주기 자동 갱신 및 중복 방지

alter table projects
  add column if not exists join_code text,
  add column if not exists join_code_generated_at timestamptz not null default now(),
  add column if not exists join_code_expires_at timestamptz not null default (now() + interval '6 hours');

create unique index if not exists projects_join_code_unique on projects (join_code);

-- 난수 생성 헬퍼 (대문자+숫자 조합 6자리, 읽기 편한 문자셋)
create or replace function public.generate_unique_join_code(p_name text)
returns text language plpgsql as $$
declare
  v_slug text;
  v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_random text;
  v_candidate text;
  v_i integer;
  v_len integer;
  v_exists boolean;
begin
  -- 프로젝트 이름을 슬러그화 (최대 12자)
  v_slug := regexp_replace(lower(trim(coalesce(p_name, 'project'))), '[^a-z0-9가-힣]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  if v_slug = '' then
    v_slug := 'project';
  end if;
  if length(v_slug) > 12 then
    v_slug := substring(v_slug from 1 for 12);
    v_slug := regexp_replace(v_slug, '-+$', '', 'g');
  end if;

  v_len := length(v_chars);

  loop
    v_random := '';
    for v_i in 1..6 loop
      v_random := v_random || substr(v_chars, floor(random() * v_len + 1)::integer, 1);
    end loop;
    v_candidate := v_slug || '-' || v_random;

    select exists(select 1 from public.projects where join_code = v_candidate) into v_exists;
    if not v_exists then
      return v_candidate;
    end if;
  end loop;
end;
$$;

-- 기존 projects에 join_code가 없으면 자동 부여
update public.projects
set join_code = public.generate_unique_join_code(name),
    join_code_generated_at = now(),
    join_code_expires_at = now() + interval '6 hours'
where join_code is null;

-- projects INSERT 시 join_code 자동 생성 트리거
create or replace function public.set_project_join_code_trigger()
returns trigger language plpgsql as $$
begin
  if new.join_code is null or new.join_code = '' then
    new.join_code := public.generate_unique_join_code(new.name);
  end if;
  if new.join_code_generated_at is null then
    new.join_code_generated_at := now();
  end if;
  if new.join_code_expires_at is null then
    new.join_code_expires_at := now() + interval '6 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_set_project_join_code on public.projects;
create trigger tr_set_project_join_code
before insert on public.projects
for each row execute function public.set_project_join_code_trigger();

-- 팀장·부팀장용 참여 코드 수동/강제 갱신 RPC
create or replace function public.rotate_project_join_code(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_new_code text;
  v_expires_at timestamptz;
  v_is_manager boolean;
  v_is_admin boolean;
begin
  select public.is_project_manager(p_project_id) into v_is_manager;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  ) into v_is_admin;

  if not (v_is_manager or v_is_admin) then
    raise exception '팀장 또는 부팀장만 참여 코드를 갱신할 수 있습니다.' using errcode = '42501';
  end if;

  select name into v_name from public.projects where id = p_project_id;
  if not found then
    raise exception '프로젝트를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  v_new_code := public.generate_unique_join_code(v_name);
  v_expires_at := now() + interval '6 hours';

  update public.projects
  set join_code = v_new_code,
      join_code_generated_at = now(),
      join_code_expires_at = v_expires_at
  where id = p_project_id;

  return jsonb_build_object(
    'project_id', p_project_id,
    'join_code', v_new_code,
    'join_code_expires_at', v_expires_at
  );
end;
$$;

-- 6시간 경과 시 자동 회전 및 최신 참여 코드 조회 함수
create or replace function public.get_or_rotate_join_code(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.projects%rowtype;
  v_new_code text;
  v_expires_at timestamptz;
  v_is_member boolean;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
  ) into v_is_member;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  ) into v_is_admin;

  if not (v_is_member or v_is_admin) then
    raise exception '프로젝트 참여자만 참여 코드를 확인할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_row from public.projects where id = p_project_id for update;
  if not found then
    raise exception '프로젝트를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  if v_row.join_code is null or v_row.join_code_expires_at is null or v_row.join_code_expires_at <= now() then
    v_new_code := public.generate_unique_join_code(v_row.name);
    v_expires_at := now() + interval '6 hours';

    update public.projects
    set join_code = v_new_code,
        join_code_generated_at = now(),
        join_code_expires_at = v_expires_at
    where id = p_project_id;

    return jsonb_build_object(
      'project_id', p_project_id,
      'join_code', v_new_code,
      'join_code_expires_at', v_expires_at
    );
  end if;

  return jsonb_build_object(
    'project_id', p_project_id,
    'join_code', v_row.join_code,
    'join_code_expires_at', v_row.join_code_expires_at
  );
end;
$$;

-- 참여하려는 사용자를 위한 프로젝트 조회 (참여코드 검증 & 6시간 만료 체크)
create or replace function public.lookup_project_by_join_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text := trim(coalesce(p_code, ''));
  v_row public.projects%rowtype;
begin
  if v_target = '' then
    return null;
  end if;

  -- 1) join_code 일치 검색
  select * into v_row
  from public.projects
  where join_code = v_target;

  -- 2) join_code로 못 찾은 경우 id로 fallback 검색 (하위호환)
  if not found then
    select * into v_row
    from public.projects
    where id = v_target;
  end if;

  if not found then
    return null;
  end if;

  -- 만료 체크: join_code_expires_at이 설정되어 있고 현재 시간보다 이전이면 만료 에러
  if v_row.join_code_expires_at is not null and v_row.join_code_expires_at <= now() then
    raise exception '참여 코드가 만료되었습니다 (유효시간: 6시간). 팀장에게 새 참여 코드를 요청하세요.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'org', v_row.org,
    'period', v_row.period,
    'status', v_row.status,
    'start_date', v_row.start_date,
    'end_date', v_row.end_date,
    'join_code', v_row.join_code,
    'join_code_expires_at', v_row.join_code_expires_at
  );
end;
$$;

revoke all on function public.rotate_project_join_code(text) from public;
grant execute on function public.rotate_project_join_code(text) to authenticated;

revoke all on function public.get_or_rotate_join_code(text) from public;
grant execute on function public.get_or_rotate_join_code(text) to authenticated;

revoke all on function public.lookup_project_by_join_code(text) from public;
grant execute on function public.lookup_project_by_join_code(text) to authenticated;
