import type { Member } from "../api/types";
export function summarizeEvaluations(members: Pick<Member, "score" | "evalCount" | "criteriaScores">[], projectCount: number, collaboratorCount: number) {
  const count = members.reduce((sum, m) => sum + m.evalCount, 0);
  const criteria = { role: 0, deadline: 0, communication: 0, collaboration: 0, quality: 0 };
  for (const key of Object.keys(criteria) as (keyof typeof criteria)[]) {
    criteria[key] = count ? members.reduce((sum, m) => sum + m.criteriaScores[key] * m.evalCount, 0) / count : 0;
  }
  return { projectCount, collaboratorCount, count, score: count ? members.reduce((sum, m) => sum + m.score * m.evalCount, 0) / count : null, criteria };
}
export type MyEvaluationSummary = ReturnType<typeof summarizeEvaluations>;
