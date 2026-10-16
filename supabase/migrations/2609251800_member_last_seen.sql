-- 팀원의 마지막 접속 시각(members.last_seen_at). 온라인 여부는 Realtime Presence가, 오프라인 팀원의
-- "마지막 접속"은 이 값이 알려준다. 본인 행만 touch_member_presence()로 갱신한다.
--
-- 컬럼 추가와 기본값을 한 문장(add column ... default now())으로 쓰면 PostgreSQL이 이미 있는 행을 모두
-- 실행 시각으로 채워, 오래 안 들어온 팀원도 "마지막 접속: 방금"으로 보인다. 기존 행은 비워 두고(접속 기록 없음)
-- 새로 합류하는 팀원부터 기본값을 쓴다.
begin;
set local lock_timeout = '5s'; -- 앱이 members를 쓰는 중이면 오래 기다리지 않는다(시간 초과 시 잠시 뒤 다시 실행)
alter table public.members add column if not exists last_seen_at timestamptz;
alter table public.members alter column last_seen_at set default now();
commit;

-- 본인 멤버 행의 마지막 접속 시각만 갱신(다른 사람 id를 넘기면 아무것도 바뀌지 않음)
create or replace function public.touch_member_presence(p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.members
  set last_seen_at = now()
  where id = p_member_id and user_id = auth.uid();
end;
$$;

revoke all on function public.touch_member_presence(uuid) from public, anon;
grant execute on function public.touch_member_presence(uuid) to authenticated;
