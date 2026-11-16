import { useCallback, useEffect, useMemo, useState } from "react";
import { dataRepository } from "../api";
import type { Announcement, Project } from "../api/types";
import { todayKst } from "../lib/dday";

// 관리자 화면의 "공지 보내기": 기간과 대상(전체 또는 고른 프로젝트)을 정하면, 그 기간 동안 대상 사용자의
// 화면 오른쪽 아래에 작은 팝업으로 뜬다(이미 접속 중인 사람에게는 바로).
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString("sv-SE"); };

export default function AdminAnnouncements({ projects }: { projects: Project[] }) {
  const today = todayKst();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 6));
  const [targetAll, setTargetAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameOf = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const refresh = useCallback(() => {
    dataRepository.listAnnouncements().then(setItems).catch((e) => setError(e instanceof Error ? e.message : "공지 목록을 불러오지 못했습니다."));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  function togglePicked(id: string) {
    setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice("");
    if (!title.trim()) return setError("공지 제목을 입력해 주세요.");
    if (!body.trim()) return setError("공지 내용을 입력해 주세요.");
    if (endDate < startDate) return setError("종료일은 시작일 이후여야 해요.");
    if (!targetAll && picked.size === 0) return setError("공지할 프로젝트를 한 개 이상 고르거나 ‘전체’를 선택해 주세요.");
    setBusy(true);
    try {
      await dataRepository.createAnnouncement({ title: title.trim(), body: body.trim(), startDate, endDate, targetAll, projectIds: targetAll ? [] : [...picked] });
      setTitle(""); setBody(""); setPicked(new Set());
      setNotice("공지를 보냈어요. 접속 중인 대상에게는 바로 표시돼요.");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공지를 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Announcement) {
    if (!window.confirm(`‘${item.title}’ 공지를 삭제할까요? 대상 사용자에게서 바로 사라져요.`)) return;
    setError(""); setNotice("");
    try { await dataRepository.deleteAnnouncement(item.id); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "공지를 지우지 못했습니다."); }
  }

  const status = (a: Announcement) => a.endDate < today ? { text: "종료", color: "var(--muted-foreground)", bg: "var(--muted)" }
    : a.startDate > today ? { text: "예정", color: "#d97706", bg: "#f59e0b18" } : { text: "진행 중", color: "#16a34a", bg: "#22c55e18" };
  const input = { borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" } as const;

  return (
    <section className="mb-6 p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }} aria-label="공지 관리">
      <h2 className="text-sm font-700 mb-1">공지 보내기</h2>
      <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>정한 기간 동안 대상 사용자의 화면 오른쪽 아래에 작은 팝업으로 떠요. 사용자는 닫거나 ‘다시 보지 않기’를 할 수 있어요.</p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="제목 (100자까지)" aria-label="공지 제목" className="w-full text-sm px-3 py-2.5 border outline-none" style={input} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} placeholder="내용 (2000자까지)" aria-label="공지 내용" className="w-full text-sm px-3 py-2.5 border outline-none resize-y" style={input} />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">시작일
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} className="text-sm px-2 py-1.5 border outline-none" style={input} />
          </label>
          <label className="flex items-center gap-2">종료일
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm px-2 py-1.5 border outline-none" style={input} />
          </label>
        </div>
        <fieldset className="text-xs">
          <legend className="font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>공지 대상</legend>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-1.5"><input type="radio" name="announcement-target" checked={targetAll} onChange={() => setTargetAll(true)} />전체 사용자</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="announcement-target" checked={!targetAll} onChange={() => setTargetAll(false)} />선택한 프로젝트 참여자</label>
          </div>
          {!targetAll && (
            <div className="p-3 flex flex-col gap-1.5 max-h-44 overflow-auto" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
              {projects.length === 0 && <span style={{ color: "var(--muted-foreground)" }}>프로젝트가 없어요.</span>}
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePicked(p.id)} />{p.name}</label>
              ))}
            </div>
          )}
        </fieldset>

        {error && <p role="alert" className="text-xs px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>{error}</p>}
        {notice && <p role="status" className="text-xs px-3 py-2" style={{ background: "#22c55e18", color: "#16a34a", borderRadius: "var(--radius-sm)" }}>{notice}</p>}
        <div>
          <button type="submit" disabled={busy} className="text-sm font-700 px-5 py-2.5" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", opacity: busy ? 0.6 : 1 }}>{busy ? "보내는 중…" : "공지 보내기"}</button>
        </div>
      </form>

      <h3 className="text-xs font-700 mt-6 mb-2">보낸 공지 ({items.length})</h3>
      {items.length === 0 ? <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>아직 보낸 공지가 없어요.</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const s = status(a);
            return (
              <li key={a.id} className="flex items-start gap-3 px-3 py-2.5" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
                <span className="text-[10px] font-700 px-2 py-0.5 shrink-0 mt-0.5" style={{ background: s.bg, color: s.color, borderRadius: "20px" }}>{s.text}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-600 break-words">{a.title}</span>
                  <span className="block text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    {a.startDate} ~ {a.endDate} · {a.targetAll ? "전체 사용자" : a.projectIds.map((id) => nameOf.get(id) ?? id).join(", ")}
                  </span>
                </span>
                <button type="button" onClick={() => void remove(a)} className="text-xs font-600 px-2.5 py-1 shrink-0" style={{ color: "#ef4444", borderRadius: "20px", background: "#ef444412" }}>삭제</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
