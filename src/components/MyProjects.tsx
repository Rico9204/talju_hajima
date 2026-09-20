import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../context/ProjectContext";
import { listMyCalendarEvents, type MyCalendarEvent } from "../api/backend/calendarMe";
import { createBoardPost } from "../api/backend/board";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";
import Board from "./Board";

const typeMeta: Record<string, { label: string; color: string }> = {
  deadline: { label: "마감", color: "#ef4444" },
  meeting: { label: "회의", color: "#2563eb" },
  presentation: { label: "발표", color: "#f59e0b" },
  other: { label: "기타", color: "#8b5cf6" },
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function DDayBadge({ date, color }: { date: string; color: string }) {
  const d = daysUntil(date.slice(0, 10));
  return (
    <span
      className="text-xs font-700 px-2 py-0.5 shrink-0"
      style={{
        background: d >= 0 && d <= 7 ? `${color}20` : "var(--card)",
        color: d >= 0 && d <= 7 ? color : "var(--muted-foreground)",
        borderRadius: "20px",
        fontFamily: "var(--font-jetbrains)",
      }}
    >
      {d === 0 ? "D-DAY" : d > 0 ? `D-${d}` : `D+${-d}`}
    </span>
  );
}

// "내 프로젝트" 전체 목록 화면 — talju_hajima-main 원본엔 이 화면이 없고(사이드바의 프로젝트
// 전환 팝오버가 그 역할을 대신함), 제품개발/frontend의 ProjectsPage.tsx를 이 앱의 카드/토큰
// 스타일에 맞춰 새로 포팅해 추가함.
export default function MyProjects() {
  const { projects, setProjectId, addProject, lookupProject, joinProject } = useProject();
  const navigate = useNavigate();
  const [events, setEvents] = useState<MyCalendarEvent[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<"create" | "join" | null>(null);
  const [tab, setTab] = useState<"projects" | "board">("projects");

  useEffect(() => {
    listMyCalendarEvents()
      .then(({ data }) => setEvents(data))
      .catch(() => setEvents([]));
  }, []);

  function openProject(id: string) {
    setProjectId(id);
    navigate("/dashboard");
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-7 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center text-lg font-700 shrink-0"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "12px" }}
          >
            협
          </div>
          <h1 className="text-3xl font-600" style={{ fontFamily: "var(--font-fraunces)" }}>
            {tab === "projects" ? "내 프로젝트" : "게시판"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenPanel("create")}
            className="text-sm font-700 px-4 py-2.5 transition-all"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px" }}
          >
            프로젝트 개설
          </button>
          <button
            onClick={() => setOpenPanel("join")}
            className="text-sm font-700 px-4 py-2.5"
            style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px" }}
          >
            참여
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 mb-6 p-1 w-fit" style={{ background: "var(--muted)", borderRadius: "10px" }}>
        {([["projects", "내 프로젝트"], ["board", "게시판"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="text-sm font-700 px-4 py-1.5 transition-all"
            style={{ background: tab === id ? "var(--card)" : "transparent", color: tab === id ? "var(--primary)" : "var(--muted-foreground)", borderRadius: "7px", boxShadow: tab === id ? "var(--shadow-card)" : "none" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CreateProjectModal/JoinProjectModal은 이 앱 전역에서 항상 fixed inset-0 전체화면
          오버레이로 뜨는 패턴이라(Sidebar와 동일하게), 여기서도 그 패턴을 그대로 따름 */}
      {openPanel === "create" && (
        <CreateProjectModal
          onCancel={() => setOpenPanel(null)}
          onCreate={async (input, recruitMessage) => {
            const id = await addProject(input);
            if (recruitMessage && id) {
              await createBoardPost({ title: `[팀원 모집] ${input.name}`, content: recruitMessage, projectId: id }).catch(() => {});
            }
            setOpenPanel(null);
            navigate("/dashboard");
          }}
        />
      )}
      {openPanel === "join" && (
        <JoinProjectModal
          lookupProject={lookupProject}
          joinProject={joinProject}
          onCancel={() => setOpenPanel(null)}
          onJoined={() => {
            setOpenPanel(null);
            navigate("/dashboard");
          }}
        />
      )}

      {tab === "board" ? (
        <Board />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {projects.map((p) => {
          const projectEvents = events.filter((e) => e.projectId === p.id).sort((a, b) => a.date.localeCompare(b.date));
          const upcoming = projectEvents.filter((e) => daysUntil(e.date.slice(0, 10)) >= 0);
          const nearest = upcoming[0];

          return (
            <div key={p.id} className="relative" onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId((v) => (v === p.id ? null : v))}>
              <button
                onClick={() => openProject(p.id)}
                className="block w-full text-left p-5 transition-all"
                style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
              >
                <div className="text-sm font-700 mb-1.5">{p.name}</div>
                {nearest ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{nearest.title}</span>
                    <DDayBadge date={nearest.date} color={nearest.refType ? typeMeta[nearest.refType].color : typeMeta.other.color} />
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>예정된 일정 없음</div>
                )}
              </button>

              {hoveredId === p.id && projectEvents.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 p-3 z-10" style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "0 16px 40px rgba(15,18,53,0.18)" }}>
                  <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>전체 일정</div>
                  <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                    {projectEvents.map((e) => {
                      const meta = e.refType ? typeMeta[e.refType] : typeMeta.other;
                      return (
                        <div key={e.id} className="flex items-center justify-between gap-2 p-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                            <div className="min-w-0">
                              <div className="text-xs font-600 truncate">{e.title}</div>
                              <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{e.date.slice(0, 10)} · {meta.label}</div>
                            </div>
                          </div>
                          <DDayBadge date={e.date} color={meta.color} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="sm:col-span-2 p-6 text-center text-xs border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
            아직 참여 중인 프로젝트가 없어요
          </div>
        )}
      </div>
      )}
    </div>
  );
}
