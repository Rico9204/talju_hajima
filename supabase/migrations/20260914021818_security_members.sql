-- members 테이블 보안 취약점 3건 수정
--
-- 1. INSERT 시 is_leader: true 삽입 가능
--    → set_member_user_id 트리거에서 is_leader도 강제
-- 2. UPDATE로 is_leader 직접 조작 가능
--    → BEFORE UPDATE 트리거로 차단, transfer_leadership만 허용
-- 3. 팀원이 다른 팀원을 삭제 가능
--    → members_delete 정책을 팀장 전용으로 변경
--
-- ⚠️  Fix 2에서 BEFORE UPDATE 트리거를 추가하면, 기존에 Supabase SQL 에디터에
--    서 직접 적용한 transfer_leadership 함수가 is_leader를 UPDATE하려 할 때
--    트리거에 막힙니다. 아래에서 transfer_leadership을 재정의하므로, 이 스크
--    립트를 한 번에 통째로 실행하세요.

-- ─────────────────────────────────────────
-- Fix 1: INSERT 시 is_leader 강제
-- ─────────────────────────────────────────
-- 해당 프로젝트에 이미 리더가 있으면 is_leader를 false로 덮어씀.
-- createProject(첫 번째 멤버, 리더 없음) → is_leader: true 그대로 통과
-- joinProject(기존 리더 있음) → 클라이언트가 true를 보내도 false로 교정
create or replace function public.set_member_user_id()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  if new.is_leader and exists (
    select 1 from members where project_id = new.project_id and is_leader
  ) then
    new.is_leader := false;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────
-- Fix 2a: is_leader 직접 UPDATE 차단 트리거
-- ─────────────────────────────────────────
-- transfer_leadership RPC(SECURITY DEFINER)가 트랜잭션 내에서
-- set_config('app.allow_leader_change', 'true', true) 를 호출하면 통과.
-- 그 외의 경로(직접 API 호출 등)는 예외로 막음.
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

-- ─────────────────────────────────────────
-- Fix 2b: transfer_leadership 재정의
-- ─────────────────────────────────────────
-- 기존 함수와 로직은 동일하되, set_config 플래그를 추가해
-- 위 트리거를 트랜잭션 범위 내에서만 우회합니다.
create or replace function public.transfer_leadership(p_project_id text, p_target_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_target_id uuid;
begin
  -- 서버에서 호출자가 현재 팀장인지 검증
  select id into v_caller_id
    from members
    where project_id = p_project_id
      and user_id = auth.uid()
      and is_leader;
  if v_caller_id is null then
    raise exception '팀장만 권한을 이전할 수 있습니다';
  end if;

  -- 대상 멤버 존재 확인 (자기 자신이나 이미 팀장인 경우 제외)
  select id into v_target_id
    from members
    where project_id = p_project_id
      and name = p_target_name
      and not is_leader;
  if v_target_id is null then
    raise exception '대상 멤버를 찾을 수 없거나 이미 팀장입니다';
  end if;

  -- 이 트랜잭션 내에서만 is_leader 변경을 허용
  perform set_config('app.allow_leader_change', 'true', true);

  -- 기존 팀장 → 팀원, 대상 → 팀장 (단일 트랜잭션 원자적 처리)
  update members set is_leader = false where id = v_caller_id;
  update members set is_leader = true  where id = v_target_id;
end;
$$;

-- ─────────────────────────────────────────
-- Fix 3: members DELETE 정책 → 팀장 전용
-- ─────────────────────────────────────────
drop policy if exists members_delete on members;
create policy members_delete on members for delete
  using (is_project_leader(project_id));
