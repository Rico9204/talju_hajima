import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";

type Status = "todo" | "inprogress" | "review" | "done";

interface Task {
  id: number;
  title: string;
  assignee: string;
  avatar: string;
  priority: "high" | "mid" | "low";
  due: string;
  tags: string[];
  status: Status;
  color: string;
}

const tasksByProject: Record<string, { assignees: string[]; tasks: Task[] }> = {
  heritage: {
    assignees: ["전체", "김지수", "박민준", "이서연", "정하늘", "최현우"],
    tasks: [
      { id: 1, title: "프로젝트 기획안 작성", assignee: "김지수", avatar: "김", priority: "high", due: "09/01", tags: ["기획"], status: "done", color: "#2563eb" },
      { id: 2, title: "문헌 조사 및 선행 연구 정리", assignee: "박민준", avatar: "박", priority: "high", due: "09/05", tags: ["조사"], status: "done", color: "#f59e0b" },
      { id: 3, title: "강화도 현장 답사 계획 수립", assignee: "정하늘", avatar: "정", priority: "high", due: "09/10", tags: ["답사"], status: "done", color: "#8b5cf6" },
      { id: 4, title: "문화재 목록 데이터 정리 (인천)", assignee: "박민준", avatar: "박", priority: "high", due: "09/20", tags: ["데이터"], status: "inprogress", color: "#f59e0b" },
      { id: 5, title: "디지털 아카이브 구조 설계", assignee: "이서연", avatar: "이", priority: "high", due: "09/22", tags: ["설계"], status: "inprogress", color: "#22c55e" },
      { id: 6, title: "현장 사진 분류 및 편집", assignee: "최현우", avatar: "최", priority: "mid", due: "09/18", tags: ["사진"], status: "review", color: "#ef4444" },
      { id: 7, title: "인터뷰 녹취 정리 (3건)", assignee: "박민준", avatar: "박", priority: "mid", due: "09/24", tags: ["기록"], status: "review", color: "#f59e0b" },
      { id: 8, title: "중간 발표 슬라이드 제작", assignee: "이서연", avatar: "이", priority: "high", due: "10/01", tags: ["발표"], status: "todo", color: "#22c55e" },
      { id: 9, title: "웹 전시 페이지 초안", assignee: "이서연", avatar: "이", priority: "mid", due: "10/08", tags: ["설계"], status: "todo", color: "#22c55e" },
      { id: 10, title: "최종 보고서 초안 작성", assignee: "김지수", avatar: "김", priority: "high", due: "10/15", tags: ["보고서"], status: "todo", color: "#2563eb" },
    ],
  },
  dialect: {
    assignees: ["전체", "김지수", "박민준", "오유진", "한소민"],
    tasks: [
      { id: 101, title: "방언 조사 지역 선정", assignee: "박민준", avatar: "박", priority: "high", due: "03/10", tags: ["기획"], status: "done", color: "#f59e0b" },
      { id: 102, title: "설문·인터뷰 문항 설계", assignee: "김지수", avatar: "김", priority: "high", due: "03/20", tags: ["설계"], status: "done", color: "#2563eb" },
      { id: 103, title: "현지 화자 섭외", assignee: "박민준", avatar: "박", priority: "high", due: "04/05", tags: ["섭외"], status: "done", color: "#f59e0b" },
      { id: 104, title: "1차 인터뷰 촬영", assignee: "한소민", avatar: "한", priority: "high", due: "04/20", tags: ["촬영"], status: "done", color: "#8b5cf6" },
      { id: 105, title: "녹취 전사 (1차)", assignee: "김지수", avatar: "김", priority: "mid", due: "05/01", tags: ["전사"], status: "done", color: "#2563eb" },
      { id: 106, title: "어휘 분류 체계 수립", assignee: "오유진", avatar: "오", priority: "mid", due: "05/10", tags: ["분석"], status: "done", color: "#2563eb" },
      { id: 107, title: "비교 분석 및 통계 정리", assignee: "오유진", avatar: "오", priority: "high", due: "05/25", tags: ["분석"], status: "done", color: "#2563eb" },
      { id: 108, title: "최종 보고서 작성", assignee: "오유진", avatar: "오", priority: "high", due: "06/15", tags: ["보고서"], status: "done", color: "#2563eb" },
    ],
  },
};

const columns: { id: Status; label: string; color: string; bg: string }[] = [
  { id: "todo", label: "예정", color: "#7b82a8", bg: "#7b82a818" },
  { id: "inprogress", label: "진행 중", color: "#2563eb", bg: "#2563eb18" },
  { id: "review", label: "검토 중", color: "#f59e0b", bg: "#f59e0b18" },
  { id: "done", label: "완료", color: "#22c55e", bg: "#22c55e18" },
];

const priorityLabel: Record<string, { label: string; color: string }> = {
  high: { label: "긴급", color: "#ef4444" },
  mid: { label: "보통", color: "#f59e0b" },
  low: { label: "낮음", color: "#22c55e" },
};

const emptyTaskSource = { assignees: ["전체", "김지수"], tasks: [] as Task[] };

export default function TaskBoard() {
  const { project } = useProject();
  const source = tasksByProject[project.id] || emptyTaskSource;
  const [tasks, setTasks] = useState<Task[]>(source.tasks);
  const [filter, setFilter] = useState<string>("전체");

  useEffect(() => {
    setTasks(source.tasks);
    setFilter("전체");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const filtered = filter === "전체" ? tasks : tasks.filter((t) => t.assignee === filter);

  function moveTask(id: number, newStatus: Status) {
    if (project.status === "done") return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
  }

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          과제 보드 · {project.name}
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-700">Task Board</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              {doneCount}/{tasks.length}개 완료{project.status === "done" && " · 프로젝트 종료 (읽기 전용)"}
            </p>
          </div>
          {/* Mini progress */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-32" style={{ background: "var(--border)", borderRadius: "4px" }}>
              <div className="h-2" style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`, background: "linear-gradient(90deg, #2563eb, #22c55e)", borderRadius: "4px" }} />
            </div>
            <span className="text-xs font-700" style={{ color: "var(--primary)", fontFamily: "var(--font-jetbrains)" }}>
              {tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {source.assignees.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className="text-xs font-600 px-4 py-2 transition-all"
            style={{
              background: filter === a ? "var(--primary)" : "var(--card)",
              color: filter === a ? "#fff" : "var(--foreground)",
              borderRadius: "40px",
              boxShadow: filter === a ? "0 4px 12px rgba(37,99,235,0.25)" : "var(--shadow-card)",
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4">
        {columns.map((col) => {
          const colTasks = filtered.filter((t) => t.status === col.id);
          return (
            <div key={col.id}>
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-3 py-2.5" style={{ background: col.bg, borderRadius: "12px" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs font-700" style={{ color: col.color }}>{col.label}</span>
                </div>
                <span
                  className="text-xs font-700 w-5 h-5 flex items-center justify-center"
                  style={{ background: col.color, color: "#fff", borderRadius: "50%", fontFamily: "var(--font-jetbrains)" }}
                >
                  {colTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-3 min-h-32">
                {colTasks.map((task) => (
                  <div key={task.id} className="p-4 group transition-all" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
                    {/* Priority + tags */}
                    <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                      <span
                        className="text-xs font-600 px-2 py-0.5"
                        style={{ background: `${priorityLabel[task.priority].color}15`, color: priorityLabel[task.priority].color, borderRadius: "20px" }}
                      >
                        {priorityLabel[task.priority].label}
                      </span>
                      {task.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <p className="text-sm font-600 leading-snug mb-3">{task.title}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700" style={{ background: `${task.color}18`, color: task.color }}>
                          {task.avatar}
                        </div>
                        <span className="text-xs font-500" style={{ color: "var(--muted-foreground)" }}>{task.assignee}</span>
                      </div>
                      <span
                        className="text-xs font-600 px-2 py-0.5"
                        style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px", fontFamily: "var(--font-jetbrains)" }}
                      >
                        ~{task.due}
                      </span>
                    </div>

                    {/* Move actions on hover */}
                    {project.status !== "done" && (
                      <div className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                        {columns
                          .filter((c) => c.id !== col.id)
                          .map((c) => (
                            <button
                              key={c.id}
                              onClick={() => moveTask(task.id, c.id)}
                              className="text-xs px-2.5 py-1 font-600 transition-colors"
                              style={{ background: c.bg, color: c.color, borderRadius: "20px" }}
                            >
                              {c.label} →
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ))}

                {colTasks.length === 0 && (
                  <div className="p-4 text-center text-xs" style={{ border: `2px dashed ${col.color}40`, color: "var(--muted-foreground)", borderRadius: "var(--radius)" }}>
                    과제 없음
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
