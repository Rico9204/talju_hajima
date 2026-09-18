import { apiClient } from "./client";

// 학교명으로 실제 학과 목록을 조회 (백엔드 GET /majors, 내부적으로 공공데이터포털 odcloud API를
// 프록시). talju_hajima-main2의 src/lib/majorsApi.ts를 이식한 것 — 거기서는 Vercel 서버리스
// 함수를 직접 fetch했지만, 여기선 우리 NestJS 백엔드(apiClient)를 거친다.
export async function fetchMajors(school: string): Promise<string[]> {
  const { data } = await apiClient.get<{ majors: string[] }>("/majors", { params: { school } });
  return data.majors;
}
