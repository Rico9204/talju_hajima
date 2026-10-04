// 미리보기용 가짜 실시간 채널(src/api/rest/realtimeClient 대신). 같은 주소의 탭·iframe끼리 BroadcastChannel로
// 서버처럼 방송(다른 사람에게만)과 접속 상태(presence)를 주고받는다.
type Message = { type?: string; topic?: string; event?: string; payload?: Record<string, unknown>; state?: Record<string, Array<Record<string, unknown>>> };
type Send = (message: Record<string, unknown>) => void;
export function subscribeTopic(_apiUrl: string, _accessToken: unknown, topic: string, onMessage: (message: Message, send: Send) => void) {
  const bus = new BroadcastChannel("fixture-realtime");
  const from = Math.random().toString(36).slice(2);
  const presence = new Map<string, Record<string, unknown>>();
  let mine: { key: string; meta: Record<string, unknown> } | null = null;
  const emitPresence = () => onMessage({ type: "presence", topic, state: Object.fromEntries([...presence].map(([key, meta]) => [key, [meta]])) }, send);
  const post = (data: Record<string, unknown>) => bus.postMessage({ from, topic, ...data });
  const send: Send = (m) => {
    if (m.type === "broadcast") post({ kind: "broadcast", event: m.event, payload: m.payload });
    if (m.type === "track") { mine = { key: String(m.key), meta: m.meta as Record<string, unknown> }; presence.set(mine.key, mine.meta); post({ kind: "track", ...mine }); emitPresence(); }
    if (m.type === "untrack" && mine) { presence.delete(mine.key); post({ kind: "untrack", key: mine.key }); mine = null; emitPresence(); }
  };
  bus.onmessage = (e) => {
    const d = e.data;
    if (d.topic !== topic || d.from === from) return;
    if (d.kind === "broadcast") onMessage({ type: "broadcast", topic, event: d.event, payload: d.payload }, send);
    if (d.kind === "track") { presence.set(d.key, d.meta); emitPresence(); }
    if (d.kind === "untrack") { presence.delete(d.key); emitPresence(); }
    if (d.kind === "hello" && mine) post({ kind: "track", ...mine });
  };
  const timer = window.setTimeout(() => { onMessage({ type: "joined", topic }, send); post({ kind: "hello" }); }, 50);
  return () => { window.clearTimeout(timer); send({ type: "untrack" }); bus.close(); };
}
