-- 일반 PostgreSQL에서 supabase/schema.sql(표·DB 함수·권한 규칙)을 그대로 쓰기 위한 최소 기반.
-- Supabase가 제공하던 것(역할, auth 스키마, storage·realtime 표)을 우리 것으로 대신한다.
-- 새 DB에 한 번, schema.sql 보다 먼저 실행한다(server/scripts/db-setup.mjs). 여러 번 실행해도 안전하다.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- 서버의 DB 계정이 요청마다 "set local role authenticated"로 내려갈 수 있어야 한다.
grant anon, authenticated to current_user;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists realtime;
grant usage on schema public, auth, storage, realtime to anon, authenticated;

-- 계정. encrypted_password는 bcrypt — Supabase auth.users 와 같은 형식이라 기존 계정을 비밀번호 그대로 옮길 수 있다.
-- 이메일은 서버가 소문자로 정규화해서 넣는다. 앱(anon·authenticated)은 이 표를 직접 읽지 못한다.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  -- 이메일 인증 시각. 메일 발송(가입 확인)을 도입하기 전까지는 모두 null(= 미인증) — 운영자 화면의
  -- 관리자 신청 목록(list_admin_applications)이 이 값으로 "인증 안 된 이메일"을 구분한다.
  email_confirmed_at timestamptz
);
alter table auth.users add column if not exists email_confirmed_at timestamptz;
-- 리프레시 토큰: 원문 대신 SHA-256 해시만 저장하고, 쓸 때마다 새 토큰으로 바꾼다(재사용 불가).
create table if not exists auth.refresh_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists refresh_tokens_user_idx on auth.refresh_tokens(user_id);
-- 메일 링크용 1회용 토큰(가입 확인 24시간, 비밀번호 재설정 1시간). 원문 대신 SHA-256 해시만 저장.
create table if not exists auth.one_time_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('confirm', 'reset')),
  -- 가입 확인 링크는 "그 링크를 만들 때의 비밀번호"에만 유효하다(미인증 계정을 남이 먼저 만들어 두는 공격 대비).
  password_fingerprint text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists one_time_tokens_user_idx on auth.one_time_tokens(user_id, purpose);
revoke all on auth.users, auth.refresh_tokens, auth.one_time_tokens from public, anon, authenticated;

-- 권한 규칙·DB 함수가 부르는 auth.uid()/auth.role(). 서버가 트랜잭션마다 채우는 설정값을 읽는다(server/src/db.ts).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

-- 파일 저장소의 목록표. 실제 파일은 서버가 디스크·S3 등에 두고, 이 표에는 경로·크기·형식만 기록한다
-- (schema.sql의 파일 관련 함수와 권한 규칙이 이 표를 읽는다).
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;
create or replace function storage.extension(name text) returns text language sql immutable as $$
  select substring(name from '\.([^./]+)$')
$$;
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to anon, authenticated;

-- 실시간 채널 권한 규칙(schema.sql)이 붙는 자리. 서버의 실시간 기능이 같은 규칙을 쓰도록 표만 둔다.
create table if not exists realtime.messages (id bigint generated always as identity primary key, extension text, topic text);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$
  select coalesce(current_setting('realtime.topic', true), '')
$$;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

-- schema.sql이 기대하는 기본 권한(Supabase 기본값과 같음): 앞으로 만드는 public 표·시퀀스는 authenticated가 쓸 수 있고,
-- 실제로 무엇을 읽고 쓸 수 있는지는 각 표의 권한 규칙(RLS)이 정한다.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;
