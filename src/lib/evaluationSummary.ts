import type { EvaluationPercentiles, Member } from "../api/types";
export function summarizeEvaluations(members: Pick<Member, "score" | "evalCount" | "criteriaScores">[], projectCount: number, collaboratorCount: number) {
  const count = members.reduce((sum, m) => sum + m.evalCount, 0);
  const criteria = { role: 0, deadline: 0, communication: 0, collaboration: 0, quality: 0 };
  for (const key of Object.keys(criteria) as (keyof typeof criteria)[]) {
    criteria[key] = count ? members.reduce((sum, m) => sum + m.criteriaScores[key] * m.evalCount, 0) / count : 0;
  }
  return { projectCount, collaboratorCount, count, score: count ? members.reduce((sum, m) => sum + m.score * m.evalCount, 0) / count : null, criteria };
}
export type MyEvaluationSummary = ReturnType<typeof summarizeEvaluations>;

// 오각형 차트 데이터. 상위 %가 있으면 각 점수 옆에 붙인다(서비스 전체 사용자 기준).
const CRITERIA = [["role", "역할 이행"], ["deadline", "약속·마감 준수"], ["communication", "의사소통"], ["collaboration", "협업 태도"], ["quality", "결과물 품질"]] as const;
export function criteriaChartData(criteria: MyEvaluationSummary["criteria"], percentiles?: EvaluationPercentiles | null) {
  return CRITERIA.map(([key, label]) => ({ label, value: criteria[key], note: percentiles?.available ? `상위 ${percentiles.criteria[key]}%` : undefined }));
}
// 점수 아래 한 줄 설명: "전체 사용자 42명 중 상위 12%" 또는 인원 부족 안내.
export function percentileCaption(percentiles: EvaluationPercentiles | null | undefined) {
  if (!percentiles) return null;
  return percentiles.available
    ? `서비스 전체 ${percentiles.population}명 중 상위 ${percentiles.overall}%`
    : "비교할 사용자가 10명 이상 모이면 상위 %가 표시됩니다.";
}
