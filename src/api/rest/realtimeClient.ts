import type { AccessToken } from "./apiClient";
import { realtimeUrl } from "./backendUrl";

type Message = { type?: string; topic?: string; event?: string; data?: unknown; payload?: Record<string, unknown>; state?: Record<string, Array<Record<string, unknown>>> };
type Send = (message: Record<string, unknown>) => void;

// 한 주제를 구독하는 WebSocket. 토큰 만료(서버가 4001로 끊음)·네트워크 끊김이면 새 토큰으로 다시 연결하고 다시 join한다
// → 받는 쪽은 "joined"를 받을 때마다 상태(presence track, 동시 편집 sync)를 다시 보내면 된다.
export function subscribeTopic(apiUrl: string, accessToken: AccessToken, topic: string, onMessage: (message: Message, send: Send) => void) {
  const url = realtimeUrl(apiUrl);
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: number | undefined;
  const send: Send = (message) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
  const retry = () => { if (!stopped) timer = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt++)); };
  async function open() {
    let token: string | null;
    try { token = await accessToken(); } catch { retry(); return; } // 서버에 닿지 않음 → 나중에 다시
    if (stopped || !token) return; // 로그아웃됨
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = (event) => {
      let message: Message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "ready") send({ type: "join", topic });
      else if (message.topic === topic) { if (message.type === "joined") attempt = 0; onMessage(message, send); }
    };
    ws.onclose = () => { if (socket === ws) { socket = null; retry(); } };
  }
  void open();
  return () => { stopped = true; window.clearTimeout(timer); socket?.close(); socket = null; };
}

export class RealtimeClient {
  constructor(private readonly apiUrl: string, private readonly accessToken: AccessToken) {}

  subscribe(topic: string, onMessage: (message: Message, send: Send) => void) {
    return subscribeTopic(this.apiUrl, this.accessToken, topic, onMessage);
  }
}
