-- 직접 구현 백엔드의 실시간 알림(Supabase Realtime 대체). supabase/schema.sql 다음에 한 번 실행한다(여러 번 실행해도 안전).
-- 표가 바뀌면 그 행의 "키"만 pg_notify('talju_realtime', …)로 알린다(내용 없음 — 알림 크기 제한 8KB, 권한 없는 사람에게 새지 않게).
-- 서버(server/src/realtime.ts)가 알림을 받아, 구독 중인 사람마다 "그 사람으로서" 행을 다시 읽어(RLS) 볼 수 있을 때만 보낸다.
-- 트리거 인자 = 알림에 담을 키 칸 이름들.

create or replace function public.realtime_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  project text := rec->>'project_id';
  keys jsonb := '{}'::jsonb;
  k text;
begin
  -- 과제 댓글 반응에는 project_id 칸이 없어 댓글 → 과제로 찾는다.
  if project is null and tg_table_name = 'task_comment_reactions' then
    select t.project_id into project from public.task_comments c join public.tasks t on t.id = c.task_id where c.id = (rec->>'comment_id')::bigint;
  end if;
  if project is null then return null; end if;
  foreach k in array tg_argv loop
    keys := keys || jsonb_build_object(k, rec->k);
  end loop;
  perform pg_notify('talju_realtime', jsonb_build_object('table', tg_table_name, 'op', tg_op, 'project', project, 'row', keys)::text);
  return null;
end $$;
revoke all on function public.realtime_notify() from public, anon, authenticated;

drop trigger if exists realtime_notify on public.chat_messages;
create trigger realtime_notify after insert on public.chat_messages
  for each row execute function public.realtime_notify('id');
drop trigger if exists realtime_notify on public.message_reactions;
create trigger realtime_notify after insert or delete on public.message_reactions
  for each row execute function public.realtime_notify('message_id', 'member_id', 'emoji');
drop trigger if exists realtime_notify on public.message_reads;
create trigger realtime_notify after insert on public.message_reads
  for each row execute function public.realtime_notify('message_id', 'member_id');
drop trigger if exists realtime_notify on public.chat_tool_events;
create trigger realtime_notify after insert on public.chat_tool_events
  for each row execute function public.realtime_notify('id');
drop trigger if exists realtime_notify on public.chat_group_members;
create trigger realtime_notify after insert on public.chat_group_members
  for each row execute function public.realtime_notify('group_id', 'member_id');
drop trigger if exists realtime_notify on public.tasks;
create trigger realtime_notify after insert or update or delete on public.tasks
  for each row execute function public.realtime_notify('id');
drop trigger if exists realtime_notify on public.schedule_events;
create trigger realtime_notify after insert or update or delete on public.schedule_events
  for each row execute function public.realtime_notify('id');
drop trigger if exists realtime_notify on public.files;
create trigger realtime_notify after insert or update or delete on public.files
  for each row execute function public.realtime_notify('id');
drop trigger if exists realtime_notify on public.task_comment_reactions;
create trigger realtime_notify after insert or delete on public.task_comment_reactions
  for each row execute function public.realtime_notify('comment_id', 'member_id', 'emoji');

-- ── 웹 푸시(pg_net 대체) ──
-- supabase/schema.sql의 push_to_members는 pg_net의 net.http_post로 Vercel 함수(/api/push)에 보낸다.
-- 일반 PostgreSQL에는 pg_net이 없으므로 같은 이름·인자의 함수가 요청을 net.push_outbox에 쌓고 pg_notify('talju_push', id)로 알린다.
-- 서버(server/src/push.ts)가 받아 브라우저 푸시 서비스로 보낸다. 저장이 취소(롤백)되면 쌓인 요청도 함께 사라진다.
-- 진짜 pg_net이 설치된 DB에서는 건드리지 않는다.
do $outer$ begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  create schema if not exists net;
  revoke all on schema net from public;
  create table if not exists net.push_outbox (
    id bigint generated always as identity primary key,
    body jsonb not null,
    created_at timestamptz not null default now()
  );
  execute $fn$
    create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
    returns bigint language plpgsql security definer set search_path = pg_catalog, net as $body$
    declare new_id bigint;
    begin
      insert into net.push_outbox(body) values (http_post.body) returning id into new_id;
      perform pg_notify('talju_push', new_id::text);
      return new_id;
    end $body$
  $fn$;
  revoke all on function net.http_post(text, jsonb, jsonb, jsonb, integer) from public;
end $outer$;
