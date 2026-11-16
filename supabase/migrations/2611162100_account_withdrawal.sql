-- ===== 계정 탈퇴·복구: 탈퇴를 신청해도 14일 동안은 계정 정보를 그대로 보관하고, 그 안에 복구를 신청할 수 있다 =====
-- 탈퇴 신청된 계정은 로그인할 수 없다(서버가 막는다). 14일이 지난 계정은 운영자가 "탈퇴 승인"을 눌러야 정보가 지워진다.
-- 참여한 프로젝트가 있으면 탈퇴를 신청할 수 없고, 운영자 계정은 탈퇴할 수 없다(운영자가 없어지는 일을 막는다).
-- 행이 있으면 "탈퇴 신청 상태"다. recovery_requested_at이 있으면 복구 신청 목록, 없으면 탈퇴 신청 목록에 보인다.
create table if not exists public.account_withdrawals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  reason text not null default '' check (char_length(reason) <= 500),
  requested_at timestamptz not null default now(),
  recovery_requested_at timestamptz,
  recovery_rejected_at timestamptz
);

alter table public.account_withdrawals enable row level security;
revoke all on table public.account_withdrawals from anon, authenticated;
grant select on table public.account_withdrawals to authenticated;
drop policy if exists account_withdrawals_select on public.account_withdrawals;
create policy account_withdrawals_select on public.account_withdrawals for select to authenticated using (public.is_operator());

-- 본인이 탈퇴 신청(아이디·비밀번호 재입력은 서버가 확인한 뒤 부른다).
create or replace function public.withdraw_my_account(p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  shown text;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  if exists (select 1 from public.account_withdrawals where user_id = uid) then raise exception '이미 탈퇴 신청된 계정입니다.'; end if;
  if public.is_operator() then raise exception '운영자 계정은 탈퇴할 수 없습니다.'; end if;
  if exists (select 1 from public.members where user_id = uid) then raise exception '참여 중인 프로젝트가 있어 탈퇴할 수 없습니다.'; end if;
  if char_length(coalesce(p_reason, '')) > 500 then raise exception '탈퇴 사유는 500자까지 입력할 수 있습니다.'; end if;
  select email into mail from auth.users where id = uid;
  select display_name into shown from public.profiles where id = uid;
  insert into public.account_withdrawals(user_id, email, display_name, reason)
  values (uid, coalesce(mail, ''), coalesce(shown, ''), btrim(coalesce(p_reason, '')));
end $$;
revoke all on function public.withdraw_my_account(text) from public, anon;
grant execute on function public.withdraw_my_account(text) to authenticated;

-- 탈퇴한 본인의 복구 신청. 로그인할 수 없는 상태라 서버가 비밀번호를 확인한 뒤 서버 권한으로만 부른다(사용자 권한에는 열지 않는다).
create or replace function public.request_account_recovery(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w public.account_withdrawals;
begin
  select * into w from public.account_withdrawals where user_id = p_user_id for update;
  if not found then raise exception '탈퇴 신청된 계정이 아닙니다.'; end if;
  if w.recovery_requested_at is not null then raise exception '이미 복구를 신청했어요. 운영자 확인을 기다려 주세요.'; end if;
  if w.recovery_rejected_at is not null then raise exception '복구 신청이 거절된 계정입니다.'; end if;
  if w.requested_at + interval '14 days' <= now() then raise exception '복구 신청 기간(탈퇴 신청 후 14일)이 지났습니다.'; end if;
  update public.account_withdrawals set recovery_requested_at = now() where user_id = p_user_id;
end $$;
revoke all on function public.request_account_recovery(uuid) from public, anon, authenticated;

-- 운영자: 탈퇴 승인 = 계정 정보 삭제. 14일이 지나야 하고, 복구 신청이 접수된 계정은 먼저 그 신청을 처리해야 한다.
create or replace function public.approve_account_withdrawal(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w public.account_withdrawals;
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 탈퇴를 승인할 수 있습니다.'; end if;
  select * into w from public.account_withdrawals where user_id = p_user_id for update;
  if not found then raise exception '탈퇴 신청을 찾을 수 없습니다.'; end if;
  if w.recovery_requested_at is not null then raise exception '복구 신청이 접수된 계정입니다. 복구 신청을 먼저 처리해 주세요.'; end if;
  if w.requested_at + interval '14 days' > now() then raise exception '탈퇴 신청 후 14일이 지나야 승인할 수 있습니다.'; end if;
  if exists (select 1 from public.members where user_id = p_user_id) then raise exception '참여 중인 프로젝트가 있는 계정은 삭제할 수 없습니다.'; end if;
  delete from auth.users where id = p_user_id; -- 프로필·알림·로그인 정보 등 계정에 딸린 정보가 함께 지워진다
end $$;
revoke all on function public.approve_account_withdrawal(uuid) from public, anon;
grant execute on function public.approve_account_withdrawal(uuid) to authenticated;

-- 운영자: 복구 승인 = 탈퇴 신청을 없던 일로(다시 로그인할 수 있다).
create or replace function public.approve_account_recovery(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 복구를 승인할 수 있습니다.'; end if;
  if not exists (select 1 from public.account_withdrawals where user_id = p_user_id and recovery_requested_at is not null) then
    raise exception '복구 신청을 찾을 수 없습니다.';
  end if;
  delete from public.account_withdrawals where user_id = p_user_id;
end $$;
revoke all on function public.approve_account_recovery(uuid) from public, anon;
grant execute on function public.approve_account_recovery(uuid) to authenticated;

-- 운영자: 복구 거절 = 탈퇴 신청 목록으로 되돌린다(같은 계정은 다시 복구를 신청할 수 없다).
create or replace function public.reject_account_recovery(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 복구 신청을 거절할 수 있습니다.'; end if;
  update public.account_withdrawals set recovery_requested_at = null, recovery_rejected_at = now()
  where user_id = p_user_id and recovery_requested_at is not null;
  if not found then raise exception '복구 신청을 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.reject_account_recovery(uuid) from public, anon;
grant execute on function public.reject_account_recovery(uuid) to authenticated;
