import type { IncomingMessage, ServerResponse } from "node:http";

// This function's fetch/pagination logic is INTENTIONALLY duplicated in
// src/lib/majorsApi.ts (used by vite.config.ts's local dev proxy) rather
// than imported from there — an import reaching outside the api/ directory
// made this Vercel serverless function crash at cold start with an opaque
// FUNCTION_INVOCATION_FAILED (confirmed by testing two different file
// locations for a shared module; only inlining it here fixed it). If you
// change this, make the matching change in src/lib/majorsApi.ts too.
const ENDPOINT =
  "https://api.odcloud.kr/api/15014632/v1/uddi:d6552229-9686-4565-a421-ab303156f076_202004101338";
const MAX_PAGES = 30;

async function fetchMajorsFromApi(school: string, apiKey: string): Promise<string[]> {
  const seen = new Set<string>();
  let page = 1;

  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({
      page: String(page),
      perPage: "100",
      returnType: "JSON",
      serviceKey: apiKey,
    });
    params.append("cond[학교명::LIKE]", school);

    const res = await fetch(`${ENDPOINT}?${params}`);
    if (!res.ok) throw new Error(`odcloud API returned ${res.status}`);

    const body = (await res.json()) as {
      data?: Record<string, string>[];
      totalCount?: number;
      error?: string;
    };
    if (!Array.isArray(body.data)) {
      throw new Error(body.error || "odcloud API returned an unexpected response shape");
    }

    for (const row of body.data) {
      if (row["학과상태"] !== "폐지") {
        const name = row["학부·과(전공)명"];
        if (name) seen.add(name);
      }
    }

    const totalCount = typeof body.totalCount === "number" ? body.totalCount : body.data.length;
    if (page * 100 >= totalCount || body.data.length === 0) break;
    page++;
  }

  return [...seen].sort((a, b) => a.localeCompare(b, "ko"));
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { majors: string[]; cachedAt: number }>();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const school = (url.searchParams.get("school") ?? "").trim();
    if (!school) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "school query param is required" }));
      return;
    }

    const apiKey = process.env.ODCLOUD_API_KEY;
    if (!apiKey) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ODCLOUD_API_KEY not configured" }));
      return;
    }

    const cached = cache.get(school);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ majors: cached.majors }));
      return;
    }

    const majors = await fetchMajorsFromApi(school, apiKey);
    cache.set(school, { majors, cachedAt: Date.now() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ majors }));
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "fetch failed" }));
  }
}
