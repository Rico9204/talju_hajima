import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchMajorsFromApi } from "../src/lib/majorsApi";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { majors: string[]; cachedAt: number }>();

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
) {
  // TEMPORARY: entire body wrapped so any crash (not just the API-fetch
  // step) is visible in the response instead of surfacing as an opaque
  // FUNCTION_INVOCATION_FAILED page with no detail.
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
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : "fetch failed",
        stack: err instanceof Error ? err.stack : undefined,
      })
    );
  }
}
