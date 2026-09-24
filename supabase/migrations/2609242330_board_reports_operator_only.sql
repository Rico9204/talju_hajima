-- 게시글 신고 조회·처리를 운영자(is_operator)만 할 수 있게 한다(일반 관리자 제외).
-- 신고자 본인은 계속 자기 신고를 볼 수 있다.
begin;

drop policy if exists board_post_reports_select on public.board_post_reports;
create policy board_post_reports_select on public.board_post_reports for select to authenticated
  using (reporter_user_id = auth.uid() or public.is_operator());

create or replace function public.review_board_report(p_report_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_operator() then raise exception '운영자만 신고를 처리할 수 있습니다.'; end if;
  if p_status not in ('resolved', 'dismissed') then raise exception '올바르지 않은 처리 상태입니다.'; end if;
  update public.board_post_reports set status = p_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_report_id;
  if not found then raise exception '신고를 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.review_board_report(bigint, text) from public, anon;
grant execute on function public.review_board_report(bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;
