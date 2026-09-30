-- ===== 웹 푸시: 브라우저를 닫아도 새 과제·일정·파일·채팅 알림 =====
-- 흐름: 새 행 insert → 트리거가 받을 사람(볼 권한이 있는 팀원, 작성자 제외)의 구독을 모아
--       pg_net으로 Vercel 함수(/api/push)에 전달 → 함수가 브라우저 푸시 서비스로 암호화해 보낸다.
-- 알림 실패는 원래 저장을 절대 막지 않는다(트리거 안에서 오류를 삼킨다).

-- pg_net: Supabase에서 제공하는 비동기 HTTP 확장. 없는 환경(테스트 등)에서는 건너뛴다.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net을 켤 수 없습니다(웹 푸시 전송 비활성): %', sqlerrm;
end $$;

-- 브라우저(기기)별 푸시 구독. 주소(endpoint)는 브라우저 푸시 서비스가 발급한 값.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
-- 본인 구독만 읽기(설정 화면 확인용). 쓰기는 아래 함수로만.
grant select on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

-- 보낼 곳(Vercel 함수 주소)과 공유 비밀값. 한 줄만 있고, 사용자는 읽을 수 없다(아래 함수들만 사용).
-- 설정(예: 따옴표 안에 값만, 꺾쇠·공백 없이): insert into public.push_config(endpoint, secret) values ('https://taljuhajima.vercel.app/api/push', 'Vercel의 PUSH_WEBHOOK_SECRET과 같은 64글자')
--       on conflict (id) do update set endpoint = excluded.endpoint, secret = excluded.secret;
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  endpoint text not null check (endpoint ~ '^https://'),
  secret text not null check (char_length(secret) >= 32)
);
alter table public.push_config enable row level security;
revoke all on public.push_config from public, anon, authenticated;

-- 구독 저장. 같은 브라우저에서 다른 계정으로 로그인했으면 그 계정으로 옮긴다.
-- 주소는 알려진 브라우저 푸시 서비스만 받는다(보내는 함수가 아무 주소로나 요청하지 않도록).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_endpoint is null or char_length(p_endpoint) > 1000
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception '지원하지 않는 푸시 주소입니다.';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{40,200}={0,2}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{10,100}={0,2}$' then
    raise exception '푸시 키 형식이 올바르지 않습니다.';
  end if;
  insert into public.push_subscriptions(endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- 푸시 서비스가 "더 이상 없는 구독"이라고 답한 주소 정리. 보내는 함수만 부른다(공유 비밀값 확인).
create or replace function public.prune_push_subscriptions(p_secret text, p_endpoints text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.push_config where secret = p_secret) then raise exception '권한이 없습니다.'; end if;
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
end $$;
revoke all on function public.prune_push_subscriptions(text, text[]) from public;
grant execute on function public.prune_push_subscriptions(text, text[]) to anon, authenticated;

-- 받을 사람의 구독을 모아 전송 요청. p_members가 null이면 프로젝트 전원, 아니면 그 팀원들만. 보낸 사람(p_exclude_user)은 제외.
create or replace function public.push_to_members(p_project_id text, p_members uuid[], p_exclude_user uuid, p_title text, p_body text, p_url text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare cfg public.push_config; subs jsonb; project_name text;
begin
  select * into cfg from public.push_config where id;
  if cfg.endpoint is null then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
  from public.push_subscriptions s
  where s.user_id in (
    select m.user_id from public.members m
    where m.project_id = p_project_id and m.user_id is not null and m.user_id is distinct from p_exclude_user
      and (p_members is null or m.id = any(p_members)));
  if subs is null then return; end if;
  select name into project_name from public.projects where id = p_project_id;
  perform net.http_post(
    url := cfg.endpoint,
    body := jsonb_build_object('subscriptions', subs, 'notification', jsonb_build_object(
      'title', '[' || coalesce(project_name, '프로젝트') || '] ' || p_title,
      'body', left(coalesce(p_body, ''), 200),
      'url', p_url,
      'tag', p_tag)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret));
exception when others then
  raise warning '웹 푸시 전송 요청 실패: %', sqlerrm; -- 알림 실패로 원래 저장이 막히면 안 된다
end $$;
revoke all on function public.push_to_members(text, uuid[], uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.push_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipients uuid[]; sender_name text; link text;
begin
  link := '?project=' || new.project_id;
  if tg_table_name = 'tasks' then
    perform public.push_to_members(new.project_id, null, auth.uid(), '새 과제', new.title, '/tasks/' || new.id || link, 'tasks:' || new.project_id);
  elsif tg_table_name = 'schedule_events' then
    -- 나만 보기 개인 일정은 알리지 않는다. 제목 숨김이면 "바쁨"으로.
    if new.scope = 'personal' and new.visibility = 'private' then return new; end if;
    perform public.push_to_members(new.project_id, null, auth.uid(), '새 일정',
      case when new.hide_title then '바쁨 (' || to_char(new.date, 'MM/DD') || ')' else new.title || ' (' || to_char(new.date, 'MM/DD') || ')' end,
      '/schedule/' || new.id || link, 'schedule:' || new.project_id);
  elsif tg_table_name = 'files' then
    perform public.push_to_members(new.project_id, null, auth.uid(), '새 파일', new.name, '/workspace' || link, 'files:' || new.project_id);
  elsif tg_table_name = 'chat_messages' then
    -- 채널을 볼 수 있는 사람만: 전체방=전원, 1:1=두 사람, 단체방=방 참여자.
    if new.channel_id = 'all' then
      recipients := null;
    elsif new.channel_id ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
      recipients := array[split_part(new.channel_id, ':', 2)::uuid, split_part(new.channel_id, ':', 3)::uuid];
    elsif new.channel_id ~ '^grp:[0-9a-f-]{36}$' then
      select coalesce(array_agg(gm.member_id), '{}') into recipients from public.chat_group_members gm
      where gm.group_id = substring(new.channel_id from 5)::uuid and gm.project_id = new.project_id;
    else
      return new;
    end if;
    select m.name into sender_name from public.members m where m.id = new.sender_id;
    perform public.push_to_members(new.project_id, recipients,
      (select m.user_id from public.members m where m.id = new.sender_id),
      coalesce(sender_name, '팀원'),
      case when btrim(new.text) = '' and new.file_id is not null then '파일을 보냈습니다.' else new.text end,
      '/chat/' || new.channel_id || link || '&messageId=' || new.id, 'chat:' || new.project_id || ':' || new.channel_id);
  end if;
  return new;
exception when others then
  raise warning '웹 푸시 트리거 실패: %', sqlerrm;
  return new;
end $$;
revoke all on function public.push_on_insert() from public, anon, authenticated;

drop trigger if exists push_on_insert_tasks on public.tasks;
create trigger push_on_insert_tasks after insert on public.tasks for each row execute function public.push_on_insert();
drop trigger if exists push_on_insert_schedule_events on public.schedule_events;
create trigger push_on_insert_schedule_events after insert on public.schedule_events for each row execute function public.push_on_insert();
drop trigger if exists push_on_insert_files on public.files;
create trigger push_on_insert_files after insert on public.files for each row execute function public.push_on_insert();
drop trigger if exists push_on_insert_chat_messages on public.chat_messages;
create trigger push_on_insert_chat_messages after insert on public.chat_messages for each row execute function public.push_on_insert();
