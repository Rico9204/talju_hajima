import type { IncomingMessage, ServerResponse } from "node:http";
import { crawlNotices } from "../lib/crawler/crawlerService";
import { findSchoolEntry } from "../lib/crawler/schoolsRegistry";
import { findUniversity } from "../lib/constants/koreanUniversities";
import type { NoticeCategory } from "../lib/crawler/types";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins cache
const CACHE_MAX = 1000;
// Vercel CDN에도 10분 저장하고, 그 뒤 1시간은 옛 응답을 먼저 주며 뒤에서 새로 모은다(함수가 새로 뜰 때마다 수집하느라 첫 로딩이 3~4초 걸리던 문제).
const CDN_CACHE = "public, s-maxage=600, stale-while-revalidate=3600";
const NATIONAL = "전국 공모전·취업 Pick";
const CATEGORIES = new Set<NoticeCategory>(["all", "contest", "job", "general", "internship"]);
const cache = new Map<string, { result: unknown; cachedAt: number }>();

// 로그인 없이 부르는 주소라, 요청 값 그대로 캐시 키를 만들면 글자만 바꿔 캐시를 피하며 외부 사이트 수집을 계속 일으킬 수 있다
// → 아는 학교 이름·허용된 분류로만 정리해서, 키의 가짓수가 학교 수로 묶이게 한다.
function normalize(url: URL) {
  const raw = (url.searchParams.get("school") ?? "").trim();
  const school = (raw && (findSchoolEntry(raw)?.name ?? findUniversity(raw)?.name)) || NATIONAL;
  const rawCategory = url.searchParams.get("category") as NoticeCategory | null;
  const category = rawCategory && CATEGORIES.has(rawCategory) ? rawCategory : "all";
  return { school, category };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { school, category } = normalize(new URL(req.url ?? "", "http://localhost"));

    const cacheKey = `${school}:${category}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": CDN_CACHE });
      res.end(JSON.stringify(cached.result));
      return;
    }

    // Call real campus crawler engine
    const result = await crawlNotices(school, category);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!); // 가장 오래된 것부터
    cache.set(cacheKey, { result, cachedAt: Date.now() });

    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": CDN_CACHE });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("campus-notices crawl failed", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "소식을 불러오지 못했습니다." }));
  }
}
