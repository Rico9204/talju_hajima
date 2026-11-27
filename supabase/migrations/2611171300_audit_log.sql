-- ===== 접속 감사: 사용자별 접속(IP·처음~마지막 시각)과 업로드·삭제 활동 기록 =====
-- 기록은 서버만 쓴다(앱 계정에는 쓰기 권한이 없어 수정·삭제할 수 없다). 읽기는 운영자만(운영자 창의 "접속 감사").
-- 계정이 삭제돼도(탈퇴 승인·자동 삭제) 기록은 보관 기간(1년) 동안 남아야 하므로 user_id에 외래키를 걸지 않고, 그때의 이메일·이름을 함께 적어 둔다.
-- 1년이 지난 기록은 서버가 하루에 한 번 purge_audit_log()로 지운다.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null,
  user_email text not null default '',
  user_name text not null default '',
  ip text not null default '' check (char_length(ip) <= 64),
  kind text not null check (kind in ('login', 'refresh', 'upload', 'delete')),
  target_type text,  -- workspace_file, workspace_folder, project, member, task, schedule_event, board_post, board_comment, announcement, profile_image, board_attachment, admin_document
  target_id text,
  target_name text,
  project_id text,
  project_name text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_user_ip_idx on public.audit_log (user_id, ip, at desc);
create index if not exists audit_log_at_idx on public.audit_log (at);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_operator());

-- 보관 기간(1년)이 지난 기록 삭제. 지운 개수를 돌려준다. 서버 권한 전용.
create or replace function public.purge_audit_log()
returns bigint language plpgsql security definer set search_path = public as $$
declare removed bigint;
begin
  delete from public.audit_log where at < now() - interval '1 year';
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.purge_audit_log() from public, anon, authenticated;
