-- ===== 알림 읽음 기록 합치기: 관리자 공지의 읽음은 announcement_reads("확인했어요") 한 곳에만 =====
-- 알림 종에서 관리자 공지를 열거나 "모두 읽음"을 누르면 "확인했어요"와 같은 기록(announcement_reads)이 남는다. 그래서 확인 인원 수에도 들어간다.
-- notification_reads에는 게시판 공지사항(board_notice)의 읽음만 남긴다.

-- 예전에 notification_reads에 적힌 관리자 공지 읽음을 announcement_reads로 옮기고 지운다(지워진 공지는 버린다).
insert into public.announcement_reads(announcement_id, user_id, read_at)
select r.ref_id, r.user_id, r.read_at
from public.notification_reads r
join public.announcements a on a.id = r.ref_id
where r.kind = 'announcement'
on conflict do nothing;
delete from public.notification_reads where kind = 'announcement';

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'notification_reads_kind_check'
             and pg_get_constraintdef(oid) <> 'CHECK ((kind = ''board_notice''::text))') then
    alter table public.notification_reads drop constraint notification_reads_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_reads_kind_check') then
    alter table public.notification_reads add constraint notification_reads_kind_check check (kind = 'board_notice');
  end if;
end $$;

-- 내 읽음 표시(여러 개를 한 번에). 관리자 공지는 announcement_reads에, 게시판 공지사항은 notification_reads에 적는다.
-- 관리자 공지는 내가 받는 것(시스템 공지이거나 내가 참여한 프로젝트가 대상)만 적고, 그 밖의 번호는 조용히 건너뛴다.
create or replace function public.mark_notifications_read(p_kinds text[], p_refs bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if coalesce(cardinality(p_kinds), 0) <> coalesce(cardinality(p_refs), 0) then raise exception '알림 목록이 올바르지 않습니다.'; end if;
  if coalesce(cardinality(p_kinds), 0) > 200 then raise exception '한 번에 200개까지 표시할 수 있습니다.'; end if;
  if exists (select 1 from unnest(p_kinds) k where k not in ('announcement', 'board_notice')) then raise exception '알림 종류가 올바르지 않습니다.'; end if;
  insert into public.announcement_reads(announcement_id, user_id)
  select distinct t.r, auth.uid() from unnest(p_kinds, p_refs) as t(k, r)
  join public.announcements a on a.id = t.r
  where t.k = 'announcement'
    and (a.target_all or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (a.project_ids)))
  on conflict do nothing;
  insert into public.notification_reads(user_id, kind, ref_id)
  select auth.uid(), t.k, t.r from unnest(p_kinds, p_refs) as t(k, r)
  where t.k = 'board_notice'
  on conflict do nothing;
end $$;
revoke all on function public.mark_notifications_read(text[], bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(text[], bigint[]) to authenticated;
