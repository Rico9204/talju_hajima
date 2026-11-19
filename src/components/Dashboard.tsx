import { Link } from "react-router-dom";
import ProjectNoticeCard from "./ProjectNoticeCard";
import { dashboardActivity } from "../lib/dashboardActivity";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { summarizeDashboardTasks } from "../lib/dashboardTasks";
import MyEvaluationSummary from "./MyEvaluationSummary";
import { Page } from "../App";
import { useProject } from "../context/ProjectContext";
import { useDraggableScroll } from "../hooks/useDraggableScroll";
import Avatar from "./Avatar";
import AvatarFrame from "./AvatarFrame";
import MedalIcon from "./MedalIcon";
import WindowPanel from "./WindowPanel";
import { useMyProfileTheme } from "../lib/useMyProfileTheme";
import { ACHIEVEMENTS, achievementProgress, formatAchievementValue } from "../lib/achievements";
import type { MyEvaluationSummary as EvalSummary } from "../lib/evaluationSummary";
import {
  useDashboardLayout,
  isDefaultDashboardLayout,
  moveWidget,
  moveWidgetStep,
  type DashboardWidgetId,
  type DashboardColumnId,
} from "../lib/dashboardLayout";

interface Deadline { label: string; due: string; days: number; color: string }
interface Activity { who: string; action: string; time: string; avatar: string; color: string }
interface Phase { label: string; pct: number }
interface Stat { label: string; value: string; sub: string; icon: string; color: string }

interface ProjectDashboardData {
  banner: string;
  ctaPrimary: { label: string; page: Page };
  stats: Stat[];
  phases: Phase[];
  deadlines: Deadline[];
  activity: Activity[];
}

const dashboardData: Record<string, ProjectDashboardData> = {
  heritage: {
    banner: "동료 평가 중간 점검 마감까지 5일 남았습니다.",
    ctaPrimary: { label: "동료 평가 하러가기 →", page: "evaluation" },
    stats: [
      { label: "완료 과제", value: "14", sub: "전체 22개 중", icon: "✓", color: "#22c55e" },
      { label: "협업 평점", value: "4.4", sub: "3개 프로젝트 평균", icon: "★", color: "#f59e0b" },
      { label: "남은 마감", value: "3", sub: "다가오는 기한", icon: "◷", color: "#ef4444" },
      { label: "평가 완료", value: "4/5", sub: "중간 점검 라운드", icon: "⊙", color: "var(--status-inprogress)" },
    ],
    phases: [
      { label: "기획 및 자료 조사 계획", pct: 100 },
      { label: "1차 현장 답사 및 사진 기록", pct: 100 },
      { label: "문화재 목록 데이터 정리", pct: 70 },
      { label: "디지털 아카이브 설계", pct: 45 },
      { label: "최종 보고서 및 전시 자료 제작", pct: 10 },
    ],
    deadlines: [
      { label: "중간발표 자료", due: "2026-10-08", days: 28, color: "#22c55e" },
      { label: "현장조사 보고서 v3", due: "2026-09-22", days: 12, color: "#f59e0b" },
      { label: "동료 평가 중간 점검", due: "2026-09-15", days: 5, color: "#ef4444" },
    ],
    activity: [
      { who: "정하늘", action: "현장사진_모음.zip v2 업로드", time: "1시간 전", avatar: "정", color: "#8b5cf6" },
      { who: "이서연", action: "디지털_아카이브_기획안.pptx 업로드", time: "3시간 전", avatar: "이", color: "#22c55e" },
      { who: "박민준", action: "문화재 목록 데이터 오류 수정", time: "5시간 전", avatar: "박", color: "#f59e0b" },
      { who: "최현우", action: "중간발표_피드백_정리.docx 확인", time: "어제", avatar: "최", color: "#ef4444" },
    ],
  },
  dialect: {
    banner: "프로젝트가 종료되었습니다. 종료 평가 결과를 확인해보세요.",
    ctaPrimary: { label: "종료 평가 결과 보기 →", page: "evaluation" },
    stats: [
      { label: "완료 과제", value: "16", sub: "전체 16개 중", icon: "✓", color: "#22c55e" },
      { label: "협업 평점", value: "4.5", sub: "이 프로젝트 평균", icon: "★", color: "#f59e0b" },
      { label: "참여 기간", value: "14주", sub: "2026-03 ~ 2026-06", icon: "◷", color: "#454b6e" },
      { label: "평가 완료", value: "2/2", sub: "종료 평가 라운드", icon: "⊙", color: "var(--status-inprogress)" },
    ],
    phases: [
      { label: "방언 조사 지역 선정 및 계획", pct: 100 },
      { label: "현지 화자 인터뷰 및 녹취", pct: 100 },
      { label: "녹취 전사 및 어휘 분류", pct: 100 },
      { label: "비교 분석 및 보고서 작성", pct: 100 },
      { label: "결과 발표 및 아카이빙", pct: 100 },
    ],
    deadlines: [],
    activity: [
      { who: "오유진", action: "최종 보고서 v2 업로드", time: "2026-06-19", avatar: "오", color: "#4a74b5" },
      { who: "박민준", action: "인터뷰 녹취 전사 최종본 확인", time: "2026-06-17", avatar: "박", color: "#f59e0b" },
      { who: "김지수", action: "종료 평가 제출", time: "2026-06-21", avatar: "김", color: "#4a74b5" },
    ],
  },
};

const emptyDashboardData: ProjectDashboardData = {
  banner: "새 프로젝트가 만들어졌어요. 팀원을 초대하고 과제·일정을 등록해 시작해보세요.",
  ctaPrimary: { label: "팀 정보로 이동 →", page: "team" },
  stats: [
    { label: "완료 과제", value: "0", sub: "전체 0개 중", icon: "✓", color: "#22c55e" },
    { label: "협업 평점", value: "—", sub: "아직 평가 없음", icon: "★", color: "#f59e0b" },
    { label: "남은 마감", value: "0", sub: "등록된 일정 없음", icon: "◷", color: "#ef4444" },
    { label: "평가 완료", value: "0/0", sub: "중간 점검 라운드", icon: "⊙", color: "var(--status-inprogress)" },
  ],
  phases: [],
  deadlines: [],
  activity: [],
};

function DashboardDeadlinesList({
  deadlines,
  emptyMessage,
}: {
  deadlines: { id: string | number; label: string; due: string; color: string; badge: string; days: number }[];
  emptyMessage: string | null;
}) {
  const { ref, events, preventClickIfDragged } = useDraggableScroll<HTMLDivElement>({ direction: "y" });

  return (
    <div
      ref={ref}
      {...events}
      className="flex flex-col gap-2.5 max-h-[160px] overflow-y-auto pr-1 select-none cursor-grab active:cursor-grabbing scrollbar-thin"
    >
      {deadlines.map((d) => (
        <Link
          key={d.id}
          to={`/tasks/${d.id}`}
          onClick={preventClickIfDragged}
          draggable={false}
          className="flex items-center justify-between p-2.5 transition-colors hover:bg-[var(--secondary)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] select-none"
          style={{ background: "var(--muted)", borderRadius: "10px", userSelect: "none", WebkitUserSelect: "none" }}
        >
          <div className="flex items-center gap-2 pointer-events-none select-none">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <div><div className="text-xs font-500">{d.label}</div><div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.due}</div></div>
          </div>
          <span
            className="text-xs font-700 px-2 py-0.5 pointer-events-none select-none"
            style={{
              background: d.days <= 7 ? `${d.color}20` : "var(--card)",
              color: d.days <= 7 ? d.color : "var(--muted-foreground)",
              borderRadius: "20px",
              fontFamily: "var(--font-jetbrains)",
            }}
          >
            {d.badge}
          </span>
        </Link>
      ))}
      {emptyMessage && (
        <div className="text-xs text-center py-3 select-none" style={{ color: "var(--muted-foreground)" }}>
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function DashboardActivityList({
  activities,
  emptyMessage,
}: {
  activities: { id: string; href: string; who: string; action: string; time: string; avatar: string; color: string }[];
  emptyMessage: string | null;
}) {
  const { ref, events, preventClickIfDragged } = useDraggableScroll<HTMLDivElement>({ direction: "y" });

  return (
    <div
      ref={ref}
      {...events}
      className="flex flex-col gap-3 max-h-[165px] overflow-y-auto overflow-x-hidden pr-1 select-none cursor-grab active:cursor-grabbing scrollbar-thin"
    >
      {emptyMessage && (
        <div className="text-xs text-center py-3 select-none" style={{ color: "var(--muted-foreground)" }}>
          {emptyMessage}
        </div>
      )}
      {activities.map((a) => (
        <Link
          key={a.id}
          to={a.href}
          onClick={preventClickIfDragged}
          draggable={false}
          className="flex items-center gap-2.5 rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] select-none"
          style={{ userSelect: "none", WebkitUserSelect: "none" }}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none shrink-0 pointer-events-none select-none" aria-hidden="true" style={{ background: `${a.color}20`, color: a.color }}>
            {a.avatar}
          </div>
          <div className="flex-1 min-w-0 text-xs leading-5 pointer-events-none select-none">
            <div className="truncate"><span className="font-700">{a.who} </span><span style={{ color: "var(--muted-foreground)" }}>{a.action}</span></div>
            <div className="text-xs leading-4 mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{a.time}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { project, team, tasks, files, scheduleEvents, currentMember, isShortTerm, getEvaluations, getEvaluationMode, getMyEvaluationSummary } = useProject();
  const isDone = project.status === "done";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refreshDate = () => setNow(new Date());
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshDate); };
  }, []);
  const taskSummary = summarizeDashboardTasks(tasks, now);
  const [deadlineSearch, setDeadlineSearch] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [evaluation, setEvaluation] = useState<{ key: string; submitted: boolean; prototype: boolean; finalSubmitted: boolean } | null>(null);
  const evaluationKey = project.id + ":" + project.status;
  useEffect(() => {
    let active = true;
    getEvaluationMode().then(async (prototype) => {
      const result = await getEvaluations(prototype ? "midterm" : isDone ? "final" : "midterm");
      const final = prototype ? await getEvaluations("final") : null;
      return { key: evaluationKey, submitted: result.submitted, prototype, finalSubmitted: final?.submitted ?? false };
    })
      .then((result) => { if (active) setEvaluation(result); })
      .catch(() => { if (active) setEvaluation(null); });
    return () => { active = false; };
  }, [evaluationKey]);
  const source = dashboardData[project.id] || emptyDashboardData;
  const data = {
    ...source,
    banner: isDone ? "프로젝트가 종료되었습니다. 종료 평가를 작성하고 받은 평가를 확인해 주세요." :
      source.banner.includes("동료 평가") ? "프로젝트 진행 중입니다. 동료에게 중간 피드백을 남겨보세요." :
      // 팀원 초대를 안내하는 신규 프로젝트 문구는 이미 2명 이상 모이면 의미가
      // 없으므로 숨긴다.
      source.banner.startsWith("새 프로젝트가 만들어졌어요") && team.members.length >= 2 ? "" : source.banner,
    ctaPrimary: isDone ? { label: "종료 평가로 이동 →", page: "evaluation" as Page } : source.ctaPrimary,
    deadlines: taskSummary.deadlines,
    activity: dashboardActivity(files, scheduleEvents, currentMember?.id, now),
    stats: source.stats.map((stat) => stat.label === "평가 완료" ? {
      ...stat, label: "내 평가",
      value: evaluation?.key !== evaluationKey ? "—" : evaluation.prototype
        ? (evaluation.submitted ? "중간 완료" : "중간 대기") + " · " + (evaluation.finalSubmitted ? "최종 완료" : "최종 대기")
        : !isDone && isShortTerm ? "생략" : evaluation.submitted ? "제출 완료" : "미제출",
      sub: evaluation?.key === evaluationKey && evaluation.prototype ? "프로토타입 검증" : isDone ? "최종 평가" : "중간 점검",
    } : stat.label === "협업 평점" ? {
      ...stat, label: "현재 프로젝트 협업 신뢰도", value: currentMember?.evalCount ? currentMember.score.toFixed(2) : "—",
      sub: currentMember?.evalCount ? `최종 평가 ${currentMember.evalCount}건 기준` : "최종 평가 공개 대기",
    } : stat.label === "완료 과제" ? {
      ...stat, value: String(taskSummary.completed), sub: "전체 " + taskSummary.total + "개 중",
    } : ["남은 마감", "참여 기간"].includes(stat.label) ? {
      ...stat, label: "남은 마감", value: String(taskSummary.remaining),
      sub: "마감일 있는 미완료 과제" + (taskSummary.overdue ? " · 기한 초과 " + taskSummary.overdue + "개" : ""),
    } : stat),
  };
  // "다가오는 마감"은 7일 이내(기한 초과 포함)로 임박한 것만 보여준다 —
  // 전체 미완료 과제 수는 대시보드 상단 "남은 마감" 통계 카드가 따로 담당.
  const upcomingDeadlines = data.deadlines.filter((d) => d.days <= 7);
  const deadlineSearchTrimmed = deadlineSearch.trim().toLowerCase();
  const showDeadlineSearch = upcomingDeadlines.length > 5;
  const searchableDeadlines = upcomingDeadlines.filter(
    (d) => !deadlineSearchTrimmed || d.label.toLowerCase().includes(deadlineSearchTrimmed)
  );
  const activitySearchTrimmed = activitySearch.trim().toLowerCase();
  const showActivitySearch = data.activity.length > 5;
  const searchableActivity = data.activity.filter(
    (a) => !activitySearchTrimmed || `${a.who}${a.action}`.toLowerCase().includes(activitySearchTrimmed)
  );
  const progressPct = taskSummary.total ? Math.round((taskSummary.completed / taskSummary.total) * 100) : 0;
  const { myTier, myScore, earnedIds, avatarFrame, cardC1, cardC2 } = useMyProfileTheme();
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  useEffect(() => {
    let active = true;
    getMyEvaluationSummary().then((value) => { if (active) setEvalSummary(value); }).catch(() => {});
    return () => { active = false; };
  }, [currentMember?.userId, currentMember?.evalCount, currentMember?.score]);
  const achievementRows = evalSummary
    ? ACHIEVEMENTS.map((achievement) => ({ achievement, progress: achievementProgress(achievement, evalSummary) }))
        .filter((row) => !row.progress.earned).sort((x, y) => y.progress.pct - x.progress.pct).slice(0, 3)
    : null;
  const noEvaluations = !!evalSummary && evalSummary.count === 0;
  const parseDay = (value?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const startMs = parseDay(project.startDate), endMs = parseDay(project.endDate), todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsedPct = startMs !== null && endMs !== null && endMs > startMs ? Math.max(0, Math.min(100, Math.round(((todayMs - startMs) / (endMs - startMs)) * 100))) : null;
  const gap = elapsedPct === null ? null : progressPct - elapsedPct;
  const pace = isDone ? { text: "프로젝트가 종료됐어요.", color: "#16a34a" }
    : elapsedPct === null ? { text: "프로젝트 기간이 없어 비교할 수 없어요.", color: "var(--neutral-text)" }
    : !taskSummary.total ? { text: "과제를 등록하면 기간과 비교해 드려요.", color: "var(--neutral-text)" }
    : gap! >= 5 ? { text: `기간보다 ${gap}%p 앞서 가고 있어요`, color: "#16a34a" }
    : gap! <= -5 ? { text: `기간보다 ${-gap!}%p 늦어요. 마감 임박 과제를 확인해 보세요`, color: "#d97706" }
    : { text: "기간에 맞게 진행 중이에요", color: "var(--primary-text)" };
  const tierColor = myTier?.color ?? "#8b95c9";
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(project.endDate ?? "");
  const endDays = endMatch ? Math.round((Date.UTC(+endMatch[1], +endMatch[2] - 1, +endMatch[3]) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000) : null;
  const dDayLabel = endDays === null ? "—" : endDays < 0 ? "종료" : endDays === 0 ? "D-Day" : "D-" + endDays;
  const evalStat = data.stats.find((stat) => stat.label === "내 평가");
  const statusCounts = (["todo", "inprogress", "review", "done"] as const).map((status) => tasks.filter((task) => task.status === status).length);
  const myTasks = tasks.filter((task) => task.status !== "done" && !!currentMember && task.assigneeIds.includes(currentMember.id));
  const deadlineById = new Map(taskSummary.deadlines.map((d) => [d.id, d]));
  const todayTasks = [...myTasks].sort((x, y) => (deadlineById.get(x.id)?.days ?? 1e9) - (deadlineById.get(y.id)?.days ?? 1e9)).slice(0, 5);
  const isPending = project.approvalStatus === "pending";
  const isRejected = project.approvalStatus === "rejected";
  const bannerText = isPending
    ? "관리자 승인 대기 중이에요. 승인되기 전까지는 대시보드 외 다른 기능을 사용할 수 없어요."
    : isRejected
      ? "관리자가 이 프로젝트 생성을 반려했어요. 자세한 사항은 관리자에게 문의해주세요."
      : data.banner;

  const cardStyle = { background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" };
  const statusRows = [
    { status: "todo", label: "예정", color: "#9aa0bd", text: "var(--neutral-text)" },
    { status: "inprogress", label: "진행", color: "var(--status-inprogress)", text: "var(--status-inprogress)" },
    { status: "review", label: "검토", color: "#f59e0b", text: "var(--warning-text)" },
  ] as const;

  const [layout, saveLayout, resetSavedLayout] = useDashboardLayout();
  const [editMode, setEditMode] = useState(false);

  // ===== 카드 옮기기 =====
  // 브라우저 기본 끌어 놓기(draggable)는 카드의 반투명 "사진"만 끌고 다녀(유리 배경이 빠져 뜯긴 것처럼 보임),
  // 놓기 전까지 다른 카드도 움직이지 않는다. 그래서 포인터로 직접 옮긴다:
  // - 끄는 카드는 실제 카드 그대로 들려(그림자·살짝 확대) 손을 따라오고,
  // - 다른 카드는 끄는 동안 바로 새 순서로 비켜 주며(FLIP: 바뀌기 직전 위치를 재 두고 그 차이만큼 되돌렸다가 0으로),
  // - 놓으면 빈자리로 미끄러져 들어간다. 버튼(↑ ↓ ⇄)·기본 배치 복원도 같은 움직임을 쓴다.
  // 동작 줄이기 설정이면 움직임 없이 바로 바뀐다.
  const widgetEls = useRef(new Map<DashboardWidgetId, HTMLDivElement>());
  const columnEls = useRef<Record<DashboardColumnId, HTMLDivElement | null>>({ main: null, side: null });
  const beforeRects = useRef<Map<DashboardWidgetId, DOMRect> | null>(null);
  const [movedWidget, setMovedWidget] = useState<DashboardWidgetId | null>(null);
  const [drag, setDrag] = useState<{ id: DashboardWidgetId; preview: typeof layout } | null>(null);
  const dragInfo = useRef<{ id: DashboardWidgetId; pointerId: number; startX: number; startY: number; grabX: number; grabY: number; x: number; y: number; started: boolean; preview: typeof layout } | null>(null);
  const shownLayout = drag?.preview ?? layout;
  const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function snapshot() {
    beforeRects.current = new Map([...widgetEls.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
  }
  function setLayout(next: typeof layout, moved?: DashboardWidgetId) {
    snapshot();
    if (moved) setMovedWidget(moved);
    saveLayout(next);
  }
  function resetLayout() {
    snapshot();
    resetSavedLayout();
  }

  // 끄는 카드를 손 위치에 둔다(자리 = 지금 배치에서의 원래 위치, 거기서 손까지 옮겨 그린다).
  function placeDragged() {
    const info = dragInfo.current;
    const el = info ? widgetEls.current.get(info.id) : null;
    if (!info?.started || !el) return;
    el.style.transform = "";
    const home = el.getBoundingClientRect();
    el.style.transform = `translate(${info.x - info.grabX - home.left}px, ${info.y - info.grabY - home.top}px) scale(1.02)`;
  }

  useLayoutEffect(() => {
    const before = beforeRects.current;
    beforeRects.current = null;
    placeDragged();
    if (!before || reducedMotion()) return;
    for (const [id, el] of widgetEls.current) {
      if (drag && id === drag.id) continue; // 끄는 카드는 손을 따라간다
      const prev = before.get(id);
      if (!prev) continue;
      const now = el.getBoundingClientRect();
      const dx = prev.left - now.left;
      const dy = prev.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownLayout]);
  useEffect(() => {
    if (!movedWidget) return;
    const timer = window.setTimeout(() => setMovedWidget(null), 900);
    return () => window.clearTimeout(timer);
  }, [movedWidget]);

  // 손 위치로 놓일 자리를 정한다: 손이 있는(없으면 가장 가까운) 열에서, 손보다 아래에 중심이 있는 첫 카드 앞.
  function dropTarget(x: number, y: number, preview: typeof layout, id: DashboardWidgetId): typeof layout {
    const cols = (["main", "side"] as const)
      .map((col) => ({ col, rect: columnEls.current[col]?.getBoundingClientRect() }))
      .filter((c): c is { col: DashboardColumnId; rect: DOMRect } => !!c.rect);
    if (!cols.length) return preview;
    const distance = (r: DOMRect) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    const col = cols.reduce((best, c) => (distance(c.rect) < distance(best.rect) ? c : best)).col;
    const others = preview[col].filter((w) => w !== id);
    let at = others.findIndex((w) => {
      const r = widgetEls.current.get(w)?.getBoundingClientRect();
      return !!r && y < r.top + r.height / 2;
    });
    if (at === -1) at = others.length;
    return moveWidget(preview, id, col, at);
  }

  function startPointerDrag(e: React.PointerEvent<HTMLDivElement>, id: DashboardWidgetId) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement;
    // 편집 모드에서는 카드 어디든(버튼·입력칸·링크 빼고), 평소에는 ⠿ 손잡이로만 끈다.
    if (editMode ? target.closest("button, a, input, select, textarea, [role='slider'], [contenteditable='true']") : !target.closest("[data-drag-handle]")) return;
    if (dragInfo.current) return;
    if (editMode) {
      // 안쪽 목록의 끌어서 스크롤·글자 선택이 함께 움직이지 않게(포인터 기본 동작을 막으면 뒤따르는 마우스 이벤트도 생기지 않는다).
      e.stopPropagation();
      e.preventDefault();
    }
    dragInfo.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, grabX: 0, grabY: 0, x: e.clientX, y: e.clientY, started: false, preview: layout };

    const scroller = e.currentTarget.closest("main");
    const move = (ev: PointerEvent) => {
      const info = dragInfo.current;
      if (!info || ev.pointerId !== info.pointerId) return;
      info.x = ev.clientX;
      info.y = ev.clientY;
      if (!info.started) {
        if (Math.hypot(ev.clientX - info.startX, ev.clientY - info.startY) < 5) return; // 작은 흔들림은 클릭
        const el = widgetEls.current.get(info.id);
        const rect = el?.getBoundingClientRect();
        if (!rect) return;
        info.started = true;
        info.grabX = info.startX - rect.left;
        info.grabY = info.startY - rect.top;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        setDrag({ id: info.id, preview: info.preview });
      }
      ev.preventDefault();
      // 화면 위·아래 끝에 가까우면 스크롤
      if (scroller) {
        if (ev.clientY < 70) scroller.scrollTop -= 14;
        else if (ev.clientY > window.innerHeight - 70) scroller.scrollTop += 14;
      }
      const next = dropTarget(ev.clientX, ev.clientY, info.preview, info.id);
      if (next.main.join() !== info.preview.main.join() || next.side.join() !== info.preview.side.join()) {
        info.preview = next;
        snapshot();
        setDrag({ id: info.id, preview: next });
      } else {
        placeDragged();
      }
    };
    const end = (ev: PointerEvent) => {
      const info = dragInfo.current;
      if (!info || ev.pointerId !== info.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      dragInfo.current = null;
      if (!info.started) return;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      // 들린 위치를 재 둔 뒤 손 위치 이동을 풀면, 위의 FLIP이 그 자리에서 빈자리로 미끄러뜨린다.
      snapshot();
      const el = widgetEls.current.get(info.id);
      if (el) el.style.transform = "";
      setDrag(null);
      setMovedWidget(info.id);
      saveLayout(info.preview);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
  const isDefault = isDefaultDashboardLayout(layout);


  function renderHeaderControls(id: DashboardWidgetId, col: DashboardColumnId, idx: number, total: number) {
    return (
      <div className="flex items-center gap-1 z-10 shrink-0" onClick={(e) => e.stopPropagation()}>
        {editMode ? (
          <>
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => setLayout(moveWidgetStep(layout, id, "up"), id)}
              title="위로 이동"
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold transition-all disabled:opacity-20 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={idx === total - 1}
              onClick={() => setLayout(moveWidgetStep(layout, id, "down"), id)}
              title="아래로 이동"
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold transition-all disabled:opacity-20 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => setLayout(moveWidgetStep(layout, id, "cross"), id)}
              title={col === "main" ? "우측 사이드로 이동" : "좌측 메인으로 이동"}
              className="px-1.5 h-5 flex items-center justify-center rounded text-[10px] font-semibold transition-all hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer text-primary-text"
            >
              {col === "main" ? "우측 ➔" : "⬅ 좌측"}
            </button>
            <span data-drag-handle title="끌어서 옮기기" className="cursor-grab active:cursor-grabbing px-1 text-xs opacity-70 hover:opacity-100 select-none" style={{ touchAction: "none" }}>
              ⠿
            </span>
          </>
        ) : (
          <span
            data-drag-handle
            title="끌어서 배치 변경"
            className="cursor-grab active:cursor-grabbing px-1.5 py-0.5 rounded text-[11px] opacity-40 group-hover/widget:opacity-90 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity select-none"
            style={{ touchAction: "none" }}
          >
            ⠿
          </span>
        )}
      </div>
    );
  }

  function renderWidgetContent(id: DashboardWidgetId, col: DashboardColumnId, idx: number, total: number) {
    switch (id) {
      case "profile":
        return (
          <WindowPanel
            id="dashboard-profile"
            title="내 프로필"
            dark
            className="relative"
            bodyClassName="relative px-6 py-6 md:px-7"
            headerRight={renderHeaderControls("profile", col, idx, total)}
            style={{ background: "linear-gradient(120deg, #111a47, #2a215f)", borderRadius: "calc(var(--radius) + 4px)", color: "#fff", boxShadow: "0 8px 28px rgba(17,26,71,0.28)" }}
          >
            <div className="absolute pointer-events-none" style={{ left: -40, top: -70, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${tierColor}55, transparent 65%)` }} />
            <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
              <span className="shrink-0 rounded-full" style={avatarFrame ? undefined : { boxShadow: `0 0 0 3px #111a47, 0 0 0 6px ${tierColor}, 0 0 24px ${tierColor}88` }}>
                {(() => {
                  const tierBadge = myTier ? (
                    <span title={myTier.label} className="flex items-center justify-center w-full h-full">
                      <MedalIcon shape={myTier.shape} colors={myTier.colors} size={40} />
                    </span>
                  ) : undefined;
                  const photo = (
                    <Avatar
                      url={currentMember?.avatarUrl}
                      initial={currentMember?.avatar ?? "?"}
                      color={currentMember?.color ?? "#f59e0b"}
                      size={84}
                      badge={avatarFrame ? undefined : tierBadge}
                    />
                  );
                  return avatarFrame ? (
                    <AvatarFrame kind={avatarFrame} size={84} c1={cardC1} c2={cardC2} badge={tierBadge}>
                      {photo}
                    </AvatarFrame>
                  ) : photo;
                })()}
              </span>
              <div className="flex-1 min-w-[180px]">
                <div className="text-xs font-600" style={{ opacity: 0.7, letterSpacing: "0.08em" }}>{myTier ? myTier.label : "티어 평가 대기"}</div>
                <div className="text-2xl md:text-3xl font-500 leading-tight" style={{ fontFamily: "var(--font-outfit)" }}>{currentMember?.name ?? "참여자"}</div>
                <div className="text-sm" style={{ opacity: 0.75 }}>{project.name}{earnedIds ? ` · 업적 ${earnedIds.size}개` : ""}</div>
                {!isPending && !isRejected && bannerText && <div className="text-xs mt-1.5" style={{ opacity: 0.7 }}>{bannerText}</div>}
              </div>
              <div className="flex gap-6 md:gap-7 flex-wrap">
                <div><div className="text-[11px]" style={{ opacity: 0.65 }}>협업 신뢰도</div><div className="text-2xl md:text-3xl font-300 leading-tight" style={{ fontFamily: "var(--font-outfit)" }}>{myScore === null ? "대기" : myScore.toFixed(1)}</div></div>
                <div><div className="text-[11px]" style={{ opacity: 0.65 }}>{isDone ? "프로젝트" : "종료까지"}</div><div className="text-2xl md:text-3xl font-300 leading-tight" style={{ fontFamily: "var(--font-outfit)" }}>{dDayLabel}</div></div>
                <div><div className="text-[11px]" style={{ opacity: 0.65 }}>진행률</div><div className="text-2xl md:text-3xl font-300 leading-tight" style={{ fontFamily: "var(--font-outfit)" }}>{progressPct}%</div></div>
              </div>
            </div>
            {!isPending && !isRejected && (
              <div className="relative flex flex-wrap gap-2 mt-5">
                <button onClick={() => onNavigate(data.ctaPrimary.page)} className="px-4 py-2 text-xs font-700 transition-all cursor-pointer" style={{ background: "#fff", color: "#111a47", borderRadius: "40px" }}>{data.ctaPrimary.label}</button>
                {evalStat && <button onClick={() => onNavigate("evaluation")} className="px-4 py-2 text-xs font-600 transition-all cursor-pointer" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", borderRadius: "40px", border: "1px solid rgba(255,255,255,0.22)" }}>동료 평가 · {evalStat.value}</button>}
              </div>
            )}
          </WindowPanel>
        );

      case "board":
        return (
          <WindowPanel
            id="dashboard-board"
            title="프로젝트 현황판"
            bodyClassName="p-5 md:p-6"
            headerRight={renderHeaderControls("board", col, idx, total)}
            style={cardStyle}
          >
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-600 truncate" style={{ color: "var(--muted-foreground)" }}>과제 {taskSummary.total}개 중 {taskSummary.completed}개 완료 · {project.name}</p>
              </div>
              <button onClick={() => onNavigate("tasks")} className="text-xs font-600 px-4 py-2 transition-all shrink-0 cursor-pointer" style={{ background: "var(--secondary)", color: "var(--primary-text)", borderRadius: "40px" }}>전체 보기</button>
            </div>
            <div className="flex h-2 overflow-hidden mb-5" style={{ borderRadius: "6px", background: "var(--border)" }} aria-hidden="true">
              {[["#9aa0bd", statusCounts[0]], ["var(--status-inprogress)", statusCounts[1]], ["#f59e0b", statusCounts[2]], ["#86d4a0", statusCounts[3]]].map(([color, count], i) => (
                <i key={i} style={{ width: taskSummary.total ? `${(Number(count) / taskSummary.total) * 100}%` : 0, background: String(color) }} />
              ))}
            </div>
            <div className={col === "side" ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 sm:grid-cols-3 gap-5"}>
              {statusRows.map((column) => {
                const items = tasks.filter((task) => task.status === column.status);
                return (
                  <div key={column.status} aria-label={column.label + " 과제"} className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: column.color }} />
                      <h3 className="text-sm font-700" style={{ color: column.text }}>{column.label}</h3>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{items.length}</span>
                    </div>
                    {items.length === 0 ? <p className="text-xs py-1" style={{ color: "var(--muted-foreground)" }}>{column.label} 과제가 없습니다.</p> : (
                      <ul className="flex flex-col gap-1.5">
                        {items.slice(0, col === "side" ? 2 : 3).map((task) => {
                          const d = deadlineById.get(task.id);
                          return (
                            <li key={task.id}>
                              <Link to={`/tasks/${task.id}`} className="flex items-center justify-between gap-2 text-sm py-1 transition-colors hover:text-[var(--primary-text)]">
                                <span className="truncate">{task.title}</span>
                                {d && d.days <= 7 && <span className="text-[11px] font-700 shrink-0" style={{ color: d.color, fontFamily: "var(--font-jetbrains)" }}>{d.badge}</span>}
                              </Link>
                            </li>
                          );
                        })}
                        {items.length > (col === "side" ? 2 : 3) && <li className="text-xs" style={{ color: "var(--muted-foreground)" }}>+{items.length - (col === "side" ? 2 : 3)}개 더</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </WindowPanel>
        );

      case "pace":
        return (
          <WindowPanel
            id="dashboard-pace"
            title="우리 팀 속도"
            bodyClassName="p-5 md:p-6"
            headerRight={renderHeaderControls("pace", col, idx, total)}
            style={cardStyle}
          >
            <p className="text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>기간이 얼마나 지났고, 과제는 얼마나 끝났나</p>
            {[
              { label: "경과한 기간", pct: elapsedPct, color: "#9aa0bd" },
              { label: "완료한 과제", pct: taskSummary.total ? progressPct : null, color: "var(--primary)" },
            ].map((bar) => (
              <div key={bar.label} className="mb-4">
                <div className="flex justify-between text-xs mb-1.5"><span>{bar.label}</span><b>{bar.pct === null ? "—" : bar.pct + "%"}</b></div>
                <div className="h-3 overflow-hidden" style={{ background: "var(--border)", borderRadius: "7px" }} role="img" aria-label={`${bar.label} ${bar.pct ?? 0}%`}>
                  <div className="h-full" style={{ width: `${bar.pct ?? 0}%`, background: bar.color, borderRadius: "7px" }} />
                </div>
              </div>
            ))}
            <div className="text-xs font-600 px-3 py-2.5" style={{ background: `color-mix(in srgb, ${pace.color} 12%, transparent)`, color: pace.color, borderRadius: "12px" }}>{pace.text}</div>
          </WindowPanel>
        );

      case "achievements":
        return (
          <WindowPanel
            id="dashboard-achievements"
            title="다음에 달성할 업적"
            bodyClassName="p-5 md:p-6"
            headerRight={renderHeaderControls("achievements", col, idx, total)}
            style={cardStyle}
          >
            <p className="text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>진행 중인 도전과제</p>
            {!achievementRows ? <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
              : achievementRows.length === 0 ? <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>모든 업적을 달성했어요.</p>
              : <ul className="flex flex-col gap-3.5">
                {achievementRows.map(({ achievement, progress }) => (
                  <li key={achievement.id}>
                    <div className="flex justify-between text-xs mb-1.5 gap-2"><span className="truncate">{achievement.label}</span><b className="shrink-0">{formatAchievementValue(progress.value)} / {formatAchievementValue(achievement.threshold)}{achievement.unit}</b></div>
                    <div className="h-2 overflow-hidden" style={{ background: "var(--border)", borderRadius: "6px" }} role="img" aria-label={`${achievement.label} ${progress.pct}%`}>
                      <div className="h-full" style={{ width: `${progress.pct}%`, background: `linear-gradient(90deg, ${achievement.colors[0]}, ${achievement.colors[1]})`, borderRadius: "6px" }} />
                    </div>
                  </li>
                ))}
              </ul>}
            {achievementRows && achievementRows.length > 0 && noEvaluations && <p className="text-[11px] mt-4" style={{ color: "var(--muted-foreground)" }}>동료 평가가 공개되면 진행도가 채워져요.</p>}
          </WindowPanel>
        );

      case "mytasks":
        return (
          <WindowPanel
            id="dashboard-mytasks"
            title="나의 할 일"
            bodyClassName="p-5"
            headerRight={renderHeaderControls("mytasks", col, idx, total)}
            style={cardStyle}
          >
            <div className="flex items-center justify-end mb-3">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{myTasks.length}건</span>
            </div>
            {todayTasks.length === 0 ? <p className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>맡은 진행 과제가 없어요.</p> : (
              <ul className="flex flex-col">
                {todayTasks.map((task) => {
                  const d = deadlineById.get(task.id);
                  return (
                    <li key={task.id} style={{ borderTop: "1px solid var(--border)" }} className="first:border-t-0">
                      <Link to={`/tasks/${task.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-[var(--primary-text)]">
                        <span className="truncate">{task.title}</span>
                        {d && <span className="text-[11px] font-700 px-2 py-0.5 shrink-0" style={{ background: `${d.color}20`, color: d.color, borderRadius: "20px", fontFamily: "var(--font-jetbrains)" }}>{d.badge}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </WindowPanel>
        );

      case "deadlines":
        return (
          <WindowPanel
            id="dashboard-deadlines"
            title="다가오는 마감"
            bodyClassName="p-5"
            headerRight={renderHeaderControls("deadlines", col, idx, total)}
            style={cardStyle}
          >
            {showDeadlineSearch && (
              <input
                value={deadlineSearch}
                onChange={(e) => setDeadlineSearch(e.target.value)}
                placeholder="마감 검색"
                className="w-full text-xs px-3 py-1.5 border outline-none mb-2.5"
                style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
              />
            )}
            <DashboardDeadlinesList
              deadlines={searchableDeadlines}
              emptyMessage={
                searchableDeadlines.length === 0
                  ? data.deadlines.length === 0
                    ? "마감일이 지정된 미완료 과제가 없습니다."
                    : upcomingDeadlines.length === 0
                      ? "7일 이내로 임박한 마감이 없어요."
                      : "검색 결과가 없어요"
                  : null
              }
            />
          </WindowPanel>
        );

      case "evaluation":
        return (
          <WindowPanel
            id="dashboard-evaluation"
            title="내 평가 및 참여 현황"
            bodyClassName="p-5"
            headerRight={renderHeaderControls("evaluation", col, idx, total)}
            style={cardStyle}
          >
            <MyEvaluationSummary embedded />
          </WindowPanel>
        );

      case "activity":
        return (
          <WindowPanel
            id="dashboard-activity"
            title="최근 활동 · 최근 3일"
            bodyClassName="p-5"
            headerRight={renderHeaderControls("activity", col, idx, total)}
            style={cardStyle}
          >
            {showActivitySearch && (
              <input
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="활동 검색"
                className="w-full text-xs px-3 py-1.5 border outline-none mb-2.5"
                style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
              />
            )}
            <DashboardActivityList
              activities={searchableActivity}
              emptyMessage={
                searchableActivity.length === 0
                  ? data.activity.length === 0
                    ? "최근 3일 이내 등록·수정된 일정이나 자료가 없습니다."
                    : "검색 결과가 없어요"
                  : null
              }
            />
          </WindowPanel>
        );
    }
  }

  function renderDraggableWidget(id: DashboardWidgetId, col: DashboardColumnId, idx: number, total: number) {
    const isDragging = drag?.id === id;
    const justMoved = movedWidget === id && !drag;
    return (
      <div
        key={id}
        ref={(el) => { if (el) widgetEls.current.set(id, el); else widgetEls.current.delete(id); }}
        // 편집 모드에서는 카드 안 목록의 "끌어서 스크롤"보다 먼저 받아 카드 옮기기로 쓴다(그 밖에는 ⠿ 손잡이로만).
        onPointerDownCapture={(e) => startPointerDrag(e, id)}
        onDragStart={(e) => { if (editMode || drag) e.preventDefault(); }} // 이미지·링크의 브라우저 기본 끌기 막기
        className={`relative group/widget ${editMode ? "cursor-grab" : ""}`}
        style={isDragging ? {
          zIndex: 40,
          cursor: "grabbing",
          borderRadius: "var(--radius)",
          boxShadow: "0 22px 50px rgba(15,18,53,0.28), 0 6px 16px rgba(15,18,53,0.16)",
          willChange: "transform",
          touchAction: "none",
        } : editMode ? { touchAction: "none" } : undefined}
      >
        {renderWidgetContent(id, col, idx, total)}
        {/* 편집 테두리: 카드 바깥 6px에 따로 그려 카드 모서리·그림자에 가려지거나 잘리지 않게(레이아웃에 영향 없음). */}
        {(editMode || justMoved || isDragging) && (
          <span
            aria-hidden="true"
            className="absolute -inset-1.5 pointer-events-none border-2 transition-colors duration-300 group-hover/widget:border-[var(--primary)]"
            style={{
              borderStyle: justMoved || isDragging ? "solid" : "dashed",
              borderColor: justMoved || isDragging ? "var(--primary)" : "color-mix(in srgb, var(--primary) 45%, transparent)",
              borderRadius: "calc(var(--radius) + 6px)",
              boxShadow: justMoved ? "0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent)" : undefined,
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      {(isPending || isRejected) && (
        <div className="mb-5 px-5 py-3 text-sm font-600" style={{ background: isRejected ? "linear-gradient(135deg, #ef4444, #991b1b)" : "linear-gradient(135deg, #f59e0b, #b45309)", color: "#fff", borderRadius: "var(--radius)" }}>
          {bannerText}
        </div>
      )}

      {/* 담당 교수 공지: 위젯 배치와 상관없이 늘 맨 위(옮기거나 숨길 수 없음). 공지가 없으면 그리지 않는다. */}
      <ProjectNoticeCard projectId={project.id} />

      {/* Top Controls: Edit Layout & Reset */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          {editMode && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 font-semibold border border-blue-500/20">
              💡 카드를 마우스로 끌거나 버튼(↑, ↓, ⇄)을 눌러 원하는 위치로 배치할 수 있어요.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {!isDefault && (
            <button
              type="button"
              onClick={resetLayout}
              className="text-xs font-600 px-3 py-1.5 rounded-lg border border-[var(--border)] transition-all hover:bg-[var(--secondary)] cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>기본 배치로 복원</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className="text-xs font-700 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            style={{
              background: editMode ? "var(--primary)" : "var(--secondary)",
              color: editMode ? "#fff" : "var(--primary-text)",
            }}
          >
            <span>{editMode ? "✓" : "⚙️"}</span>
            <span>{editMode ? "배치 편집 완료" : "카드 배치 변경"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-5 items-start">
        {/* Main (Left) Column */}
        <div ref={(el) => { columnEls.current.main = el; }} className="flex flex-col gap-5 min-w-0 min-h-[120px]">
          {shownLayout.main.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-[var(--border)] rounded-2xl text-center text-xs text-muted-foreground">
              카드를 이곳으로 끌어다 놓으세요.
            </div>
          ) : (
            shownLayout.main.map((widgetId, index) => renderDraggableWidget(widgetId, "main", index, shownLayout.main.length))
          )}
        </div>

        {/* Side (Right) Column */}
        <div ref={(el) => { columnEls.current.side = el; }} className="flex flex-col gap-5 min-w-0 min-h-[120px]">
          {shownLayout.side.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-[var(--border)] rounded-2xl text-center text-xs text-muted-foreground">
              카드를 이곳으로 끌어다 놓으세요.
            </div>
          ) : (
            shownLayout.side.map((widgetId, index) => renderDraggableWidget(widgetId, "side", index, shownLayout.side.length))
          )}
        </div>
      </div>
    </div>
  );
}
