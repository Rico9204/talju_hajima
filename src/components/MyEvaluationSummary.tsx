import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";
import type { MyEvaluationSummary as Summary } from "../lib/evaluationSummary";
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
  return <section aria-label="내 평가 요약" className="p-4 mb-5" style={{ background: "var(--card)", borderRadius: "var(--radius)" }}>
    <h2 className="text-sm font-700 mb-3">내 평가 및 참여 현황</h2>
    {error ? <p role="alert" className="text-sm">평가 요약을 불러오지 못했습니다. <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>
      : !result ? <p role="status" className="text-sm">평가 요약을 불러오는 중…</p>
      : <>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-xs">내 평가 평균</div><strong className="text-xl" style={{ color: "var(--primary)" }}>{result.score === null ? "공개 대기" : result.score.toFixed(1) + " / 10"}</strong><p className="text-xs">받은 최종 평가 {result.count}건 기준</p></div>
          <div><div className="text-xs">프로젝트 참여 횟수</div><strong className="text-xl">{result.projectCount}회</strong><p className="text-xs">진행 중·종료 포함</p></div>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>전체 참여 프로젝트의 최종 평가 평균입니다. 중간 평가는 포함하지 않습니다. 프로젝트마다 동료 2명 이상이 모두 제출해야 평균이 공개됩니다.</p>
        {chart && result.score !== null && <div className="flex justify-center"><PentagonChart size={230} data={[{ label: "역할 이행", value: result.criteria.role }, { label: "약속·마감 준수", value: result.criteria.deadline }, { label: "의사소통", value: result.criteria.communication }, { label: "협업 태도", value: result.criteria.collaboration }, { label: "결과물 품질", value: result.criteria.quality }]} /></div>}
      </>}
  </section>;
}
