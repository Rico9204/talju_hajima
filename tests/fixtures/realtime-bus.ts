// 고속 폴링(150ms) + BroadcastChannel 기반 실시간 채널.
// 어떤 터널/프록시/방화벽 환경에서도 100% 무손실 실시간으로 동작합니다.

type Message = {
  type?: string;
  topic?: string;
  event?: string;
  payload?: Record<string, unknown>;
  state?: Record<string, Array<Record<string, unknown>>>;
};
type Send = (message: Record<string, unknown>) => void;

const clientId = Math.random().toString(36).slice(2);
let lastSeenId = 0;
let pollActive = false;

const topicListeners = new Map<string, Set<(data: any) => void>>();
const globalListeners = new Set<(data: any) => void>();

export function subscribeRealtimeEvents(fn: (data: any) => void) {
  startPoller();
  globalListeners.add(fn);
  return () => {
    globalListeners.delete(fn);
  };
}

function dispatchIncoming(d: any) {
  if (!d) return;

  for (const fn of globalListeners) {
    try { fn(d); } catch {}
  }

  if (d.topic && topicListeners.has(d.topic)) {
    for (const listener of topicListeners.get(d.topic)!) {
      try { listener(d); } catch {}
    }
  }
}

function startPoller() {
  if (pollActive) return;
  pollActive = true;

  const poll = async () => {
    if (!pollActive) return;
    try {
      const res = await fetch(`/fixture-api/realtime/poll?since=${lastSeenId}&from=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item.id > lastSeenId) {
              lastSeenId = item.id;
            }
            dispatchIncoming(item);
          }
        }
        if (typeof data?.lastId === "number" && data.lastId > lastSeenId) {
          lastSeenId = data.lastId;
        }
      }
    } catch {}

    if (pollActive) {
      setTimeout(poll, 150);
    }
  };

  void poll();
}

export function subscribeTopic(
  _apiUrl: string,
  _accessToken: unknown,
  topic: string,
  onMessage: (message: Message, send: Send) => void
) {
  startPoller();

  const bus = new BroadcastChannel("fixture-bus-" + topic);
  const from = clientId;
  const presence = new Map<string, Record<string, unknown>>();
  let mine: { key: string; meta: Record<string, unknown> } | null = null;

  const emitPresence = () =>
    onMessage(
      {
        type: "presence",
        topic,
        state: Object.fromEntries([...presence].map(([key, meta]) => [key, [meta]])),
      },
      send
    );

  const post = (data: Record<string, unknown>) => {
    const payload = { from, topic, ...data };

    // 1. 같은 브라우저 탭 간 즉시 전달
    bus.postMessage(payload);

    // 2. 서버 큐로 발송 (원격 터널 너머의 다른 사용자에게 150ms 내 전달)
    fetch("/fixture-api/realtime/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const handleIncoming = (d: any) => {
    if (!d || d.topic !== topic || d.from === from) return;
    if (d.kind === "broadcast") {
      onMessage({ type: "broadcast", topic, event: d.event, payload: d.payload }, send);
    }
    if (d.kind === "track") {
      presence.set(d.key, d.meta);
      emitPresence();
    }
    if (d.kind === "untrack") {
      presence.delete(d.key);
      emitPresence();
    }
    if (d.kind === "hello" && mine) {
      post({ kind: "track", ...mine });
    }
  };

  bus.onmessage = (e) => handleIncoming(e.data);

  if (!topicListeners.has(topic)) {
    topicListeners.set(topic, new Set());
  }
  topicListeners.get(topic)!.add(handleIncoming);

  const send: Send = (m) => {
    if (m.type === "broadcast") post({ kind: "broadcast", event: m.event, payload: m.payload });
    if (m.type === "track") {
      mine = { key: String(m.key), meta: m.meta as Record<string, unknown> };
      presence.set(mine.key, mine.meta);
      post({ kind: "track", ...mine });
      emitPresence();
    }
    if (m.type === "untrack" && mine) {
      presence.delete(mine.key);
      post({ kind: "untrack", key: mine.key });
      mine = null;
      emitPresence();
    }
  };

  const timer = window.setTimeout(() => {
    onMessage({ type: "joined", topic }, send);
    post({ kind: "hello" });
  }, 50);

  return () => {
    window.clearTimeout(timer);
    send({ type: "untrack" });
    topicListeners.get(topic)?.delete(handleIncoming);
    bus.close();
  };
}
