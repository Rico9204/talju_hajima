import { useEffect, useMemo, useState } from "react";
import { dataRepository } from "../api";
import type { AdminEvaluationRow, Member } from "../api/types";

// 승인 담당 교수의 동료 평가 열람(성적 반영용): 받은 사람별로 누가 몇 점을 줬는지와 평균, 미제출자.
// 팀장·팀원에게는 공개하지 않는 정보라 관리자 화면(내가 승인한 프로젝트의 팀원 관리)에서만 보인다. 권한은 DB가 다시 검사한다.
const CRITERIA: { key: keyof AdminEvaluationRow["criteria"]; label: string }[] = [
  { key: "role", label: "역할" },
  { key: "deadline", label: "마감" },
  { key: "communication", label: "소통" },
  { key: "collaboration", label: "협업" },
  { key: "quality", label: "품질" },
];
const avgOf = (c: AdminEvaluationRow["criteria"]) => (c.role + c.deadline + c.communication + c.collaboration + c.quality) / 5;

export default function AdminProjectEvaluations({ projectId, members }: { projectId: string; members: Member[] }) {
  const [rows, setRows] = useState<AdminEvaluationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"final" | "midterm">("final");

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    dataRepository.listAdminProjectEvaluations(projectId)
      .then((list) => {
        if (!active) return;
        setRows(list);
        if (!list.some((r) => r.phase === "final") && list.some((r) => r.phase === "midterm")) setPhase("midterm");
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "평가를 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [projectId]);

  const evaluators = members.filter((m) => m.userId);
  const shown = useMemo(() => (rows ?? []).filter((r) => r.phase === phase), [rows, phase]);
  const byRecipient = useMemo(() => {
    const map = new Map<string, AdminEvaluationRow[]>();
    for (const r of shown) map.set(r.recipientId, [...(map.get(r.recipientId) ?? []), r]);
    return map;
  }, [shown]);
  const submitted = new Set(shown.map((r) => r.evaluatorId));
  const missing = evaluators.filter((m) => !submitted.has(m.id));

  return (
    <section className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }} aria-label="동료 평가 열람">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-sm font-700">동료 평가 열람</h4>
        <div role="tablist" className="inline-flex p-0.5" style={{ background: "var(--muted)", borderRadius: "20px" }}>
          {(["final", "midterm"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={phase === p} onClick={() => setPhase(p)}
              className="text-[11px] font-600 px-3 py-1"
              style={{ borderRadius: "16px", background: phase === p ? "var(--surface-opaque)" : "transparent", color: phase === p ? "var(--foreground)" : "var(--muted-foreground)" }}>
              {p === "final" ? "종료 평가" : "중간 점검"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        🔒 성적 반영을 위해 승인 담당 교수에게만 보여요. 팀장·팀원에게는 누가 몇 점을 줬는지 공개되지 않아요.
      </p>

      {error && <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
      {!error && rows === null && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>}
      {!error && rows !== null && (
        <>
          <p className="text-xs mb-2" style={{ color: missing.length ? "var(--warning-text)" : "var(--muted-foreground)" }}>
            제출 {evaluators.length - missing.length}/{evaluators.length}명{missing.length ? ` · 미제출: ${missing.map((m) => m.name).join(", ")}` : ""}
          </p>
          {byRecipient.size === 0 ? (
            <p className="text-xs p-3" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--muted-foreground)" }}>아직 제출된 {phase === "final" ? "종료 평가" : "중간 점검"}가 없어요.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {[...byRecipient.entries()].map(([recipientId, list]) => {
                const mean = list.reduce((s, r) => s + avgOf(r.criteria), 0) / list.length;
                return (
                  <div key={recipientId} className="p-3" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      <span className="text-sm font-700">{list[0].recipientName}</span>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>평균 <strong style={{ color: "var(--primary-text)", fontFamily: "var(--font-jetbrains)" }}>{mean.toFixed(2)}</strong> · {list.length}명 평가</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]" style={{ fontFamily: "var(--font-jetbrains)" }}>
                        <thead>
                          <tr style={{ color: "var(--muted-foreground)" }}>
                            <th className="text-left font-600 py-0.5 pr-2" style={{ fontFamily: "var(--font-outfit)" }}>평가한 사람</th>
                            {CRITERIA.map((c) => <th key={c.key} className="font-600 px-1" style={{ fontFamily: "var(--font-outfit)" }}>{c.label}</th>)}
                            <th className="font-600 pl-1" style={{ fontFamily: "var(--font-outfit)" }}>평균</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((r) => (
                            <tr key={r.evaluatorId} className="border-t" style={{ borderColor: "var(--border)" }}>
                              <td className="py-1 pr-2 truncate max-w-[7rem]" style={{ fontFamily: "var(--font-outfit)" }}>{r.evaluatorName}</td>
                              {CRITERIA.map((c) => <td key={c.key} className="text-center px-1">{r.criteria[c.key]}</td>)}
                              <td className="text-center pl-1 font-700">{avgOf(r.criteria).toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {phase === "midterm" && list.some((r) => r.comment.trim()) && (
                      <ul className="mt-2 flex flex-col gap-1 text-xs">
                        {list.filter((r) => r.comment.trim()).map((r) => (
                          <li key={r.evaluatorId} style={{ lineHeight: 1.5 }}><span className="font-600">{r.evaluatorName}:</span> {r.comment}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
