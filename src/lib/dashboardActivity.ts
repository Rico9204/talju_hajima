import type { ScheduleEvent, WorkspaceFile } from "../api/types";
export function dashboardActivity(files: WorkspaceFile[], events: ScheduleEvent[], memberId: string | undefined, now = new Date()) {
  const candidates = [
    ...files.map(file => ({ id: "file-" + file.id, title: file.name, kind: "자료", createdAt: file.createdAt, updatedAt: file.updatedAt, color: "#2563eb", avatar: "📄" })),
    ...events.filter(event => event.scope === "team" || event.ownerMemberId === memberId || event.visibility === "shared").map(event => ({
      id: "event-" + event.id, title: event.hideTitle && event.ownerMemberId !== memberId && event.scope === "personal" ? "바쁨" : event.title,
      kind: "일정", createdAt: event.createdAt, updatedAt: event.updatedAt, color: "#22c55e", avatar: "🗓" })),
  ];
  return candidates.flatMap(item => {
    const created = Date.parse(item.createdAt ?? "");
    const updated = Date.parse(item.updatedAt ?? "");
    const changed = Number.isFinite(updated) && (!Number.isFinite(created) || updated > created);
    const timestamp = changed ? updated : created;
    const age = now.getTime() - timestamp;
    if (!Number.isFinite(timestamp) || age < 0 || age > 72 * 60 * 60 * 1000) return [];
    return [{ ...item, timestamp, who: item.kind, action: item.title + (changed ? " 수정" : " 등록"),
      time: new Date(timestamp).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) }];
  }).sort((a,b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}
