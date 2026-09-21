import { useEffect, useState } from "react";
import { useProject, type Member, type TaskStatus, type TaskPriority } from "../context/ProjectContext";
import TaskDetailPanel from "./TaskDetailPanel";
import Avatar from "./Avatar";

export function memberInfo(members: Member[], id: string): { name: string; avatar: string; avatarUrl: string | null; color: string } {
  const m = members.find((m) => m.id === id);
  return m
    ? { name: m.name, avatar: m.avatar, avatarUrl: m.avatarUrl, color: m.color }
    : { name: "알 수 없음", avatar: "?", avatarUrl: null, color: "#454b6e" };
}

const columns: { id: TaskStatus; label: string; color: string; bg: string }[] = [
  { id: "todo", label: "예정", color: "#454b6e", bg: "#454b6e18" },
  { id: "inprogress", label: "진행 중", color: "#2563eb", bg: "#2563eb18" },
  { id: "review", label: "검토 중", color: "#f59e0b", bg: "#f59e0b18" },
  { id: "done", label: "완료", color: "#22c55e", bg: "#22c55e18" },
];

const priorityLabel: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: "긴급", color: "#ef4444" },
  mid: { label: "보통", color: "#f59e0b" },
  low: { label: "낮음", color: "#22c55e" },
};

function daysUntilDue(due: string): number | null {
  if (!due.trim()) return null;
  const target = new Date(due + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// 카드에는 연도 없이 월/일만 짧게 보여준다.
function shortDue(due: string): string {
  const parts = due.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : due;
}

export default function TaskBoard({ focusTaskId }: { focusTaskId?: number } = {}) {
  const {
    project, team, isManager, currentMember,
    tasks, addTask, updateTaskDetails, moveTask, deleteTask,
    toggleTaskChecklistItem, addTaskChecklistItem, addTaskComment, toggleTaskCommentReaction,
    toggleTaskTeamSchedule, toggleTaskPersonalSchedule, openMemberProfile, markSectionViewed,
  } = useProject();
  const [filter, setFilter] = useState<string>("all");
  const [assigneeFilterSearch, setAssigneeFilterSearch] = useState("");
  const [quickAddAssigneeSearch, setQuickAddAssigneeSearch] = useState("");
  const [boardSearch, setBoardSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [addingCol, setAddingCol] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignees, setNewAssignees] = useState<string[]>(team.members[0] ? [team.members[0].id] : []);

  const locked = project.status === "done";

  useEffect(() => {
    setFilter("all");
    setAssigneeFilterSearch("");
    setBoardSearch("");
    setSelectedTaskId(null);
    setAddingCol(null);
    setNewTitle("");
    setNewAssignees(team.members[0] ? [team.members[0].id] : []);
    setQuickAddAssigneeSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // 대시보드 현황판/다가오는 마감에서 특정 과제로 딥링크했을 때 상세 패널을 연다.
  useEffect(() => {
    if (focusTaskId != null) setSelectedTaskId(focusTaskId);
  }, [focusTaskId]);

  useEffect(() => {
    if (currentMember) void markSectionViewed("tasks");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, currentMember?.id]);

  const filterOptions = [{ id: "all", label: "전체" }, ...team.members.map((m) => ({ id: m.id, label: m.name }))];
  const showAssigneeFilterSearch = team.members.length > 8;
  const assigneeFilterSearchTrimmed = assigneeFilterSearch.trim().toLowerCase();
  const visibleFilterOptions = assigneeFilterSearchTrimmed
    ? filterOptions.filter((o) => o.id === "all" || o.label.toLowerCase().includes(assigneeFilterSearchTrimmed))
    : filterOptions;
  const showQuickAddSearch = team.members.length > 8;
  const quickAddSearchTrimmed = quickAddAssigneeSearch.trim().toLowerCase();
  const visibleQuickAddMembers = quickAddSearchTrimmed
    ? team.members.filter((m) => m.name.toLowerCase().includes(quickAddSearchTrimmed))
    : team.members;
  const showBoardSearch = tasks.length > 8;
  const boardSearchTrimmed = boardSearch.trim().toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (filter === "all" || t.assigneeIds.includes(filter)) &&
      (!boardSearchTrimmed || t.title.toLowerCase().includes(boardSearchTrimmed))
  );
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  function startQuickAdd(col: TaskStatus) {
    setAddingCol(col);
    setNewTitle("");
    setNewAssignees(team.members[0] ? [team.members[0].id] : []);
    setQuickAddAssigneeSearch("");
  }

  function toggleNewAssignee(id: string) {
    setNewAssignees((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  }

  function submitQuickAdd(col: TaskStatus) {
    if (locked || !newTitle.trim() || newAssignees.length === 0) return;
    addTask({ title: newTitle.trim(), assigneeIds: newAssignees, status: col });
    setAddingCol(null);
    setNewTitle("");
  }

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-4 md:p-6">
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

      {/* Search + filter pills */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {showBoardSearch && (
          <input
            value={boardSearch}
            onChange={(e) => setBoardSearch(e.target.value)}
            placeholder="과제 제목 검색"
            className="w-48 min-w-0 text-xs px-3 py-1.5 border outline-none"
            style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--card)", fontFamily: "var(--font-outfit)" }}
          />
        )}
        {showAssigneeFilterSearch && (
          <input
            value={assigneeFilterSearch}
            onChange={(e) => setAssigneeFilterSearch(e.target.value)}
            placeholder="담당자 검색"
            className="w-40 min-w-0 text-xs px-3 py-1.5 border outline-none"
            style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--card)", fontFamily: "var(--font-outfit)" }}
          />
        )}
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {visibleFilterOptions.map((a) => (
          <button
            key={a.id}
            onClick={() => setFilter(a.id)}
            className="text-xs font-600 px-4 py-2 transition-all"
            style={{
              background: filter === a.id ? "var(--primary)" : "var(--card)",
              color: filter === a.id ? "#fff" : "var(--foreground)",
              borderRadius: "40px",
              boxShadow: filter === a.id ? "0 4px 12px rgba(37,99,235,0.25)" : "var(--shadow-card)",
            }}
          >
            {a.label}
          </button>
        ))}
        {visibleFilterOptions.length === 0 && (
          <div className="text-xs py-2" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</div>
        )}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const colTasks = filtered.filter((t) => t.status === col.id);
          const colTasksUnfiltered = tasks.filter((t) => t.status === col.id).length;
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
                <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1 scrollbar-dark">
                {colTasks.map((task) => {
                  const dLeft = daysUntilDue(task.due);
                  const urgent = task.status !== "done" && dLeft !== null && dLeft <= 3;
                  const shownAssignees = task.assigneeIds.slice(0, 3);
                  const extraCount = task.assigneeIds.length - shownAssignees.length;
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className="p-4 group transition-all cursor-pointer"
                      style={{
                        background: "var(--card-glass)",
                        borderRadius: "var(--radius)",
                        boxShadow: "var(--shadow-card)",
                        border: urgent ? "1.5px solid #ef4444" : "1.5px solid transparent",
                        backdropFilter: "var(--panel-blur)",
                        WebkitBackdropFilter: "var(--panel-blur)",
                      }}
                    >
                      {/* Priority + tags */}
                      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                        <span
                          className="text-xs font-600 px-2 py-0.5"
                          style={{ background: `${priorityLabel[task.priority].color}15`, color: priorityLabel[task.priority].color, borderRadius: "20px" }}
                        >
                          {priorityLabel[task.priority].label}
                        </span>
                        {urgent && (
                          <span className="text-xs font-700 px-2 py-0.5" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>
                            {dLeft! < 0 ? "기한 초과" : "마감임박"}
                          </span>
                        )}
                        {task.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                            {tag}
                          </span>
                        ))}
                      </div>

                      <p className="text-sm font-600 leading-snug mb-3">{task.title}</p>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex -space-x-1.5 shrink-0">
                            {shownAssignees.map((id) => {
                              const info = memberInfo(team.members, id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openMemberProfile(id); }}
                                  title={`${info.name} 프로필 보기`}
                                  style={{ border: "2px solid var(--card)", borderRadius: "50%" }}
                                >
                                  <Avatar url={info.avatarUrl} initial={info.avatar} color={info.color} size={20} />
                                </button>
                              );
                            })}
                            {extraCount > 0 && (
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700"
                                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "2px solid var(--card)" }}
                              >
                                +{extraCount}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-500 truncate" style={{ color: "var(--muted-foreground)" }}>
                            {task.assigneeIds.map((id) => memberInfo(team.members, id).name).join(", ")}
                          </span>
                        </div>
                        <span
                          className="text-xs font-600 px-2 py-0.5 shrink-0"
                          style={{
                            background: urgent ? "#ef444418" : "var(--muted)",
                            color: urgent ? "#ef4444" : "var(--muted-foreground)",
                            borderRadius: "20px",
                            fontFamily: "var(--font-jetbrains)",
                          }}
                        >
                          {task.due ? `~${shortDue(task.due)}` : "미정"}
                        </span>
                      </div>

                      {task.checklist.length > 0 && (
                        <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                          ☑ {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
                          {task.comments.length > 0 && ` · 💬 ${task.comments.length}`}
                        </div>
                      )}
                      {task.checklist.length === 0 && task.comments.length > 0 && (
                        <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                          💬 {task.comments.length}
                        </div>
                      )}

                      {/* Move actions on hover */}
                      {!locked && isManager && (
                        <div
                          className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="p-4 text-center text-xs" style={{ border: `2px dashed ${col.color}40`, color: "var(--muted-foreground)", borderRadius: "var(--radius)" }}>
                    {colTasksUnfiltered === 0 ? "과제 없음" : "검색 결과가 없어요"}
                  </div>
                )}
                </div>

                {/* Quick add */}
                {isManager && !locked && (
                  addingCol === col.id ? (
                    <div className="p-3 flex flex-col gap-2" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
                      <input
                        autoFocus
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitQuickAdd(col.id)}
                        placeholder="과제 제목"
                        className="text-xs px-2.5 py-2 border outline-none"
                        style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
                      />
                      {showQuickAddSearch && (
                        <input
                          value={quickAddAssigneeSearch}
                          onChange={(e) => setQuickAddAssigneeSearch(e.target.value)}
                          placeholder="담당자 검색"
                          className="text-xs px-2.5 py-1.5 border outline-none"
                          style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
                        />
                      )}
                      <div
                        className="flex flex-col gap-1 max-h-28 overflow-y-auto px-2.5 py-2 border"
                        style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)" }}
                      >
                        {visibleQuickAddMembers.map((m) => (
                          <label key={m.id} className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" checked={newAssignees.includes(m.id)} onChange={() => toggleNewAssignee(m.id)} />
                            {m.name}
                          </label>
                        ))}
                        {visibleQuickAddMembers.length === 0 && (
                          <div className="text-xs py-1" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</div>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => submitQuickAdd(col.id)}
                          className="flex-1 text-xs font-700 py-1.5 transition-all"
                          style={{
                            background: newTitle.trim() && newAssignees.length > 0 ? "var(--primary)" : "var(--muted)",
                            color: newTitle.trim() && newAssignees.length > 0 ? "#fff" : "var(--muted-foreground)",
                            borderRadius: "20px",
                          }}
                        >
                          추가
                        </button>
                        <button
                          onClick={() => setAddingCol(null)}
                          className="px-3 text-xs font-600"
                          style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startQuickAdd(col.id)}
                      className="w-full text-xs font-600 py-2 transition-all"
                      style={{ border: `2px dashed var(--border)`, color: "var(--muted-foreground)", borderRadius: "var(--radius)" }}
                    >
                      + 새 과제
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          members={team.members}
          columns={columns}
          priorityLabel={priorityLabel}
          currentMember={currentMember}
          isManager={isManager}
          isAssignee={!!currentMember && selectedTask.assigneeIds.includes(currentMember.id)}
          canChangeStatus={isManager}
          locked={locked}
          onClose={() => setSelectedTaskId(null)}
          onUpdateDetails={(patch) => updateTaskDetails(selectedTask.id, patch)}
          onChangeStatus={(s) => moveTask(selectedTask.id, s)}
          onDelete={() => { deleteTask(selectedTask.id); setSelectedTaskId(null); }}
          onToggleChecklist={(itemId, done) => toggleTaskChecklistItem(selectedTask.id, itemId, done)}
          onAddChecklistItem={(text) => addTaskChecklistItem(selectedTask.id, text)}
          onAddComment={(text) => addTaskComment(selectedTask.id, text)}
          onToggleCommentReaction={(commentId, emoji) => toggleTaskCommentReaction(commentId, emoji)}
          onToggleTeamSchedule={(checked) => toggleTaskTeamSchedule(selectedTask.id, checked)}
          onTogglePersonalSchedule={(checked) => toggleTaskPersonalSchedule(selectedTask.id, checked)}
        />
      )}
    </div>
  );
}
