begin;

-- 코드 리뷰 지적 사항 수정
--  1) 게시판 투표: 투표 행을 for share로 잠가서 같은 사용자의 동시 요청(더블클릭·탭 두 개)이 서로를 막지 못해
--     단일 선택 투표에 두 표가 들어갈 수 있었다. for update로 잠가 같은 투표에 대한 요청을 한 줄로 세운다.
--  2) 첨부 주소 검증: 경로 모양만 보고 도메인을 보지 않아 다른 서버 주소도 통과했다.
--     우리 Supabase 도메인을 app_text_settings.storage_host에 두고 정확히 그 도메인만 허용한다.
--     (값이 없으면 *.supabase.co 형식만 확인 — 새 프로젝트는 아래 insert의 도메인을 자기 것으로 바꿔 실행)

-- 1) 투표 직렬화
create or replace function public.cast_board_poll_vote(p_poll_id bigint, p_option_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_poll public.board_polls; v_opt_id bigint; v_ids bigint[];
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_poll from public.board_polls where id = p_poll_id for update;
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

-- 2) 문자열 설정 저장소(읽기는 로그인 사용자, 쓰기는 SQL 에디터에서만)
create table if not exists public.app_text_settings (
  key text primary key,
  value text not null
);
alter table public.app_text_settings enable row level security;
revoke all on table public.app_text_settings from anon, authenticated;
grant select on table public.app_text_settings to authenticated;
drop policy if exists app_text_settings_select on public.app_text_settings;
create policy app_text_settings_select on public.app_text_settings for select to authenticated using (true);

create or replace function public.jsonb_urls_ok(p_items jsonb, p_board_attachment boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) <= 30
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e->'url') is distinct from 'string'
          or length(e->>'url') > 2048
          or (e->>'url') ~ '[\s"<>]'
          or case when p_board_attachment
               then (e->>'url') not like 'https://' || coalesce(
                      (select value from public.app_text_settings where key = 'storage_host'),
                      substring(e->>'url' from '^https://([a-z0-9]{20}\.supabase\.co)/'),
                      ''  -- 도메인을 못 찾으면 어떤 주소와도 맞지 않게 해 거절한다(NULL이면 검사가 통과돼 버림)
                    ) || '/storage/v1/object/public/board-attachments/%'
                    or (e->>'url') ~ '\.\./'
               else (e->>'url') !~* '^https?://[^/]'
             end
     )
$$;

insert into public.app_text_settings (key, value) values ('storage_host', 'mulcqnbxbhadqdbkqfnh.supabase.co')
  on conflict (key) do update set value = excluded.value;

notify pgrst, 'reload schema';
commit;
