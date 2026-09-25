import * as Y from "yjs";
import { supabase } from "./supabase";
import { applyTextEdit, fromB64, seedDoc, textHash, toB64, transformIndex, type Delta } from "./collabCore";

export { textHash, transformIndex };
export type { Delta };

// 워크스페이스 "바로 수정"(동시 편집). Yjs 문서를 Supabase Realtime으로 동기화한다.
//  - collab_presence:<project> : 누가 어떤 파일을 수정 중인지 (목록 배지, 편집창의 함께 수정 중 표시)
//  - collab_doc:<project>:<file>:<room>:<mode> : 그 방의 Yjs 업데이트 broadcast
// room = 편집을 시작한 기준 버전 id. mode "main" = 현재 버전 이어쓰기, "pin" = 핀 버전에서 분기.

export type CollabMode = "main" | "pin";

export interface CollabEditor {
  key: string; // 탭 단위 고유 키
  memberId: string;
  name: string;
  fileId: number;
  room: number;
  mode: CollabMode;
}

export interface CollabPresence {
  key: string;
  track: (mine: { fileId: number; room: number; mode: CollabMode } | null) => void;
  leave: () => void;
}

export function joinCollabPresence(projectId: string, me: { id: string; name: string }, onChange: (editors: CollabEditor[]) => void): CollabPresence {
  const key = `${me.id}:${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase.channel(`collab_presence:${projectId}`, { config: { private: true, presence: { key } } });
  let ready = false;
  let mine: { fileId: number; room: number; mode: CollabMode } | null = null;
  const read = (): CollabEditor[] =>
    Object.entries(channel.presenceState<{ memberId: string; name: string; fileId: number; room: number; mode: CollabMode }>()).flatMap(([k, metas]) =>
      metas.filter((m) => typeof m.fileId === "number").map((m) => ({ key: k, memberId: m.memberId, name: m.name, fileId: m.fileId, room: m.room, mode: m.mode })));
  async function push() {
    if (!ready) return;
    if (mine) await channel.track({ memberId: me.id, name: me.name, ...mine });
    else await channel.untrack();
  }
  channel
    .on("presence", { event: "sync" }, () => onChange(read()))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") { ready = true; void push(); }
    });
  return {
    key,
    track: (next) => { mine = next; void push(); },
    leave: () => { void supabase.removeChannel(channel); },
  };
}

export interface CollabDoc {
  text: () => string;
  edit: (oldValue: string, newValue: string, remoteSince?: Delta[]) => void;
  head: () => number;
  savedHash: () => string;
  markSaved: (head: number, text: string) => void;
  destroy: () => void;
}

export function openCollabDoc(opts: {
  projectId: string;
  fileId: number;
  room: number;
  mode: CollabMode;
  initialText: string;
  onRemote: (delta: Delta) => void;
  onSaved: () => void;
}): CollabDoc {
  const doc = new Y.Doc();
  const ytext = doc.getText("t");
  seedDoc(doc, opts.initialText);

  let head = opts.room;
  let saved = textHash(opts.initialText);
  const channel = supabase.channel(`collab_doc:${opts.projectId}:${opts.fileId}:${opts.room}:${opts.mode}`, {
    config: { private: true, broadcast: { self: false } },
  });
  const send = (event: string, payload: Record<string, unknown>) => { void channel.send({ type: "broadcast", event, payload }); };

  // Realtime은 초당 전송 수에 제한이 있어서 타자마다 보내지 않고 모아서(≈120ms) 한 번에 보낸다.
  let pending: Uint8Array[] = [];
  let flushTimer: number | undefined;
  const flush = () => {
    window.clearTimeout(flushTimer);
    flushTimer = undefined;
    if (!pending.length) return;
    send("update", { u: toB64(Y.mergeUpdates(pending)) });
    pending = [];
  };
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "local") return;
    pending.push(update);
    flushTimer ??= window.setTimeout(flush, 120);
  });
  ytext.observe((event) => { if (event.transaction.origin === "remote") opts.onRemote(event.delta as Delta); });

  channel
    .on("broadcast", { event: "update" }, ({ payload }) => { Y.applyUpdate(doc, fromB64(payload.u as string), "remote"); })
    .on("broadcast", { event: "sync-req" }, ({ payload }) => {
      send("sync-res", { u: toB64(Y.encodeStateAsUpdate(doc, fromB64(payload.sv as string))), head, saved });
    })
    .on("broadcast", { event: "sync-res" }, ({ payload }) => {
      Y.applyUpdate(doc, fromB64(payload.u as string), "remote");
      if (typeof payload.head === "number" && payload.head > head) { head = payload.head; saved = payload.saved as string; }
    })
    .on("broadcast", { event: "saved" }, ({ payload }) => {
      if (typeof payload.head === "number" && payload.head >= head) { head = payload.head; saved = payload.saved as string; opts.onSaved(); }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") send("sync-req", { sv: toB64(Y.encodeStateVector(doc)) });
    });

  return {
    text: () => ytext.toString(),
    edit: (oldValue, newValue, remoteSince) => applyTextEdit(doc, oldValue, newValue, remoteSince),
    head: () => head,
    savedHash: () => saved,
    markSaved: (newHead, text) => {
      head = newHead;
      saved = textHash(text);
      send("saved", { head: newHead, saved });
    },
    destroy: () => { flush(); void supabase.removeChannel(channel); doc.destroy(); },
  };
}
