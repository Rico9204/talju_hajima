import { BadGatewayException, BadRequestException, Controller, Get, Query, ServiceUnavailableException } from "@nestjs/common";

const ENDPOINT = "https://api.odcloud.kr/api/15014632/v1/uddi:d6552229-9686-4565-a421-ab303156f076_202004101338";
const MAX_PAGES = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class MajorsService {
  private readonly cache = new Map<string, { majors: string[]; cachedAt: number }>();

  constructor(private readonly apiKey: string | undefined, private readonly fetcher: typeof fetch = fetch) {}

  async list(school: string): Promise<string[]> {
    if (!this.apiKey) throw new ServiceUnavailableException("전공 조회 기능이 설정되지 않았습니다.");
    const cached = this.cache.get(school);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.majors;
    const seen = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ page: String(page), perPage: "100", returnType: "JSON", serviceKey: this.apiKey });
      params.append("cond[학교명::LIKE]", school);
      let response: Response;
      try { response = await this.fetcher(`${ENDPOINT}?${params}`); } catch { throw new BadGatewayException("전공 정보를 불러오지 못했습니다."); }
      if (!response.ok) throw new BadGatewayException("전공 정보를 불러오지 못했습니다.");
      const body = await response.json() as { data?: Record<string, string>[]; totalCount?: number };
      if (!Array.isArray(body.data)) throw new BadGatewayException("전공 정보 응답이 올바르지 않습니다.");
      for (const row of body.data) if (row["학과상태"] !== "폐지" && row["학부·과(전공)명"]) seen.add(row["학부·과(전공)명"]);
      if (page * 100 >= (typeof body.totalCount === "number" ? body.totalCount : body.data.length) || body.data.length === 0) break;
    }
    const majors = [...seen].sort((a, b) => a.localeCompare(b, "ko"));
    this.cache.set(school, { majors, cachedAt: Date.now() });
    return majors;
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
