import { Link } from "react-router-dom";
import { dashboardActivity } from "../lib/dashboardActivity";
import { useEffect, useState } from "react";
import { summarizeDashboardTasks } from "../lib/dashboardTasks";
import MyEvaluationSummary from "./MyEvaluationSummary";
import { Page } from "../App";
import { useProject } from "../context/ProjectContext";

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
      { label: "평가 완료", value: "4/5", sub: "중간 점검 라운드", icon: "⊙", color: "#2563eb" },
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
      { label: "참여 기간", value: "14주", sub: "2026-03 ~ 2026-06", icon: "◷", color: "#7b82a8" },
      { label: "평가 완료", value: "2/2", sub: "종료 평가 라운드", icon: "⊙", color: "#2563eb" },
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
      { who: "오유진", action: "최종 보고서 v2 업로드", time: "2026-06-19", avatar: "오", color: "#2563eb" },
      { who: "박민준", action: "인터뷰 녹취 전사 최종본 확인", time: "2026-06-17", avatar: "박", color: "#f59e0b" },
      { who: "김지수", action: "종료 평가 제출", time: "2026-06-21", avatar: "김", color: "#2563eb" },
    ],
  },
};

const emptyDashboardData: ProjectDashboardData = {
  banner: "새 프로젝트가 만들어졌어요. 팀원을 초대하고 과제·일정을 등록해 시작해보세요.",
  ctaPrimary: { label: "팀 관리로 이동 →", page: "team" },
  stats: [
    { label: "완료 과제", value: "0", sub: "전체 0개 중", icon: "✓", color: "#22c55e" },
    { label: "협업 평점", value: "—", sub: "아직 평가 없음", icon: "★", color: "#f59e0b" },
    { label: "남은 마감", value: "0", sub: "등록된 일정 없음", icon: "◷", color: "#ef4444" },
    { label: "평가 완료", value: "0/0", sub: "중간 점검 라운드", icon: "⊙", color: "#2563eb" },
  ],
  phases: [],
  deadlines: [],
  activity: [],
};

export default function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { project, tasks, files, scheduleEvents, currentMember, isShortTerm, getEvaluations, getEvaluationMode } = useProject();
  const isDone = project.status === "done";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refreshDate = () => setNow(new Date());
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshDate); };
  }, []);
  const taskSummary = summarizeDashboardTasks(tasks, now);
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  useEffect(() => { setExpandedColumns({}); }, [project.id]);
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
      source.banner.includes("동료 평가") ? "프로젝트 진행 중입니다. 동료에게 중간 피드백을 남겨보세요." : source.banner,
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
      ...stat, label: "현재 프로젝트 내 평점", value: currentMember?.evalCount ? currentMember.score.toFixed(1) : "—",
      sub: "이 프로젝트 종료 평가",
    } : stat.label === "완료 과제" ? {
      ...stat, value: String(taskSummary.completed), sub: "전체 " + taskSummary.total + "개 중",
    } : ["남은 마감", "참여 기간"].includes(stat.label) ? {
      ...stat, label: "남은 마감", value: String(taskSummary.remaining),
      sub: "마감일 있는 미완료 과제" + (taskSummary.overdue ? " · 기한 초과 " + taskSummary.overdue + "개" : ""),
    } : stat),
  };
  const isPending = project.approvalStatus === "pending";
  const isRejected = project.approvalStatus === "rejected";
  const bannerText = isPending
    ? "관리자 승인 대기 중이에요. 승인되기 전까지는 대시보드 외 다른 기능을 사용할 수 없어요."
    : isRejected
      ? "관리자가 이 프로젝트 생성을 반려했어요. 자세한 사항은 관리자에게 문의해주세요."
      : data.banner;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <MyEvaluationSummary completedOnly />
      {/* Hero banner */}
      <div
        className="relative mb-6 overflow-hidden"
        style={{
          background: isRejected
            ? "linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #991b1b 100%)"
            : isPending
              ? "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)"
              : isDone
                ? "linear-gradient(135deg, #16a34a 0%, #15803d 50%, #14532d 100%)"
                : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)",
          borderRadius: "calc(var(--radius) + 4px)",
          padding: "32px 36px",
          boxShadow: isDone ? "0 8px 32px rgba(22,163,74,0.3)" : "0 8px 32px rgba(37,99,235,0.3)",
        }}
      >
        {/* decorative circles */}
        <div
          className="absolute"
          style={{ width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)", right: -40, top: -60 }}
        />
        <div
          className="absolute"
          style={{ width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)", right: 80, bottom: -40 }}
        />

        <div className="relative">
          <div
            className="inline-block text-xs font-600 uppercase tracking-widest px-3 py-1 mb-3"
            style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", borderRadius: "20px", fontFamily: "var(--font-jetbrains)" }}
          >
            {project.period}
          </div>
          <h1 className="text-2xl font-700 mb-1" style={{ color: "#fff", fontFamily: "var(--font-outfit)" }}>
            안녕하세요, {currentMember?.name ?? "참여자"}님
          </h1>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "14px" }}>{bannerText}</p>

          {!isPending && !isRejected && (
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => onNavigate(data.ctaPrimary.page)}
                className="px-5 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#fff", color: isDone ? "#16a34a" : "var(--primary)", borderRadius: "40px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
              >
                {data.ctaPrimary.label}
              </button>
              <button
                onClick={() => onNavigate("tasks")}
                className="px-5 py-2.5 text-sm font-600 transition-all"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: "40px", border: "1px solid rgba(255,255,255,0.25)" }}
              >
                과제 보드
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {data.stats.map((s) => (
          <div key={s.label} className="p-4" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <div className="w-9 h-9 flex items-center justify-center text-base mb-3" style={{ background: `${s.color}18`, borderRadius: "10px", color: s.color }}>
              {s.icon}
            </div>
            <div className="text-2xl font-800 leading-none mb-1" style={{ fontFamily: "var(--font-outfit)", color: "var(--foreground)" }}>
              {s.value}
            </div>
            <div className="text-xs font-600">{s.label}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Progress */}
        <div className="col-span-1 md:col-span-3 p-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-700">현황판</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{project.name}</p>
            </div>
            <button
              onClick={() => onNavigate("tasks")}
              className="text-xs font-600 px-4 py-2 transition-all"
              style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "40px" }}
            >
              전체 보기
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {([
              { status: "todo", label: "예정", color: "#7b82a8" },
              { status: "inprogress", label: "진행", color: "#2563eb" },
              { status: "review", label: "검토", color: "#f59e0b" },
            ] as const).map((column) => {
              const items = tasks.filter((task) => task.status === column.status);
              const expanded = expandedColumns[column.status] ?? false;
              const visibleItems = expanded ? items : items.slice(0, 3);
              return <section key={column.status} aria-label={column.label + " 과제"}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-700" style={{ color: column.color }}>{column.label} · {items.length}개</h3>
                  {items.length > 3 && <button type="button"
                    aria-label={column.label + (expanded ? " 과제 접기" : " 과제 더보기")}
                    aria-expanded={expanded} aria-controls={"dashboard-tasks-" + column.status}
                    onClick={() => setExpandedColumns((previous) => ({ ...previous, [column.status]: !previous[column.status] }))}
                    className="text-xs underline" style={{ color: "var(--primary)" }}>
                    {expanded ? "접기" : "더보기"}
                  </button>}
                </div>
                {items.length ? <ul id={"dashboard-tasks-" + column.status} className="flex flex-col gap-2">
                  {visibleItems.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                    <span className="text-sm break-words min-w-0">{task.title}</span>
                    {task.due && <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{task.due}</span>}
                  </li>)}
                </ul> : <p className="text-xs py-2" style={{ color: "var(--muted-foreground)" }}>{column.label} 과제가 없습니다.</p>}
              </section>;
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-1 md:col-span-2 flex flex-col gap-5">
          {/* Deadlines */}
          <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <h2 className="text-sm font-700 mb-4">다가오는 마감</h2>
            <div className="flex flex-col gap-2.5">
              {data.deadlines.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2.5" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <div><div className="text-xs font-500">{d.label}</div><div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.due}</div></div>
                  </div>
                  <span
                    className="text-xs font-700 px-2 py-0.5"
                    style={{
                      background: d.days <= 7 ? `${d.color}20` : "var(--card)",
                      color: d.days <= 7 ? d.color : "var(--muted-foreground)",
                      borderRadius: "20px",
                      fontFamily: "var(--font-jetbrains)",
                    }}
                  >
                    {d.badge}
                  </span>
                </div>
              ))}
              {data.deadlines.length === 0 && (
                <div className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>
                  마감일이 지정된 미완료 과제가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="p-5 flex-1" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
            <h2 className="text-sm font-700 mb-4">최근 활동 <span className="text-xs font-400">· 최근 3일</span></h2>
            <div className="flex flex-col gap-3">
              {data.activity.length === 0 && (
                <div className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>최근 3일 이내 등록·수정된 일정이나 자료가 없습니다.</div>
              )}
              {data.activity.map((a) => (
                <Link key={a.id} to={a.href} className="flex items-center gap-2.5 rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none shrink-0" aria-hidden="true" style={{ background: `${a.color}20`, color: a.color }}>
                    {a.avatar}
                  </div>
                  <div className="flex-1 min-w-0 text-xs leading-5">
                    <span className="font-700">{a.who} </span>
                    <span style={{ color: "var(--muted-foreground)" }}>{a.action}</span>
                    <div className="text-xs leading-4 mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{a.time}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
