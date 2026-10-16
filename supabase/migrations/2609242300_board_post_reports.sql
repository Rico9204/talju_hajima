-- 게시글 신고: 로그인한 사용자가 남의 게시글을 신고하고, 관리자가 검토(처리 완료/기각)한다.
--  * 신고는 게시글당 1인 1회, 본인 글은 신고할 수 없고, 하루 20건까지.
--  * 신고 내용은 신고자 본인과 관리자만 볼 수 있다. 쓰기는 RPC로만 한다.
begin;

create table if not exists public.board_post_reports (
  id bigint generated always as identity primary key,
  -- 게시글이 삭제돼도 신고 기록은 남긴다(post_id만 비고, 제목·내용 앞부분은 신고 시점 스냅샷).
  post_id bigint references public.board_posts(id) on delete set null,
  post_title text not null default '',
  post_excerpt text not null default '',
  post_author_user_id uuid references auth.users(id) on delete set null,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'privacy', 'other')),
  detail text not null default '' check (length(detail) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_user_id)
);
create index if not exists board_post_reports_post_idx on public.board_post_reports (post_id, created_at);
create index if not exists board_post_reports_open_idx on public.board_post_reports (status, created_at);

alter table public.board_post_reports enable row level security;
revoke all on table public.board_post_reports from anon, authenticated;
grant select on table public.board_post_reports to authenticated;
drop policy if exists board_post_reports_select on public.board_post_reports;
create policy board_post_reports_select on public.board_post_reports for select to authenticated
  using (reporter_user_id = auth.uid() or public.is_admin());

create or replace function public.report_board_post(p_post_id bigint, p_reason text, p_detail text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_post public.board_posts; v_id bigint;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_post from public.board_posts where id = p_post_id;
  if not found then raise exception '게시글을 찾을 수 없습니다.'; end if;
  if v_post.author_user_id = v_uid then raise exception '본인 게시글은 신고할 수 없습니다.'; end if;
  if p_reason is null or p_reason not in ('spam', 'abuse', 'sexual', 'privacy', 'other') then
    raise exception '신고 사유를 선택해 주세요.';
  end if;
  if length(coalesce(p_detail, '')) > 500 then raise exception '상세 내용은 500자 이하로 입력해 주세요.'; end if;
  if (select count(*) from public.board_post_reports where reporter_user_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception '하루에 신고할 수 있는 횟수를 넘었습니다.';
  end if;
  begin
    insert into public.board_post_reports (post_id, post_title, post_excerpt, post_author_user_id, reporter_user_id, reason, detail)
    values (p_post_id, left(v_post.title, 200), left(v_post.content, 300), v_post.author_user_id, v_uid, p_reason, trim(coalesce(p_detail, ''))) returning id into v_id;
  exception when unique_violation then
    raise exception '이미 신고한 게시글입니다.';
  end;
  return v_id;
end $$;
revoke all on function public.report_board_post(bigint, text, text) from public, anon;
grant execute on function public.report_board_post(bigint, text, text) to authenticated;

create or replace function public.review_board_report(p_report_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception '관리자만 신고를 처리할 수 있습니다.'; end if;
  if p_status not in ('resolved', 'dismissed') then raise exception '올바르지 않은 처리 상태입니다.'; end if;
  update public.board_post_reports set status = p_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_report_id;
  if not found then raise exception '신고를 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.review_board_report(bigint, text) from public, anon;
grant execute on function public.review_board_report(bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;
