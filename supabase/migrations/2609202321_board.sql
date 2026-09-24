-- 메인 화면 게시판(공지/자유/팀원모집) — 프로젝트에 속하지 않는, 로그인한
-- 모든 사용자가 함께 보는 전역 커뮤니티 게시판. feature/board 브랜치의
-- localStorage 기반 프로토타입을 실제 Supabase 테이블로 재구현.
begin;

create table if not exists public.board_posts (
  id bigint generated always as identity primary key,
  category text not null check (category in ('notice','free','recruit')),
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  content text not null check (length(content) <= 50000),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  views integer not null default 0,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  tags text[] not null default '{}',
  -- [{id,name,size,kind:'image'|'file',url,mimeType}] — url은 board-attachments
  -- 버킷의 실제 업로드 경로. base64는 절대 저장하지 않는다.
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists board_posts_list_idx on public.board_posts (pinned desc, created_at desc);

create table if not exists public.board_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.board_posts(id) on delete cascade,
  -- null이면 게시글에 바로 달린 댓글, 값이 있으면 그 댓글에 대한 대댓글(1단계만 지원).
  parent_comment_id bigint references public.board_comments(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);

create table if not exists public.board_likes (
  post_id bigint not null references public.board_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_likes enable row level security;

drop policy if exists board_posts_select on public.board_posts;
create policy board_posts_select on public.board_posts for select to authenticated using (true);
drop policy if exists board_posts_insert on public.board_posts;
create policy board_posts_insert on public.board_posts for insert to authenticated
  with check (author_user_id = auth.uid() and (category <> 'notice' or public.is_admin()));
drop policy if exists board_posts_update on public.board_posts;
create policy board_posts_update on public.board_posts for update to authenticated
  using (author_user_id = auth.uid() or public.is_admin())
  with check (author_user_id = auth.uid() and (category <> 'notice' or public.is_admin()));
drop policy if exists board_posts_delete on public.board_posts;
create policy board_posts_delete on public.board_posts for delete to authenticated
  using (author_user_id = auth.uid() or public.is_admin());
-- 조회수/좋아요/댓글수는 트리거와 RPC로만 바뀐다 — 작성자 본인도 직접 수정 불가.
revoke update (views, likes_count, comments_count, author_user_id) on public.board_posts from authenticated;

drop policy if exists board_comments_select on public.board_comments;
create policy board_comments_select on public.board_comments for select to authenticated using (true);
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.board_posts p where p.id = post_id)
    and (parent_comment_id is null or exists (
      select 1 from public.board_comments parent
      where parent.id = parent_comment_id and parent.post_id = board_comments.post_id and parent.parent_comment_id is null
    ))
  );
drop policy if exists board_comments_delete on public.board_comments;
create policy board_comments_delete on public.board_comments for delete to authenticated
  using (author_user_id = auth.uid() or public.is_admin());

drop policy if exists board_likes_select on public.board_likes;
create policy board_likes_select on public.board_likes for select to authenticated using (true);
drop policy if exists board_likes_insert on public.board_likes;
create policy board_likes_insert on public.board_likes for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists board_likes_delete on public.board_likes;
create policy board_likes_delete on public.board_likes for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.sync_board_post_likes_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.board_posts set likes_count = likes_count + 1 where id = new.post_id;
    return new;
  else
    update public.board_posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists board_likes_sync on public.board_likes;
create trigger board_likes_sync after insert or delete on public.board_likes
for each row execute function public.sync_board_post_likes_count();

create or replace function public.sync_board_post_comments_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.board_posts set comments_count = comments_count + 1 where id = new.post_id;
    return new;
  else
    update public.board_posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists board_comments_sync on public.board_comments;
create trigger board_comments_sync after insert or delete on public.board_comments
for each row execute function public.sync_board_post_comments_count();

create or replace function public.increment_board_post_views(p_post_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  update public.board_posts set views = views + 1 where id = p_post_id;
end $$;
revoke all on function public.increment_board_post_views(bigint) from public,anon;
grant execute on function public.increment_board_post_views(bigint) to authenticated;

-- 게시판 첨부/본문 삽입 이미지 저장용 버킷. avatars와 동일하게 공개 읽기 —
-- 게시판 콘텐츠는 민감 정보가 아니고, 서명 URL 없이 바로 렌더링되어야 함.
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-attachments', 'board-attachments', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

drop policy if exists board_attachments_public_read on storage.objects;
drop policy if exists board_attachments_own_write on storage.objects;
drop policy if exists board_attachments_own_delete on storage.objects;
create policy board_attachments_public_read on storage.objects for select
  using (bucket_id = 'board-attachments');
create policy board_attachments_own_write on storage.objects for insert
  with check (bucket_id = 'board-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy board_attachments_own_delete on storage.objects for delete
  using (bucket_id = 'board-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst,'reload schema';
commit;
