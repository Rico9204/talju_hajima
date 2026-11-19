import type { ParticipationStats } from "../api/types";

// 남의 협업 점수가 아직 공개 기준(결과가 공개된 종료 평가 프로젝트 2개·평가한 동료 4명)에 못 미칠 때 점수 자리에 보여 준다.
// 첫 프로젝트 한 번의 점수가 꼬리표가 되지 않게 하려는 것이라, 부정적인 인상을 주지 않게 "수집 중"과 진행 정도만 보여 준다.
export default function EvaluationCollecting({ stats, compact = false }: { stats: ParticipationStats; compact?: boolean }) {
  const rows = [
    { label: "평가가 끝난 프로젝트", value: stats.evaluationProjects, need: stats.requiredProjects },
    { label: "평가한 동료", value: stats.evaluationEvaluators, need: stats.requiredEvaluators },
  ];
  return (
    <div className="p-3 text-xs" style={{ background: "var(--muted)", borderRadius: "10px" }}>
      <div className="font-700 mb-1" style={{ color: "var(--foreground)" }}>🌱 협업 기록 수집 중</div>
      {!compact && (
        <p className="mb-2" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          프로젝트를 몇 번 더 함께하면 협업 점수가 공개돼요. 한두 번의 평가로 판단하지 않도록 기준을 두고 있어요.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between mb-0.5" style={{ color: "var(--muted-foreground)" }}>
              <span>{r.label}</span>
              <span style={{ fontFamily: "var(--font-jetbrains)" }}>{Math.min(r.value, r.need)}/{r.need}</span>
            </div>
            <div className="h-1.5" style={{ background: "var(--border)", borderRadius: "4px" }}>
              <div className="h-1.5" style={{ width: `${Math.min(100, (r.value / Math.max(1, r.need)) * 100)}%`, background: "var(--primary)", borderRadius: "4px" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
