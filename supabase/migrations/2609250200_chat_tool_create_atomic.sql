begin;

-- 코드 리뷰 지적 사항 수정(채팅 도구)
--  * 도구 메시지를 올린 뒤 준비(chat_tool_init)를 따로 부르다 보니, 준비가 실패하면 메시지만 남고 카드가 영구히
--    동작하지 않았다. chat_tool_create()가 메시지 등록과 준비를 한 트랜잭션에서 처리한다(실패하면 메시지도 남지 않음).
--    security invoker라 메시지 등록은 기존 chat_messages RLS(채널 접근, 본인 멤버)를 그대로 거친다.
--  * 항목 목록이 없거나 배열이 아니면 검사가 NULL이 되어 통과하던 문제(제비·룰렛·사다리)를 거절로 바꾼다.

create or replace function public.chat_ladder_generate(p_participants jsonb, p_results jsonb)
returns jsonb language plpgsql volatile set search_path = public as $$
declare
  n int := case when jsonb_typeof(p_participants) = 'array' then jsonb_array_length(p_participants) else 0 end;
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
revoke all on function public.chat_ladder_generate(jsonb, jsonb) from public, anon, authenticated;

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
    if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 2 and 50 then
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
    if jsonb_typeof(opts) is distinct from 'array' or jsonb_array_length(opts) not between 2 and 20 then
      raise exception '룰렛 항목은 2~20개여야 합니다.';
    end if;
    insert into public.chat_tool_events (message_id, project_id, kind, event, actor_member_id, data)
    values (p_message_id, ctx->>'projectId', 'roulette', 'init', (ctx->>'actorId')::uuid, '{}'::jsonb) returning * into ev;
  end if;
  return public.chat_tool_event_json(ev);
end $$;

create or replace function public.chat_tool_create(p_project_id text, p_channel_id text, p_text text, p_config jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_msg public.chat_messages%rowtype; v_sender uuid; v_event jsonb;
begin
  select id into v_sender from public.members where project_id = p_project_id and user_id = auth.uid();
  if v_sender is null then raise exception '프로젝트 참여자만 사용할 수 있습니다.'; end if;
  insert into public.chat_messages (project_id, channel_id, sender_id, text)
  values (p_project_id, p_channel_id, v_sender, p_text)
  returning * into v_msg;
  v_event := public.chat_tool_init(v_msg.id, p_config);
  return jsonb_build_object('message', to_jsonb(v_msg), 'event', v_event);
end $$;
revoke all on function public.chat_tool_create(text, text, text, jsonb) from public, anon;
grant execute on function public.chat_tool_create(text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
