-- ===== 캠퍼스 소식(공모전·취업) 캐시 및 스크랩 테이블 =====
-- 대학교 홈페이지 및 공모전 사이트에서 크롤링한 소식 캐시
create table if not exists public.campus_notices_cache (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  school_name text not null,
  category text not null, -- 'contest' | 'job' | 'general' | 'internship'
  title text not null,
  author text,
  post_date text,
  link text not null,
  views integer default 0,
  thumbnail text,
  is_pinned boolean default false,
  crawled_at timestamptz default now()
);

create unique index if not exists campus_notices_school_link_idx on public.campus_notices_cache (school_code, link);
create index if not exists campus_notices_lookup_idx on public.campus_notices_cache (school_code, category, post_date desc);

-- 사용자가 관심 있는 공모전/취업 공지를 스크랩(북마크) 보관하는 테이블
create table if not exists public.campus_scrapped_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_code text not null,
  school_name text not null,
  category text not null,
  title text not null,
  author text,
  post_date text,
  link text not null,
  created_at timestamptz default now()
);

create unique index if not exists campus_scrapped_user_link_idx on public.campus_scrapped_notices (user_id, link);

alter table public.campus_notices_cache enable row level security;
alter table public.campus_scrapped_notices enable row level security;

-- 캐시 조회: 누구나 조회 가능
drop policy if exists "campus_notices_cache_read" on public.campus_notices_cache;
create policy "campus_notices_cache_read" on public.campus_notices_cache
  for select using (true);

-- 캐시 갱신: 인증된 사용자와 서버(서비스 롤) 모두 가능
drop policy if exists "campus_notices_cache_write" on public.campus_notices_cache;
create policy "campus_notices_cache_write" on public.campus_notices_cache
  for all to authenticated using (true) with check (true);

-- 스크랩: 본인의 스크랩 목록만 조회 및 관리
drop policy if exists "campus_scrapped_notices_select" on public.campus_scrapped_notices;
create policy "campus_scrapped_notices_select" on public.campus_scrapped_notices
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "campus_scrapped_notices_insert" on public.campus_scrapped_notices;
create policy "campus_scrapped_notices_insert" on public.campus_scrapped_notices
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "campus_scrapped_notices_delete" on public.campus_scrapped_notices;
create policy "campus_scrapped_notices_delete" on public.campus_scrapped_notices
  for delete to authenticated using (auth.uid() = user_id);
