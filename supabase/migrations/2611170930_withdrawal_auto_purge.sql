-- ===== 계정 탈퇴: 유예 기간(14일)이 지나면 자동 삭제, 운영자 승인은 바로 삭제 =====
-- 탈퇴 신청 목록에는 유예 기간 안의 계정만 보인다. 유예 기간이 지난 계정은 서버가 주기적으로(서버 시작 때와 1시간마다) 자동으로 지운다.
-- 운영자가 "탈퇴 승인"을 누르면 유예 기간 안이어도 바로 삭제한다. 복구 신청이 접수된 계정은 운영자가 그 신청을 처리하기 전에는 지우지 않는다.

-- 유예 기간이 지나 자동 삭제할 계정(복구 신청이 접수됐거나 참여한 프로젝트가 있는 계정은 제외). 서버 권한 전용.
create or replace function public.expired_withdrawal_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(w.user_id), '{}'::uuid[])
  from public.account_withdrawals w
  where w.requested_at + interval '14 days' <= now()
    and w.recovery_requested_at is null
    and not exists (select 1 from public.members m where m.user_id = w.user_id)
$$;
revoke all on function public.expired_withdrawal_ids() from public, anon, authenticated;

-- 위 계정을 지우고 지운 계정 번호를 돌려준다(프로필·로그인 정보 등 계정에 딸린 정보가 함께 지워진다). 서버 권한 전용.
create or replace function public.purge_expired_withdrawals()
returns uuid[] language plpgsql security definer set search_path = public as $$
declare ids uuid[] := public.expired_withdrawal_ids();
begin
  if cardinality(ids) > 0 then delete from auth.users where id = any (ids); end if;
  return ids;
end $$;
revoke all on function public.purge_expired_withdrawals() from public, anon, authenticated;

-- 운영자: 탈퇴 승인 = 바로 삭제. (예전에는 14일이 지나야 했지만, 이제 유예 기간 안에도 승인할 수 있다.)
create or replace function public.approve_account_withdrawal(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w public.account_withdrawals;
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 탈퇴를 승인할 수 있습니다.'; end if;
  select * into w from public.account_withdrawals where user_id = p_user_id for update;
  if not found then raise exception '탈퇴 신청을 찾을 수 없습니다.'; end if;
  if w.recovery_requested_at is not null then raise exception '복구 신청이 접수된 계정입니다. 복구 신청을 먼저 처리해 주세요.'; end if;
  if exists (select 1 from public.members where user_id = p_user_id) then raise exception '참여 중인 프로젝트가 있는 계정은 삭제할 수 없습니다.'; end if;
  delete from auth.users where id = p_user_id; -- 프로필·알림·로그인 정보 등 계정에 딸린 정보가 함께 지워진다
end $$;
revoke all on function public.approve_account_withdrawal(uuid) from public, anon;
grant execute on function public.approve_account_withdrawal(uuid) to authenticated;
