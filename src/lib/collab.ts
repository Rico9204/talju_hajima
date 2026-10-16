import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { subscribeTopic } from "../api/rest/realtimeClient";
import { accessToken } from "../api/rest/session";
import { applyTextEdit, fromB64, seedDoc, textHash, toB64, transformIndex, type Delta } from "./collabCore";

export { textHash, transformIndex };
export type { Delta };
export type CollabMode = "main" | "pin";
// 접속 상태에만 쓰는 모드: "office" = 오피스 편집기로 여는 중(동시 편집은 문서 서버가 하므로 방·동기화 없음, room은 0).
export type PresenceMode = CollabMode | "office";
export interface CollabEditor { key: string; memberId: string; name: string; fileId: number; room: number; mode: PresenceMode; }
export interface CollabPresence { key: string; me: { id: string; name: string }; track: (mine: { fileId: number; room: number; mode: PresenceMode } | null) => void; leave: () => void; }

type Message = { type?: string; topic?: string; event?: string; payload?: Record<string, unknown>; state?: Record<string, Array<Record<string, unknown>>> };
function connect(topic: string, onMessage: (message: Message, send: (type: string, extra?: Record<string, unknown>) => void) => void) {
  const api = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (!api) return { send: () => {}, close: () => {} };
  let raw: (message: Record<string, unknown>) => void = () => {};
  const send = (type: string, extra: Record<string, unknown> = {}) => raw({ type, ...extra });
  const close = subscribeTopic(api, accessToken, topic, (message, sendRaw) => { raw = sendRaw; onMessage(message, send); });
  return { send, close };
}

export function joinCollabPresence(projectId: string, me: { id: string; name: string }, onChange: (editors: CollabEditor[]) => void): CollabPresence {
  const key = `${me.id}:${Math.random().toString(36).slice(2, 8)}`;
  let mine: { fileId: number; room: number; mode: PresenceMode } | null = null;
  let ready = false;
  const channel = connect(`collab_presence:${projectId}`, (message, send) => {
    if (message.type === "joined") { ready = true; if (mine) send("track", { topic: `collab_presence:${projectId}`, key, meta: { memberId: me.id, name: me.name, ...mine } }); }
    if (message.type === "presence") {
      const editors = Object.entries(message.state ?? {}).flatMap(([entryKey, values]) => values.filter((v) => typeof v.fileId === "number").map((v) => ({ key: entryKey, memberId: String(v.memberId), name: String(v.name), fileId: Number(v.fileId), room: Number(v.room), mode: v.mode === "pin" || v.mode === "office" ? v.mode : "main" as PresenceMode })));
      onChange(editors);
    }
  });
  return { key, me, track: (next) => { mine = next; if (ready) next ? channel.send("track", { topic: `collab_presence:${projectId}`, key, meta: { memberId: me.id, name: me.name, ...next } }) : channel.send("untrack", { topic: `collab_presence:${projectId}` }); }, leave: channel.close };
}

// 커서 색: 사람마다 늘 같은 색(편집기 커서 플러그인이 #rrggbb 형식만 받는다).
const CURSOR_COLORS = ["#ef4444", "#f97316", "#d97706", "#16a34a", "#0d9488", "#0284c7", "#4f46e5", "#9333ea", "#db2777", "#65a30d"];
export function cursorColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}
export interface CursorUser { name: string; color: string; }

// awareness = 같은 방 사람들의 커서·선택 위치와 이름·색(저장되지 않는 휘발성 상태). 문서 업데이트와 같은 방송 채널로
// "aw" 이벤트를 주고받는다. 들어올 때(joined)와 남이 들어올 때(sync-req) 내 상태를 다시 보내고, 나갈 때(창 닫기 포함) 지운다.
// 연결이 끊긴 사람의 커서는 y-protocols가 30초 뒤에 지운다(각자 15초마다 상태를 갱신). awareness는 문서가 없어질 때 함께 정리된다.
export interface CollabRoom { awareness: Awareness; head: () => number; savedKey: () => string; markSaved: (head: number, key: string) => void; destroy: () => void; }
export function connectCollabRoom(doc: Y.Doc, opts: { projectId: string; fileId: number; room: number; mode: CollabMode; initialKey: string; me?: { id: string; name: string }; awareness?: Awareness; onSaved: () => void }): CollabRoom {
  const awareness = opts.awareness ?? new Awareness(doc);
  const user: CursorUser | null = opts.me ? { name: opts.me.name, color: cursorColor(opts.me.id) } : null;
  if (user) awareness.setLocalState({ ...awareness.getLocalState(), user });
  let head = opts.room; let saved = opts.initialKey; const topic = `collab_doc:${opts.projectId}:${opts.fileId}:${opts.room}:${opts.mode}`;
  let pending: Uint8Array[] = []; let flushTimer: number | undefined;
  let broadcast = (_event: string, _payload: Record<string, unknown>) => {};
  const flush = () => { window.clearTimeout(flushTimer); flushTimer = undefined; if (pending.length) { broadcast("update", { u: toB64(Y.mergeUpdates(pending)) }); pending = []; } };
  const onUpdate = (update: Uint8Array, origin: unknown) => { if (origin !== "remote" && origin !== "seed") { pending.push(update); flushTimer ??= window.setTimeout(flush, 120); } };
  doc.on("update", onUpdate);
  // 커서는 움직일 때마다 바뀌므로 0.1초에 한 번만 보낸다(서버 방송 한도: 연결당 초당 60번).
  let awTimer: number | undefined; const awChanged = new Set<number>();
  const sendAw = () => { window.clearTimeout(awTimer); awTimer = undefined; if (awChanged.size) { broadcast("aw", { u: toB64(encodeAwarenessUpdate(awareness, [...awChanged])) }); awChanged.clear(); } };
  const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === "remote") return;
    for (const id of [...added, ...updated, ...removed]) awChanged.add(id);
    awTimer ??= window.setTimeout(sendAw, 100);
  };
  awareness.on("update", onAwareness);
  const announce = () => { if (awareness.getLocalState()) { awChanged.add(doc.clientID); sendAw(); } };
  const leave = () => { awareness.setLocalState(null); sendAw(); };
  const back = (e: PageTransitionEvent) => { if (e.persisted && user) awareness.setLocalState({ user }); }; // 뒤로 가기로 되살아난 페이지
  window.addEventListener("pagehide", leave);
  window.addEventListener("pageshow", back);
  const channel = connect(topic, (message, send) => {
    broadcast = (event, payload) => send("broadcast", { topic, event, payload });
    if (message.type === "joined") { broadcast("sync-req", { sv: toB64(Y.encodeStateVector(doc)) }); announce(); }
    if (message.type !== "broadcast" || !message.payload) return;
    const payload = message.payload;
    if (message.event === "update") Y.applyUpdate(doc, fromB64(String(payload.u)), "remote");
    if (message.event === "sync-req") { broadcast("sync-res", { u: toB64(Y.encodeStateAsUpdate(doc, fromB64(String(payload.sv)))), head, saved }); announce(); }
    if (message.event === "aw" && typeof payload.u === "string") { try { applyAwarenessUpdate(awareness, fromB64(payload.u), "remote"); } catch { /* 깨진 상태는 무시 */ } }
    if (message.event === "sync-res") { Y.applyUpdate(doc, fromB64(String(payload.u)), "remote"); if (typeof payload.head === "number" && payload.head > head) { head = payload.head; saved = String(payload.saved); } }
    if (message.event === "saved" && typeof payload.head === "number" && payload.head >= head) { head = payload.head; saved = String(payload.saved); opts.onSaved(); }
  });
  return {
    awareness, head: () => head, savedKey: () => saved, markSaved: (nextHead, key) => { head = nextHead; saved = key; broadcast("saved", { head: nextHead, saved: key }); },
    destroy: () => { flush(); leave(); window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", back); awareness.off("update", onAwareness); doc.off("update", onUpdate); channel.close(); },
  };
}
// 다른 사람의 커서(바로 수정): anchor = 선택 시작, head = 커서가 있는 쪽. 글자 위치(textarea selectionStart와 같은 단위).
export interface RemoteCursor { clientId: number; user: CursorUser; anchor: number; head: number; }
export interface CollabDoc {
  text: () => string; edit: (oldValue: string, newValue: string, remoteSince?: Delta[]) => void; head: () => number; savedHash: () => string; markSaved: (head: number, text: string) => void; destroy: () => void;
  setCursor: (anchor: number, head: number) => void; cursors: () => RemoteCursor[]; onCursors: (listener: () => void) => () => void;
}
export function openCollabDoc(opts: { projectId: string; fileId: number; room: number; mode: CollabMode; initialText: string; me?: { id: string; name: string }; onRemote: (delta: Delta) => void; onSaved: () => void }): CollabDoc {
  const doc = new Y.Doc(); const text = doc.getText("t"); seedDoc(doc, opts.initialText); text.observe((event) => { if (event.transaction.origin === "remote") opts.onRemote(event.delta as Delta); }); const room = connectCollabRoom(doc, { ...opts, initialKey: textHash(opts.initialText) });
  const { awareness } = room;
  // 위치는 글자 번호가 아니라 Yjs 상대 위치로 보낸다 — 다른 사람이 앞쪽에 글을 넣어도 커서가 같은 글자 옆에 남는다.
  const toRel = (index: number) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, index));
  const toAbs = (json: unknown) => { try { return Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc)?.index ?? null; } catch { return null; } };
  return {
    text: () => text.toString(), edit: (oldValue, newValue, remoteSince) => applyTextEdit(doc, oldValue, newValue, remoteSince), head: room.head, savedHash: room.savedKey, markSaved: (nextHead, value) => room.markSaved(nextHead, textHash(value)), destroy: () => { room.destroy(); doc.destroy(); },
    setCursor: (anchor, head) => { if (awareness.getLocalState()) awareness.setLocalStateField("cursor", { anchor: toRel(anchor), head: toRel(head) }); },
    cursors: () => [...awareness.getStates()].flatMap(([clientId, state]) => {
      const user = state.user as CursorUser | undefined; const cursor = state.cursor as { anchor?: unknown; head?: unknown } | null | undefined;
      if (clientId === doc.clientID || !user || !cursor) return [];
      const anchor = toAbs(cursor.anchor); const head = toAbs(cursor.head);
      return anchor === null || head === null ? [] : [{ clientId, user, anchor, head }];
    }),
    onCursors: (listener) => { awareness.on("change", listener); return () => awareness.off("change", listener); },
  };
}
