// 채팅 채널에서 공유된 파일을 "언제 공유됐는지"로 묶는다: 오늘 / 어제 / 이번 주 / 이전.
// 기준은 파일이 올라온 날이 아니라 채팅에서 공유한 시각(메시지 시각)이다. 같은 파일이 여러 번 공유되면 가장 최근 한 번만 센다.
export type SharedFileGroupLabel = "오늘" | "어제" | "이번 주" | "이전";

export interface SharedFileMessage { id: number; fileId: number | null; createdAt: string; senderId: string }
export interface SharedFileItem { fileId: number; messageId: number; senderId: string; sharedAt: string }
export interface SharedFileGroup { label: SharedFileGroupLabel; items: SharedFileItem[] }

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function groupSharedFiles(messages: SharedFileMessage[], now = new Date()): SharedFileGroup[] {
  const today = dayStart(now);
  const day = 86_400_000;
  // 이번 주 = 월요일부터. 오늘·어제를 뺀 이번 주 날짜만 "이번 주"로 센다.
  const mondayOffset = (now.getDay() + 6) % 7;
  const weekStart = today - mondayOffset * day;

  const latestByFile = new Map<number, SharedFileItem>();
  for (const message of messages) {
    if (message.fileId === null) continue;
    const prev = latestByFile.get(message.fileId);
    if (!prev || new Date(message.createdAt).getTime() > new Date(prev.sharedAt).getTime()) {
      latestByFile.set(message.fileId, { fileId: message.fileId, messageId: message.id, senderId: message.senderId, sharedAt: message.createdAt });
    }
  }

  const buckets: Record<SharedFileGroupLabel, SharedFileItem[]> = { "오늘": [], "어제": [], "이번 주": [], "이전": [] };
  for (const item of latestByFile.values()) {
    const start = dayStart(new Date(item.sharedAt));
    const label: SharedFileGroupLabel = start >= today ? "오늘" : start === today - day ? "어제" : start >= weekStart ? "이번 주" : "이전";
    buckets[label].push(item);
  }
  const order: SharedFileGroupLabel[] = ["오늘", "어제", "이번 주", "이전"];
  return order
    .map((label) => ({ label, items: buckets[label].sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()) }))
    .filter((group) => group.items.length > 0);
}
