import type { AccessToken } from "./apiClient";

type Message = { type?: string; topic?: string; event?: string; data?: unknown; state?: Record<string, Array<Record<string, unknown>>> };

export class RealtimeClient {
  constructor(private readonly apiUrl: string, private readonly accessToken: AccessToken) {}

  subscribe(topic: string, onMessage: (message: Message, send: (message: Record<string, unknown>) => void) => void) {
    const token = this.accessToken();
    if (!token) return () => {};
    const url = this.apiUrl.replace(/^http/, "ws").replace(/\/api$/, "") + "/realtime";
    const socket = new WebSocket(url);
    const send = (message: Record<string, unknown>) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    socket.onopen = () => send({ type: "auth", token });
    socket.onmessage = (event) => {
      let message: Message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "ready") send({ type: "join", topic });
      else if (message.type === "joined" && message.topic === topic) onMessage(message, send);
      else if (message.topic === topic) onMessage(message, send);
    };
    return () => socket.close();
  }
}
