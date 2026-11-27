-- ===== 전체 알림: 관리자 공지(기간 동안)와 게시판 공지사항을 알림 목록에 모아 보여 주고, 읽음 표시는 사용자별로 기록 =====
-- 알림 내용은 새로 저장하지 않는다(공지·게시글을 그대로 읽는다). 이 표는 "내가 읽은 것"만 기록한다.
-- 관리자 공지는 "다시 보지 않기"(팝업 숨김)와 별개로 공지 기간 동안 알림 목록에 계속 남는다.
create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('announcement', 'board_notice')),
  ref_id bigint not null,
  read_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);

alter table public.notification_reads enable row level security;
revoke all on table public.notification_reads from anon, authenticated;
grant select on table public.notification_reads to authenticated;
drop policy if exists notification_reads_select on public.notification_reads;
create policy notification_reads_select on public.notification_reads for select to authenticated using (user_id = auth.uid());

-- 내 읽음 표시(여러 개를 한 번에). 종류 검사만 하고, 없는 번호를 넣어도 남에게 영향은 없다(내 기록일 뿐이다).
create or replace function public.mark_notifications_read(p_kinds text[], p_refs bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if coalesce(cardinality(p_kinds), 0) <> coalesce(cardinality(p_refs), 0) then raise exception '알림 목록이 올바르지 않습니다.'; end if;
  if coalesce(cardinality(p_kinds), 0) > 200 then raise exception '한 번에 200개까지 표시할 수 있습니다.'; end if;
  if exists (select 1 from unnest(p_kinds) k where k not in ('announcement', 'board_notice')) then raise exception '알림 종류가 올바르지 않습니다.'; end if;
  insert into public.notification_reads(user_id, kind, ref_id)
  select auth.uid(), k, r from unnest(p_kinds, p_refs) as t(k, r)
  on conflict do nothing;
end $$;
revoke all on function public.mark_notifications_read(text[], bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(text[], bigint[]) to authenticated;
