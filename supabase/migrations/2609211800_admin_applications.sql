-- 관리자 가입 신청과 운영자 승인.
-- 관리자(교수·교원 등)는 증명서 PDF와 함께 신청하고, 운영자가 직접 확인해 승인해야 관리자가 된다.
-- 가입 정보(메타데이터)로는 어떤 권한도 얻을 수 없고, 승격은 review_admin_application() 하나로만 일어난다.
-- 운영자(is_operator) 지정은 DB 소유자가 SQL Editor에서만 한다. 예:
--   update public.profiles set is_operator = true, is_admin = true where id = '<운영자 계정 UUID>';
begin;

-- 1) 운영자 역할
alter table public.profiles add column if not exists is_operator boolean not null default false;

create or replace function public.is_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_operator from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.is_operator() from public, anon;
grant execute on function public.is_operator() to authenticated;

-- 앱(authenticated/anon)에서는 is_admin, is_operator를 바꿀 수 없다. SECURITY DEFINER 함수와 SQL Editor는 통과한다.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.is_operator := false;
    else
      if new.is_admin is distinct from old.is_admin then
        raise exception '관리자 권한은 운영자만 변경할 수 있습니다.';
      end if;
      if new.is_operator is distinct from old.is_operator then
        raise exception '운영자 권한은 DB 관리자만 변경할 수 있습니다.';
      end if;
    end if;
  end if;
  return new;
end $$;

-- 2) 신청서와 처리 기록
create table if not exists public.admin_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  applicant_type text not null default 'faculty' check (applicant_type in ('faculty')),
  org text not null check (char_length(btrim(org)) between 1 and 100),
  job_title text not null check (char_length(btrim(job_title)) between 1 and 60),
  contact text not null check (char_length(btrim(contact)) between 3 and 60),
  doc_type text not null check (doc_type in ('employment', 'faculty_id', 'appointment', 'other')),
  -- 처리 후 원본 PDF를 지우면 null이 된다(기록에는 "확인함"만 남는다).
  doc_path text,
  doc_name text not null check (char_length(btrim(doc_name)) between 1 and 200),
  doc_size bigint not null check (doc_size between 1 and 10485760),
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  doc_deleted_at timestamptz
);
create unique index if not exists admin_applications_one_pending on public.admin_applications (user_id) where status = 'pending';
create unique index if not exists admin_applications_doc_path_unique on public.admin_applications (doc_path) where doc_path is not null;
create index if not exists admin_applications_status_idx on public.admin_applications (status, submitted_at);

alter table public.admin_applications enable row level security;
revoke all on table public.admin_applications from anon, authenticated;
grant select on table public.admin_applications to authenticated;
drop policy if exists admin_applications_select on public.admin_applications;
create policy admin_applications_select on public.admin_applications for select to authenticated
  using (user_id = auth.uid() or public.is_operator());

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('application_approved', 'application_rejected', 'admin_revoked')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
grant select on table public.admin_audit_log to authenticated;
drop policy if exists admin_audit_log_select on public.admin_audit_log;
create policy admin_audit_log_select on public.admin_audit_log for select to authenticated using (public.is_operator());

-- 3) 증명서 PDF 저장소(비공개). 본인 폴더에만 올리고, 조회는 본인과 운영자만 한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admin-verification', 'admin-verification', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- 정책 안에서 storage.objects를 다시 조회하면 "정책 무한 재귀" 오류가 나므로, RLS를 우회하는 함수로 개수를 센다.
create or replace function public.admin_verification_file_count(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from storage.objects o
  where o.bucket_id = 'admin-verification' and (storage.foldername(o.name))[1] = p_user_id::text
$$;
revoke all on function public.admin_verification_file_count(uuid) from public, anon;
grant execute on function public.admin_verification_file_count(uuid) to authenticated;

drop policy if exists admin_verification_insert on storage.objects;
drop policy if exists admin_verification_select on storage.objects;
drop policy if exists admin_verification_delete_own on storage.objects;
drop policy if exists admin_verification_delete_operator on storage.objects;
create policy admin_verification_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'admin-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')
  and not public.is_admin()
  and public.admin_verification_file_count(auth.uid()) < 5
);
create policy admin_verification_select on storage.objects for select to authenticated using (
  bucket_id = 'admin-verification'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_operator())
);
-- 신청서에 연결되지 않은 내 파일(업로드 실패 후 정리 등)만 지울 수 있다.
create policy admin_verification_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'admin-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (select 1 from public.admin_applications a where a.doc_path = objects.name)
);
-- 운영자는 처리가 끝난 신청의 증명서만 지울 수 있다(검토 중인 자료는 지울 수 없다).
create policy admin_verification_delete_operator on storage.objects for delete to authenticated using (
  bucket_id = 'admin-verification'
  and public.is_operator()
  and exists (select 1 from public.admin_applications a where a.doc_path = objects.name and a.status <> 'pending')
);

-- 4) 신청 제출: 파일이 실제로 저장소에 있는지, PDF인지, 크기가 맞는지 서버에서 확인한다.
create or replace function public.submit_admin_application(
  p_org text, p_job_title text, p_contact text, p_doc_type text, p_doc_path text, p_doc_name text, p_consent boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org text := btrim(coalesce(p_org, ''));
  v_title text := btrim(coalesce(p_job_title, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_name text := btrim(coalesce(p_doc_name, ''));
  v_size bigint;
  v_mime text;
  v_id uuid;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin_application:' || uid::text, 0));
  if public.is_admin() then raise exception '이미 관리자 계정입니다.'; end if;
  if p_consent is not true then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  if char_length(v_org) not between 1 and 100 then raise exception '소속을 1~100자로 입력해 주세요.'; end if;
  if char_length(v_title) not between 1 and 60 then raise exception '직위를 1~60자로 입력해 주세요.'; end if;
  if char_length(v_contact) not between 3 and 60 then raise exception '연락처를 입력해 주세요.'; end if;
  if char_length(v_name) not between 1 and 200 then raise exception '파일 이름이 올바르지 않습니다.'; end if;
  if p_doc_type is null or p_doc_type not in ('employment', 'faculty_id', 'appointment', 'other') then
    raise exception '증명서 종류를 선택해 주세요.';
  end if;
  if p_doc_path is null or p_doc_path !~ ('^' || uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$') then
    raise exception '업로드 경로가 올바르지 않습니다.';
  end if;
  select (metadata->>'size')::bigint, coalesce(metadata->>'mimetype', 'application/octet-stream')
    into v_size, v_mime from storage.objects where bucket_id = 'admin-verification' and name = p_doc_path;
  if not found then raise exception '업로드한 증명서를 확인할 수 없습니다.'; end if;
  if v_mime is distinct from 'application/pdf' then raise exception 'PDF 파일만 제출할 수 있습니다.'; end if;
  if v_size is null or v_size < 1 or v_size > 10485760 then raise exception '증명서는 10MB 이하의 PDF여야 합니다.'; end if;
  if exists (select 1 from public.admin_applications where user_id = uid and status = 'pending') then
    raise exception '이미 검토 중인 신청이 있습니다.';
  end if;
  if exists (select 1 from public.admin_applications
             where user_id = uid and status = 'rejected' and reviewed_at > now() - interval '24 hours') then
    raise exception '반려된 뒤 24시간이 지나야 다시 신청할 수 있습니다.';
  end if;
  insert into public.admin_applications(user_id, org, job_title, contact, doc_type, doc_path, doc_name, doc_size, consent_at)
    values (uid, v_org, v_title, v_contact, p_doc_type, p_doc_path, v_name, v_size, now())
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_admin_application(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.submit_admin_application(text, text, text, text, text, text, boolean) to authenticated;

-- 5) 승인·반려: 운영자만. 승인하면 그때 관리자가 된다.
create or replace function public.review_admin_application(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.admin_applications;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 신청을 처리할 수 있습니다.'; end if;
  if p_approve is null then raise exception '승인 또는 반려를 선택해 주세요.'; end if;
  select * into a from public.admin_applications where id = p_id for update;
  if not found then raise exception '신청을 찾을 수 없습니다.'; end if;
  if a.user_id = auth.uid() then raise exception '본인 신청은 처리할 수 없습니다.'; end if;
  if a.status <> 'pending' then raise exception '이미 처리된 신청입니다.'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception '사유는 500자 이하로 입력해 주세요.'; end if;
  if not p_approve and v_note is null then raise exception '반려 사유를 입력해 주세요.'; end if;

  update public.admin_applications
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
    where id = a.id;
  if p_approve then
    update public.profiles set is_admin = true, org = a.org where id = a.user_id;
    if not found then raise exception '신청자의 프로필을 찾을 수 없습니다.'; end if;
  end if;
  insert into public.admin_audit_log(actor_id, target_id, action, note)
    values (auth.uid(), a.user_id, case when p_approve then 'application_approved' else 'application_rejected' end, v_note);
end $$;
revoke all on function public.review_admin_application(uuid, boolean, text) from public, anon;
grant execute on function public.review_admin_application(uuid, boolean, text) to authenticated;

-- 6) 처리 끝난 증명서 삭제 확인: 실제 파일은 앱이 Storage API로 지우고, 지워진 뒤에 이 함수로 기록한다.
create or replace function public.mark_admin_document_deleted(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.admin_applications;
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 처리할 수 있습니다.'; end if;
  select * into a from public.admin_applications where id = p_id for update;
  if not found then raise exception '신청을 찾을 수 없습니다.'; end if;
  if a.status = 'pending' then raise exception '검토 중인 신청의 증명서는 삭제할 수 없습니다.'; end if;
  if a.doc_path is null then return; end if;
  if exists (select 1 from storage.objects where bucket_id = 'admin-verification' and name = a.doc_path) then
    raise exception '증명서 파일이 아직 삭제되지 않았습니다.';
  end if;
  update public.admin_applications set doc_path = null, doc_deleted_at = now() where id = a.id;
end $$;
revoke all on function public.mark_admin_document_deleted(uuid) from public, anon;
grant execute on function public.mark_admin_document_deleted(uuid) to authenticated;

-- 7) 운영자용 조회
create or replace function public.list_admin_applications(p_status text default null)
returns table (
  id uuid, user_id uuid, display_name text, email text, email_confirmed boolean, org text, job_title text, contact text,
  doc_type text, doc_name text, doc_size bigint, doc_path text, doc_deleted_at timestamptz, status text,
  submitted_at timestamptz, reviewed_at timestamptz, review_note text, reviewed_by_name text
) language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 조회할 수 있습니다.'; end if;
  return query
    select a.id, a.user_id, p.display_name, coalesce(p.email, u.email::text), (u.email_confirmed_at is not null),
           a.org, a.job_title, a.contact, a.doc_type, a.doc_name, a.doc_size, a.doc_path, a.doc_deleted_at, a.status,
           a.submitted_at, a.reviewed_at, a.review_note, rp.display_name
      from public.admin_applications a
      left join public.profiles p on p.id = a.user_id
      left join auth.users u on u.id = a.user_id
      left join public.profiles rp on rp.id = a.reviewed_by
     where p_status is null or a.status = p_status
     order by (a.status = 'pending') desc, coalesce(a.reviewed_at, a.submitted_at) desc;
end $$;
revoke all on function public.list_admin_applications(text) from public, anon;
grant execute on function public.list_admin_applications(text) to authenticated;

create or replace function public.list_admins()
returns table (user_id uuid, display_name text, email text, org text, is_operator boolean, pending_projects integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 조회할 수 있습니다.'; end if;
  return query
    select p.id, p.display_name, p.email, p.org, p.is_operator,
           (select count(*)::integer from public.projects pr where pr.requested_admin_id = p.id and pr.approval_status = 'pending')
      from public.profiles p
     where p.is_admin
     order by p.is_operator desc, p.display_name;
end $$;
revoke all on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;

-- 8) 관리자 해제: 운영자만. 승인 대기 프로젝트를 맡은 관리자는 해제할 수 없다(처리할 사람이 없어지므로).
create or replace function public.revoke_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 관리자를 해제할 수 있습니다.'; end if;
  if p_user_id = auth.uid() then raise exception '본인의 권한은 해제할 수 없습니다.'; end if;
  select * into t from public.profiles where id = p_user_id for update;
  if not found or not t.is_admin then raise exception '관리자 계정이 아닙니다.'; end if;
  if t.is_operator then raise exception '운영자는 앱에서 해제할 수 없습니다.'; end if;
  if exists (select 1 from public.projects where requested_admin_id = p_user_id and approval_status = 'pending') then
    raise exception '승인 대기 중인 프로젝트가 있는 관리자는 해제할 수 없습니다. 먼저 처리해 주세요.';
  end if;
  update public.profiles set is_admin = false where id = p_user_id;
  insert into public.admin_audit_log(actor_id, target_id, action) values (auth.uid(), p_user_id, 'admin_revoked');
end $$;
revoke all on function public.revoke_admin(uuid) from public, anon;
grant execute on function public.revoke_admin(uuid) to authenticated;

commit;
