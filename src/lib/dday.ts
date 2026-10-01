// 일정 D-day(한국 시간 기준 날짜끼리 비교). 기간 일정은 시작~끝 사이면 "진행 중".
const kstDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export function todayKst(now: Date = new Date()): string {
  return kstDate.format(now);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function dDayLabel(start: string, end: string | null, today: string = todayKst()): string {
  const diff = dayNumber(start) - dayNumber(today);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "D-DAY";
  return end && dayNumber(end) >= dayNumber(today) ? "진행 중" : `D+${-diff}`;
}
