// 협업 신뢰도 단계와 평가 근거 단계. 평가 점수 안내(evaluationGuide)도 같은 기준을 그대로 보여 준다.
export const TRUST_LEVELS = [
  { min: 8.5, label: "협업 신뢰도 높음" },
  { min: 7, label: "협업 신뢰도 안정적" },
  { min: 5, label: "추가 확인 권장" },
  { min: 0, label: "협업 방식 확인 권장" },
] as const;
export const EVIDENCE_LEVELS = [
  { min: 8, label: "근거 충분" },
  { min: 3, label: "근거 보통" },
  { min: 1, label: "근거 제한적" },
] as const;

export function collaborationTrust(score: number | null, evaluationCount: number) {
  if (score === null || evaluationCount === 0) {
    return { label: "평가 수집 중", evidence: "공개된 최종 평가 없음" };
  }
  const label = TRUST_LEVELS.find((level) => score >= level.min)?.label ?? TRUST_LEVELS[TRUST_LEVELS.length - 1].label;
  const evidence = EVIDENCE_LEVELS.find((level) => evaluationCount >= level.min)?.label ?? EVIDENCE_LEVELS[EVIDENCE_LEVELS.length - 1].label;
  return { label, evidence: `평가 ${evaluationCount}건 · ${evidence}` };
}
