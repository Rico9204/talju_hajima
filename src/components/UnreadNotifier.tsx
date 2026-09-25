import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const { newTasks, newScheduleEvents, newFiles, chatUnreadTotal, chatHistoryLoaded, unreadMentions } = useProject();
  const previous = useRef<{
    taskIds: Set<number>;
    scheduleIds: Set<number>;
    fileIds: Set<number>;
    chat: number;
    chatLoaded: boolean;
    mentionIds: Set<number>;
  } | null>(null);

  useEffect(() => {
    const taskIds = new Set(newTasks.map((t) => t.id));
    const scheduleIds = new Set(newScheduleEvents.map((e) => e.id));
    const fileIds = new Set(newFiles.map((f) => f.id));
    const mentionIds = new Set(unreadMentions.map((m) => m.messageId));
    const prev = previous.current;
    previous.current = { taskIds, scheduleIds, fileIds, chat: chatUnreadTotal, chatLoaded: chatHistoryLoaded, mentionIds };
    if (!prev) return; // first render after mount: record the existing backlog, don't notify for it

    const addedTasks = newTasks.filter((t) => !prev.taskIds.has(t.id));
    const addedEvents = newScheduleEvents.filter((e) => !prev.scheduleIds.has(e.id));
    const addedFiles = newFiles.filter((f) => !prev.fileIds.has(f.id));
    const addedMentions = unreadMentions.filter((m) => !prev.mentionIds.has(m.messageId));
    // 채팅 기록을 처음 불러오는 동안 늘어난 안 읽음 수는 쌓여 있던 것이므로 알리지 않는다.
    const addedChat = chatHistoryLoaded && prev.chatLoaded ? Math.max(0, chatUnreadTotal - prev.chat) : 0;

    // 멘션 알림이 있는 경우, 클릭 시 해당 채팅/메시지로 직접 이동할 수 있도록 즉시 띄운다.
    if (addedMentions.length === 1) {
      const m = addedMentions[0];
      notifyIfAway(
        `💬 [멘션] ${m.senderName}님이 회원님을 멘션했습니다`,
        m.text,
        () => {
          navigate(`/chat/${encodeURIComponent(m.channelId)}?messageId=${m.messageId}`);
        }
      );
    } else if (addedMentions.length > 1) {
      notifyIfAway(
        `💬 [멘션] 새로운 멘션 ${addedMentions.length}건`,
        addedMentions.map((m) => `${m.senderName}: ${m.text}`).join(" · "),
        () => {
          navigate(`/chat/${encodeURIComponent(addedMentions[0].channelId)}?messageId=${addedMentions[0].messageId}`);
        }
      );
    }

    const sections: { label: string; detail: string; onClick?: () => void }[] = [];
    if (addedTasks.length > 0) {
      sections.push({
        label: "새 과제",
        detail: summarize(addedTasks.map((t) => t.title)),
        onClick: () => navigate("/tasks"),
      });
    }
    if (addedEvents.length > 0) {
      sections.push({
        label: "새 일정",
        detail: summarize(addedEvents.map((e) => e.title)),
        onClick: () => navigate("/schedule"),
      });
    }
    if (addedFiles.length > 0) {
      sections.push({
        label: "새 파일",
        detail: summarize(addedFiles.map((f) => f.name)),
        onClick: () => navigate("/workspace"),
      });
    }
    const nonMentionChat = Math.max(0, addedChat - addedMentions.length);
    if (nonMentionChat > 0 && addedMentions.length === 0) {
      sections.push({
        label: "새 채팅",
        detail: `${addedChat}건`,
        onClick: () => navigate("/chat"),
      });
    }
    if (sections.length === 0) return;

    if (sections.length === 1) {
      notifyIfAway(sections[0].label, sections[0].detail, sections[0].onClick);
    } else {
      notifyIfAway("새 알림", sections.map((s) => `${s.label}: ${s.detail}`).join(" · "));
    }
  }, [newTasks, newScheduleEvents, newFiles, chatUnreadTotal, chatHistoryLoaded, unreadMentions, navigate]);

  return null;
}
