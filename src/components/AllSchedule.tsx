import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dataRepository } from "../api";
import type { ScheduleEventType, UpcomingEvent } from "../api/types";
import { useProject } from "../context/ProjectContext";
import { todayKst } from "../lib/dday";

// 메인 화면 "전체 일정": 내가 속한 모든 프로젝트의 일정을 한 달력에 합쳐 보여 준다(프로젝트별 색·필터).
const TYPE_META: Record<ScheduleEventType, { label: string; color: string }> = {
  deadline: { label: "마감", color: "#ef4444" },
  meeting: { label: "회의", color: "#4a74b5" },
  presentation: { label: "발표", color: "#f59e0b" },
  other: { label: "기타", color: "#8b5cf6" },
};
const PROJECT_COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#db2777", "#65a30d"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_CHIPS_PER_DAY = 3;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftMonth = (ym: string, delta: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

// 그 달 달력에 보이는 칸들(앞뒤 달의 날짜 포함). 일요일 시작, 6주 고정이 아니라 필요한 주만.
function monthCells(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const last = new Date(y, m, 0);
  const end = new Date(y, m - 1, last.getDate() + (6 - last.getDay()));
  const cells: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) cells.push(iso(d));
  return cells;
}

const eventCoversDay = (e: UpcomingEvent, day: string) => e.date <= day && day <= (e.endDate ?? e.date);

export default function AllSchedule() {
  const navigate = useNavigate();
  const { projects, setProjectId } = useProject();
  const today = todayKst();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // 달력에서 숨긴 프로젝트
  const cells = useMemo(() => monthCells(month), [month]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const from = cells[0];
    const to = cells[cells.length - 1];
    dataRepository.listMyScheduleEvents(from, to)
      .then((list) => { if (active) { setEvents(list); setError(""); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "일정을 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cells]);

  // 프로젝트 색: 프로젝트 목록 순서대로 고정(필터를 바꿔도 색이 안 바뀐다).
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p, i) => map.set(p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]));
    return (projectId: string) => map.get(projectId) ?? "#6b7280";
  }, [projects]);
  const shown = useMemo(() => events.filter((e) => !hidden.has(e.projectId)), [events, hidden]);
  const dayEvents = (day: string) => shown.filter((e) => eventCoversDay(e, day));
  const selectedEvents = dayEvents(selectedDay);

  const projectsWithEvents = useMemo(() => projects.filter((p) => events.some((e) => e.projectId === p.id)), [projects, events]);
  const monthLabel = `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;

  function toggleProject(id: string) {
    setHidden((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function openEvent(e: UpcomingEvent) {
    setProjectId(e.projectId);
    navigate(`/schedule/${e.id}`);
  }
  function goToday() { setMonth(today.slice(0, 7)); setSelectedDay(today); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-700">전체 일정</h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>내가 속한 모든 프로젝트의 일정을 한 달력에서 확인해요.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="이전 달" className="text-sm font-700 w-8 h-8" style={{ background: "var(--muted)", borderRadius: "50%" }}>‹</button>
          <span className="text-sm font-700 min-w-24 text-center">{monthLabel}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="다음 달" className="text-sm font-700 w-8 h-8" style={{ background: "var(--muted)", borderRadius: "50%" }}>›</button>
          <button type="button" onClick={goToday} className="text-xs font-700 px-3 py-1.5" style={{ background: "var(--muted)", borderRadius: "20px" }}>오늘</button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>{error}</p>}

      {projectsWithEvents.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="프로젝트 필터">
          {projectsWithEvents.map((p) => {
            const on = !hidden.has(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggleProject(p.id)} aria-pressed={on} className="flex items-center gap-1.5 text-xs font-600 px-2.5 py-1" style={{ background: on ? `${colorOf(p.id)}1f` : "var(--muted)", color: on ? "var(--foreground)" : "var(--muted-foreground)", borderRadius: "20px", opacity: on ? 1 : 0.6 }}>
                <span className="w-2 h-2 rounded-full" style={{ background: colorOf(p.id) }} />
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-3 md:p-4" style={{ background: "var(--card-glass, var(--card))", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        <div className="grid grid-cols-7 text-center text-[11px] font-700 mb-1" style={{ color: "var(--muted-foreground)" }}>
          {WEEKDAYS.map((w, i) => <div key={w} className="py-1" style={{ color: i === 0 ? "#ef4444" : i === 6 ? "#2563eb" : undefined }}>{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px" style={{ background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", opacity: loading ? 0.6 : 1 }}>
          {cells.map((day) => {
            const inMonth = day.startsWith(month);
            const list = dayEvents(day);
            const isToday = day === today;
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                aria-label={`${day} 일정 ${list.length}개`}
                aria-pressed={isSelected}
                className="text-left p-1 min-h-20 md:min-h-24 flex flex-col gap-0.5 min-w-0"
                style={{ background: isSelected ? "color-mix(in srgb, var(--primary) 12%, var(--card))" : "var(--card)", opacity: inMonth ? 1 : 0.45 }}
              >
                <span className="text-[11px] font-700 w-5 h-5 flex items-center justify-center shrink-0" style={{ background: isToday ? "var(--primary)" : "transparent", color: isToday ? "#fff" : "var(--foreground)", borderRadius: "50%" }}>{Number(day.slice(8))}</span>
                {list.slice(0, MAX_CHIPS_PER_DAY).map((e) => (
                  <span key={`${e.projectId}-${e.id}`} className="text-[10px] leading-tight px-1 py-0.5 truncate block" style={{ background: `${colorOf(e.projectId)}26`, color: "var(--foreground)", borderLeft: `3px solid ${colorOf(e.projectId)}`, borderRadius: "3px" }} title={`${e.projectName} · ${e.title}`}>{e.title}</span>
                ))}
                {list.length > MAX_CHIPS_PER_DAY && <span className="text-[10px] font-600" style={{ color: "var(--muted-foreground)" }}>+{list.length - MAX_CHIPS_PER_DAY}개 더</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4" style={{ background: "var(--card-glass, var(--card))", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        <h2 className="text-sm font-700 mb-3">{Number(selectedDay.slice(5, 7))}월 {Number(selectedDay.slice(8))}일 일정 · {selectedEvents.length}개</h2>
        {selectedEvents.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{loading ? "불러오는 중…" : "이 날은 일정이 없어요."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedEvents.map((e) => (
              <li key={`${e.projectId}-${e.id}`}>
                <button type="button" onClick={() => openEvent(e)} className="w-full text-left flex items-center gap-3 px-3 py-2.5" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)", borderLeft: `4px solid ${colorOf(e.projectId)}` }}>
                  <span className="text-[10px] font-700 px-2 py-0.5 shrink-0" style={{ background: `${TYPE_META[e.type].color}22`, color: TYPE_META[e.type].color, borderRadius: "20px" }}>{TYPE_META[e.type].label}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-600 truncate">{e.title}</span>
                    <span className="block text-[11px] truncate" style={{ color: "var(--muted-foreground)" }}>{e.projectName}{e.endDate ? ` · ${e.date} ~ ${e.endDate}` : ""}{e.scope === "personal" ? " · 개인" : ""}</span>
                  </span>
                  <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }} aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
