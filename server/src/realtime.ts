import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { TokenService } from "./auth.js";
import { Db, scalarJson, selectOneJson } from "./db.js";
import { mapMessage, mapToolEvent } from "./mappers.js";

// ── 실시간(Supabase Realtime 대체) ──
// 하나의 WebSocket(/realtime)으로 세 가지를 한다. 채널 이름은 Supabase 때와 같다.
//  1) DB 변경 알림: chat_messages·message_reads·chat_tool_events·chat_group_members·tasks·schedule_events·files·
//     task_comment_reactions:<프로젝트>. DB 트리거(db/realtime.sql)가 행의 키만 알리고, 서버가 구독자마다
//     "그 사람으로서" 행을 다시 읽어(RLS) 볼 수 있을 때만 보낸다 — 남의 1:1·나만 보기 일정이 새지 않는다.
//  2) 접속 상태(presence·collab_presence:<프로젝트>): 키·팀원 id는 서버가 정한다(남으로 위장 불가).
//  3) 방송(collab_doc:…): 동시 편집 Yjs 업데이트를 같은 방의 다른 사람에게 그대로 전달.
// 구독 권한은 DB 함수 can_access_project_realtime_topic 이 정한다(Supabase 때와 같은 함수).
//
// 주고받는 메시지(JSON):
//   → {type:"auth", token}                     ← {type:"ready"}          (연결 후 10초 안에, 아니면 끊음)
//   → {type:"join", topic, ref?}               ← {type:"joined", topic, ref} | {type:"error", topic, ref, message}
//   → {type:"leave", topic}
//   → {type:"track", topic, key?, meta} / {type:"untrack", topic}   ← {type:"presence", topic, state:{키:[meta…]}}
//   → {type:"broadcast", topic, event, payload}                    ← (다른 사람에게) 같은 모양
//                                              ← {type:"change", topic, event, data}  (DB 변경)
//                                              ← {type:"left", topic}  (권한이 사라져 구독 해제)

const PATH = "/realtime";
const MAX_TOPICS = 100;
const MAX_META_BYTES = 2048;
const AUTH_TIMEOUT_MS = 10_000;
const REVALIDATE_MS = 5 * 60_000;
const BROADCASTS_PER_SECOND = 60;
const PRESENCE_TOPIC = /^(presence|collab_presence):([^:]+)$/;
const BROADCAST_TOPIC = /^collab_doc:/;

interface Conn {
  ws: WebSocket;
  userId: string | null;
  topics: Map<string, { memberId: string | null }>;
  presence: Map<string, { key: string; meta: Record<string, unknown> }>;
  queue: Promise<void>; // 한 연결의 메시지·알림은 차례대로 처리(순서 유지)
  expiryTimer?: NodeJS.Timeout;
  budget: { count: number; resetAt: number };
}

interface Notification {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  project: string;
  row: Record<string, unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class RealtimeHub implements OnModuleDestroy {
  private readonly logger = new Logger("Realtime");
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
  private readonly subscribers = new Map<string, Set<Conn>>();
  private readonly conns = new Set<Conn>();
  private unlisten?: () => Promise<void>;
  private revalidateTimer?: NodeJS.Timeout;

  constructor(private readonly db: Db, private readonly tokens: TokenService, private readonly allowedOrigins: string[]) {}

  async start(server: Server): Promise<void> {
    server.on("upgrade", (request, socket, head) => {
      if (new URL(request.url ?? "", "http://localhost").pathname !== PATH) return;
      // 브라우저는 항상 Origin을 보낸다. 허용하지 않은 사이트에서 여는 연결은 거부(다른 사이트가 사용자 몰래 붙는 것 방지).
      const origin = request.headers.origin;
      if (origin && !this.allowedOrigins.includes(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => this.onConnection(ws));
    });
    this.unlisten = await this.db.listen("talju_realtime", (payload) => this.onNotification(payload));
    this.revalidateTimer = setInterval(() => void this.revalidateAll(), REVALIDATE_MS);
    this.revalidateTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.revalidateTimer);
    await this.unlisten?.();
    for (const conn of this.conns) conn.ws.terminate();
    this.wss.close();
  }

  private send(conn: Conn, message: Record<string, unknown>): void {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(message));
  }

  private enqueue(conn: Conn, task: () => Promise<void>): void {
    conn.queue = conn.queue.then(task).catch((error) => {
      this.logger.warn(error instanceof Error ? error.message : String(error));
      this.send(conn, { type: "error", message: "요청을 처리하지 못했습니다." });
    });
  }

  private onConnection(ws: WebSocket): void {
    const conn: Conn = { ws, userId: null, topics: new Map(), presence: new Map(), queue: Promise.resolve(), budget: { count: 0, resetAt: 0 } };
    this.conns.add(conn);
    const authTimer = setTimeout(() => { if (!conn.userId) ws.close(4001, "auth timeout"); }, AUTH_TIMEOUT_MS);
    ws.on("message", (data: RawData) => this.enqueue(conn, () => this.onMessage(conn, data)));
    ws.on("close", () => {
      clearTimeout(authTimer);
      clearTimeout(conn.expiryTimer);
      for (const topic of [...conn.topics.keys()]) this.leave(conn, topic);
      this.conns.delete(conn);
    });
  }

  private async onMessage(conn: Conn, data: RawData): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
      if (!isPlainObject(msg)) throw new Error();
    } catch {
      return this.send(conn, { type: "error", message: "JSON 메시지만 받습니다." });
    }
    const topic = typeof msg.topic === "string" ? msg.topic : "";
    if (!conn.userId) {
      if (msg.type !== "auth") return this.send(conn, { type: "error", message: "먼저 로그인 토큰을 보내 주세요." });
      try {
        const { userId, expiresAt } = await this.tokens.verifyClaims(String(msg.token ?? ""));
        conn.userId = userId;
        const ms = Math.min(Math.max(expiresAt * 1000 - Date.now(), 0), 2 ** 31 - 1);
        conn.expiryTimer = setTimeout(() => conn.ws.close(4001, "token expired"), ms);
        this.send(conn, { type: "ready" });
      } catch {
        conn.ws.close(4001, "invalid token");
      }
      return;
    }
    switch (msg.type) {
      case "join": return this.join(conn, topic, msg.ref);
      case "leave": return void this.leave(conn, topic);
      case "track": return this.track(conn, topic, msg.key, msg.meta);
      case "untrack": return this.untrack(conn, topic);
      case "broadcast": return this.broadcast(conn, topic, msg.event, msg.payload);
      default: return this.send(conn, { type: "error", message: "알 수 없는 메시지 종류입니다." });
    }
  }

  private canAccess(userId: string, topic: string): Promise<boolean> {
    return this.db.asUser(userId, (query) => scalarJson<boolean>(query, "public.can_access_project_realtime_topic($1)", [topic]))
      .then((ok) => ok === true, () => false);
  }

  private async join(conn: Conn, topic: string, ref: unknown): Promise<void> {
    if (conn.topics.has(topic)) return this.send(conn, { type: "joined", topic, ref });
    if (!topic || topic.length > 300 || conn.topics.size >= MAX_TOPICS || !(await this.canAccess(conn.userId!, topic))) {
      return this.send(conn, { type: "error", topic, ref, message: "이 채널을 구독할 권한이 없습니다." });
    }
    const presence = PRESENCE_TOPIC.exec(topic);
    const memberId = presence
      ? (await this.db.asUser(conn.userId!, (query) =>
        selectOneJson(query, "select id from public.members where project_id = $1 and user_id = auth.uid()", [presence[2]])))?.id ?? null
      : null;
    conn.topics.set(topic, { memberId });
    if (!this.subscribers.has(topic)) this.subscribers.set(topic, new Set());
    this.subscribers.get(topic)!.add(conn);
    this.send(conn, { type: "joined", topic, ref });
    if (presence) this.send(conn, { type: "presence", topic, state: this.presenceState(topic) });
  }

  private leave(conn: Conn, topic: string): void {
    if (!conn.topics.delete(topic)) return;
    const subs = this.subscribers.get(topic);
    subs?.delete(conn);
    if (subs && subs.size === 0) this.subscribers.delete(topic);
    if (conn.presence.delete(topic)) this.emitPresence(topic);
  }

  // 접속 상태: presence 채널의 키 = 내 팀원 id, collab_presence(탭마다) = "<팀원 id>:<탭 표시>". meta.memberId도 서버 값으로 덮는다.
  private track(conn: Conn, topic: string, key: unknown, meta: unknown): void {
    const joined = conn.topics.get(topic);
    const presence = PRESENCE_TOPIC.exec(topic);
    if (!joined || !presence || !joined.memberId) return this.send(conn, { type: "error", topic, message: "먼저 이 채널에 참여해 주세요." });
    if (!isPlainObject(meta) || Buffer.byteLength(JSON.stringify(meta)) > MAX_META_BYTES) {
      return this.send(conn, { type: "error", topic, message: "상태 정보가 올바르지 않거나 너무 큽니다." });
    }
    const suffix = typeof key === "string" && /^[^:]+:([a-z0-9]{1,16})$/i.test(key) ? key.split(":")[1] : randomBytes(3).toString("hex");
    const presenceKey = presence[1] === "presence" ? joined.memberId : `${joined.memberId}:${suffix}`;
    conn.presence.set(topic, { key: presenceKey, meta: { ...meta, memberId: joined.memberId } });
    this.emitPresence(topic);
  }

  private untrack(conn: Conn, topic: string): void {
    if (conn.presence.delete(topic)) this.emitPresence(topic);
  }

  private presenceState(topic: string): Record<string, Record<string, unknown>[]> {
    const state: Record<string, Record<string, unknown>[]> = {};
    for (const conn of this.subscribers.get(topic) ?? []) {
      const mine = conn.presence.get(topic);
      if (mine) (state[mine.key] ??= []).push(mine.meta);
    }
    return state;
  }

  private emitPresence(topic: string): void {
    const state = this.presenceState(topic);
    for (const conn of this.subscribers.get(topic) ?? []) this.send(conn, { type: "presence", topic, state });
  }

  // 동시 편집 방송: 같은 방의 다른 사람에게만. 초당 횟수 제한.
  private broadcast(conn: Conn, topic: string, event: unknown, payload: unknown): void {
    if (!BROADCAST_TOPIC.test(topic) || !conn.topics.has(topic)) return this.send(conn, { type: "error", topic, message: "먼저 이 채널에 참여해 주세요." });
    if (typeof event !== "string" || event.length > 30 || !isPlainObject(payload)) return this.send(conn, { type: "error", topic, message: "잘못된 방송입니다." });
    const now = Date.now();
    if (now >= conn.budget.resetAt) conn.budget = { count: 0, resetAt: now + 1000 };
    if (++conn.budget.count > BROADCASTS_PER_SECOND) return this.send(conn, { type: "error", topic, message: "너무 자주 보내고 있습니다." });
    for (const other of this.subscribers.get(topic) ?? []) {
      if (other !== conn) this.send(other, { type: "broadcast", topic, event, payload });
    }
  }

  private onNotification(raw: string): void {
    let n: Notification;
    try { n = JSON.parse(raw); } catch { return; }
    const topicTable = n.table === "message_reactions" ? "chat_messages" : n.table;
    const topic = `${topicTable}:${n.project}`;
    for (const conn of this.subscribers.get(topic) ?? []) this.enqueue(conn, () => this.deliver(conn, topic, n));
  }

  // 구독자로서 다시 읽어 볼 수 있을 때만 보낸다(권한 규칙 그대로).
  private async deliver(conn: Conn, topic: string, n: Notification): Promise<void> {
    const userId = conn.userId;
    if (!userId || !conn.topics.has(topic)) return;
    const row = n.row;
    const one = (sql: string, params: unknown[]) => this.db.asUser(userId, (query) => selectOneJson(query, sql, params));
    const change = (event: string, data: unknown) => this.send(conn, { type: "change", topic, event, data });
    switch (n.table) {
      case "chat_messages": {
        const message = await one("select * from public.chat_messages where id = $1", [row.id]);
        if (message) change("message", mapMessage({ ...message, message_reads: [], message_reactions: [] }));
        return;
      }
      case "message_reactions":
        if (await one("select 1 as ok from public.chat_messages where id = $1", [row.message_id])) {
          change("reaction", { active: n.op === "INSERT", reaction: { messageId: row.message_id, memberId: row.member_id, emoji: row.emoji } });
        }
        return;
      case "message_reads":
        if (await one("select 1 as ok from public.chat_messages where id = $1", [row.message_id])) change("read", { messageId: row.message_id, memberId: row.member_id });
        return;
      case "chat_tool_events": {
        const event = await one("select * from public.chat_tool_events where id = $1", [row.id]);
        if (event) change("tool_event", mapToolEvent(event));
        return;
      }
      case "chat_group_members":
        if (await one("select 1 as ok from public.chat_group_members where group_id = $1 and member_id = $2", [row.group_id, row.member_id])) {
          change("group_member", { groupId: row.group_id, memberId: row.member_id });
        }
        return;
      case "tasks":
      case "schedule_events":
      case "files":
        // 지운 행은 다시 읽을 수 없으므로 "바뀜"만 알린다(화면은 목록을 다시 받는다).
        if (n.op === "DELETE" || await one(`select 1 as ok from public.${n.table} where id = $1`, [row.id])) change("changed", { op: n.op, id: row.id });
        return;
      case "task_comment_reactions":
        if (n.op === "DELETE" || await one("select 1 as ok from public.task_comments where id = $1", [row.comment_id])) change("changed", { op: n.op });
        return;
    }
  }

  // 구독 중 팀에서 제외되는 등 권한이 사라진 채널은 주기적으로 정리한다.
  async revalidateAll(): Promise<void> {
    for (const conn of this.conns) {
      if (!conn.userId) continue;
      for (const topic of [...conn.topics.keys()]) {
        if (!(await this.canAccess(conn.userId, topic))) {
          this.leave(conn, topic);
          this.send(conn, { type: "left", topic });
        }
      }
    }
  }
}
