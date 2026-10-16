-- 게시판 투표 보안 보완 (2609242150_board_poll.sql 이후에 실행)
--  * 투표 기록(board_poll_votes)은 본인 것만 직접 조회할 수 있다. 익명 투표는 누가 골랐는지 서버가 아예 내려주지 않는다.
--  * 투표·마감·투표 생성은 RPC로만 한다(테이블 직접 쓰기 차단) — 마감/단일선택/항목 검증을 우회할 수 없다.
--  * 결과 조회는 board_poll_votes_view()로만 한다.
begin;

-- 1) 직접 쓰기 차단
revoke insert, update, delete on table public.board_poll_votes from anon, authenticated;
revoke insert, update on table public.board_polls from anon, authenticated;
revoke insert, update, delete on table public.board_poll_options from anon, authenticated;
drop policy if exists board_poll_votes_insert on public.board_poll_votes;
drop policy if exists board_poll_votes_delete on public.board_poll_votes;
drop policy if exists board_polls_insert on public.board_polls;
drop policy if exists board_polls_update on public.board_polls;
drop policy if exists board_poll_options_insert on public.board_poll_options;
drop policy if exists board_poll_options_update on public.board_poll_options;
drop policy if exists board_poll_options_delete on public.board_poll_options;

-- 2) 투표 기록은 본인 것만 직접 조회
drop policy if exists board_poll_votes_select on public.board_poll_votes;
create policy board_poll_votes_select on public.board_poll_votes for select to authenticated
  using (user_id = auth.uid());

-- 3) 결과 조회: 기명 투표만 투표자(user_id)를 내려주고, 익명 투표는 본인 표만 user_id를 준다.
--    voter_ref는 투표 안에서 같은 사람을 구분하는 번호일 뿐 신원이 아니다(총 참여 인원 계산용).
create or replace function public.board_poll_votes_view(p_poll_ids bigint[])
returns table (poll_id bigint, option_id bigint, user_id uuid, voter_ref integer)
language sql stable security definer set search_path = public as $$
  select v.poll_id, v.option_id,
         case when not p.is_anonymous or v.user_id = auth.uid() then v.user_id else null end,
         (dense_rank() over (partition by v.poll_id order by md5(v.user_id::text || v.poll_id::text)))::integer
  from public.board_poll_votes v
  join public.board_polls p on p.id = v.poll_id
  where auth.uid() is not null and v.poll_id = any(p_poll_ids)
$$;
revoke all on function public.board_poll_votes_view(bigint[]) from public, anon;
grant execute on function public.board_poll_votes_view(bigint[]) to authenticated;

-- 4) 투표 생성: 게시글 작성자(또는 관리자)만, 항목 2~10개, 마감은 미래 시각. 투표+항목을 한 번에.
create or replace function public.create_board_poll(
  p_post_id bigint, p_question text, p_options text[],
  p_allow_multiple boolean default false, p_is_anonymous boolean default false, p_closes_at timestamptz default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_post public.board_posts; v_poll_id bigint; v_opts text[]; i int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_post from public.board_posts where id = p_post_id;
  if not found then raise exception '게시글을 찾을 수 없습니다.'; end if;
  if v_post.author_user_id <> v_uid and not public.is_admin() then
    raise exception '게시글 작성자만 투표를 만들 수 있습니다.';
  end if;
  if exists (select 1 from public.board_polls where post_id = p_post_id) then
    raise exception '이미 투표가 있는 게시글입니다.';
  end if;
  select coalesce(array_agg(trim(o)) filter (where trim(o) <> ''), '{}') into v_opts from unnest(coalesce(p_options, '{}')) o;
  if coalesce(array_length(v_opts, 1), 0) not between 2 and 10 then raise exception '투표 항목은 2~10개여야 합니다.'; end if;
  if p_closes_at is not null and p_closes_at <= now() then raise exception '마감일은 현재 시간 이후여야 합니다.'; end if;
  insert into public.board_polls (post_id, question, allow_multiple, is_anonymous, closes_at)
  values (p_post_id, trim(p_question), coalesce(p_allow_multiple, false), coalesce(p_is_anonymous, false), p_closes_at)
  returning id into v_poll_id;
  for i in 1 .. array_length(v_opts, 1) loop
    insert into public.board_poll_options (poll_id, text, sort_order) values (v_poll_id, v_opts[i], i - 1);
  end loop;
  return v_poll_id;
end $$;
revoke all on function public.create_board_poll(bigint, text, text[], boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_board_poll(bigint, text, text[], boolean, boolean, timestamptz) to authenticated;

-- 5) 투표: 같은 옵션 중복 선택 제거, 동시 투표는 투표 행 잠금으로 직렬화
create or replace function public.cast_board_poll_vote(p_poll_id bigint, p_option_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_poll public.board_polls; v_opt_id bigint; v_ids bigint[];
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_poll from public.board_polls where id = p_poll_id for share;
  if not found then raise exception '투표를 찾을 수 없습니다.'; end if;
  if v_poll.closed then raise exception '이미 마감된 투표입니다.'; end if;
  if v_poll.closes_at is not null and v_poll.closes_at <= now() then raise exception '마감 기한이 지난 투표입니다.'; end if;
  select coalesce(array_agg(distinct o), '{}') into v_ids from unnest(coalesce(p_option_ids, '{}')) o;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    delete from public.board_poll_votes where poll_id = p_poll_id and user_id = v_uid;
    return;
  end if;
  if not v_poll.allow_multiple and array_length(v_ids, 1) > 1 then raise exception '복수 선택이 허용되지 않은 투표입니다.'; end if;
  if exists (select 1 from unnest(v_ids) o where not exists (select 1 from public.board_poll_options b where b.id = o and b.poll_id = p_poll_id)) then
    raise exception '올바르지 않은 투표 항목이 포함되어 있습니다.';
  end if;
  delete from public.board_poll_votes where poll_id = p_poll_id and user_id = v_uid;
  foreach v_opt_id in array v_ids loop
    insert into public.board_poll_votes (poll_id, option_id, user_id) values (p_poll_id, v_opt_id, v_uid);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
