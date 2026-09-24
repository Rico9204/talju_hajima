import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceFile } from "../api/types";
import { openCollabDoc, pickSaver, textHash, transformIndex, type CollabDoc, type CollabEditor, type CollabMode, type CollabPresence } from "../lib/collab";

const SAVE_DELAY_MS = 4000;

// "바로 수정": 여러 명이 같은 텍스트 파일을 동시에 고친다. 입력이 잠잠해지면 같은 방의 한 명(저장 담당)이
// 새 버전으로 저장하고, 저장 담당이 나가면 남은 사람 중 다음 사람이 이어받는다.
export default function QuickEditModal({ projectId, file, room, mode, initialText, presence, editors, save, onClose }: {
  projectId: string;
  file: WorkspaceFile;
  room: number; // 편집을 시작한 기준 버전 id
  mode: CollabMode;
  initialText: string;
  presence: CollabPresence;
  editors: CollabEditor[];
  save: (text: string, baseVersionId: number) => Promise<number>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialText);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const valueRef = useRef(initialText);
  const docRef = useRef<CollabDoc | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef<string | null>(null); // IME 조합 시작 시점의 텍스트
  const pendingSel = useRef<[number, number] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef(false);
  const roomEditors = editors.filter((e) => e.fileId === file.id && e.room === room && e.mode === mode);
  const roomRef = useRef(roomEditors);
  roomRef.current = roomEditors;
  const saveRef = useRef(save);
  saveRef.current = save;

  async function runSave() {
    const doc = docRef.current;
    if (!doc || saving.current) return;
    const saver = pickSaver(roomRef.current);
    if (saver !== null && saver !== presence.key) return; // 저장 담당이 아님
    const text = doc.text();
    if (textHash(text) === doc.savedHash()) return;
    saving.current = true;
    setStatus("saving");
    try {
      const id = await saveRef.current(text, doc.head());
      doc.markSaved(id, text);
      setStatus("saved");
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      setError("");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "저장하지 못했습니다.");
    } finally { saving.current = false; }
  }

  function scheduleSave() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runSave(), SAVE_DELAY_MS);
  }

  useEffect(() => {
    const doc = openCollabDoc({
      projectId, fileId: file.id, room, mode, initialText,
      onRemote: (delta) => {
        const next = docRef.current?.text() ?? valueRef.current;
        const el = areaRef.current;
        if (el) pendingSel.current = [transformIndex(el.selectionStart, delta), transformIndex(el.selectionEnd, delta)];
        if (composing.current === null) { valueRef.current = next; setValue(next); }
        scheduleSave();
      },
      onSaved: () => { setStatus("saved"); setError(""); },
    });
    docRef.current = doc;
    presence.track({ fileId: file.id, room, mode });
    return () => {
      window.clearTimeout(timer.current);
      void runSave(); // 화면이 그냥 사라지는 경우에도 마지막 변경을 저장 시도
      presence.track(null);
      docRef.current = null;
      window.setTimeout(() => doc.destroy(), 1500); // 마지막 저장 알림이 나갈 시간
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장 담당이 바뀌어 내가 이어받게 되면 남은 변경을 저장한다.
  const roomKeys = roomEditors.map((e) => e.key).sort().join(",");
  useEffect(() => { if (pickSaver(roomRef.current) === presence.key) scheduleSave(); }, [roomKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const sel = pendingSel.current;
    if (sel && areaRef.current) { areaRef.current.setSelectionRange(sel[0], sel[1]); pendingSel.current = null; }
  }, [value]);

  function onChange(next: string) {
    setValue(next);
    if (composing.current !== null) return; // 조합 중에는 끝난 뒤 한 번에 반영
    docRef.current?.edit(valueRef.current, next);
    valueRef.current = next;
    scheduleSave();
  }

  function onCompositionEnd(el: HTMLTextAreaElement) {
    const base = composing.current ?? valueRef.current;
    composing.current = null;
    docRef.current?.edit(base, el.value);
    const merged = docRef.current?.text() ?? el.value;
    valueRef.current = merged;
    setValue(merged);
    scheduleSave();
  }

  async function close() {
    window.clearTimeout(timer.current);
    await runSave();
    onClose();
  }

  const names = [...new Set(roomEditors.map((e) => e.name))];
  const statusText = status === "saving" ? "저장 중…" : status === "error" ? "저장 실패" : status === "saved" ? `저장됨 ${savedAt}`.trim() : "변경하면 잠시 뒤 자동 저장돼요";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)" }}>
      <section className="w-[min(96vw,900px)] h-[min(88vh,760px)] flex flex-col border" aria-label="바로 수정" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 24px 70px rgba(15,18,53,0.25)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <div className="text-xs font-700" style={{ color: "var(--primary)" }}>{mode === "pin" ? "📌 핀 버전에서 분기해 수정" : "바로 수정 (함께 편집)"}</div>
            <div className="text-sm font-700 truncate mt-0.5">{file.name}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs" style={{ color: status === "error" ? "#ef4444" : "var(--muted-foreground)" }} role="status">{statusText}</span>
            <button type="button" onClick={() => void close()} className="h-8 px-3 rounded-full text-xs font-700" style={{ background: "var(--primary)", color: "#fff" }}>닫기</button>
          </div>
        </div>
        <div className="px-5 py-2 text-xs border-b shrink-0" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          {names.length > 1 ? `지금 ${names.length}명이 함께 수정 중: ${names.join(", ")}` : "지금은 나만 수정 중이에요. 다른 팀원이 들어오면 여기에 표시돼요."}
        </div>
        {error && <p role="alert" className="mx-5 mt-2 text-xs rounded-lg bg-red-50 text-red-700 p-2">{error}</p>}
        <textarea
          ref={areaRef}
          aria-label="파일 내용"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onCompositionStart={() => { composing.current = valueRef.current; }}
          onCompositionEnd={(e) => onCompositionEnd(e.currentTarget)}
          spellCheck={false}
          className="flex-1 min-h-0 m-5 p-3 text-sm resize-none outline-none border"
          style={{ fontFamily: "var(--font-jetbrains)", background: "var(--muted)", borderColor: "var(--border)", borderRadius: 10 }}
        />
      </section>
    </div>
  );
}
