// Used by vite.config.ts's dev-server middleware (local dev only).
//
// api/majors.ts (the real Vercel serverless function) INTENTIONALLY keeps
// its own inline copy of this same function instead of importing this file —
// Vercel's Node function bundler failed to package an import that reaches
// outside the api/ directory (confirmed by testing: moving this file around
// didn't help, only inlining it into api/majors.ts did). If you change the
// fetch/pagination logic here, make the same change in api/majors.ts, or
// local dev and production will quietly drift apart again — exactly how
// this feature ended up hardcoding one school in only one of two copies the
// first time.
//
// The dataset covers every Korean university (~50k rows), so this always
// queries scoped to one school at a time — fetching everything would take
// hundreds of paginated requests.
const ENDPOINT =
  "https://api.odcloud.kr/api/15014632/v1/uddi:d6552229-9686-4565-a421-ab303156f076_202004101338";

// Hard ceiling on pagination — protects against ever looping forever if the
// API responds with a malformed/missing totalCount (this actually happened:
// the naive `page * 100 >= totalCount` check never becomes true when
// totalCount isn't a valid number, since any comparison against
// NaN/undefined is false). 30 pages is already 3,000 rows, far more than one
// school's department count in this dataset.
const MAX_PAGES = 30;

export async function fetchMajorsFromApi(school: string, apiKey: string): Promise<string[]> {
  const seen = new Set<string>();
  let page = 1;

  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({
      page: String(page),
      perPage: "100",
      returnType: "JSON",
      serviceKey: apiKey,
    });
    // ::LIKE (not ::EQ) so "동명대" also matches "동명대학교" — school names
    // typed by hand rarely match the official name byte-for-byte.
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
