import { BadGatewayException, BadRequestException, Controller, Get, Query, ServiceUnavailableException } from "@nestjs/common";

const ENDPOINT = "https://api.odcloud.kr/api/15014632/v1/uddi:d6552229-9686-4565-a421-ab303156f076_202004101338";
const MAX_PAGES = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// 공공데이터(학과 목록)는 2020년 4월 자료라 그 뒤에 이름을 바꾼 학교는 새 이름으로 찾으면 비어 있다.
// 새 이름으로 결과가 없으면 옛 이름으로 다시 찾는다. 통합된 학교는 옛 학교를 모두 적는다.
const FORMER_NAMES: Record<string, string[]> = {
  "한국공학대학교": ["한국산업기술대학교"], // 2022년 개명
  "경상국립대학교": ["경상대학교", "경남과학기술대학교"], // 2021년 통합
};

// 찾아볼 이름들: 입력한 이름 → 옛 이름 → "국립"을 뗀 이름(예: 국립한밭대학교 → 한밭대학교).
export function schoolNameCandidates(school: string): string[] {
  const names = [school, ...(FORMER_NAMES[school] ?? [])];
  if (school.startsWith("국립") && school.length > 2) names.push(school.slice(2));
  return [...new Set(names)];
}

export class MajorsService {
  private readonly cache = new Map<string, { majors: string[]; cachedAt: number }>();

  constructor(private readonly apiKey: string | undefined, private readonly fetcher: typeof fetch = fetch) {}

  async list(school: string): Promise<string[]> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new ServiceUnavailableException("전공 조회 기능이 설정되지 않았습니다.");
    const cached = this.cache.get(school);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.majors;
    // 입력한 이름으로 나오면 그대로 쓰고, 비어 있으면 옛 이름들의 결과를 모두 합친다(통합 학교).
    const [given, ...fallbacks] = schoolNameCandidates(school);
    let found = await this.fetchMajors(apiKey, given);
    if (found.length === 0) for (const name of fallbacks) found = [...found, ...await this.fetchMajors(apiKey, name)];
    const majors = [...new Set(found)].sort((a, b) => a.localeCompare(b, "ko"));
    this.cache.set(school, { majors, cachedAt: Date.now() });
    return majors;
  }

  private async fetchMajors(apiKey: string, school: string): Promise<string[]> {
    const seen = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ page: String(page), perPage: "100", returnType: "JSON", serviceKey: apiKey });
      params.append("cond[학교명::LIKE]", school);
      let response: Response;
      try { response = await this.fetcher(`${ENDPOINT}?${params}`); } catch { throw new BadGatewayException("전공 정보를 불러오지 못했습니다."); }
      if (!response.ok) throw new BadGatewayException("전공 정보를 불러오지 못했습니다.");
      const body = await response.json() as { data?: Record<string, string>[]; totalCount?: number };
      if (!Array.isArray(body.data)) throw new BadGatewayException("전공 정보 응답이 올바르지 않습니다.");
      for (const row of body.data) if (row["학과상태"] !== "폐지" && row["학부·과(전공)명"]) seen.add(row["학부·과(전공)명"]);
      if (page * 100 >= (typeof body.totalCount === "number" ? body.totalCount : body.data.length) || body.data.length === 0) break;
    }
    return [...seen];
  }
}

@Controller("majors")
export class MajorsController {
  constructor(private readonly majors: MajorsService) {}

  @Get()
  list(@Query("school") school: string) {
    const normalized = school?.trim();
    if (!normalized || normalized.length > 100) throw new BadRequestException("학교 이름이 올바르지 않습니다.");
    return this.majors.list(normalized).then((majors) => ({ majors }));
  }
}
