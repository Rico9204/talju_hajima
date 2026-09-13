import { useEffect, useState } from "react";
import { useProject, type ScheduleEventType, type ScheduleEventScope, type ScheduleEventVisibility, type ScheduleEvent } from "../context/ProjectContext";

const typeMeta: Record<ScheduleEventType, { label: string; color: string }> = {
  deadline: { label: "마감", color: "#ef4444" },
  meeting: { label: "회의", color: "#2563eb" },
  presentation: { label: "발표", color: "#f59e0b" },
  other: { label: "기타", color: "#8b5cf6" },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

function daysUntil(dateStr: string, today: string) {
  const a = new Date(today + "T00:00:00");
  const b = new Date(dateStr + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export default function Schedule() {
  const { project, team, currentMember, isLeader, scheduleEvents, addScheduleEvent } = useProject();
  const today = todayISO();
  const defaultMonth = scheduleEvents[0]?.date.slice(0, 7) || today.slice(0, 7);
  const [month, setMonth] = useState(defaultMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showTeam, setShowTeam] = useState(true);
  const [showPersonal, setShowPersonal] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>(team.members.map((m) => m.id));

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<ScheduleEventType>("meeting");
  const [scope, setScope] = useState<ScheduleEventScope>("personal");
  const [visibility, setVisibility] = useState<ScheduleEventVisibility>("private");
  const [hideTitle, setHideTitle] = useState(false);

  const locked = project.status === "done";

  useEffect(() => {
    setMonth(scheduleEvents[0]?.date.slice(0, 7) || today.slice(0, 7));
    setSelectedDay(null);
    setShowTeam(true);
    setShowPersonal(true);
    setSelectedMembers(team.members.map((m) => m.id));
    setTitle("");
    setDate("");
    setScope("personal");
    setVisibility("private");
    setHideTitle(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  function ownerName(e: ScheduleEvent): string {
    return team.members.find((m) => m.id === e.ownerMemberId)?.name ?? "알 수 없음";
  }

  function displayTitle(e: ScheduleEvent) {
    if (e.scope === "personal" && e.hideTitle && e.ownerMemberId !== currentMember?.id) return "바쁨";
    return e.title;
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  }

  const visibleToMe = scheduleEvents.filter(
    (e) => e.scope === "team" || e.visibility === "shared" || e.ownerMemberId === currentMember?.id
  );

  const events = visibleToMe
    .filter((e) => {
      if (e.scope === "team") return showTeam;
      return showPersonal && selectedMembers.includes(e.ownerMemberId ?? "");
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const weeks = getMonthGrid(month);
  const eventsByDay = events.reduce<Record<string, ScheduleEvent[]>>((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});

  const agenda = selectedDay ? events.filter((e) => e.date === selectedDay) : events;

  async function handleAdd() {
    if (!title.trim() || !date.trim() || locked) return;
    if (scope === "team" && !isLeader) return;
    await addScheduleEvent({
      title: title.trim(),
      date: date.trim(),
      type,
      scope,
      visibility: scope === "personal" ? visibility : undefined,
      hideTitle: scope === "personal" && visibility === "shared" ? hideTitle : undefined,
    });
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                className="w-7 h-7 flex items-center justify-center text-sm font-700"
                style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "50%" }}
              >
                ‹
              </button>
              <h2 className="text-base font-700" style={{ fontFamily: "var(--font-jetbrains)" }}>{month}</h2>
              <button
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                className="w-7 h-7 flex items-center justify-center text-sm font-700"
                style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "50%" }}
              >
                ›
              </button>
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
                  const key = dayKey(month, d);
                  const dayEvents = eventsByDay[key] || [];
                  const isToday = key === today;
                  const isSelected = selectedDay === key;
                  return (
                    <button
                      key={di}
                      onClick={() => {
                        const next = isSelected ? null : key;
                        setSelectedDay(next);
                        if (next && !locked) setDate(next);
                      }}
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
                            style={{
                              background: isSelected ? "#fff" : typeMeta[e.type].color,
                              opacity: e.scope === "personal" && e.visibility === "private" ? 0.4 : 1,
                            }}
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
            {(Object.keys(typeMeta) as ScheduleEventType[]).map((t) => (
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

              <div className="flex gap-2 mb-2">
                {(["personal", "team"] as ScheduleEventScope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className="flex-1 py-2 text-xs font-700 transition-all"
                    style={{
                      background: scope === s ? "var(--primary)" : "var(--muted)",
                      color: scope === s ? "#fff" : "var(--muted-foreground)",
                      borderRadius: "20px",
                    }}
                  >
                    {s === "personal" ? "개인 일정" : "팀 일정"}
                  </button>
                ))}
              </div>

              {scope === "team" && !isLeader ? (
                <div className="text-xs text-center py-3 mb-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>
                  팀 일정은 조장만 추가할 수 있어요
                </div>
              ) : (
                <>
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
                      onChange={(e) => setType(e.target.value as ScheduleEventType)}
                      className="text-sm px-3 py-2 border outline-none"
                      style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
                    >
                      {(Object.keys(typeMeta) as ScheduleEventType[]).map((t) => (
                        <option key={t} value={t}>{typeMeta[t].label}</option>
                      ))}
                    </select>
                  </div>

                  {scope === "personal" && (
                    <div className="flex gap-1.5 mb-2">
                      {(["private", "shared"] as ScheduleEventVisibility[]).map((v) => (
                        <button
                          key={v}
                          onClick={() => setVisibility(v)}
                          title={v === "private" ? "나만 보기" : "팀에 공유"}
                          aria-label={v === "private" ? "나만 보기" : "팀에 공유"}
                          className="w-8 h-8 flex items-center justify-center shrink-0 transition-all"
                          style={{
                            background: visibility === v ? "var(--secondary)" : "var(--muted)",
                            color: visibility === v ? "var(--primary)" : "var(--muted-foreground)",
                            borderRadius: "50%",
                          }}
                        >
                          {v === "private" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                              <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                              <path d="M2 2l20 20" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {scope === "personal" && visibility === "shared" && (
                    <label className="flex items-center gap-2 mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      <input type="checkbox" checked={hideTitle} onChange={(e) => setHideTitle(e.target.checked)} />
                      팀원에게는 제목 대신 "바쁨"으로만 표시
                    </label>
                  )}

                  <button
                    onClick={handleAdd}
                    className="w-full py-2.5 text-sm font-700 transition-all"
                    style={{
                      background: title.trim() && date.trim() ? "var(--primary)" : "var(--muted)",
                      color: title.trim() && date.trim() ? "#fff" : "var(--muted-foreground)",
                      borderRadius: "40px",
                    }}
                  >
                    일정 추가
                  </button>
                </>
              )}
            </div>
          )}

          <div className="p-5 flex-1" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-700">{selectedDay ? `${selectedDay} 일정` : "전체 일정"}</h2>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowTeam((v) => !v)}
                  title="팀 일정"
                  aria-label="팀 일정"
                  className="w-8 h-8 flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: showTeam ? "var(--secondary)" : "var(--muted)",
                    color: showTeam ? "var(--primary)" : "var(--muted-foreground)",
                    borderRadius: "50%",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowPersonal((v) => !v)}
                  title="개인 일정"
                  aria-label="개인 일정"
                  className="w-8 h-8 flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: showPersonal ? "var(--secondary)" : "var(--muted)",
                    color: showPersonal ? "var(--primary)" : "var(--muted-foreground)",
                    borderRadius: "50%",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </button>
              </div>
            </div>

            {showPersonal && (
              <div className="flex gap-2 flex-wrap mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                {team.members.map((m) => {
                  const checked = selectedMembers.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMember(m.id)}
                      aria-pressed={checked}
                      className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 text-xs font-600 shrink-0 transition-all"
                      style={{
                        background: checked ? `${m.color}18` : "var(--muted)",
                        color: checked ? m.color : "var(--muted-foreground)",
                        borderRadius: "20px",
                        opacity: checked ? 1 : 0.5,
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-700 shrink-0 overflow-hidden"
                        style={{ background: m.avatarUrl ? "var(--card)" : checked ? `${m.color}30` : "var(--border)", color: checked ? m.color : "var(--muted-foreground)" }}
                      >
                        {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : m.avatar}
                      </span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {agenda.map((e) => {
                const meta = typeMeta[e.type];
                const d = daysUntil(e.date, today);
                const isMine = e.scope === "personal" && e.ownerMemberId === currentMember?.id;
                return (
                  <div key={e.id} className="flex items-center justify-between p-2.5" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color, opacity: e.scope === "personal" && e.visibility === "private" ? 0.5 : 1 }} />
                      <div className="min-w-0">
                        <div className="text-xs font-600 truncate">{displayTitle(e)}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
                          {e.date} · {meta.label}
                          {e.scope === "personal" && !isMine ? ` · ${ownerName(e)}님 개인일정` : ""}
                          {e.scope === "personal" && isMine ? ` · ${e.visibility === "private" ? "나만 보기" : "팀에 공유"}` : ""}
                        </div>
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
