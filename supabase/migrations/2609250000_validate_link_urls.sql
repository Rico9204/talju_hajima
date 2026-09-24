-- 사용자가 저장하는 주소를 서버에서 검증한다(화면 검증은 API 직접 호출로 우회할 수 있다).
--  * 프로필 링크(profiles.links): 배열이고 각 url은 http(s) 주소
--  * 게시글 첨부(board_posts.attachments): 배열이고 각 url은 우리 Storage의 board-attachments 공개 주소
-- 이미 저장된 행은 검사하지 않고(not valid) 새로 쓰거나 고치는 행부터 적용한다.
-- 기존 위반 행 확인: select id from profiles where not public.jsonb_urls_ok(links, false);
--
-- 두 테이블을 한 트랜잭션에서 잠그면, 앱이 두 테이블을 반대 순서로 읽는 순간과 겹쳐 교착 상태(40P01 deadlock)가
-- 난다. 그래서 테이블마다 별도 트랜잭션(begin/commit)으로 나눴다(SQL 에디터는 여러 문장을 한 트랜잭션으로
-- 실행하므로 명시적으로 나눠야 한다). 잠금은 5초까지만 기다리고, 시간 초과가 나면 잠시 뒤 그대로 다시 실행하면 된다.
-- 전체를 다시 실행해도 안전하다.

create or replace function public.jsonb_urls_ok(p_items jsonb, p_board_attachment boolean)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) <= 30
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e->'url') <> 'string'
          or length(e->>'url') > 2048
          or (e->>'url') ~ '[\s"<>]'
          or case when p_board_attachment
               then (e->>'url') !~ '^https://[a-z0-9.-]+/storage/v1/object/public/board-attachments/'
               else (e->>'url') !~* '^https?://[^/]'
             end
     )
$$;

begin;
set local lock_timeout = '5s';
alter table public.profiles
  drop constraint if exists profiles_links_urls_ok,
  add constraint profiles_links_urls_ok check (public.jsonb_urls_ok(links, false)) not valid;
commit;

begin;
set local lock_timeout = '5s';
alter table public.board_posts
  drop constraint if exists board_posts_attachment_urls_ok,
  add constraint board_posts_attachment_urls_ok check (public.jsonb_urls_ok(attachments, true)) not valid;
commit;

notify pgrst, 'reload schema';
