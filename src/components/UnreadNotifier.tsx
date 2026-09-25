import { useEffect, useRef } from "react";
import { useProject } from "../context/ProjectContext";
import { notifyIfAway } from "../lib/browserNotifications";

// Joins up to `max` names, folding the rest into a "+N건 더" tail so one
// huge batch (e.g. a bulk import) doesn't produce an unreadably long line.
function summarize(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} 외 ${names.length - max}건`;
}

// Renders nothing — just watches the same unread counts Sidebar's bell shows
// and fires an OS notification, with the actual task/일정/파일 names (not
// just a count), when one grows while this tab isn't the one being looked at.
export default function UnreadNotifier() {
  const { newTasks, newScheduleEvents, newFiles, chatUnreadTotal, chatHistoryLoaded } = useProject();
  const previous = useRef<{ taskIds: Set<number>; scheduleIds: Set<number>; fileIds: Set<number>; chat: number; chatLoaded: boolean } | null>(null);

  useEffect(() => {
    const taskIds = new Set(newTasks.map((t) => t.id));
    const scheduleIds = new Set(newScheduleEvents.map((e) => e.id));
    const fileIds = new Set(newFiles.map((f) => f.id));
    const prev = previous.current;
    previous.current = { taskIds, scheduleIds, fileIds, chat: chatUnreadTotal, chatLoaded: chatHistoryLoaded };
    if (!prev) return; // first render after mount: record the existing backlog, don't notify for it

    const addedTasks = newTasks.filter((t) => !prev.taskIds.has(t.id));
    const addedEvents = newScheduleEvents.filter((e) => !prev.scheduleIds.has(e.id));
    const addedFiles = newFiles.filter((f) => !prev.fileIds.has(f.id));
    // 채팅 기록을 처음 불러오는 동안 늘어난 안 읽음 수는 쌓여 있던 것이므로 알리지 않는다.
    const addedChat = chatHistoryLoaded && prev.chatLoaded ? Math.max(0, chatUnreadTotal - prev.chat) : 0;

    const sections: { label: string; detail: string }[] = [];
    if (addedTasks.length > 0) sections.push({ label: "새 과제", detail: summarize(addedTasks.map((t) => t.title)) });
    if (addedEvents.length > 0) sections.push({ label: "새 일정", detail: summarize(addedEvents.map((e) => e.title)) });
    if (addedFiles.length > 0) sections.push({ label: "새 파일", detail: summarize(addedFiles.map((f) => f.name)) });
    if (addedChat > 0) sections.push({ label: "새 채팅", detail: `${addedChat}건` });
    if (sections.length === 0) return;

    if (sections.length === 1) {
      notifyIfAway(sections[0].label, sections[0].detail);
    } else {
      notifyIfAway("새 알림", sections.map((s) => `${s.label}: ${s.detail}`).join(" · "));
    }
  }, [newTasks, newScheduleEvents, newFiles, chatUnreadTotal, chatHistoryLoaded]);

  return null;
}
