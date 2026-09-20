import { apiClient } from "./client";

// 학교명으로 실제 학과 목록을 조회 (백엔드 GET /majors, 내부적으로 공공데이터포털 odcloud API를
// 프록시). talju_hajima-main2의 src/lib/majorsApi.ts를 이식한 것 — 거기서는 Vercel 서버리스
// 함수를 직접 fetch했지만, 여기선 우리 NestJS 백엔드(apiClient)를 거친다.
export async function fetchMajors(school: string): Promise<string[]> {
  const { data } = await apiClient.get<{ majors: string[] }>("/majors", { params: { school } });
  return data.majors;
}

// 학교+학과가 odcloud 기준 "공학계열"인지 — 워크스페이스 버전 트리를 공학자용/쉬운 보기 중
// 무엇으로 기본 표시할지 정하는 용도. 못 찾으면 null(사용자가 직접 골라야 함).
export async function classifyMajor(school: string, major: string): Promise<boolean | null> {
  const { data } = await apiClient.get<{ engineering: boolean | null }>("/majors/classify", { params: { school, major } });
  return data.engineering;
}
