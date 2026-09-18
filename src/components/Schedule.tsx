import { useEffect, useMemo, useState } from "react";
import { useProject } from "../context/ProjectContext";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  type CalendarEvent,
  type CalendarEventType,
} from "../api/backend/calendar";

// 제품개발/frontend의 일정(구글 캘린더 스타일 라벨 바 달력, ScheduleTab.tsx)을 이 앱의 화면 형식
// (페이지 하나 = 화면 하나, var(--token) 인라인 스타일)에 맞춰 그대로 이식. talju_hajima 원래의
// 개인/팀 범위(scope)·공개범위(visibility) 구분은 실제 백엔드 캘린더에 대응 개념이 없어(제목/날짜/
// 기간/색/refType만 존재) 빠졌다 — Workspace.tsx를 실제 백엔드로 교체한 것과 동일한 방식.

const typeMeta: Record<CalendarEventType, { label: string; color: string }> = {
  deadline: { label: "마감", color: "#ef4444" },
  meeting: { label: "회의", color: "#2563eb" },
  presentation: { label: "발표", color: "#f59e0b" },
  other: { label: "기타", color: "#8b5cf6" },
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_SEGMENTS_PER_DAY = 3;

function eventColor(e: CalendarEvent): string {
  return e.color ?? (e.refType ? typeMeta[e.refType].color : typeMeta.other.color);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

// 일정 생성 폼에 시간을 남기지 않으면 자정(00:00)으로 저장된다 — 그래서 "시간이 실제로
// 설정됐는지"는 별도 필드 없이 시:분이 00:00이 아닌지로 판단한다 (자정 정각에 시작하는
// 일정을 시간 미설정으로 오판하는 예외가 있지만, 필드를 새로 추가하는 것보단 가벼움).
function hasExplicitTime(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function formatDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}월 ${d}일`;
}

const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 380;
const POPUP_ANIM_MS = 220;

// 더블클릭한 날짜 칸의 위치(originRect)에서 시작해, 그 칸의 중심을 기준으로 펼쳐진 크기
// (targetRect)로 커지는 팝업 — 화면 중앙이 아니라 클릭한 칸 자리에서 커진다(화면 밖으로
// 나가지 않게 16px 여백만큼만 안쪽으로 밀어넣음). 마운트 직후 한 프레임 뒤에 phase를
// 'open'으로 바꿔서 CSS transition이 실제로 발동하게 한다(처음부터 open 스타일로 그리면
// transition이 걸리지 않음).
function DayEventsPopup({
  dateKey,
  segments,
  onClose,
  originRect,
}: {
  dateKey: string;
  segments: { event: CalendarEvent; start: string; end: string }[];
  onClose: () => void;
  originRect: DOMRect;
}) {
  const [phase, setPhase] = useState<"enter" | "open" | "closing">("enter");

  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    setPhase("closing");
    setTimeout(onClose, POPUP_ANIM_MS);
  }

  const open = phase === "open";
  const targetWidth = Math.min(POPUP_WIDTH, window.innerWidth - 32);
  const targetHeight = Math.min(POPUP_HEIGHT, window.innerHeight - 32);
  const originCenterX = originRect.left + originRect.width / 2;
  const originCenterY = originRect.top + originRect.height / 2;
  const targetRect = {
    left: Math.min(Math.max(originCenterX - targetWidth / 2, 16), window.innerWidth - targetWidth - 16),
    top: Math.min(Math.max(originCenterY - targetHeight / 2, 16), window.innerHeight - targetHeight - 16),
    width: targetWidth,
    height: targetHeight,
  };
  const rect = open
    ? targetRect
    : { left: originRect.left, top: originRect.top, width: originRect.width, height: originRect.height };

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: "rgba(15,18,53,0.35)", opacity: open ? 1 : 0, transition: `opacity ${POPUP_ANIM_MS}ms ease` }}
      onClick={close}
    >
      <div
        className="fixed overflow-hidden flex flex-col"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          background: "var(--card)",
          borderRadius: "var(--radius)",
          boxShadow: "0 24px 64px rgba(15,18,53,0.25)",
          transition: `left ${POPUP_ANIM_MS}ms ease, top ${POPUP_ANIM_MS}ms ease, width ${POPUP_ANIM_MS}ms ease, height ${POPUP_ANIM_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-700">{formatDayLabel(dateKey)} 일정</h3>
          <button
            onClick={close}
            className="w-7 h-7 flex items-center justify-center text-sm rounded-full"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {segments.map((s) => (
            <div
              key={s.event.id}
              className="flex items-center gap-2.5 p-2.5"
              style={{ background: "var(--muted)", borderRadius: "10px", opacity: hasExplicitTime(s.event.date) ? 1 : 0.5 }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: eventColor(s.event) }} />
              <div className="min-w-0">
                <div className="text-xs font-600 truncate">{s.event.title}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {formatDayLabel(s.start)} ~ {formatDayLabel(s.end)}
                </div>
              </div>
            </div>
          ))}
          {segments.length === 0 && (
            <div className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>이 날짜엔 일정이 없어요</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Schedule() {
  const { project } = useProject();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<CalendarEventType>("meeting");
  const [color, setColor] = useState(typeMeta.meeting.color);
  const [error, setError] = useState<string | null>(null);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayPopup, setDayPopup] = useState<{ dateKey: string; rect: DOMRect } | null>(null);
  // 편집 대상 — "일정 추가" 폼을 이 값이 있는 동안 "일정 수정" 폼으로 재사용한다(아래
  // startEdit/cancelEdit/handleSubmit 참고), 목록 안에 별도 편집 폼을 두지 않음.
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  async function refresh() {
    const { data } = await listCalendarEvents(project.id);
    setEvents(data.slice().sort((a, b) => a.date.localeCompare(b.date)));
  }

  useEffect(() => {
    setMonthDate(new Date());
    setSelectedDate(null);
    setEditingEventId(null);
    refresh().catch(() => setError("일정을 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  function resetForm() {
    setTitle("");
    setDate("");
    setEndDate("");
    setType("meeting");
    setColor(typeMeta.meeting.color);
    setEditingEventId(null);
  }

  function startEdit(e: CalendarEvent) {
    if (e.source !== "manual") return;
    setEditingEventId(e.id);
    setTitle(e.title);
    setDate(e.date.slice(0, 10));
    setEndDate(e.endDate ? e.endDate.slice(0, 10) : "");
    setType(e.refType ?? "other");
    setColor(e.color ?? typeMeta[e.refType ?? "other"].color);
  }

  async function handleSubmit() {
    if (!title.trim() || !date) return;
    setError(null);
    try {
      if (editingEventId) {
        await updateCalendarEvent(project.id, editingEventId, { title: title.trim(), date, endDate: endDate || null, color, type });
      } else {
        await createCalendarEvent(project.id, { title: title.trim(), date, endDate: endDate || undefined, color, type });
      }
      resetForm();
      await refresh();
    } catch {
      setError(editingEventId ? "일정 수정에 실패했습니다." : "일정 추가에 실패했습니다.");
    }
  }

  async function handleDelete(eventId: string) {
    setError(null);
    try {
      await deleteCalendarEvent(project.id, eventId);
      if (editingEventId === eventId) resetForm();
      await refresh();
    } catch {
      setError("일정 삭제에 실패했습니다.");
    }
  }

  // 모든 일정을 "기간"으로 통일해서 다룬다 — 종료일이 없으면 시작일=종료일인 하루짜리 기간.
  const segments = useMemo(
    () => events.map((e) => ({ event: e, start: e.date.slice(0, 10), end: (e.endDate ?? e.date).slice(0, 10) })),
    [events],
  );

  function segmentsForDay(key: string) {
    return segments.filter((s) => key >= s.start && key <= s.end);
  }

  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const todayKey = toDateKey(new Date());
  const visibleEvents = selectedDate ? segmentsForDay(selectedDate).map((s) => s.event) : events;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-7">
        <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          일정 · {project.name}
        </div>
        <h1 className="text-3xl font-600" style={{ fontFamily: "var(--font-fraunces)" }}>Schedule</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>마감·회의·발표 일정을 한눈에 확인하세요</p>
      </div>

      {error && (
        <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* 달력 */}
        <div className="lg:col-span-3 p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="w-8 h-8 flex items-center justify-center text-sm font-700"
              style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "50%" }}
            >
              ‹
            </button>
            <div className="text-sm font-700">
              {monthDate.getFullYear()}년 {monthDate.getMonth() + 1}월
            </div>
            <button
              onClick={() => setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="w-8 h-8 flex items-center justify-center text-sm font-700"
              style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "50%" }}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 mb-1.5">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-xs font-600 text-center py-1" style={{ color: "var(--muted-foreground)" }}>
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {monthGrid.map((d) => {
              const key = toDateKey(d);
              const inMonth = d.getMonth() === monthDate.getMonth();
              const daySegments = segmentsForDay(key);
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                  onDoubleClick={(e) => setDayPopup({ dateKey: key, rect: e.currentTarget.getBoundingClientRect() })}
                  className="min-h-[92px] px-1 pt-1 pb-1 flex flex-col text-left transition-all overflow-hidden"
                  style={{
                    borderRadius: "10px",
                    background: isSelected ? "var(--primary)" : isToday ? "var(--secondary)" : "transparent",
                    opacity: inMonth ? 1 : 0.35,
                  }}
                >
                  <span className="text-xs font-600 px-0.5 shrink-0" style={{ color: isSelected ? "#fff" : "var(--foreground)" }}>
                    {d.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1 -mx-1">
                    {daySegments.slice(0, MAX_SEGMENTS_PER_DAY).map((s) => {
                      const isStart = key === s.start;
                      const isEnd = key === s.end;
                      return (
                        <div
                          key={s.event.id}
                          className="h-[18px] flex items-center px-1.5 text-[10px] font-600 truncate"
                          style={{
                            background: isSelected ? "rgba(255,255,255,0.75)" : eventColor(s.event),
                            color: isSelected ? eventColor(s.event) : "#fff",
                            borderTopLeftRadius: isStart ? 4 : 0,
                            borderBottomLeftRadius: isStart ? 4 : 0,
                            borderTopRightRadius: isEnd ? 4 : 0,
                            borderBottomRightRadius: isEnd ? 4 : 0,
                            marginLeft: isStart ? 2 : 0,
                            marginRight: isEnd ? 2 : 0,
                          }}
                        >
                          {isStart ? s.event.title : " "}
                        </div>
                      );
                    })}
                    {daySegments.length > MAX_SEGMENTS_PER_DAY && (
                      <span className="text-[9px] leading-none px-1" style={{ color: isSelected ? "#fff" : "var(--muted-foreground)" }}>
                        +{daySegments.length - MAX_SEGMENTS_PER_DAY}개 더보기
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 일정 추가 + 전체 일정 목록 */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-700">{editingEventId ? "일정 수정" : "일정 추가"}</h2>
              {editingEventId && (
                <button onClick={resetForm} className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                  취소
                </button>
              )}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목"
              className="w-full text-sm px-3 py-2 outline-none mb-2"
              style={{ border: "1px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
            />
            <div className="flex gap-2 mb-2 items-center flex-wrap">
              <div className="flex-1 min-w-[110px]">
                <label className="text-xs block mb-1" style={{ color: "var(--muted-foreground)" }}>시작일</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full text-sm px-3 py-2 outline-none"
                  style={{ border: "1px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
                />
              </div>
              <div className="flex-1 min-w-[110px]">
                <label className="text-xs block mb-1" style={{ color: "var(--muted-foreground)" }}>종료일 (기간 일정 시)</label>
                <input
                  type="date"
                  value={endDate}
                  min={date || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-sm px-3 py-2 outline-none"
                  style={{ border: "1px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
                />
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEventType)}
                className="flex-1 text-sm px-3 py-2 outline-none"
                style={{ border: "1px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
              >
                {(Object.keys(typeMeta) as CalendarEventType[]).map((t) => (
                  <option key={t} value={t}>
                    {typeMeta[t].label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 px-3" style={{ border: "1px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>색상</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer" />
              </label>
            </div>
            <button
              onClick={handleSubmit}
              className="w-full py-2.5 text-sm font-700"
              style={{ borderRadius: "40px", background: title.trim() && date ? "var(--primary)" : "var(--muted)", color: title.trim() && date ? "#fff" : "var(--muted-foreground)" }}
            >
              {editingEventId ? "일정 수정" : "일정 추가"}
            </button>
          </div>

          <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-700">{selectedDate ? `${selectedDate} 일정` : "전체 일정"}</h2>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="text-xs font-600" style={{ color: "var(--primary)" }}>
                  전체 보기
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {visibleEvents.map((e) => {
                const c = eventColor(e);
                const meta = e.refType ? typeMeta[e.refType] : typeMeta.other;
                const d = daysUntil(e.date.slice(0, 10));
                const editable = e.source === "manual";
                const isEditing = editingEventId === e.id;

                return (
                  <div
                    key={e.id}
                    onClick={() => editable && startEdit(e)}
                    className="flex items-center justify-between p-2.5 gap-2 transition-all"
                    style={{
                      background: isEditing ? "var(--secondary)" : "var(--muted)",
                      borderRadius: "10px",
                      border: isEditing ? "1.5px solid var(--primary)" : "1.5px solid transparent",
                      cursor: editable ? "pointer" : "default",
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
                      <div className="min-w-0">
                        <div className="text-xs font-600 truncate">{e.title}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {e.date.slice(0, 10)}
                          {e.endDate ? ` ~ ${e.endDate.slice(0, 10)}` : ""} · {meta.label}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {editable && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleDelete(e.id);
                          }}
                          className="w-6 h-6 flex items-center justify-center text-xs"
                          style={{ background: "var(--card)", color: "#ef4444", borderRadius: "50%" }}
                          title="삭제"
                        >
                          ×
                        </button>
                      )}
                      <span
                        className="text-xs font-700 px-2 py-0.5 shrink-0"
                        style={{ borderRadius: "20px", background: d >= 0 && d <= 7 ? `${c}20` : "var(--card)", color: d >= 0 && d <= 7 ? c : "var(--muted-foreground)" }}
                      >
                        {d === 0 ? "D-DAY" : d > 0 ? `D-${d}` : `D+${-d}`}
                      </span>
                    </div>
                  </div>
                );
              })}
              {visibleEvents.length === 0 && (
                <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>
                  {selectedDate ? "이 날짜에는 일정이 없어요" : "등록된 일정이 없어요"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {dayPopup && (
        <DayEventsPopup
          dateKey={dayPopup.dateKey}
          segments={segmentsForDay(dayPopup.dateKey)}
          originRect={dayPopup.rect}
          onClose={() => setDayPopup(null)}
        />
      )}
    </div>
  );
}
