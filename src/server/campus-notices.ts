import type { IncomingMessage, ServerResponse } from "node:http";
import { crawlNotices } from "../lib/crawler/crawlerService";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins cache
const cache = new Map<string, { result: any; cachedAt: number }>();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const school = (url.searchParams.get("school") ?? "").trim() || "전국";
    const category = (url.searchParams.get("category") ?? "all") as any;

    const cacheKey = `${school}:${category}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cached.result));
      return;
    }

    // Call real campus crawler engine
    const result = await crawlNotices(school, category);
    cache.set(cacheKey, { result, cachedAt: Date.now() });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "crawling failed" }));
  }
}
