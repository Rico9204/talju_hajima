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

// 방 하나의 전송 담당(Realtime broadcast): 로컬 변경 모아 보내기, 늦게 들어온 사람 따라잡기(sync-req/res),
// 저장 알림(saved). 문서 내용의 모양(Y.Text, Y.XmlFragment 등)과 무관해서 텍스트·문서 편집이 함께 쓴다.
// savedKey는 "마지막으로 저장된 내용"을 비교하는 값(텍스트 해시 등)으로, 호출하는 쪽이 정한다.
export interface CollabRoom {
  head: () => number;
  savedKey: () => string;
  markSaved: (head: number, key: string) => void;
  destroy: () => void;
}

export function connectCollabRoom(doc: Y.Doc, opts: {
  projectId: string;
  fileId: number;
  room: number;
  mode: CollabMode;
  initialKey: string;
  onSaved: () => void;
}): CollabRoom {
  let head = opts.room;
  let saved = opts.initialKey;
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
  // 원격·초기 적용(origin "remote"/"seed")이 아닌 모든 변경을 보낸다(편집기 라이브러리는 자기 origin을 쓴다).
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote" || origin === "seed") return;
    pending.push(update);
    flushTimer ??= window.setTimeout(flush, 120);
  };
  doc.on("update", onUpdate);

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
    head: () => head,
    savedKey: () => saved,
    markSaved: (newHead, key) => {
      head = newHead;
      saved = key;
      send("saved", { head: newHead, saved: key });
    },
    destroy: () => { flush(); doc.off("update", onUpdate); void supabase.removeChannel(channel); },
  };
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
  ytext.observe((event) => { if (event.transaction.origin === "remote") opts.onRemote(event.delta as Delta); });
  const room = connectCollabRoom(doc, { ...opts, initialKey: textHash(opts.initialText) });

  return {
    text: () => ytext.toString(),
    edit: (oldValue, newValue, remoteSince) => applyTextEdit(doc, oldValue, newValue, remoteSince),
    head: room.head,
    savedHash: room.savedKey,
    markSaved: (newHead, text) => room.markSaved(newHead, textHash(text)),
    destroy: () => { room.destroy(); doc.destroy(); },
  };
}
