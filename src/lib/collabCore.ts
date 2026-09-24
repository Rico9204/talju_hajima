import * as Y from "yjs";

// Supabase 없이 검증 가능한 순수 로직(동시 편집 코어).

export function toB64(u: Uint8Array): string {
  let s = "";
  u.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}
export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function textHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${(h >>> 0).toString(36)}:${s.length}`;
}

export type Delta = { retain?: number; insert?: unknown; delete?: number }[];

// 원격 변경 뒤에도 내 커서가 같은 글자 옆에 있도록 인덱스를 옮긴다.
export function transformIndex(index: number, delta: Delta): number {
  let oldPos = 0;
  let shift = 0;
  for (const op of delta) {
    if (op.retain) oldPos += op.retain;
    else if (typeof op.insert === "string") { if (oldPos < index) shift += op.insert.length; }
    else if (op.delete) { if (oldPos < index) shift -= Math.min(op.delete, index - oldPos); oldPos += op.delete; }
  }
  return index + shift;
}

// 모두가 같은 초기 구조를 갖도록 고정 clientID로 만든 업데이트를 적용한다(중복 삽입 방지).
export function seedDoc(doc: Y.Doc, initialText: string) {
  const seed = new Y.Doc();
  seed.clientID = 1;
  seed.getText("t").insert(0, initialText);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed), "seed");
}

// textarea 값 변경(공통 앞/뒤를 제외한 구간)을 Y.Text에 반영한다.
export function applyTextEdit(doc: Y.Doc, oldValue: string, newValue: string) {
  const ytext = doc.getText("t");
  let p = 0;
  while (p < oldValue.length && p < newValue.length && oldValue[p] === newValue[p]) p++;
  let so = oldValue.length;
  let sn = newValue.length;
  while (so > p && sn > p && oldValue[so - 1] === newValue[sn - 1]) { so--; sn--; }
  doc.transact(() => {
    if (so > p) ytext.delete(p, so - p);
    if (sn > p) ytext.insert(p, newValue.slice(p, sn));
  }, "local");
}
