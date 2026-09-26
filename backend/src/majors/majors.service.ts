import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// talju_hajima-main2/src/lib/majorsApi.ts에서 이식 — 공공데이터포털(odcloud) 전국 대학 학과
// 정보 API를 학교명으로 조회한다. 전국 학과가 약 5만 건이라 학교 단위로만 조회 가능.
const ENDPOINT =
  'https://api.odcloud.kr/api/15014632/v1/uddi:d6552229-9686-4565-a421-ab303156f076_202004101338';

// totalCount가 malformed(NaN/undefined)로 와도 무한 루프에 빠지지 않도록 하는 안전장치.
// 30페이지(3,000행)면 한 학교의 학과 수를 훨씬 넘는다.
const MAX_PAGES = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface MajorRow {
  name: string;
  // odcloud의 "표준분류대계열"(공학계열/인문계열/자연계열 등) 원문 — 워크스페이스 버전 트리를
  // 공학자용/비공학자용으로 나눠 보는 기본값을 정할 때 씀(engineering.service.ts 쪽이 아니라
  // Workspace.tsx가 currentMember.major로 이 값을 다시 조회해서 판단).
  field: string | null;
}

@Injectable()
export class MajorsService {
  private readonly cache = new Map<string, { rows: MajorRow[]; cachedAt: number }>();

  constructor(private readonly config: ConfigService) {}

  async findMajors(school: string): Promise<string[]> {
    const rows = await this.findMajorRows(school);
    return rows.map((r) => r.name);
  }

  // 학과명이 그 학교에서 "공학계열"로 분류되는지 — 못 찾으면 null(판단 불가, 프론트에서 기본값
  // 없이 사용자가 직접 고르게 둔다).
  async isEngineeringMajor(school: string, major: string): Promise<boolean | null> {
    const rows = await this.findMajorRows(school);
    const row = rows.find((r) => r.name === major);
    if (!row || row.field === null) return null;
    return row.field.includes('공학');
  }

  private async findMajorRows(school: string): Promise<MajorRow[]> {
    const cached = this.cache.get(school);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.rows;

    const apiKey = this.config.get<string>('ODCLOUD_API_KEY');
    if (!apiKey) throw new HttpException('ODCLOUD_API_KEY not configured', 500);

    const rows = await this.fetchMajorsFromApi(school, apiKey);
    this.cache.set(school, { rows, cachedAt: Date.now() });
    return rows;
  }

  private async fetchMajorsFromApi(school: string, apiKey: string): Promise<MajorRow[]> {
    const seen = new Map<string, string | null>();
    let page = 1;

    while (page <= MAX_PAGES) {
      const params = new URLSearchParams({
        page: String(page),
        perPage: '100',
        returnType: 'JSON',
        serviceKey: apiKey,
      });
      // ::LIKE (not ::EQ) so "동명대" also matches "동명대학교".
      params.append('cond[학교명::LIKE]', school);

      const res = await fetch(`${ENDPOINT}?${params}`);
      if (!res.ok) throw new HttpException(`odcloud API returned ${res.status}`, 502);

      const body = (await res.json()) as {
        data?: Record<string, string>[];
        totalCount?: number;
        error?: string;
      };
      if (!Array.isArray(body.data)) {
        throw new HttpException(body.error || 'odcloud API returned an unexpected response shape', 502);
      }

      for (const row of body.data) {
        if (row['학과상태'] !== '폐지') {
          const name = row['학부·과(전공)명'];
          if (name && !seen.has(name)) seen.set(name, row['표준분류대계열'] ?? null);
        }
      }

      const totalCount = typeof body.totalCount === 'number' ? body.totalCount : body.data.length;
      if (page * 100 >= totalCount || body.data.length === 0) break;
      page++;
    }

    return [...seen.entries()]
      .map(([name, field]) => ({ name, field }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
}
