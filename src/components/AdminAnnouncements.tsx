import { useCallback, useEffect, useMemo, useState } from "react";
import { dataRepository } from "../api";
import type { Announcement, AnnouncementPriority, Project } from "../api/types";
import { todayKst } from "../lib/dday";
import { useAuth } from "../context/AuthContext";
import { useProjectManagement } from "../context/ProjectContext";
import { PRIORITY_LABEL } from "../lib/announcementsStore";

// 관리자 화면의 "공지 보내기".
// - 운영자: 시스템 공지(전체 사용자) → 모든 사용자의 메인 화면 위쪽 공지 띠에 뜬다.
// - 관리자(교수 등): 내가 승인 담당이고 승인한 프로젝트에만 → 그 프로젝트 대시보드 맨 위 공지 카드에 뜬다.
// 중요·긴급은 확인 전까지 팝업으로도 뜬다. 프로젝트 공지는 팀원 몇 명이 "확인했어요"를 눌렀는지 보낸 사람만 본다.
// (대상 제한은 DB 함수 create_announcement가 다시 검사한다.)
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString("sv-SE"); };

const PRIORITY_OPTIONS: { id: AnnouncementPriority; label: string; hint: string }[] = [
  { id: "normal", label: "일반", hint: "공지 자리에만 표시" },
  { id: "important", label: "중요", hint: "확인 전까지 팝업으로도 표시" },
  { id: "urgent", label: "긴급", hint: "빨간색으로 강조 + 팝업" },
];

export default function AdminAnnouncements({ projects }: { projects: Project[] }) {
  const { user } = useAuth();
  const { isAdmin, isOperator } = useProjectManagement();
  const today = todayKst();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 6));
  const [targetAll, setTargetAll] = useState(!isAdmin && isOperator);
  const [priority, setPriority] = useState<AnnouncementPriority>("normal");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameOf = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  // 프로젝트 공지를 보낼 수 있는 곳: 내가 승인 담당이고 승인을 마친 프로젝트.
  const myProjects = useMemo(
    () => (isAdmin && user ? projects.filter((p) => p.requestedAdminId === user.id && p.approvalStatus === "approved") : []),
    [projects, isAdmin, user],
  );

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
    if (!targetAll && picked.size === 0) return setError("공지할 프로젝트를 한 개 이상 골라 주세요.");
    setBusy(true);
    try {
      await dataRepository.createAnnouncement({ title: title.trim(), body: body.trim(), startDate, endDate, targetAll, projectIds: targetAll ? [] : [...picked], priority });
      setTitle(""); setBody(""); setPicked(new Set()); setPriority("normal");
      setNotice(targetAll ? "시스템 공지를 보냈어요. 모든 사용자의 메인 화면에 표시돼요." : "프로젝트 공지를 보냈어요. 고른 프로젝트의 대시보드 맨 위에 표시돼요.");
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

  if (!isAdmin && !isOperator) return null;

  const status = (a: Announcement) => a.endDate < today ? { text: "종료", color: "var(--muted-foreground)", bg: "var(--muted)" }
    : a.startDate > today ? { text: "예정", color: "#d97706", bg: "#f59e0b18" } : { text: "진행 중", color: "#16a34a", bg: "#22c55e18" };
  const input = { borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" } as const;

  return (
    <section className="mb-6 p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }} aria-label="공지 관리">
      <h2 className="text-sm font-700 mb-1">공지 보내기</h2>
      <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
        {isOperator && "시스템 공지는 모든 사용자의 메인 화면 위쪽에 떠요. "}
        {isAdmin && "프로젝트 공지는 내가 승인한 프로젝트의 대시보드 맨 위에 떠요(팀 채팅에는 올라가지 않아요). 팀원이 ‘확인했어요’를 누른 인원은 나에게만 보여요."}
      </p>

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
          <legend className="font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>중요도</legend>
          <div className="flex flex-wrap gap-4">
            {PRIORITY_OPTIONS.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5">
                <input type="radio" name="announcement-priority" checked={priority === o.id} onChange={() => setPriority(o.id)} />
                <span className="font-600" style={{ color: PRIORITY_LABEL[o.id].color }}>{o.label}</span>
                <span style={{ color: "var(--muted-foreground)" }}>{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="text-xs">
          <legend className="font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>공지 대상</legend>
          {isOperator && isAdmin && (
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1.5"><input type="radio" name="announcement-target" checked={targetAll} onChange={() => setTargetAll(true)} />시스템 공지 (전체 사용자)</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="announcement-target" checked={!targetAll} onChange={() => setTargetAll(false)} />내가 승인한 프로젝트</label>
            </div>
          )}
          {targetAll ? (
            <p style={{ color: "var(--muted-foreground)" }}>모든 사용자의 메인 화면에 표시돼요.</p>
          ) : (
            <div className="p-3 flex flex-col gap-1.5 max-h-44 overflow-auto" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
              {myProjects.length === 0 && <span style={{ color: "var(--muted-foreground)" }}>내가 승인한 프로젝트가 아직 없어요. 학생이 나를 승인 담당으로 골라 만든 프로젝트를 승인하면 여기에 나와요.</span>}
              {myProjects.length > 1 && (
                <label className="flex items-center gap-2 font-600">
                  <input type="checkbox" checked={picked.size === myProjects.length} onChange={() => setPicked(picked.size === myProjects.length ? new Set() : new Set(myProjects.map((p) => p.id)))} />
                  전체 선택 ({myProjects.length}개)
                </label>
              )}
              {myProjects.map((p) => (
                <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePicked(p.id)} />{p.name}{p.org ? <span style={{ color: "var(--muted-foreground)" }}> · {p.org}</span> : null}</label>
              ))}
            </div>
          )}
        </fieldset>

        {error && <p role="alert" className="text-xs px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>{error}</p>}
        {notice && <p role="status" className="text-xs px-3 py-2" style={{ background: "#22c55e18", color: "#16a34a", borderRadius: "var(--radius-sm)" }}>{notice}</p>}
        <div>
          <button type="submit" disabled={busy || (!targetAll && myProjects.length === 0)} className="text-sm font-700 px-5 py-2.5 disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", opacity: busy ? 0.6 : undefined }}>{busy ? "보내는 중…" : "공지 보내기"}</button>
        </div>
      </form>

      <h3 className="text-xs font-700 mt-6 mb-2">{isOperator ? "모든 공지" : "내가 보낸 공지"} ({items.length})</h3>
      {items.length === 0 ? <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>아직 보낸 공지가 없어요.</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const s = status(a);
            const p = PRIORITY_LABEL[a.priority ?? "normal"];
            return (
              <li key={a.id} className="flex items-start gap-3 px-3 py-2.5" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
                <span className="flex flex-col gap-1 shrink-0 mt-0.5">
                  <span className="text-[10px] font-700 px-2 py-0.5 text-center" style={{ background: s.bg, color: s.color, borderRadius: "20px" }}>{s.text}</span>
                  {a.priority !== "normal" && <span className="text-[10px] font-700 px-2 py-0.5 text-center" style={{ background: p.bg, color: p.color, borderRadius: "20px" }}>{p.text}</span>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-600 break-words">{a.title}</span>
                  <span className="block text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    {a.startDate} ~ {a.endDate} · {a.targetAll ? "시스템 공지(전체 사용자)" : a.projectIds.map((id) => nameOf.get(id) ?? id).join(", ")}
                    {isOperator && a.authorName ? ` · ${a.authorName}` : ""}
                  </span>
                  {!a.targetAll && a.recipientCount != null && (
                    <span className="inline-block mt-1 text-[11px] font-700 px-2 py-0.5" style={{ background: "var(--card)", borderRadius: "20px", color: a.readCount === a.recipientCount && a.recipientCount > 0 ? "#16a34a" : "var(--foreground)" }}>
                      ✓ 확인 {a.readCount ?? 0}/{a.recipientCount}명
                    </span>
                  )}
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
