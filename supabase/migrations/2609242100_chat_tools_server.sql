-- 채팅 도구(제비뽑기·사다리타기·룰렛)의 결과를 서버가 정한다.
--  * 제비뽑기 정답은 chat_tool_secrets(일반 조회 불가)에만 두고, 카드를 열 때 서버가 결과를 알려준다.
--  * 사다리 가로선/매칭, 룰렛 당첨은 서버 random()으로 정한다.
--  * 결과는 chat_tool_events에만 기록되고(RPC로만 쓰기), 화면은 이 테이블을 읽는다 — 채팅 로그에 위조 메시지를
--    넣어도 결과가 바뀌지 않는다. 투표는 정답이 없어 기존 방식(실제 발신자 기준)을 유지한다.
-- 도구 메시지 본문은 '[TALJU_CHAT_TOOL]:{"type":..,"server":true,"data":{공개 정보}}' 형식이며,
-- 클라이언트가 메시지를 올린 뒤 chat_tool_init()으로 정답을 만든다.

create table if not exists public.chat_tool_secrets (
  message_id bigint primary key references public.chat_messages(id) on delete cascade,
  project_id text not null,
  secret jsonb not null
);
alter table public.chat_tool_secrets enable row level security;
revoke all on table public.chat_tool_secrets from anon, authenticated;

create table if not exists public.chat_tool_events (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  project_id text not null,
  kind text not null check (kind in ('draw', 'ladder', 'roulette')),
  event text not null check (event in ('init', 'draw_pick', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin')),
  actor_member_id uuid references public.members(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_tool_events_project_idx on public.chat_tool_events (project_id, id);
create unique index if not exists chat_tool_events_once
  on public.chat_tool_events (message_id, event) where event in ('init', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin');
create unique index if not exists chat_tool_events_pick_once
  on public.chat_tool_events (message_id, (data->>'itemId')) where event = 'draw_pick';

alter table public.chat_tool_events enable row level security;
revoke all on table public.chat_tool_events from anon, authenticated;
grant select on table public.chat_tool_events to authenticated;
drop policy if exists chat_tool_events_select on public.chat_tool_events;
create policy chat_tool_events_select on public.chat_tool_events for select to authenticated
  using (exists (
    select 1 from public.chat_messages c
    where c.id = message_id and c.project_id = chat_tool_events.project_id and public.can_access_chat_channel(c.project_id, c.channel_id)
  ));

-- 호출자 검증: 메시지가 있고, 그 채널에 접근할 수 있는 프로젝트 참여자이며, 프로젝트가 진행 중일 것.
create or replace function public.chat_tool_load(p_message_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare msg public.chat_messages%rowtype; actor public.members%rowtype; body jsonb; prefix constant text := '[TALJU_CHAT_TOOL]:';
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into msg from public.chat_messages where id = p_message_id;
  if not found or not public.can_access_chat_channel(msg.project_id, msg.channel_id) then
    raise exception '도구 메시지를 찾을 수 없습니다.';
  end if;
  select * into actor from public.members where project_id = msg.project_id and user_id = auth.uid();
  if not found then raise exception '프로젝트 참여자만 사용할 수 있습니다.'; end if;
  perform 1 from public.projects where id = msg.project_id and status = 'active';
  if not found then raise exception '진행 중인 프로젝트에서만 사용할 수 있습니다.'; end if;
  if left(msg.text, length(prefix)) <> prefix then raise exception '도구 메시지가 아닙니다.'; end if;
  begin
    body := substr(msg.text, length(prefix) + 1)::jsonb;
  exception when others then
    raise exception '도구 메시지를 읽을 수 없습니다.';
  end;
  if coalesce(body->>'server', '') <> 'true' or (body->>'type') not in ('draw', 'ladder', 'roulette') then
    raise exception '서버 처리 도구가 아닙니다.';
  end if;
  return jsonb_build_object('projectId', msg.project_id, 'senderId', msg.sender_id, 'actorId', actor.id, 'payload', body);
end $$;
revoke all on function public.chat_tool_load(bigint) from public, anon, authenticated;

create or replace function public.chat_tool_event_json(e public.chat_tool_events)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', e.id, 'messageId', e.message_id, 'kind', e.kind, 'event', e.event,
    'actorMemberId', e.actor_member_id, 'data', e.data, 'createdAt', e.created_at)
$$;
revoke all on function public.chat_tool_event_json(public.chat_tool_events) from public, anon, authenticated;

-- 사다리: 선(step, fromCol)을 따라 각 참가자가 도착하는 결과를 계산한다.
create or replace function public.chat_ladder_matches(p_ls int[], p_lc int[], p_steps int, p_participants jsonb, p_results jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare n int := jsonb_array_length(p_participants); i int; s int; j int; cur int; moved boolean; matches jsonb := '[]'::jsonb;
begin
  for i in 0 .. n - 1 loop
    cur := i;
    for s in 0 .. p_steps - 1 loop
      moved := false;
      for j in 1 .. coalesce(array_length(p_ls, 1), 0) loop
        if p_ls[j] = s and p_lc[j] = cur then cur := cur + 1; moved := true; exit; end if;
      end loop;
      if not moved then
        for j in 1 .. coalesce(array_length(p_ls, 1), 0) loop
          if p_ls[j] = s and p_lc[j] = cur - 1 then cur := cur - 1; exit; end if;
        end loop;
      end if;
    end loop;
    matches := matches || jsonb_build_object(
      'participantId', p_participants->i->>'id',
      'participantName', p_participants->i->>'name',
      'resultText', coalesce(p_results->>cur, '결과 ' || (cur + 1)),
      'endCol', cur);
  end loop;
  return matches;
end $$;

create or replace function public.chat_ladder_generate(p_participants jsonb, p_results jsonb)
returns jsonb language plpgsql volatile set search_path = public as $$
declare
  n int := jsonb_array_length(p_participants);
  total_steps int;
  attempt int; s int; c int; i int; j int;
  ls int[]; lc int[]; colcount int[];
  has_left boolean; had_prev boolean; ok boolean; straight int; prob double precision;
  matches jsonb; best_ls int[] := '{}'; best_lc int[] := '{}'; best_matches jsonb := null;
begin
  if n < 2 or n > 20 then raise exception '사다리 참가자는 2~20명이어야 합니다.'; end if;
  total_steps := greatest(n * 2 + 2, 8);
  for attempt in 1 .. 100 loop
    ls := '{}'; lc := '{}'; colcount := array_fill(0, array[n - 1]);
    for s in 0 .. total_steps - 1 loop
      for c in 0 .. n - 2 loop
        has_left := false; had_prev := false;
        for j in 1 .. coalesce(array_length(ls, 1), 0) loop
          if ls[j] = s and lc[j] = c - 1 then has_left := true; end if;
          if ls[j] = s - 1 and lc[j] = c then had_prev := true; end if;
        end loop;
        continue when has_left or had_prev;
        prob := 0.4;
        if colcount[c + 1] < 2 then prob := 0.75; end if;
        if random() < prob then
          ls := ls || s; lc := lc || c; colcount[c + 1] := colcount[c + 1] + 1;
        end if;
      end loop;
    end loop;
    if n = 2 then
      ok := coalesce(array_length(ls, 1), 0) % 2 = 1;
    else
      ok := true;
      for i in 1 .. n - 1 loop if colcount[i] < 1 then ok := false; end if; end loop;
    end if;
    continue when not ok;
    matches := public.chat_ladder_matches(ls, lc, total_steps, p_participants, p_results);
    straight := 0;
    for i in 0 .. n - 1 loop if (matches->i->>'endCol')::int = i then straight := straight + 1; end if; end loop;
    best_ls := ls; best_lc := lc; best_matches := matches;
    exit when straight < n; -- 모두가 제자리로 떨어지는 사다리는 다시 뽑는다
  end loop;
  if best_matches is null then -- 안전한 기본값
    best_ls := '{}'; best_lc := '{}';
    for c in 0 .. n - 2 loop best_ls := best_ls || (c * 2); best_lc := best_lc || c; end loop;
    best_matches := public.chat_ladder_matches(best_ls, best_lc, total_steps, p_participants, p_results);
  end if;
  return jsonb_build_object(
    'numSteps', total_steps,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('step', a, 'fromCol', b)), '[]'::jsonb) from unnest(best_ls, best_lc) as t(a, b)),
    'matches', (select jsonb_agg(m - 'endCol') from jsonb_array_elements(best_matches) m));
end $$;
revoke all on function public.chat_ladder_matches(int[], int[], int, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.chat_ladder_generate(jsonb, jsonb) from public, anon, authenticated;

-- 도구 준비: 만든 사람이 메시지를 올린 직후 한 번 호출한다. 정답/사다리 선을 서버가 만든다.
create or replace function public.chat_tool_init(p_message_id bigint, p_config jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx jsonb := public.chat_tool_load(p_message_id); payload jsonb; kind text; ev public.chat_tool_events%rowtype;
  items jsonb; n int; shuffled jsonb; gen jsonb; opts jsonb;
begin
  if (ctx->>'senderId') <> (ctx->>'actorId') then raise exception '도구를 만든 사람만 준비할 수 있습니다.'; end if;
  payload := ctx->'payload'; kind := payload->>'type';
  if exists (select 1 from public.chat_tool_events where message_id = p_message_id and event = 'init') then
    raise exception '이미 준비된 도구입니다.';
  end if;

  if kind = 'draw' then
    items := p_config->'items';
    if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 2 and 50 then
      raise exception '제비는 2~50개여야 합니다.';
    end if;
    select jsonb_agg(jsonb_build_object('id', rn, 'label', label, 'isWinner', win) order by rn) into shuffled
    from (
      select row_number() over (order by random()) as rn, left(coalesce(v->>'label', ''), 40) as label,
             coalesce((v->>'isWinner')::boolean, false) as win
      from jsonb_array_elements(items) v
    ) t;
    n := jsonb_array_length(shuffled);
    insert into public.chat_tool_secrets (message_id, project_id, secret)
    values (p_message_id, ctx->>'projectId', jsonb_build_object('items', shuffled));
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'draw', 'init', (ctx->>'actorId')::uuid,
      jsonb_build_object('total', n, 'winnerCount', (select count(*) from jsonb_array_elements(shuffled) e where (e->>'isWinner')::boolean)))
    returning * into ev;
  elsif kind = 'ladder' then
    gen := public.chat_ladder_generate(payload->'data'->'participants', coalesce(payload->'data'->'results', '[]'::jsonb));
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'ladder', 'init', (ctx->>'actorId')::uuid, gen) returning * into ev;
  else
    opts := payload->'data'->'options';
    if jsonb_typeof(opts) <> 'array' or jsonb_array_length(opts) not between 2 and 20 then
      raise exception '룰렛 항목은 2~20개여야 합니다.';
    end if;
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'roulette', 'init', (ctx->>'actorId')::uuid, '{}'::jsonb) returning * into ev;
  end if;
  return public.chat_tool_event_json(ev);
end $$;

-- 도구 행동: 결과는 서버가 정해 chat_tool_events에 기록하고 그 이벤트를 돌려준다.
create or replace function public.chat_tool_act(p_message_id bigint, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx jsonb := public.chat_tool_load(p_message_id); payload jsonb; kind text; actor uuid := (ctx->>'actorId')::uuid;
  ev public.chat_tool_events%rowtype; sec jsonb; item jsonb; item_id int; opts jsonb; winner jsonb;
begin
  payload := ctx->'payload'; kind := payload->>'type';
  perform pg_advisory_xact_lock(p_message_id);
  if not exists (select 1 from public.chat_tool_events where message_id = p_message_id and event = 'init') then
    raise exception '아직 준비되지 않은 도구입니다.';
  end if;

  if p_action = 'draw_pick' and kind = 'draw' then
    item_id := (p_args->>'itemId')::int;
    select secret into sec from public.chat_tool_secrets where message_id = p_message_id;
    select e into item from jsonb_array_elements(sec->'items') e where (e->>'id')::int = item_id;
    if item is null then raise exception '없는 제비입니다.'; end if;
    if exists (select 1 from public.chat_tool_events where message_id = p_message_id and event = 'draw_reveal_all') then
      raise exception '이미 전체 공개된 제비뽑기입니다.';
    end if;
    begin
      insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
      values (p_message_id, ctx->>'projectId', 'draw', 'draw_pick', actor,
        jsonb_build_object('itemId', item_id, 'label', item->>'label', 'isWinner', (item->>'isWinner')::boolean))
      returning * into ev;
    exception when unique_violation then
      raise exception '이미 열린 제비입니다.';
    end;
  elsif p_action = 'draw_reveal_all' and kind = 'draw' then
    if (ctx->>'senderId') <> (ctx->>'actorId') then raise exception '만든 사람만 전체 공개할 수 있습니다.'; end if;
    select secret into sec from public.chat_tool_secrets where message_id = p_message_id;
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'draw', 'draw_reveal_all', actor, jsonb_build_object('items', sec->'items'))
    on conflict (message_id, event) where event in ('init', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin') do nothing
    returning * into ev;
  elsif p_action = 'ladder_reveal' and kind = 'ladder' then
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'ladder', 'ladder_reveal', actor, '{}'::jsonb)
    on conflict (message_id, event) where event in ('init', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin') do nothing
    returning * into ev;
  elsif p_action = 'roulette_spin' and kind = 'roulette' then
    opts := payload->'data'->'options';
    winner := opts->(floor(random() * jsonb_array_length(opts))::int);
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'roulette', 'roulette_spin', actor, jsonb_build_object('winnerOptionId', winner->>'id'))
    on conflict (message_id, event) where event in ('init', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin') do nothing
    returning * into ev;
  else
    raise exception '지원하지 않는 동작입니다.';
  end if;

  if ev.id is null then -- 이미 처리된 동작(멱등): 기존 이벤트를 돌려준다
    select * into ev from public.chat_tool_events
    where message_id = p_message_id and event = p_action order by id limit 1;
  end if;
  return public.chat_tool_event_json(ev);
end $$;

revoke all on function public.chat_tool_init(bigint, jsonb) from public, anon;
revoke all on function public.chat_tool_act(bigint, text, jsonb) from public, anon;
grant execute on function public.chat_tool_init(bigint, jsonb) to authenticated;
grant execute on function public.chat_tool_act(bigint, text, jsonb) to authenticated;

-- Realtime: 결과 이벤트를 프로젝트 참여자에게 실시간 전달.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_tool_events') then
    alter publication supabase_realtime add table public.chat_tool_events;
  end if;
end $$;

create or replace function public.can_access_project_realtime_topic(p_topic text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.members m
      where (
          p_topic ~ '^(presence|collab_presence|chat_messages|chat_tool_events|message_reads|task_comment_reactions|tasks|schedule_events|files):[^:]+$'
          or p_topic ~ '^collab_doc:[^:]+:[0-9]+:[0-9]+:(main|pin)$'
        )
        and m.project_id = split_part(p_topic, ':', 2)
        and m.user_id = auth.uid()
    );
$$;
revoke all on function public.can_access_project_realtime_topic(text) from public;
grant execute on function public.can_access_project_realtime_topic(text) to authenticated;

notify pgrst, 'reload schema';
