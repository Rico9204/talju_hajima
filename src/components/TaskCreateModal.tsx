import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Member, NewTaskInput, TaskPriority } from "../api/types";
import { todayKst } from "../lib/dday";
import Avatar from "./Avatar";

// 과제 보드의 "과제 생성" 창: 화면 가운데에 띄운다. 새 과제는 항상 "예정"에서 시작한다.
// 꼭 필요한 것: 제목, 담당자(한 명 이상). 고르면 함께 저장: 우선순위, 마감일, 태그, 세부 업무(각각 담당자 지정 가능).
// Esc나 바깥을 눌러 닫을 때 쓰던 내용이 있으면 한 번 묻는다. Ctrl/⌘+Enter로 바로 만든다.

const PRIORITIES: { id: TaskPriority; label: string; color: string; hint: string }[] = [
  { id: "high", label: "긴급", color: "#c9625b", hint: "먼저 처리" },
  { id: "mid", label: "보통", color: "#d69a4e", hint: "기본" },
  { id: "low", label: "낮음", color: "#5b9a74", hint: "여유 있음" },
];
const MAX_TAGS = 20;
const MAX_SUBTASKS = 30;

const shiftDays = (days: number) => todayKst(new Date(Date.now() + days * 86_400_000));
function dueHint(due: string): string {
  if (!due) return "마감일 없음";
  const diff = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${todayKst()}T00:00:00`).getTime()) / 86_400_000);
  return diff === 0 ? "오늘 마감" : diff > 0 ? `D-${diff}` : `${-diff}일 지남`;
}

export default function TaskCreateModal({ members, onSubmit, onClose }: {
  members: Member[];
  onSubmit: (input: NewTaskInput) => Promise<string | null>; // null이면 성공, 글이면 실패 안내(창은 그대로)
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("mid");
  const [due, setDue] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [subtasks, setSubtasks] = useState<{ key: number; text: string; assignee: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false); // 만들기를 한 번 눌러 본 뒤에만 빈 칸 안내를 보인다
  const nextKey = useRef(1);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const showSearch = members.length > 8;
  const q = memberSearch.trim().toLowerCase();
  const visibleMembers = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
  const chosenMembers = useMemo(() => members.filter((m) => assignees.includes(m.id)), [members, assignees]);
  const dirty = !!(title.trim() || assignees.length || tags.length || subtasks.some((s) => s.text.trim()) || due || priority !== "mid");
  const valid = !!title.trim() && assignees.length > 0;

  function requestClose() {
    if (busy) return;
    if (dirty && !window.confirm("작성 중인 과제가 있어요. 닫으면 내용이 사라집니다. 닫을까요?")) return;
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); requestClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleAssignee(id: string) {
    const next = assignees.includes(id) ? assignees.filter((x) => x !== id) : [...assignees, id];
    setAssignees(next);
    // 과제 담당자에서 빠진 사람이 맡던 세부 업무는 담당자 없음으로
    setSubtasks((rows) => rows.map((r) => (r.assignee && !next.includes(r.assignee) ? { ...r, assignee: null } : r)));
  }

  function addTag() {
    const value = tagDraft.trim().slice(0, 30);
    setTagDraft("");
    if (!value || tags.includes(value) || tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, value]);
  }

  function addSubtask() {
    if (subtasks.length >= MAX_SUBTASKS) return;
    setSubtasks((prev) => [...prev, { key: nextKey.current++, text: "", assignee: assignees.length === 1 ? assignees[0] : null }]);
  }

  async function submit() {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const failure = await onSubmit({
      title: title.trim(),
      assigneeIds: assignees,
      status: "todo",
      priority,
      due,
      tags,
      checklist: subtasks.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), assigneeMemberId: s.assignee })),
    });
    setBusy(false);
    if (failure === null) onClose();
    else setError(failure || "과제를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }

  const label = "text-xs font-700 mb-1.5 flex items-center gap-1.5";
  const field = { borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-outfit)" } as const;
  const quickDue: [string, string][] = [["오늘", shiftDays(0)], ["내일", shiftDays(1)], ["3일 뒤", shiftDays(3)], ["1주 뒤", shiftDays(7)]];

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(15,18,53,0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-create-title"
        className="w-full max-w-xl max-h-[90vh] flex flex-col border"
        style={{ background: "var(--surface-opaque)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 24px 70px rgba(15,18,53,0.3)", color: "var(--foreground)" }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void submit(); } }}
      >
        {/* 머리 */}
        <header className="flex items-center gap-3 px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0 flex-1">
            <h2 id="task-create-title" className="text-base font-700">새 과제 만들기</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              <span className="inline-flex items-center gap-1 font-600"><i className="w-2 h-2 rounded-full inline-block" style={{ background: "#454b6e" }} />예정</span> 단계에 추가돼요. 팀원은 검토 중까지, 완료는 팀장·부팀장이 처리해요.
            </p>
          </div>
          <button type="button" onClick={requestClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>×</button>
        </header>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <div>
            <label htmlFor="task-create-name" className={label}>과제 제목 <span style={{ color: "#ef4444" }}>*</span></label>
            <input
              id="task-create-name"
              ref={titleRef}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 중간 발표 자료 만들기"
              className="w-full text-sm px-3 py-2.5 border outline-none"
              style={{ ...field, borderColor: touched && !title.trim() ? "#ef4444" : field.borderColor }}
            />
            <div className="flex justify-between mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              <span style={{ color: touched && !title.trim() ? "#ef4444" : undefined }}>{touched && !title.trim() ? "제목을 입력해 주세요." : ""}</span>
              <span>{title.length}/200</span>
            </div>
          </div>

          <div>
            <div className={label}>담당자 <span style={{ color: "#ef4444" }}>*</span><span className="font-500" style={{ color: "var(--muted-foreground)" }}>{assignees.length ? `${assignees.length}명 선택` : "한 명 이상"}</span></div>
            {showSearch && (
              <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="팀원 이름 검색" aria-label="담당자 검색"
                className="w-full text-xs px-3 py-1.5 border outline-none mb-2" style={{ ...field, borderRadius: "20px" }} />
            )}
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-0.5">
              {visibleMembers.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAssignee(m.id)}
                    className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 text-xs font-600 border transition-colors"
                    style={{ borderRadius: "20px", background: on ? "var(--primary)" : "var(--muted)", color: on ? "#fff" : "var(--foreground)", borderColor: on ? "var(--primary)" : "var(--border)" }}
                  >
                    <Avatar url={m.avatarUrl} initial={m.avatar} color={m.color} size={20} />
                    {m.name}
                    {(m.isLeader || m.isViceLeader) && <span className="text-[10px] opacity-80">{m.isLeader ? "팀장" : "부팀장"}</span>}
                    {on && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
              {visibleMembers.length === 0 && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</span>}
            </div>
            {touched && assignees.length === 0 && <p className="text-[11px] mt-1" style={{ color: "#ef4444" }}>담당자를 한 명 이상 골라 주세요.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className={label}>우선순위</div>
              <div role="radiogroup" aria-label="우선순위" className="grid grid-cols-3 gap-1 p-0.5" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                {PRIORITIES.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={priority === p.id} onClick={() => setPriority(p.id)} title={p.hint}
                    className="text-xs font-700 py-1.5 transition-all"
                    style={{ borderRadius: "10px", background: priority === p.id ? "var(--surface-opaque)" : "transparent", color: priority === p.id ? p.color : "var(--muted-foreground)", boxShadow: priority === p.id ? "0 1px 3px rgba(34,42,58,0.12)" : "none" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="task-create-due" className={label}>마감일<span className="font-500" style={{ color: due && dueHint(due).includes("지남") ? "#ef4444" : "var(--muted-foreground)" }}>{dueHint(due)}</span></label>
              <input id="task-create-due" type="date" value={due} onChange={(e) => setDue(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border outline-none" style={{ ...field, fontFamily: "var(--font-jetbrains)" }} />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {quickDue.map(([name, value]) => (
                  <button key={name} type="button" onClick={() => setDue(value)} className="text-[11px] font-600 px-2 py-0.5"
                    style={{ borderRadius: "20px", background: due === value ? "var(--secondary)" : "var(--muted)", color: due === value ? "var(--primary-text)" : "var(--muted-foreground)" }}>{name}</button>
                ))}
                {due && <button type="button" onClick={() => setDue("")} className="text-[11px] font-600 px-2 py-0.5" style={{ borderRadius: "20px", background: "var(--muted)", color: "var(--muted-foreground)" }}>지우기</button>}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="task-create-tag" className={label}>태그<span className="font-500" style={{ color: "var(--muted-foreground)" }}>Enter로 추가 · {tags.length}/{MAX_TAGS}</span></label>
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border" style={field}>
              {tags.map((t) => (
                <span key={t} className="text-[11px] font-600 pl-2 pr-1 py-0.5 flex items-center gap-1" style={{ background: "var(--secondary)", color: "var(--primary-text)", borderRadius: "20px" }}>
                  #{t}
                  <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} aria-label={`${t} 태그 빼기`} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10">×</button>
                </span>
              ))}
              <input id="task-create-tag" value={tagDraft} maxLength={30} disabled={tags.length >= MAX_TAGS}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); }
                  else if (e.key === "Backspace" && !tagDraft && tags.length) setTags((prev) => prev.slice(0, -1));
                }}
                onBlur={addTag}
                placeholder={tags.length ? "" : "예: 발표, 자료조사"}
                className="flex-1 min-w-24 text-xs py-0.5 outline-none bg-transparent" />
            </div>
          </div>

          <div>
            <div className={label}>세부 업무<span className="font-500" style={{ color: "var(--muted-foreground)" }}>선택 · 과제 담당자 중에서 나눠 맡을 수 있어요</span></div>
            {subtasks.length > 0 && (
              <ul className="flex flex-col gap-1.5 mb-2">
                {subtasks.map((s, i) => (
                  <li key={s.key} className="flex items-center gap-1.5">
                    <span className="text-[11px] w-5 text-right shrink-0" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{i + 1}</span>
                    <input value={s.text} maxLength={2000} autoFocus={i === subtasks.length - 1 && !s.text}
                      onChange={(e) => setSubtasks((rows) => rows.map((r) => (r.key === s.key ? { ...r, text: e.target.value } : r)))}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); addSubtask(); } }}
                      placeholder="할 일" aria-label={`세부 업무 ${i + 1}`}
                      className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border outline-none" style={field} />
                    <select value={s.assignee ?? ""} disabled={chosenMembers.length === 0}
                      onChange={(e) => setSubtasks((rows) => rows.map((r) => (r.key === s.key ? { ...r, assignee: e.target.value || null } : r)))}
                      aria-label={`세부 업무 ${i + 1} 담당자`}
                      className="w-28 text-xs px-1.5 py-1.5 border outline-none shrink-0" style={field}>
                      <option value="">담당자 없음</option>
                      {chosenMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setSubtasks((rows) => rows.filter((r) => r.key !== s.key))} aria-label={`세부 업무 ${i + 1} 지우기`}
                      className="w-7 h-7 flex items-center justify-center shrink-0 text-sm" style={{ color: "var(--muted-foreground)", borderRadius: "8px" }}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={addSubtask} disabled={subtasks.length >= MAX_SUBTASKS}
              className="w-full text-xs font-600 py-2 border-2 border-dashed disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}>
              + 세부 업무 추가
            </button>
          </div>
        </div>

        {/* 바닥 */}
        <footer className="flex items-center gap-2 px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
          {error ? <p role="alert" className="text-xs flex-1" style={{ color: "#ef4444" }}>{error}</p>
            : <p className="text-[11px] flex-1 hidden sm:block" style={{ color: "var(--muted-foreground)" }}>Ctrl/⌘ + Enter로 바로 만들기</p>}
          <button type="button" onClick={requestClose} disabled={busy} className="text-xs font-600 px-4 py-2 ml-auto" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>취소</button>
          <button type="button" onClick={() => void submit()} disabled={busy}
            className="text-xs font-700 px-5 py-2 transition-all"
            style={{ background: valid ? "var(--primary)" : "var(--muted)", color: valid ? "#fff" : "var(--muted-foreground)", borderRadius: "20px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "만드는 중…" : "과제 만들기"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
