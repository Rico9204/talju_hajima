import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";
import type { MyEvaluationSummary as Summary } from "../lib/evaluationSummary";
import { collaborationTrust } from "../lib/collaborationTrust";
import PentagonChart from "./PentagonChart";

export default function MyEvaluationSummary({ chart = false }: { chart?: boolean }) {
  const { getMyEvaluationSummary, currentMember, projects } = useProject();
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const projectKey = projects.map((p) => p.id + p.status).join(",");
  useEffect(() => {
    let active = true;
    setResult(null); setError(false);
    getMyEvaluationSummary().then((value) => { if (active) setResult(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [currentMember?.userId, currentMember?.evalCount, currentMember?.score, projectKey, retry]);
  // The profile card (chart mode) leads with the pentagon, so the stats
  // above it step down a size to stay out of its way.
  const labelSize = chart ? "text-[10px]" : "text-xs";
  const valueSize = chart ? "text-base" : "text-xl";
  const trust = result ? collaborationTrust(result.score, result.count) : null;
  return <section aria-label="내 평가 요약" className="p-4 mb-5" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
    <h2 className={`font-700 mb-3 ${chart ? "text-xs" : "text-sm"}`}>내 평가 및 참여 현황</h2>
    {error ? <p role="alert" className="text-sm">평가 요약을 불러오지 못했습니다. <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>
      : !result ? <p role="status" className="text-sm">평가 요약을 불러오는 중…</p>
      : <>
        <div className={`grid grid-cols-2 ${chart ? "gap-2" : "gap-4"}`}>
          <div><div className={labelSize}>내 협업 신뢰도</div><strong className={valueSize} style={{ color: "var(--primary)" }}>{result.score === null ? "공개 대기" : result.score.toFixed(1) + " / 10"}</strong><p className={labelSize}>{trust?.label} · {trust?.evidence}</p></div>
          <div><div className={labelSize}>프로젝트 참여 횟수</div><strong className={valueSize}>{result.projectCount}회</strong><p className={labelSize}>종료된 프로젝트 기준</p></div>
          <div className="col-span-2"><div className={labelSize}>참여한 동료</div><strong className={valueSize}>{result.collaboratorCount}명</strong><p className={labelSize}>종료된 프로젝트에서 함께한 인원 (중복 제외)</p></div>
        </div>
        <p className={`${labelSize} ${chart ? "mt-2" : "mt-3"}`} style={{ color: "var(--muted-foreground)" }}>최종 평가 평균과 평가 건수를 함께 표시한 협업 참고 지표입니다. 중간 평가는 포함하지 않습니다.</p>
        {chart && result.score !== null && <div className="flex justify-center"><PentagonChart size={290} data={[{ label: "역할 이행", value: result.criteria.role }, { label: "약속·마감 준수", value: result.criteria.deadline }, { label: "의사소통", value: result.criteria.communication }, { label: "협업 태도", value: result.criteria.collaboration }, { label: "결과물 품질", value: result.criteria.quality }]} /></div>}
      </>}
  </section>;
}
