import StillImg from "./StillImg";
import { useEffect, useRef, useState } from "react";
import { useProject, type ScheduleEventType, type ScheduleEventScope, type ScheduleEventVisibility, type ScheduleEvent } from "../context/ProjectContext";

const typeMeta: Record<ScheduleEventType, { label: string; color: string }> = {
  deadline: { label: "마감", color: "#ef4444" },
  meeting: { label: "회의", color: "#2563eb" },
  presentation: { label: "발표", color: "#f59e0b" },
  other: { label: "기타", color: "#8b5cf6" },
};

// 기기 시간대 기준 오늘(YYYY-MM-DD). toISOString()은 UTC라 한국 시간 새벽 0~9시에 전날이 된다.
function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
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
const MAX_SEGMENTS_PER_DAY = 3;

const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 380;
const POPUP_ANIM_MS = 220;

function formatDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}월 ${d}일`;
}

// 더블클릭한 날짜 칸의 위치(originRect)에서 시작해, 그 칸의 중심을 기준으로
// 펼쳐진 크기(targetRect)로 커지는 팝업 — 화면 중앙이 아니라 클릭한 칸 자리에서
// 커진다(화면 밖으로 나가지 않게 16px 여백만큼만 안쪽으로 밀어넣음). 마운트 직후
// 한 프레임 뒤에 phase를 'open'으로 바꿔서 CSS transition이 실제로 발동하게
// 한다(처음부터 open 스타일로 그리면 transition이 걸리지 않음).
function DayEventsPopup({
  dateKey,
  dayEvents,
  onClose,
  originRect,
  typeMeta,
  displayTitle,
  ownerName,
}: {
  dateKey: string;
  dayEvents: ScheduleEvent[];
  onClose: () => void;
  originRect: DOMRect;
  typeMeta: Record<ScheduleEventType, { label: string; color: string }>;
  displayTitle: (e: ScheduleEvent) => string;
  ownerName: (e: ScheduleEvent) => string;
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
          {dayEvents.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2.5 p-2.5"
              style={{ background: "var(--muted)", borderRadius: "10px", opacity: e.scope === "personal" && e.visibility === "private" ? 0.6 : 1 }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: typeMeta[e.type].color }} />
              <div className="min-w-0">
                <div className="text-xs font-600 truncate">{displayTitle(e)}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {typeMeta[e.type].label}
                  {e.endDate ? ` · ${formatDayLabel(e.date)} ~ ${formatDayLabel(e.endDate)}` : ""}
                  {e.scope === "personal" ? ` · ${ownerName(e)}` : " · 팀 일정"}
                </div>
              </div>
            </div>
          ))}
          {dayEvents.length === 0 && (
            <div className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>이 날짜엔 일정이 없어요</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Schedule({ focusEventId }: { focusEventId?: number } = {}) {
  const { project, team, currentMember, isManager, scheduleEvents, addScheduleEvent, updateScheduleEvent, removeScheduleEvent, markSectionViewed } = useProject();
  const today = todayISO();
  const defaultMonth = scheduleEvents[0]?.date.slice(0, 7) || today.slice(0, 7);
  const [month, setMonth] = useState(defaultMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayPopup, setDayPopup] = useState<{ dateKey: string; rect: DOMRect } | null>(null);
  const [showTeam, setShowTeam] = useState(true);
  const [showPersonal, setShowPersonal] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>(team.members.map((m) => m.id));
  const [memberSearch, setMemberSearch] = useState("");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<ScheduleEventType>("meeting");
  const [scope, setScope] = useState<ScheduleEventScope>("personal");
  const [visibility, setVisibility] = useState<ScheduleEventVisibility>("private");
  const [hideTitle, setHideTitle] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function runAction(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setActionError(null);
    try { await action(); } catch (err) { setActionError(err && typeof err === "object" && "message" in err ? String(err.message) : "일정을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const [editingId, setEditingId] = useState<number | null>(null);
  // 남의 일정은 수정은 못 해도 목록/달력에서 선택(강조)은 할 수 있어야 하므로
  // editingId(수정 대상)와 별도로 선택 상태를 둔다.
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  // 알림 등으로 들어온 focusEventId를 선택 상태의 "초깃값"으로 딱 한 번만
  // 반영하기 위한 가드. true가 된 뒤로는 이후 어떤 재실행에도 사용자가 직접
  // 고른 selectedEventId를 덮어쓰지 않는다.
  const seededFocusEventRef = useRef(false);

  const locked = project.status === "done";

  useEffect(() => {
    setMonth(scheduleEvents[0]?.date.slice(0, 7) || today.slice(0, 7));
    setSelectedDay(null);
    setDayPopup(null);
    setShowTeam(true);
    setShowPersonal(true);
    setSelectedMembers(team.members.map((m) => m.id));
    setTitle("");
    setDate("");
    setEndDate("");
    setScope("personal");
    setVisibility("private");
    setHideTitle(false);
    setEditingId(null);
    setSelectedEventId(null);
    seededFocusEventRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (currentMember) void markSectionViewed("schedule");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, currentMember?.id]);

  const focusedEvent = scheduleEvents.find(event => event.id === focusEventId);
  useEffect(() => {
    if (!focusedEvent || seededFocusEventRef.current) return;
    if (focusedEvent.scope === "personal" && focusedEvent.visibility !== "shared" && focusedEvent.ownerMemberId !== currentMember?.id) return;
    seededFocusEventRef.current = true;
    setMonth(focusedEvent.date.slice(0, 7));
    setSelectedDay(focusedEvent.date);
    setShowTeam(true);
    setShowPersonal(true);
    if (focusedEvent.ownerMemberId) {
      const owner = focusedEvent.ownerMemberId;
      setSelectedMembers(previous => previous.includes(owner) ? previous : [...previous, owner]);
    }
    setSelectedEventId(focusedEvent.id);
  }, [project.id, focusedEvent?.id, focusedEvent?.date, focusedEvent?.ownerMemberId, focusedEvent?.scope, focusedEvent?.visibility, currentMember?.id]);

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

  function canEdit(e: ScheduleEvent): boolean {
    if (e.scope === "team") return isManager;
    return e.ownerMemberId === currentMember?.id;
  }

  function startEdit(e: ScheduleEvent) {
    if (locked || !canEdit(e)) return;
    setEditingId(e.id);
    setSelectedEventId(e.id);
    setTitle(e.title);
    setDate(e.date);
    setEndDate(e.endDate ?? "");
    setType(e.type);
    setScope(e.scope);
    setVisibility(e.visibility ?? "private");
    setHideTitle(e.hideTitle);
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDate("");
    setEndDate("");
    setScope("personal");
    setVisibility("private");
    setHideTitle(false);
  }

  function cancelEdit() {
    resetForm();
    setSelectedEventId(null);
  }

  const visibleToMe = scheduleEvents.filter(
    (e) => e.scope === "team" || e.visibility === "shared" || e.ownerMemberId === currentMember?.id
  );

  // 개인 일정 필터의 팀원 목록: 전체 팀원이 아니라, 나에게 보이는 개인 일정을
  // 실제로 하나라도 가진 사람만 표시. 검색어로 추가로 좁힘.
  const membersWithPersonalEvents = new Set(
    visibleToMe.filter((e) => e.scope === "personal" && e.ownerMemberId).map((e) => e.ownerMemberId as string)
  );
  const memberSearchTrimmed = memberSearch.trim().toLowerCase();
  const filterableMembers = team.members
    .filter((m) => membersWithPersonalEvents.has(m.id))
    .filter((m) => !memberSearchTrimmed || m.name.toLowerCase().includes(memberSearchTrimmed));

  const events = visibleToMe
    .filter((e) => {
      if (e.scope === "team") return showTeam;
      return showPersonal && selectedMembers.includes(e.ownerMemberId ?? "");
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // 모든 일정을 "기간"으로 통일해서 다룬다 — 종료일이 없으면 시작일=종료일인
  // 하루짜리 기간.
  const segments = events.map((e) => ({ event: e, start: e.date, end: e.endDate ?? e.date }));
  function segmentsForDay(key: string) {
    return segments.filter((s) => key >= s.start && key <= s.end);
  }

  const weeks = getMonthGrid(month);

  // 여러 날에 걸친 일정을, 그 일정이 보이는 모든 날짜에서 "같은 줄(레인)"에
  // 고정 배치한다(구글 캘린더 월간 보기 방식) — 그래야 하루하루 지나면서 다른
  // 일정이 시작/끝나도 줄 높이가 안 바뀌어서 선이 끊겨 보이지 않는다. 레인은
  // 한 주(7일) 단위로만 계산(이 달력은 인접 달의 날짜를 표시하지 않으므로,
  // 주 경계에 걸친 일정은 실제로 보이는 첫/마지막 칸부터 그려짐).
  const laneByEventIdByWeek = weeks.map((week) => {
    const weekKeys = week.filter((d): d is number => d !== null).map((d) => dayKey(month, d));
    const laneOf = new Map<number, number>();
    if (weekKeys.length === 0) return laneOf;
    const weekStart = weekKeys[0];
    const weekEnd = weekKeys[weekKeys.length - 1];
    const relevant = segments
      .filter((s) => s.start !== s.end && s.end >= weekStart && s.start <= weekEnd)
      .sort((a, b) => a.start.localeCompare(b.start) || a.event.id - b.event.id);
    const laneEnds: string[] = [];
    for (const seg of relevant) {
      const clippedStart = seg.start < weekStart ? weekStart : seg.start;
      const clippedEnd = seg.end > weekEnd ? weekEnd : seg.end;
      let lane = laneEnds.findIndex((end) => end < clippedStart);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(clippedEnd);
      } else {
        laneEnds[lane] = clippedEnd;
      }
      laneOf.set(seg.event.id, lane);
    }
    return laneOf;
  });

  const agenda = selectedDay ? events.filter((e) => selectedDay >= e.date && selectedDay <= (e.endDate ?? e.date)) : events;
  // 우측 목록에서 일정을 클릭(수정 진입)하거나 외부에서 특정 일정으로 진입한
  // 경우, 달력 위 해당 일정의 점/막대를 살짝 키워서 강조한다.
  const highlightEventId = selectedEventId;
  // 수정 권한 없는 남의 일정을 선택했을 때는 추가/수정 폼 대신 읽기 전용
  // 정보 카드를 보여줘서, 폼이 열린 것처럼 보이는 혼동을 없앤다.
  const viewingEvent = editingId === null && selectedEventId !== null ? (events.find((ev) => ev.id === selectedEventId) ?? null) : null;
  // 검색창은 팀원 목록과 일정 목록에 같이 쓰인다: 팀원이나 일정이 많아지면
  // (팀원 6명 초과 또는 일정 5개 초과) 나타나고, 같은 검색어로 일정 제목도
  // 걸러준다. displayTitle을 쓰는 이유는 비공개 처리된 제목("바쁨")을 검색
  // 결과에서 원문으로 노출시키지 않기 위함.
  const showSearch = membersWithPersonalEvents.size > 6 || agenda.length > 5;
  const searchableAgenda = agenda.filter(
    (e) => !memberSearchTrimmed || displayTitle(e).toLowerCase().includes(memberSearchTrimmed) || ownerName(e).toLowerCase().includes(memberSearchTrimmed)
  );

  async function handleSubmit() {
    if (!title.trim() || !date.trim() || locked) return;
    if (scope === "team" && !isManager) return;
    if (editingId !== null) {
      await updateScheduleEvent(editingId, {
        title: title.trim(),
        date: date.trim(),
        endDate: endDate.trim() || null,
        type,
        visibility: scope === "personal" ? visibility : undefined,
        hideTitle: scope === "personal" && visibility === "shared" ? hideTitle : undefined,
      });
      cancelEdit();
      return;
    }
    await addScheduleEvent({
      title: title.trim(),
      date: date.trim(),
      endDate: endDate.trim() || null,
      type,
      scope,
      visibility: scope === "personal" ? visibility : undefined,
      hideTitle: scope === "personal" && visibility === "shared" ? hideTitle : undefined,
    });
    setTitle("");
    setDate("");
    setEndDate("");
  }

  async function handleDelete() {
    if (editingId === null) return;
    await removeScheduleEvent(editingId);
    cancelEdit();
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          일정 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Schedule</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          마감·회의·발표 일정을 한눈에 확인하세요{locked && " · 종료된 프로젝트 (읽기 전용)"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Calendar */}
        <div className="col-span-1 md:col-span-3 p-5" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
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

          <div className="grid grid-cols-7 mb-1">
            {weekdayLabels.map((w) => (
              <div key={w} className="text-xs font-600 text-center py-1" style={{ color: "var(--muted-foreground)" }}>{w}</div>
            ))}
          </div>

          <div
            className="flex flex-col"
            style={{
              borderLeft: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
              borderTop: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
            }}
          >
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((d, di) => {
                  if (d === null)
                    return (
                      <div
                        key={di}
                        style={{
                          borderRight: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                          borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                        }}
                      />
                    );
                  const key = dayKey(month, d);
                  const daySegments = segmentsForDay(key);
                  const daySameDayEvents = daySegments.filter((s) => s.start === s.end);
                  const daySpanSegments = daySegments.filter((s) => s.start !== s.end);
                  const isToday = key === today;
                  const isSelected = selectedDay === key;

                  // 이번 주에 배정된 고정 레인 기준으로 이 날짜에 실제로 있는
                  // 세그먼트를 줄별로 채움(없는 레인은 빈 칸으로 둬서 다른
                  // 날짜와 높이가 안 어긋나게).
                  const laneOf = laneByEventIdByWeek[wi];
                  const bySegmentLane = new Map<number, (typeof daySpanSegments)[number]>();
                  let maxLane = -1;
                  for (const s of daySpanSegments) {
                    const lane = laneOf.get(s.event.id) ?? 0;
                    bySegmentLane.set(lane, s);
                    if (lane > maxLane) maxLane = lane;
                  }
                  const lanesToRender = Math.min(maxLane + 1, MAX_SEGMENTS_PER_DAY);
                  const hiddenCount = [...bySegmentLane.keys()].filter((lane) => lane >= lanesToRender).length;

                  return (
                    <button
                      key={di}
                      onClick={() => {
                        const next = isSelected ? null : key;
                        setSelectedDay(next);
                        if (next && !locked) setDate(next);
                      }}
                      onDoubleClick={(e) => setDayPopup({ dateKey: key, rect: e.currentTarget.getBoundingClientRect() })}
                      className="min-h-[76px] px-1 pt-1 pb-1 flex flex-col text-left transition-all overflow-hidden"
                      style={{
                        background: isSelected ? "var(--primary)" : isToday ? "var(--secondary)" : "transparent",
                        borderRight: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                        borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                        boxShadow: isToday && !isSelected ? "inset 0 0 0 1px var(--primary)" : "none",
                      }}
                    >
                      <span className="flex items-center justify-start gap-1.5 shrink-0 w-full">
                        <span
                          className="text-xs font-600"
                          style={{ color: isSelected ? "#fff" : isToday ? "var(--primary)" : "var(--foreground)" }}
                        >
                          {d}
                        </span>
                        {/* 당일(하루짜리) 일정은 막대 대신 숫자 옆에 점으로 — 최대 3개까지만. */}
                        {daySameDayEvents.slice(0, 3).map((s) => {
                          const isHighlighted = s.event.id === highlightEventId;
                          return (
                            <span
                              key={s.event.id}
                              title={s.event.title}
                              className="rounded-full shrink-0 transition-all"
                              style={{
                                width: isHighlighted ? 8 : 6,
                                height: isHighlighted ? 8 : 6,
                                background: isSelected ? "#fff" : typeMeta[s.event.type].color,
                                opacity: s.event.scope === "personal" && s.event.visibility === "private" ? 0.4 : 1,
                                boxShadow: isHighlighted ? `0 0 0 2px ${isSelected ? "rgba(255,255,255,0.4)" : `${typeMeta[s.event.type].color}40`}` : "none",
                              }}
                            />
                          );
                        })}
                      </span>
                      <div className="flex flex-col gap-1 mt-1 -mx-1">
                        {Array.from({ length: lanesToRender }, (_, lane) => {
                          const s = bySegmentLane.get(lane);
                          if (!s) return <div key={lane} style={{ height: 3 }} />;
                          const isStart = key === s.start;
                          const isEnd = key === s.end;
                          const isHighlighted = s.event.id === highlightEventId;
                          return (
                            <div
                              key={lane}
                              title={s.event.title}
                              className="transition-all"
                              style={{
                                height: isHighlighted ? 5 : 3,
                                background: isSelected ? "rgba(255,255,255,0.75)" : typeMeta[s.event.type].color,
                                opacity: s.event.scope === "personal" && s.event.visibility === "private" ? 0.5 : 1,
                                marginLeft: isStart ? "50%" : 0,
                                // 끝나는 날은 시작하는 날보다 살짝 더 짧게 그려서, 다른
                                // 일정의 시작과 맞물려도(같은 날 끝/시작) 하나의 끊긴
                                // 선이 아니라 분명히 "여기서 끝난다"는 게 보이게 한다.
                                marginRight: isEnd ? "65%" : 0,
                                borderRadius: isStart && isEnd ? 2 : isStart ? "2px 0 0 2px" : isEnd ? "0 2px 2px 0" : 0,
                              }}
                            />
                          );
                        })}
                        {hiddenCount > 0 && (
                          <span className="text-[9px] leading-none px-1" style={{ color: isSelected ? "#fff" : "var(--muted-foreground)" }}>
                            +{hiddenCount}개 더보기
                          </span>
                        )}
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
        <div className="col-span-1 md:col-span-2 flex flex-col gap-5">
          {!locked && viewingEvent && (
            <div className="p-5" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-700">일정 정보</h2>
                <button
                  onClick={() => setSelectedEventId(null)}
                  className="text-xs font-600 px-2.5 py-1"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}
                >
                  닫기
                </button>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: typeMeta[viewingEvent.type].color }} />
                <span className="text-sm font-700">{displayTitle(viewingEvent)}</span>
              </div>
              <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
                {viewingEvent.date}{viewingEvent.endDate ? ` ~ ${viewingEvent.endDate}` : ""} · {typeMeta[viewingEvent.type].label}
              </div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {viewingEvent.scope === "team" ? "팀 일정" : `${ownerName(viewingEvent)}님 개인 일정`}
              </div>
              <div className="text-xs mt-3 py-2 text-center" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>
                다른 팀원의 일정은 수정할 수 없어요
              </div>
            </div>
          )}
          {!locked && !viewingEvent && (
            <div className="p-5" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-700">{editingId !== null ? "일정 수정" : "일정 추가"}</h2>
                {editingId !== null && (
                  <button
                    onClick={cancelEdit}
                    className="text-xs font-600 px-2.5 py-1"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}
                  >
                    취소
                  </button>
                )}
              </div>

              <div className="flex gap-2 mb-2">
                {(["personal", "team"] as ScheduleEventScope[]).map((s) => (
                  <button
                    key={s}
                    disabled={editingId !== null}
                    onClick={() => setScope(s)}
                    className="flex-1 py-2 text-xs font-700 transition-all"
                    style={{
                      background: scope === s ? "var(--primary)" : "var(--muted)",
                      color: scope === s ? "#fff" : "var(--muted-foreground)",
                      borderRadius: "20px",
                      opacity: editingId !== null ? 0.6 : 1,
                    }}
                  >
                    {s === "personal" ? "개인 일정" : "팀 일정"}
                  </button>
                ))}
              </div>

              {scope === "team" && !isManager ? (
                <div className="text-xs text-center py-3 mb-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>
                  팀 일정은 팀장·부팀장만 추가할 수 있어요
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
                  <div className="flex gap-2 mb-2 items-end flex-wrap">
                    <div className="flex-1 min-w-[110px]">
                      <label className="text-xs block mb-1" style={{ color: "var(--muted-foreground)" }}>시작일</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full text-sm px-3 py-2 border outline-none"
                        style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-jetbrains)" }}
                      />
                    </div>
                    <div className="flex-1 min-w-[110px]">
                      <label className="text-xs block mb-1" style={{ color: "var(--muted-foreground)" }}>종료일</label>
                      <input
                        type="date"
                        value={endDate}
                        min={date || undefined}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full text-sm px-3 py-2 border outline-none"
                        style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-jetbrains)" }}
                      />
                    </div>
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

                  {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
                  <div className="flex gap-2">
                    {editingId !== null && (
                      <button
                        disabled={busy}
                        onClick={() => runAction(handleDelete)}
                        className="px-4 py-2.5 text-sm font-700 transition-all"
                        style={{ background: "#ef444418", color: "#ef4444", borderRadius: "40px" }}
                      >
                        삭제
                      </button>
                    )}
                    <button
                      disabled={busy || !title.trim() || !date}
                      onClick={() => runAction(handleSubmit)}
                      className="flex-1 py-2.5 text-sm font-700 transition-all"
                      style={{
                        background: title.trim() && date.trim() ? "var(--primary)" : "var(--muted)",
                        color: title.trim() && date.trim() ? "#fff" : "var(--muted-foreground)",
                        borderRadius: "40px",
                      }}
                    >
                      {editingId !== null ? "저장" : "일정 추가"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="p-5 flex-1" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
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

            {showSearch && (
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="팀원 · 일정 검색"
                className="w-full text-xs px-3 py-1.5 border outline-none mb-3"
                style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
              />
            )}

            {showPersonal && (
              <div className="mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto pr-1">
                  {filterableMembers.map((m) => {
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
                          {m.avatarUrl ? <StillImg src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : m.avatar}
                        </span>
                        {m.name}
                      </button>
                    );
                  })}
                  {filterableMembers.length === 0 && (
                    <div className="text-xs py-1" style={{ color: "var(--muted-foreground)" }}>
                      {memberSearchTrimmed ? "검색 결과가 없어요" : "개인 일정을 가진 팀원이 없어요"}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5 max-h-[215px] overflow-y-auto pr-1">
              {searchableAgenda.map((e) => {
                const meta = typeMeta[e.type];
                const d = daysUntil(e.date, today);
                const isMine = e.scope === "personal" && e.ownerMemberId === currentMember?.id;
                const editable = !locked && canEdit(e);
                return (
                  <div
                    key={e.id}
                    onClick={() => {
                      if (editable) {
                        startEdit(e);
                      } else {
                        resetForm();
                        setSelectedEventId((prev) => (prev === e.id ? null : e.id));
                      }
                    }}
                    className="flex items-center justify-between p-2.5 transition-all"
                    style={{
                      background: selectedEventId === e.id ? "var(--secondary)" : "var(--muted)",
                      borderRadius: "10px",
                      cursor: "pointer",
                      boxShadow: selectedEventId === e.id ? "inset 0 0 0 1px var(--primary)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color, opacity: e.scope === "personal" && e.visibility === "private" ? 0.5 : 1 }} />
                      <div className="min-w-0">
                        <div className="text-xs font-600 truncate">{displayTitle(e)}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
                          {e.date}{e.endDate ? ` ~ ${e.endDate}` : ""} · {meta.label}
                          {e.scope === "personal" && !isMine ? ` · ${ownerName(e)}님 개인일정` : ""}
                          {e.scope === "personal" && isMine ? ` · ${e.visibility === "private" ? "나만 보기" : "팀에 공유"}` : ""}
                        </div>
                      </div>
                    </div>
                    {!locked && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {editable && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        )}
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
                      </div>
                    )}
                  </div>
                );
              })}
              {searchableAgenda.length === 0 && (
                <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>
                  {agenda.length === 0 ? "등록된 일정이 없어요" : "검색 결과가 없어요"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {dayPopup && (
        <DayEventsPopup
          dateKey={dayPopup.dateKey}
          dayEvents={segmentsForDay(dayPopup.dateKey).map((s) => s.event)}
          originRect={dayPopup.rect}
          onClose={() => setDayPopup(null)}
          typeMeta={typeMeta}
          displayTitle={displayTitle}
          ownerName={ownerName}
        />
      )}
    </div>
  );
}
