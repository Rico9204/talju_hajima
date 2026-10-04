import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { WorkspaceFile } from "../api/types";
import EditorAvatars from "./EditorAvatars";
import { openCollabDoc, textHash, transformIndex, type CollabDoc, type CollabEditor, type CollabMode, type CollabPresence, type Delta, type RemoteCursor } from "../lib/collab";

const AUTOSAVE_MS = 5 * 60 * 1000;

// "바로 수정": 여러 명이 같은 텍스트 파일을 동시에 고친다. 누구든 "저장"(Ctrl/⌘+S)을 누르면 지금 합쳐진 내용이
// 새 버전으로 저장되고, 열어 둔 동안 5분마다 변경이 있으면 자동으로도 저장한다. 이미 같은 내용이 저장돼 있으면
// (다른 사람이 먼저 저장) 건너뛴다.
export default function QuickEditModal({ projectId, file, room, mode, initialText, presence, editors, save, onClose }: {
  projectId: string;
  file: WorkspaceFile;
  room: number; // 편집을 시작한 기준 버전 id
  mode: CollabMode;
  initialText: string;
  presence: CollabPresence;
  editors: CollabEditor[];
  save: (text: string, baseVersionId: number, auto: boolean) => Promise<number>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialText);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const valueRef = useRef(initialText);
  const docRef = useRef<CollabDoc | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef<string | null>(null); // IME 조합 시작 시점의 텍스트
  const remoteWhileComposing = useRef<Delta[]>([]); // 조합 중에 들어온 원격 변경(조합 끝에 위치 보정용)
  const pendingSel = useRef<[number, number] | null>(null);
  const saving = useRef(false);
  const roomEditors = editors.filter((e) => e.fileId === file.id && e.room === room && e.mode === mode);
  const saveRef = useRef(save);
  saveRef.current = save;
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const refreshDirty = () => {
    const doc = docRef.current;
    if (doc) setDirty(textHash(doc.text()) !== doc.savedHash());
  };

  // 저장 성공 여부를 돌려준다(닫을 때 저장 후 닫기에서 사용).
  async function runSave(auto = false): Promise<boolean> {
    const doc = docRef.current;
    if (!doc || saving.current) return false;
    const text = doc.text();
    if (textHash(text) === doc.savedHash()) { setDirty(false); return true; } // 이미 저장됨
    saving.current = true;
    setStatus("saving");
    try {
      const id = await saveRef.current(text, doc.head(), auto);
      doc.markSaved(id, text);
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

  useEffect(() => {
    const doc = openCollabDoc({
      projectId, fileId: file.id, room, mode, initialText, me: presence.me,
      onRemote: (delta) => {
        const next = docRef.current?.text() ?? valueRef.current;
        const el = areaRef.current;
        if (el) pendingSel.current = [transformIndex(el.selectionStart, delta), transformIndex(el.selectionEnd, delta)];
        if (composing.current === null) { valueRef.current = next; setValue(next); }
        else remoteWhileComposing.current.push(delta);
        refreshDirty();
      },
      onSaved: () => { setStatus("saved"); setError(""); refreshDirty(); },
    });
    docRef.current = doc;
    presence.track({ fileId: file.id, room, mode });
    const offCursors = doc.onCursors(() => setCursors(doc.cursors()));
    return () => {
      offCursors();
      presence.track(null);
      docRef.current = null;
      window.setTimeout(() => doc.destroy(), 1500); // 마지막 저장 알림이 나갈 시간
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useLayoutEffect(() => {
    const sel = pendingSel.current;
    if (sel && areaRef.current) { areaRef.current.setSelectionRange(sel[0], sel[1]); pendingSel.current = null; }
    // 글이 바뀌면 다른 사람 커서의 글자 위치도 바뀐다(상대 위치 → 지금 글 기준 위치로 다시 계산).
    if (docRef.current) setCursors(docRef.current.cursors());
    measureBox();
  }, [value]);

  // 겹쳐 그리는 커서 층은 스크롤 막대를 뺀 textarea 안쪽 크기와 같아야 줄바꿈 위치가 맞는다.
  function measureBox() {
    const el = areaRef.current;
    if (el) setBox((cur) => (cur.width === el.clientWidth && cur.height === el.clientHeight ? cur : { width: el.clientWidth, height: el.clientHeight }));
  }
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measureBox);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 커서·선택이 움직이면 알린다. React onSelect는 키보드·코드로 옮긴 커서를 놓칠 때가 있어 selectionchange를 직접 듣는다
  // (요즘 브라우저는 textarea 자체에, 예전 브라우저는 document에 보낸다).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onSelection = () => { if (document.activeElement === el) shareCursor(el); };
    el.addEventListener("selectionchange", onSelection);
    document.addEventListener("selectionchange", onSelection);
    return () => { el.removeEventListener("selectionchange", onSelection); document.removeEventListener("selectionchange", onSelection); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shareCursor(el: HTMLTextAreaElement) {
    if (composing.current !== null) return; // 조합 중에는 글이 아직 문서에 반영되지 않았다
    const backward = el.selectionDirection === "backward";
    docRef.current?.setCursor(backward ? el.selectionEnd : el.selectionStart, backward ? el.selectionStart : el.selectionEnd);
  }

  function onChange(next: string) {
    setValue(next);
    if (composing.current !== null) return; // 조합 중에는 끝난 뒤 한 번에 반영
    docRef.current?.edit(valueRef.current, next);
    valueRef.current = next;
    refreshDirty();
    if (areaRef.current) shareCursor(areaRef.current);
  }

  function onCompositionEnd(el: HTMLTextAreaElement) {
    const base = composing.current ?? valueRef.current;
    const remote = remoteWhileComposing.current;
    composing.current = null;
    remoteWhileComposing.current = [];
    docRef.current?.edit(base, el.value, remote);
    // 커서도 조합 중 들어온 원격 변경만큼 옮긴다(안 옮기면 내용이 바뀌면서 커서가 엉뚱한 곳으로 간다).
    let [selStart, selEnd] = [el.selectionStart, el.selectionEnd];
    for (const delta of remote) { selStart = transformIndex(selStart, delta); selEnd = transformIndex(selEnd, delta); }
    pendingSel.current = [selStart, selEnd];
    const merged = docRef.current?.text() ?? el.value;
    valueRef.current = merged;
    setValue(merged);
    refreshDirty();
    docRef.current?.setCursor(selStart, selEnd);
  }

  // 저장 안 한 변경이 있으면 저장 후 닫기 / 저장 없이 닫기 / 계속 수정 중에서 고르게 한다.
  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  async function saveAndClose() {
    if (await runSave()) onClose();
    else setConfirmClose(false);
  }

  const names = [...new Set(roomEditors.map((e) => e.name))];
  const statusText = status === "saving" ? "저장 중…" : status === "error" ? "저장 실패" : dirty ? "저장하지 않은 변경사항이 있어요 (5분마다 자동 저장)" : status === "saved" ? `저장됨 ${savedAt}`.trim() : "변경사항 없음";
  const lastEditor = names.length <= 1;

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
            <button type="button" onClick={() => void runSave()} disabled={!dirty || status === "saving"} title="Ctrl/⌘+S" className="h-8 px-3 rounded-full text-xs font-700 disabled:opacity-40" style={{ background: "var(--primary)", color: "#fff" }}>{status === "saving" ? "저장 중…" : "저장"}</button>
            <button type="button" onClick={requestClose} className="h-8 px-3 rounded-full text-xs font-700" style={{ background: "var(--muted)", color: "var(--foreground)" }}>닫기</button>
          </div>
        </div>
        <div className="px-5 py-2 text-xs border-b shrink-0 flex items-center gap-2" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <EditorAvatars editors={roomEditors} size={26} max={6} />
          <span>{names.length > 1 ? `지금 ${names.length}명이 함께 수정 중 · 사진을 누르면 이름이 보여요` : "지금은 나만 수정 중이에요. 다른 팀원이 들어오면 여기에 표시돼요."}</span>
        </div>
        {confirmClose && (
          <div role="alertdialog" aria-label="저장하지 않은 변경사항" className="mx-5 mt-2 p-3 text-xs rounded-lg flex flex-wrap items-center gap-2" style={{ background: "rgba(245, 158, 11, 0.14)", color: "var(--foreground)", border: "1px solid rgba(245, 158, 11, 0.35)" }}>
            <span className="flex-1 min-w-48">저장하지 않은 변경사항이 있어요.{lastEditor && " 지금 나가면 지금까지 수정한 내용이 사라질 수 있어요."}</span>
            <button type="button" onClick={() => void saveAndClose()} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--primary)", color: "#fff" }}>저장하고 닫기</button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--card)", color: "var(--foreground)" }}>저장 없이 닫기</button>
            <button type="button" onClick={() => setConfirmClose(false)} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--card)", color: "var(--foreground)" }}>계속 수정</button>
          </div>
        )}
        {error && <p role="alert" className="mx-5 mt-2 text-xs rounded-lg bg-red-500/10 text-red-500 p-2">{error}</p>}
        <div className="relative flex-1 min-h-0 m-5">
        <textarea
          ref={areaRef}
          aria-label="파일 내용"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void runSave(); } }}
          onCompositionStart={() => { composing.current = valueRef.current; remoteWhileComposing.current = []; }}
          onCompositionEnd={(e) => onCompositionEnd(e.currentTarget)}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          spellCheck={false}
          className="block w-full h-full p-3 text-sm resize-none outline-none border"
          style={{ fontFamily: "var(--font-jetbrains)", background: "var(--muted)", borderColor: "var(--border)", borderRadius: 10 }}
        />
        {cursors.length > 0 && <RemoteCursors value={value} cursors={cursors} scrollTop={scrollTop} width={box.width} height={box.height} />}
        </div>
      </section>
    </div>
  );
}

// textarea는 글자 위치의 화면 좌표를 알려 주지 않으므로, 같은 글꼴·여백·줄바꿈으로 같은 글을 투명하게 겹쳐 그리고
// 그 안에 다른 사람의 선택 영역(옅은 색)과 커서(세로선 + 이름)를 끼워 넣는다. 클릭은 아래 textarea로 그대로 간다.
function RemoteCursors({ value, cursors, scrollTop, width, height }: { value: string; cursors: RemoteCursor[]; scrollTop: number; width: number; height: number }) {
  const clamp = (n: number) => Math.max(0, Math.min(n, value.length));
  const list = cursors.map((c) => ({ ...c, from: clamp(Math.min(c.anchor, c.head)), to: clamp(Math.max(c.anchor, c.head)), at: clamp(c.head) }));
  const points = [...new Set([0, value.length, ...list.flatMap((c) => [c.from, c.to, c.at])])].sort((a, b) => a - b);
  const parts: ReactNode[] = [];
  points.forEach((point, i) => {
    for (const c of list) {
      if (c.at !== point) continue;
      parts.push(
        <span key={`c${c.clientId}`} className="relative" style={{ borderLeft: `2px solid ${c.user.color}`, marginLeft: -1, marginRight: -1 }}>
          <span className="absolute left-[-2px] bottom-full px-1 rounded-t rounded-br whitespace-nowrap font-700" style={{ background: c.user.color, color: "#fff", fontSize: 10, lineHeight: "13px", fontFamily: "var(--font-outfit)" }}>{c.user.name}</span>
        </span>,
      );
    }
    const next = points[i + 1];
    if (next === undefined) return;
    const owner = list.find((c) => c.from <= point && next <= c.to && c.from < c.to);
    const slice = value.slice(point, next);
    parts.push(owner ? <span key={`s${point}`} style={{ background: `${owner.user.color}40` }}>{slice}</span> : slice);
  });
  return (
    <div aria-hidden="true" className="absolute pointer-events-none overflow-hidden" style={{ top: 1, left: 1, width, height, borderRadius: 9 }}>
      <div className="p-3 text-sm" style={{ fontFamily: "var(--font-jetbrains)", color: "transparent", whiteSpace: "pre-wrap", overflowWrap: "break-word", transform: `translateY(${-scrollTop}px)` }}>
        {parts}{"​"}
      </div>
    </div>
  );
}
