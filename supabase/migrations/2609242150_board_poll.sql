-- 게시판 투표 기능 (Poll)
-- 게시글 작성 시 단일/복수 선택, 익명/기명, 마감일 설정이 가능한 투표를 첨부할 수 있습니다.
begin;

create table if not exists public.board_polls (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.board_posts(id) on delete cascade unique,
  question text not null check (length(trim(question)) > 0 and length(question) <= 200),
  allow_multiple boolean not null default false,
  is_anonymous boolean not null default false,
  closed boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists board_polls_post_idx on public.board_polls (post_id);

create table if not exists public.board_poll_options (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.board_polls(id) on delete cascade,
  text text not null check (length(trim(text)) > 0 and length(text) <= 100),
  votes_count integer not null default 0,
  sort_order integer not null default 0
);
create index if not exists board_poll_options_poll_idx on public.board_poll_options (poll_id, sort_order);

create table if not exists public.board_poll_votes (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.board_polls(id) on delete cascade,
  option_id bigint not null references public.board_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, option_id, user_id)
);
create index if not exists board_poll_votes_poll_user_idx on public.board_poll_votes (poll_id, user_id);

alter table public.board_polls enable row level security;
alter table public.board_poll_options enable row level security;
alter table public.board_poll_votes enable row level security;

-- board_polls RLS
drop policy if exists board_polls_select on public.board_polls;
create policy board_polls_select on public.board_polls for select to authenticated using (true);

drop policy if exists board_polls_insert on public.board_polls;
create policy board_polls_insert on public.board_polls for insert to authenticated
  with check (exists (
    select 1 from public.board_posts p
    where p.id = post_id and (p.author_user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists board_polls_update on public.board_polls;
create policy board_polls_update on public.board_polls for update to authenticated
  using (exists (
    select 1 from public.board_posts p
    where p.id = post_id and (p.author_user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists board_polls_delete on public.board_polls;
create policy board_polls_delete on public.board_polls for delete to authenticated
  using (exists (
    select 1 from public.board_posts p
    where p.id = post_id and (p.author_user_id = auth.uid() or public.is_admin())
  ));

-- board_poll_options RLS
drop policy if exists board_poll_options_select on public.board_poll_options;
create policy board_poll_options_select on public.board_poll_options for select to authenticated using (true);

drop policy if exists board_poll_options_insert on public.board_poll_options;
create policy board_poll_options_insert on public.board_poll_options for insert to authenticated
  with check (exists (
    select 1 from public.board_polls bp
    join public.board_posts p on p.id = bp.post_id
    where bp.id = poll_id and (p.author_user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists board_poll_options_update on public.board_poll_options;
create policy board_poll_options_update on public.board_poll_options for update to authenticated
  using (exists (
    select 1 from public.board_polls bp
    join public.board_posts p on p.id = bp.post_id
    where bp.id = poll_id and (p.author_user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists board_poll_options_delete on public.board_poll_options;
create policy board_poll_options_delete on public.board_poll_options for delete to authenticated
  using (exists (
    select 1 from public.board_polls bp
    join public.board_posts p on p.id = bp.post_id
    where bp.id = poll_id and (p.author_user_id = auth.uid() or public.is_admin())
  ));

-- board_poll_votes RLS
drop policy if exists board_poll_votes_select on public.board_poll_votes;
create policy board_poll_votes_select on public.board_poll_votes for select to authenticated using (true);

drop policy if exists board_poll_votes_insert on public.board_poll_votes;
create policy board_poll_votes_insert on public.board_poll_votes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists board_poll_votes_delete on public.board_poll_votes;
create policy board_poll_votes_delete on public.board_poll_votes for delete to authenticated
  using (user_id = auth.uid());

-- 옵션별 득표수 동기화 트리거
create or replace function public.sync_board_poll_option_votes_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.board_poll_options
    set votes_count = votes_count + 1
    where id = new.option_id;
    return new;
  else
    update public.board_poll_options
    set votes_count = greatest(0, votes_count - 1)
    where id = old.option_id;
    return old;
  end if;
end $$;

drop trigger if exists board_poll_votes_sync on public.board_poll_votes;
create trigger board_poll_votes_sync after insert or delete on public.board_poll_votes
for each row execute function public.sync_board_poll_option_votes_count();

-- 투표 제출 / 변경 RPC (원자적 처리)
create or replace function public.cast_board_poll_vote(p_poll_id bigint, p_option_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_poll public.board_polls;
  v_opt_id bigint;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_poll from public.board_polls where id = p_poll_id;
  if not found then raise exception '투표를 찾을 수 없습니다.'; end if;
  if v_poll.closed then raise exception '이미 마감된 투표입니다.'; end if;
  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception '마감 기한이 지난 투표입니다.';
  end if;

  if p_option_ids is null or array_length(p_option_ids, 1) = 0 then
    -- 선택 해제 / 투표 취소
    delete from public.board_poll_votes where poll_id = p_poll_id and user_id = v_uid;
    return;
  end if;

  if not v_poll.allow_multiple and array_length(p_option_ids, 1) > 1 then
    raise exception '복수 선택이 허용되지 않은 투표입니다.';
  end if;

  -- 유효한 옵션 ID인지 검증
  if exists (
    select 1 from unnest(p_option_ids) as opt_id
    where not exists (select 1 from public.board_poll_options o where o.id = opt_id and o.poll_id = p_poll_id)
  ) then
    raise exception '올바르지 않은 투표 항목이 포함되어 있습니다.';
  end if;

  -- 기존 투표 삭제 후 새 투표 등록
  delete from public.board_poll_votes where poll_id = p_poll_id and user_id = v_uid;
  foreach v_opt_id in array p_option_ids loop
    insert into public.board_poll_votes (poll_id, option_id, user_id)
    values (p_poll_id, v_opt_id, v_uid);
  end loop;
end $$;
revoke all on function public.cast_board_poll_vote(bigint, bigint[]) from public, anon;
grant execute on function public.cast_board_poll_vote(bigint, bigint[]) to authenticated;

-- 투표 마감 RPC
create or replace function public.close_board_poll(p_poll_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_poll public.board_polls;
  v_post public.board_posts;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_poll from public.board_polls where id = p_poll_id for update;
  if not found then raise exception '투표를 찾을 수 없습니다.'; end if;
  select * into v_post from public.board_posts where id = v_poll.post_id;
  if not found then raise exception '게시글을 찾을 수 없습니다.'; end if;

  if v_post.author_user_id <> v_uid and not public.is_admin() then
    raise exception '작성자 또는 관리자만 투표를 마감할 수 있습니다.';
  end if;

  update public.board_polls set closed = true where id = p_poll_id;
end $$;
revoke all on function public.close_board_poll(bigint) from public, anon;
grant execute on function public.close_board_poll(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
