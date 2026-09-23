import { useEffect, useRef } from "react";
import { useProject } from "../context/ProjectContext";
import { notifyIfAway } from "../lib/browserNotifications";

// Renders nothing — just watches the same unread counts Sidebar's bell shows
// and fires an OS notification when one grows while this tab isn't the one
// being looked at (Sidebar's badge only helps while it's visible on screen).
export default function UnreadNotifier() {
  const { newTasks, newScheduleEvents, newFiles, chatUnreadTotal } = useProject();
  const previous = useRef<{ tasks: number; schedule: number; files: number; chat: number } | null>(null);

  useEffect(() => {
    const current = { tasks: newTasks.length, schedule: newScheduleEvents.length, files: newFiles.length, chat: chatUnreadTotal };
    const prev = previous.current;
    previous.current = current;
    if (!prev) return; // first render after mount: record the existing backlog, don't notify for it

    const parts: string[] = [];
    if (current.tasks > prev.tasks) parts.push(`과제 ${current.tasks - prev.tasks}건`);
    if (current.schedule > prev.schedule) parts.push(`일정 ${current.schedule - prev.schedule}건`);
    if (current.files > prev.files) parts.push(`파일 ${current.files - prev.files}건`);
    if (current.chat > prev.chat) parts.push(`채팅 ${current.chat - prev.chat}건`);
    if (parts.length > 0) notifyIfAway("새 알림", parts.join(" · "));
  }, [newTasks.length, newScheduleEvents.length, newFiles.length, chatUnreadTotal]);

  return null;
}
