type MessageTime = { senderId: string; createdAt: string };

export function startsNewChatDay(previous: MessageTime | undefined, current: MessageTime): boolean {
  return !previous || new Date(previous.createdAt).toDateString() !== new Date(current.createdAt).toDateString();
}

export function formatChatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
}

export function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}

export function belongsToMessageGroup(previous: MessageTime | undefined, current: MessageTime | undefined): boolean {
  if (!previous || !current || previous.senderId !== current.senderId || startsNewChatDay(previous, current)) return false;
  const gap = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return gap >= 0 && gap <= 5 * 60 * 1000;
}
