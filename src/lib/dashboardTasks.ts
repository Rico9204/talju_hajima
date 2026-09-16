import type { Task } from "../api/types";
type DashboardTask = Pick<Task, "id" | "title" | "status" | "due">;
function dateDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / 86400000;
}
export function summarizeDashboardTasks(tasks: DashboardTask[], now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
  const deadlines = tasks.flatMap((task) => {
    const due = dateDay(task.due);
    if (task.status === "done" || due === null) return [];
    const days = due - today;
    return [{ id: task.id, label: task.title, due: task.due, days,
      color: days <= 0 ? "#ef4444" : days <= 7 ? "#f59e0b" : "#22c55e",
      badge: days < 0 ? Math.abs(days) + "일 지남" : days === 0 ? "D-Day" : "D-" + days }];
  }).sort((a, b) => a.days - b.days || a.id - b.id);
  return { total: tasks.length, completed: tasks.filter((task) => task.status === "done").length,
    remaining: deadlines.length, overdue: deadlines.filter((task) => task.days < 0).length, deadlines };
}
