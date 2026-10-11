import { useEffect, useState } from "react";
import { dataRepository } from "../api";
import type { EvaluationPercentiles } from "../api/types";
import { useProject } from "../context/ProjectContext";
import { criteriaChartData, percentileCaption, type MyEvaluationSummary as Summary } from "../lib/evaluationSummary";
import { collaborationTrust } from "../lib/collaborationTrust";
import { useEvaluationScoreCca } from "../lib/useEvaluationScoreCca";
import PentagonChart from "./PentagonChart";
import EvaluationInfoButton from "./EvaluationInfoButton";
import CcaBadge from "./CcaBadge";

export default function MyEvaluationSummary({ chart = false }: { chart?: boolean }) {
  const { getMyEvaluationSummary, currentMember, projects } = useProject();
  const [result, setResult] = useState<Summary | null>(null);
  const [percentiles, setPercentiles] = useState<EvaluationPercentiles | null>(null);
  const [error, setError] = useState(false);
  const scoreCca = useEvaluationScoreCca();
  const [retry, setRetry] = useState(0);
  const projectKey = projects.map((p) => p.id + p.status).join(",");
  useEffect(() => {
    let active = true;
    setResult(null); setError(false); setPercentiles(null);
    getMyEvaluationSummary().then((value) => { if (active) setResult(value); })
      .catch(() => { if (active) setError(true); });
    // 상위 %는 보조 정보라 실패해도 요약은 그대로 보여 준다.
    dataRepository.getEvaluationPercentiles().then((value) => { if (active) setPercentiles(value); }).catch(() => {});
    return () => { active = false; };
  }, [currentMember?.userId, currentMember?.evalCount, currentMember?.score, projectKey, retry]);
  // The profile card (chart mode) leads with the pentagon, so the stats
  // above it step down a size to stay out of its way.
  const labelSize = chart ? "text-[10px]" : "text-xs";
  const valueSize = chart ? "text-base" : "text-xl";
  const trust = result ? collaborationTrust(result.score, result.count) : null;
  const caption = result?.score != null ? percentileCaption(percentiles) : null;
  return <section aria-label="내 평가 요약" className="p-4 mb-5" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
    <div className="flex items-start justify-between gap-2 mb-3"><h2 className={`font-700 ${chart ? "text-xs" : "text-sm"}`}>내 평가 및 참여 현황</h2><EvaluationInfoButton section="trust" /></div>
    {error ? <p role="alert" className="text-sm">평가 요약을 불러오지 못했습니다. <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>
      : !result ? <p role="status" className="text-sm">평가 요약을 불러오는 중…</p>
      : <>
        <div className={`grid grid-cols-2 ${chart ? "gap-2" : "gap-4"}`}>
          <div><div className={labelSize}>내 협업 신뢰도</div>
            <strong className={`${valueSize} inline-flex items-center gap-1.5`} style={{ color: "var(--primary)" }}>{result.score === null ? "공개 대기" : result.score.toFixed(1) + " / 10"}{result.score !== null && scoreCca && <CcaBadge />}</strong>
            {result.score !== null && <p className={labelSize}>{trust?.label} · {trust?.evidence}</p>}
            {caption && <p className={`${labelSize} font-700`} style={{ color: percentiles?.available ? "var(--primary)" : "var(--muted-foreground)" }}>{caption}</p>}</div>
          <div><div className={labelSize}>프로젝트 참여 횟수</div><strong className={valueSize}>{result.projectCount}회</strong></div>
          <div className="col-span-2"><div className={labelSize}>참여한 동료</div><strong className={valueSize}>{result.collaboratorCount}명</strong></div>
        </div>
        {chart && result.score !== null && <div className="flex justify-center"><PentagonChart size={290} data={criteriaChartData(result.criteria, percentiles)} /></div>}
      </>}
  </section>;
}
