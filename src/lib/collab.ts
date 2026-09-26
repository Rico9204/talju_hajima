import * as Y from "yjs";
import { applyTextEdit, fromB64, seedDoc, textHash, toB64, transformIndex, type Delta } from "./collabCore";

export { textHash, transformIndex };
export type { Delta };
export type CollabMode = "main" | "pin";
export interface CollabEditor { key: string; memberId: string; name: string; fileId: number; room: number; mode: CollabMode; }
export interface CollabPresence { key: string; track: (mine: { fileId: number; room: number; mode: CollabMode } | null) => void; leave: () => void; }

type Message = { type?: string; topic?: string; event?: string; payload?: Record<string, unknown>; state?: Record<string, Array<Record<string, unknown>>> };
function connect(topic: string, onMessage: (message: Message, send: (type: string, extra?: Record<string, unknown>) => void) => void) {
  const api = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  let token: string | null = null;
  try { token = JSON.parse(localStorage.getItem("talju-server-session") ?? "null")?.accessToken ?? null; } catch { /* empty */ }
  if (!api || !token) return { send: () => {}, close: () => {} };
  const socket = new WebSocket(api.replace(/^http/, "ws").replace(/\/api$/, "") + "/realtime");
  const send = (type: string, extra: Record<string, unknown> = {}) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...extra })); };
  socket.onopen = () => send("auth", { token });
  socket.onmessage = (event) => { let message: Message; try { message = JSON.parse(String(event.data)); } catch { return; } if (message.type === "ready") send("join", { topic }); else if (message.topic === topic) onMessage(message, send); };
  return { send, close: () => socket.close() };
}

export function joinCollabPresence(projectId: string, me: { id: string; name: string }, onChange: (editors: CollabEditor[]) => void): CollabPresence {
  const key = `${me.id}:${Math.random().toString(36).slice(2, 8)}`;
  let mine: { fileId: number; room: number; mode: CollabMode } | null = null;
  let ready = false;
  const channel = connect(`collab_presence:${projectId}`, (message, send) => {
    if (message.type === "joined") { ready = true; if (mine) send("track", { topic: `collab_presence:${projectId}`, key, meta: { memberId: me.id, name: me.name, ...mine } }); }
    if (message.type === "presence") {
      const editors = Object.entries(message.state ?? {}).flatMap(([entryKey, values]) => values.filter((v) => typeof v.fileId === "number").map((v) => ({ key: entryKey, memberId: String(v.memberId), name: String(v.name), fileId: Number(v.fileId), room: Number(v.room), mode: v.mode === "pin" ? "pin" : "main" as CollabMode })));
      onChange(editors);
    }
  });
  return { key, track: (next) => { mine = next; if (ready) next ? channel.send("track", { topic: `collab_presence:${projectId}`, key, meta: { memberId: me.id, name: me.name, ...next } }) : channel.send("untrack", { topic: `collab_presence:${projectId}` }); }, leave: channel.close };
}

export interface CollabRoom { head: () => number; savedKey: () => string; markSaved: (head: number, key: string) => void; destroy: () => void; }
export function connectCollabRoom(doc: Y.Doc, opts: { projectId: string; fileId: number; room: number; mode: CollabMode; initialKey: string; onSaved: () => void }): CollabRoom {
  let head = opts.room; let saved = opts.initialKey; const topic = `collab_doc:${opts.projectId}:${opts.fileId}:${opts.room}:${opts.mode}`;
  let pending: Uint8Array[] = []; let flushTimer: number | undefined;
  let broadcast = (_event: string, _payload: Record<string, unknown>) => {};
  const flush = () => { window.clearTimeout(flushTimer); flushTimer = undefined; if (pending.length) { broadcast("update", { u: toB64(Y.mergeUpdates(pending)) }); pending = []; } };
  const onUpdate = (update: Uint8Array, origin: unknown) => { if (origin !== "remote" && origin !== "seed") { pending.push(update); flushTimer ??= window.setTimeout(flush, 120); } };
  doc.on("update", onUpdate);
  const channel = connect(topic, (message, send) => {
    broadcast = (event, payload) => send("broadcast", { topic, event, payload });
    if (message.type === "joined") broadcast("sync-req", { sv: toB64(Y.encodeStateVector(doc)) });
    if (message.type !== "broadcast" || !message.payload) return;
    const payload = message.payload;
    if (message.event === "update") Y.applyUpdate(doc, fromB64(String(payload.u)), "remote");
    if (message.event === "sync-req") broadcast("sync-res", { u: toB64(Y.encodeStateAsUpdate(doc, fromB64(String(payload.sv)))), head, saved });
    if (message.event === "sync-res") { Y.applyUpdate(doc, fromB64(String(payload.u)), "remote"); if (typeof payload.head === "number" && payload.head > head) { head = payload.head; saved = String(payload.saved); } }
    if (message.event === "saved" && typeof payload.head === "number" && payload.head >= head) { head = payload.head; saved = String(payload.saved); opts.onSaved(); }
  });
  return { head: () => head, savedKey: () => saved, markSaved: (nextHead, key) => { head = nextHead; saved = key; broadcast("saved", { head: nextHead, saved: key }); }, destroy: () => { flush(); doc.off("update", onUpdate); channel.close(); } };
}
export interface CollabDoc { text: () => string; edit: (oldValue: string, newValue: string, remoteSince?: Delta[]) => void; head: () => number; savedHash: () => string; markSaved: (head: number, text: string) => void; destroy: () => void; }
export function openCollabDoc(opts: { projectId: string; fileId: number; room: number; mode: CollabMode; initialText: string; onRemote: (delta: Delta) => void; onSaved: () => void }): CollabDoc {
  const doc = new Y.Doc(); const text = doc.getText("t"); seedDoc(doc, opts.initialText); text.observe((event) => { if (event.transaction.origin === "remote") opts.onRemote(event.delta as Delta); }); const room = connectCollabRoom(doc, { ...opts, initialKey: textHash(opts.initialText) });
  return { text: () => text.toString(), edit: (oldValue, newValue, remoteSince) => applyTextEdit(doc, oldValue, newValue, remoteSince), head: room.head, savedHash: room.savedKey, markSaved: (nextHead, value) => room.markSaved(nextHead, textHash(value)), destroy: () => { room.destroy(); doc.destroy(); } };
}
