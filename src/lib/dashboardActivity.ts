import type { ScheduleEvent, WorkspaceFile } from "../api/types";
export function dashboardActivity(files: WorkspaceFile[], events: ScheduleEvent[], memberId: string | undefined, now = new Date()) {
  const candidates = [
    ...files.flatMap(file => {
      const uploads = (file.versions ?? []).filter(version => Number.isFinite(Date.parse(version.uploadedAt ?? "")));
      if (uploads.length) return uploads.map(version => ({
        id: `file-${file.id}-version-${version.id}`, title: `${version.originalName ?? file.name} ${version.version}`,
        kind: version.uploadedBy, createdAt: version.uploadedAt, updatedAt: null,
        color: "#2563eb", avatar: "📄", upload: true, href: `/workspace/${file.folderId ?? "none"}/${file.id}`,
      }));
      return [{ id: "file-" + file.id, title: file.name, kind: "자료", createdAt: file.createdAt, updatedAt: file.updatedAt, color: "#2563eb", avatar: "📄", upload: false, href: `/workspace/${file.folderId ?? "none"}/${file.id}` }];
    }),
    ...events.filter(event => event.scope === "team" || event.ownerMemberId === memberId || event.visibility === "shared").map(event => ({
      id: "event-" + event.id, title: event.hideTitle && event.ownerMemberId !== memberId && event.scope === "personal" ? "바쁨" : event.title,
      href: `/schedule/${event.id}`, upload: false, kind: "일정", createdAt: event.createdAt, updatedAt: event.updatedAt, color: "#22c55e", avatar: "🗓" })),
  ];
  return candidates.flatMap(item => {
    const created = Date.parse(item.createdAt ?? "");
    const updated = Date.parse(item.updatedAt ?? "");
    const changed = Number.isFinite(updated) && (!Number.isFinite(created) || updated > created);
    const timestamp = changed ? updated : created;
    const age = now.getTime() - timestamp;
    if (!Number.isFinite(timestamp) || age < 0 || age > 72 * 60 * 60 * 1000) return [];
    return [{ ...item, timestamp, who: item.kind, action: item.title + (item.upload ? " 업로드" : changed ? " 수정" : " 등록"),
      time: new Date(timestamp).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) }];
  }).sort((a,b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}
