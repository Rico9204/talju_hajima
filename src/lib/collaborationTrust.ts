export function collaborationTrust(score: number | null, evaluationCount: number) {
  if (score === null || evaluationCount === 0) {
    return { label: "평가 수집 중", evidence: "아직 공개 가능한 최종 평가가 없습니다." };
  }
  const label = score >= 8.5 ? "협업 신뢰도 높음"
    : score >= 7 ? "협업 신뢰도 안정적"
    : score >= 5 ? "추가 확인 권장"
    : "협업 방식 확인 권장";
  const evidence = evaluationCount >= 8 ? `최종 평가 ${evaluationCount}건 · 평가 근거 충분`
    : evaluationCount >= 3 ? `최종 평가 ${evaluationCount}건 · 평가 근거 보통`
    : `최종 평가 ${evaluationCount}건 · 평가 근거 제한적`;
  return { label, evidence };
}
