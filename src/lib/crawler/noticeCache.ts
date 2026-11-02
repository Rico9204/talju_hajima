import type { NoticeItem } from "./types";

// 탭을 오갈 때 다시 요청하지 않도록 학교·탭별 결과를 잠시 기억한다. 서버 쪽 수집 결과도 같은 시간만큼 캐시된다.
export const NOTICE_CACHE_TTL_MS = 10 * 60 * 1000;

export function createNoticeCache(ttlMs = NOTICE_CACHE_TTL_MS, now: () => number = Date.now) {
  const entries = new Map<string, { items: NoticeItem[]; savedAt: number }>();
  return {
    get(school: string, tab: string): NoticeItem[] | undefined {
      const entry = entries.get(`${school}:${tab}`);
      return entry && now() - entry.savedAt < ttlMs ? entry.items : undefined;
    },
    // 빈 결과와 수집 실패 때의 안내 글은 기억하지 않는다. 일시적인 실패가 탭을 오가는 동안 계속 보이면 안 된다.
    set(school: string, tab: string, items: NoticeItem[]) {
      if (items.length > 0 && !items.some((item) => item.id.endsWith("-official-guide"))) entries.set(`${school}:${tab}`, { items, savedAt: now() });
    },
  };
}
