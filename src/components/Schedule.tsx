import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";

type EventType = "deadline" | "meeting" | "presentation" | "other";

interface ScheduleEvent {
  id: number;
  title: string;
  date: string; // YYYY-MM-DD
  type: EventType;
}

interface ProjectSchedule {
  referenceMonth: string; // YYYY-MM
  events: ScheduleEvent[];
}

const TODAY = "2026-09-10";

const scheduleByProject: Record<string, ProjectSchedule> = {
  heritage: {
    referenceMonth: "2026-09",
    events: [
      { id: 1, title: "정기 팀 회의", date: "2026-09-12", type: "meeting" },
      { id: 2, title: "동료 평가 중간 점검 마감", date: "2026-09-15", type: "deadline" },
      { id: 3, title: "강화도 2차 현장 답사", date: "2026-09-17", type: "other" },
      { id: 4, title: "현장조사 보고서 v3 마감", date: "2026-09-22", type: "deadline" },
      { id: 5, title: "중간발표 리허설 회의", date: "2026-09-29", type: "meeting" },
      { id: 6, title: "중간발표", date: "2026-10-08", type: "presentation" },
    ],
  },
  dialect: {
    referenceMonth: "2026-06",
    events: [
      { id: 101, title: "최종 보고서 제출 마감", date: "2026-06-15", type: "deadline" },
      { id: 102, title: "결과 발표회", date: "2026-06-20", type: "presentation" },
      { id: 103, title: "프로젝트 종료", date: "2026-06-21", type: "other" },
    ],
  },
};

const typeMeta: Record<EventType, { label: string; color: string }> = {
  deadline: { label: "마감", color: "#ef4444" },
  meeting: { label: "회의", color: "#2563eb" },
  presentation: { label: "발표", color: "#f59e0b" },
  other: { label: "기타", color: "#8b5cf6" },
};

function getMonthGrid(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dayKey(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysUntil(dateStr: string) {
  const a = new Date(TODAY + "T00:00:00");
  const b = new Date(dateStr + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export default function Schedule() {
  const { project } = useProject();
  const [eventsState, setEventsState] = useState<Record<string, ScheduleEvent[]>>(
    Object.fromEntries(Object.entries(scheduleByProject).map(([k, v]) => [k, v.events]))
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<EventType>("meeting");

  const schedule = scheduleByProject[project.id];
  const referenceMonth = schedule?.referenceMonth || TODAY.slice(0, 7);
  const events = (eventsState[project.id] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const locked = project.status === "done";
  const [viewMonth, setViewMonth] = useState(referenceMonth);

  useEffect(() => {
    setSelectedDay(null);
    setTitle("");
    setDate("");
    setViewMonth(referenceMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const weeks = getMonthGrid(viewMonth);
  const eventsByDay = events.reduce<Record<string, ScheduleEvent[]>>((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});

  const agenda = selectedDay ? events.filter((e) => e.date === selectedDay) : events;

  function addEvent() {
    if (!title.trim() || !date.trim() || locked) return;
    const newEvent: ScheduleEvent = { id: Date.now(), title: title.trim(), date: date.trim(), type };
    setEventsState((prev) => ({ ...prev, [project.id]: [...(prev[project.id] || []), newEvent] }));
    setTitle("");
    setDate("");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          일정 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Schedule</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          마감·회의·발표 일정을 한눈에 확인하세요{locked && " · 종료된 프로젝트 (읽기 전용)"}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* Calendar */}
        <div className="col-span-3 p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setViewMonth((v) => shiftMonth(v, -1))}
                className="w-7 h-7 flex items-center justify-center text-sm transition-all"
                style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "50%" }}
                aria-label="이전 달"
              >
                ‹
              </button>
              <h2 className="text-base font-700 min-w-[5.5rem] text-center" style={{ fontFamily: "var(--font-jetbrains)" }}>{viewMonth}</h2>
              <button
                onClick={() => setViewMonth((v) => shiftMonth(v, 1))}
                className="w-7 h-7 flex items-center justify-center text-sm transition-all"
                style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "50%" }}
                aria-label="다음 달"
              >
                ›
              </button>
              {viewMonth !== referenceMonth && (
                <button
                  onClick={() => setViewMonth(referenceMonth)}
                  className="text-xs font-600 px-2.5 py-1"
                  style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
                >
                  이번 달
                </button>
              )}
            </div>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs font-600 px-3 py-1.5"
                style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
              >
                전체 보기
              </button>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdayLabels.map((w) => (
              <div key={w} className="text-xs font-600 text-center py-1" style={{ color: "var(--muted-foreground)" }}>{w}</div>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((d, di) => {
                  if (d === null) return <div key={di} />;
                  const key = dayKey(viewMonth, d);
                  const dayEvents = eventsByDay[key] || [];
                  const isToday = key === TODAY;
                  const isSelected = selectedDay === key;
                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDay(isSelected ? null : key)}
                      className="aspect-square flex flex-col items-center justify-center gap-1 transition-all"
                      style={{
                        borderRadius: "10px",
                        background: isSelected ? "var(--primary)" : isToday ? "var(--secondary)" : "transparent",
                        border: isToday && !isSelected ? "1.5px solid var(--primary)" : "1.5px solid transparent",
                      }}
                    >
                      <span
                        className="text-xs font-600"
                        style={{ color: isSelected ? "#fff" : isToday ? "var(--primary)" : "var(--foreground)" }}
                      >
                        {d}
                      </span>
                      <div className="flex gap-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: isSelected ? "#fff" : typeMeta[e.type].color }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            {(Object.keys(typeMeta) as EventType[]).map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: typeMeta[t].color }} />
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{typeMeta[t].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agenda + add form */}
        <div className="col-span-2 flex flex-col gap-5">
          {!locked && (
            <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <h2 className="text-sm font-700 mb-3">일정 추가</h2>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="일정 제목"
                className="w-full text-sm px-3 py-2 border outline-none mb-2"
                style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
              />
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 text-sm px-3 py-2 border outline-none"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-jetbrains)" }}
                />
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as EventType)}
                  className="text-sm px-3 py-2 border outline-none"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
                >
                  {(Object.keys(typeMeta) as EventType[]).map((t) => (
                    <option key={t} value={t}>{typeMeta[t].label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={addEvent}
                className="w-full py-2.5 text-sm font-700 transition-all"
                style={{
                  background: title.trim() && date.trim() ? "var(--primary)" : "var(--muted)",
                  color: title.trim() && date.trim() ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "40px",
                }}
              >
                일정 추가
              </button>
            </div>
          )}

          <div className="p-5 flex-1" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <h2 className="text-sm font-700 mb-4">{selectedDay ? `${selectedDay} 일정` : "전체 일정"}</h2>
            <div className="flex flex-col gap-2.5">
              {agenda.map((e) => {
                const meta = typeMeta[e.type];
                const d = daysUntil(e.date);
                return (
                  <div key={e.id} className="flex items-center justify-between p-2.5" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                      <div className="min-w-0">
                        <div className="text-xs font-600 truncate">{e.title}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{e.date} · {meta.label}</div>
                      </div>
                    </div>
                    {!locked && (
                      <span
                        className="text-xs font-700 px-2 py-0.5 shrink-0"
                        style={{
                          background: d >= 0 && d <= 7 ? `${meta.color}20` : "var(--card)",
                          color: d >= 0 && d <= 7 ? meta.color : "var(--muted-foreground)",
                          borderRadius: "20px",
                          fontFamily: "var(--font-jetbrains)",
                        }}
                      >
                        {d === 0 ? "D-DAY" : d > 0 ? `D-${d}` : `D+${-d}`}
                      </span>
                    )}
                  </div>
                );
              })}
              {agenda.length === 0 && (
                <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>등록된 일정이 없어요</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
