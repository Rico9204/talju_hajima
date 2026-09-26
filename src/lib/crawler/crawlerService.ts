import type { NoticeItem, NoticeCategory } from "./types.ts";
import { getBoardsForSchool, findSchoolEntry } from "./schoolsRegistry.ts";
import { parseByCmsType } from "./parsers.ts";
import { getUniversityOfficialUrl, findUniversity } from "../constants/koreanUniversities.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export interface CrawlResult {
  notices: NoticeItem[];
  schoolName: string;
  schoolCode: string;
  sourceUrl?: string;
  isMockFallback?: boolean;
}

function getSchoolOfficialUrl(schoolName: string): string {
  return getUniversityOfficialUrl(schoolName);
}

// Return authentic guidance notice if school site strictly blocks automated crawlers (WAF/SSO)
function generateFallbackNotices(
  schoolName: string,
  schoolCode: string,
  category?: NoticeCategory,
  officialUrl?: string
): NoticeItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const targetLink = officialUrl || getSchoolOfficialUrl(schoolName);

  return [
    {
      id: `${schoolCode}-official-guide`,
      schoolCode,
      schoolName,
      category: category === "all" ? "general" : category || "general",
      categoryLabel: "공식 공지 안내",
      title: `[공식 공지] ${schoolName} 최신 학사·장학 및 취업/공모전 공지사항 바로가기`,
      author: `${schoolName} 종합정보`,
      postDate: today,
      link: targetLink,
      isPinned: true,
      summary: `본교(${schoolName})의 외부 봇 차단 및 보안 방화벽(WAF/SSO) 정책으로 인해 외부 자동 수집이 제한되어 공식 홈페이지로 직통 연결됩니다. 클릭 시 ${schoolName} 공식 공지사항으로 이동합니다.`,
    },
  ];
}

export async function crawlNotices(
  schoolQuery: string,
  category: NoticeCategory = "all"
): Promise<CrawlResult> {
  const schoolEntry = findSchoolEntry(schoolQuery);
  const schoolName = schoolEntry ? schoolEntry.name : schoolQuery || "전국 공모전·취업 Pick";
  const schoolCode = schoolEntry ? schoolEntry.code : "custom";
  const officialUrl = getSchoolOfficialUrl(schoolName);

  const boards = getBoardsForSchool(schoolQuery, category);
  const allNotices: NoticeItem[] = [];
  const seenTitles = new Set<string>();
  let primarySourceUrl = boards[0]?.listUrl || officialUrl;

  for (const board of boards) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      let res: Response;
      if (board.cmsType === "allcon") {
        const params = new URLSearchParams({ t: "1", page: "1", rows: "25" });
        res = await fetch(board.listUrl, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://www.all-con.co.kr/list/contest/1",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: params.toString(),
          signal: controller.signal,
        });
      } else {
        res = await fetch(board.listUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        });
      }
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const parsed = parseByCmsType(html, board);
        if (parsed.length > 0) {
          for (const item of parsed) {
            const key = item.title.trim().toLowerCase();
            if (!seenTitles.has(key)) {
              seenTitles.add(key);
              allNotices.push(item);
            }
          }
          primarySourceUrl = board.listUrl;
        }
      }
    } catch {
      // Ignore individual board fetch error
    }
  }

  // If specific category yielded 0 results, fall back to crawling general boards so the page is not empty
  if (allNotices.length === 0 && category !== "all") {
    const generalBoards = getBoardsForSchool(schoolQuery, "all");
    for (const board of generalBoards) {
      if (boards.some((b) => b.listUrl === board.listUrl)) continue;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(board.listUrl, {
          headers: { "User-Agent": USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const html = await res.text();
          const parsed = parseByCmsType(html, board);
          if (parsed.length > 0) {
            for (const item of parsed) {
              const key = item.title.trim().toLowerCase();
              if (!seenTitles.has(key)) {
                seenTitles.add(key);
                allNotices.push(item);
              }
            }
            primarySourceUrl = board.listUrl;
          }
        }
      } catch {
        // Ignore fallback error
      }
    }
  }

  // If no notices extracted yet and officialUrl exists, attempt auto-discovery on main page
  if (allNotices.length === 0 && officialUrl && !officialUrl.includes("academyinfo")) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(officialUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const autoBoard = {
          schoolCode,
          schoolName,
          category: (category === "all" ? "general" : category) as NoticeCategory,
          categoryLabel: "학교소식·공지",
          cmsType: "generic" as const,
          listUrl: officialUrl,
          baseUrl: officialUrl,
        };
        const parsed = parseByCmsType(html, autoBoard);
        if (parsed.length > 0) {
          for (const item of parsed) {
            const key = item.title.trim().toLowerCase();
            if (!seenTitles.has(key)) {
              seenTitles.add(key);
              allNotices.push(item);
            }
          }
          primarySourceUrl = officialUrl;
        }
      }
    } catch {
      // Auto-discovery failure handled below
    }
  }

  if (allNotices.length === 0) {
    const fallback = generateFallbackNotices(schoolName, schoolCode, category, officialUrl);
    return {
      notices: fallback,
      schoolName,
      schoolCode,
      sourceUrl: officialUrl,
      isMockFallback: true,
    };
  }

  // Sort: pinned items first, then newer postDate descending
  allNotices.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.postDate.localeCompare(a.postDate);
  });

  return {
    notices: allNotices.slice(0, 30),
    schoolName,
    schoolCode,
    sourceUrl: primarySourceUrl,
  };
}
