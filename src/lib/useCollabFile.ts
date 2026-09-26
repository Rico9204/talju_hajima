import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { connectCollabRoom, type CollabMode, type CollabPresence, type CollabRoom } from "./collab";

const AUTOSAVE_MS = 5 * 60 * 1000;

// 문서·슬라이드 편집기가 함께 쓰는 "저장된 파일을 여러 명이 함께 고치는" 흐름.
//  - 저장된 바이트(Yjs 상태)로 문서를 만들고 같은 방(파일·기준 버전·모드)에 실시간 연결
//  - 저장 버튼·Ctrl/⌘+S·5분 자동 저장, 이미 같은 내용이 저장돼 있으면 건너뜀
//  - 저장 안 한 변경이 있으면 닫을 때 확인, 탭을 닫으면 브라우저 경고
// keyOf: 저장 비교값(내용이 같으면 같은 값), textOf: 검색·버전 비교용 글자.
export function useCollabFile(opts: {
  projectId: string;
  fileId: number;
  room: number;
  mode: CollabMode;
  initialBytes: Uint8Array;
  presence: CollabPresence;
  keyOf: (doc: Y.Doc) => string;
  textOf: (doc: Y.Doc) => string;
  save: (bytes: Uint8Array, text: string, baseVersionId: number, auto: boolean) => Promise<number>;
}) {
  const [doc] = useState(() => {
    const d = new Y.Doc();
    Y.applyUpdate(d, opts.initialBytes, "seed");
    return d;
  });
  const roomRef = useRef<CollabRoom | null>(null);
  const saving = useRef(false);
  const saveRef = useRef(opts.save);
  saveRef.current = opts.save;
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const refreshDirty = () => {
    const r = roomRef.current;
    if (r) setDirty(opts.keyOf(doc) !== r.savedKey());
  };

  useEffect(() => {
    const r = connectCollabRoom(doc, {
      projectId: opts.projectId, fileId: opts.fileId, room: opts.room, mode: opts.mode, initialKey: opts.keyOf(doc),
      onSaved: () => { setStatus("saved"); setError(""); refreshDirty(); },
    });
    roomRef.current = r;
    const onUpdate = () => refreshDirty();
    doc.on("update", onUpdate);
    opts.presence.track({ fileId: opts.fileId, room: opts.room, mode: opts.mode });
    return () => {
      opts.presence.track(null);
      doc.off("update", onUpdate);
      roomRef.current = null;
      r.destroy();
      window.setTimeout(() => doc.destroy(), 1500); // 마지막 저장 알림이 나갈 시간
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSave(auto = false): Promise<boolean> {
    const r = roomRef.current;
    if (!r || saving.current) return false;
    if (opts.keyOf(doc) === r.savedKey()) { setDirty(false); return true; } // 이미 저장됨
    saving.current = true;
    setStatus("saving");
    try {
      const key = opts.keyOf(doc);
      const id = await saveRef.current(Y.encodeStateAsUpdate(doc), opts.textOf(doc), r.head(), auto);
      r.markSaved(id, key);
      setStatus("saved");
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      setError("");
      refreshDirty();
      return true;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "저장하지 못했습니다.");
      return false;
    } finally { saving.current = false; }
  }

  // 5분마다 자동 저장(변경이 없으면 runSave가 건너뜀).
  useEffect(() => {
    const id = window.setInterval(() => { void runSave(true); }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장하지 않은 변경이 있을 때 탭을 닫거나 새로고침하면 브라우저가 한 번 물어본다.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const statusText = status === "saving" ? "저장 중…" : status === "error" ? "저장 실패" : dirty ? "저장하지 않은 변경사항이 있어요 (5분마다 자동 저장)" : status === "saved" ? `저장됨 ${savedAt}`.trim() : "변경사항 없음";

  return {
    doc, dirty, status, statusText, error, setError, runSave, confirmClose, setConfirmClose,
    requestClose: (onClose: () => void) => { if (dirty) setConfirmClose(true); else onClose(); },
    saveAndClose: async (onClose: () => void) => { if (await runSave()) onClose(); else setConfirmClose(false); },
  };
}
