import { useEffect, useState } from "react";
import { useProject, type TaskStatus } from "../context/ProjectContext";

const columns: { id: TaskStatus; label: string; color: string; bg: string }[] = [
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

export default function TaskBoard() {
  const { project, team, tasks, moveTask } = useProject();
  const [filter, setFilter] = useState<string>("전체");

  useEffect(() => {
    setFilter("전체");
  }, [project.id]);

  const assignees = ["전체", ...team.members.map((m) => m.name)];
  const filtered = filter === "전체" ? tasks : tasks.filter((t) => t.assignee === filter);

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
        {assignees.map((a) => (
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
