import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProject } from "../context/ProjectContext";
import { getEvaluations, submitEvaluations } from "../api/backend/evaluations";
import type { EvaluationAverage, EvaluationPhase } from "../api/types";
import PentagonChart from "./PentagonChart";

const criteria = [
  { id: "role", label: "역할 이행", desc: "맡은 역할과 작업을 수행했는지", icon: "✓" },
  { id: "deadline", label: "약속 및 마감 준수", desc: "합의한 기한과 약속을 지켰는지", icon: "◷" },
  { id: "communication", label: "의사소통", desc: "요청·질문·진행 상황 공유에 적절히 응답했는지", icon: "◎" },
  { id: "collaboration", label: "협업 태도", desc: "팀 의사결정과 문제 해결 과정에 협조적으로 참여했는지", icon: "⊙" },
  { id: "quality", label: "결과물 품질", desc: "결과물의 완성도가 기대 수준을 충족했는지", icon: "★" },
] as const;

// Each person still gets a 1-10 score per criterion, but the sum across all
// peers for a given criterion must land exactly on a shared pool:
// pool = peers.length * POOL_PER_PEER. Enforced at submit time via
// `allBalanced`, not by capping any individual person's score below 10.
const POOL_PER_PEER = 5;

type Scores = Record<string, number>;

// One continuous track over a fixed min..max range (1..10 per person) —
// click anywhere or drag across it and the value snaps to whichever zone
// the pointer is over. The scale always shows the same 1..max range, but
// zones above `limit` (the shared-pool ceiling for this peer right now)
// are dimmed and unselectable, so the visible scale stays consistent while
// what you can actually pick shrinks as the pool gets used up.
function ScoreTrack({
  value, min = 1, max = 10, limit, onChange, disabled,
}: { value: number; min?: number; max?: number; limit?: number; onChange: (v: number) => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const steps = max - min + 1;
  const effectiveLimit = Math.min(limit ?? max, max);
  const clamped = Math.min(Math.max(value, min), effectiveLimit);

  function zoneFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return clamped;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.999999);
    const raw = min + Math.min(Math.floor(ratio * steps), steps - 1);
    return Math.min(raw, effectiveLimit);
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(zoneFromClientX(e.clientX));
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || e.buttons !== 1) return;
    onChange(zoneFromClientX(e.clientX));
  }

  const pctForIndex = (i: number) => ((i - min + 0.5) / steps) * 100;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className="relative h-10 select-none"
      style={{ touchAction: "none", cursor: disabled ? "default" : "pointer" }}
    >
      <div className="absolute left-0 right-0" style={{ top: 15, height: 3, background: "var(--muted)", borderRadius: "4px" }} />
      {effectiveLimit < max && (
        <div
          className="absolute right-0"
          style={{
            top: 15,
            height: 3,
            width: `${100 - pctForIndex(effectiveLimit) - (0.5 / steps) * 100}%`,
            background: "repeating-linear-gradient(45deg, #ef444440 0, #ef444440 3px, transparent 3px, transparent 6px)",
            borderRadius: "4px",
          }}
        />
      )}
      <div
        className="absolute left-0 transition-all"
        style={{ top: 15, height: 3, width: `${pctForIndex(clamped)}%`, background: "var(--primary)", borderRadius: "4px" }}
      />
      {Array.from({ length: steps }, (_, i) => min + i).map((v) => {
        const isSel = clamped === v;
        const locked = v > effectiveLimit;
        return (
          <div
            key={v}
            className="absolute flex flex-col items-center pointer-events-none"
            style={{ left: `${pctForIndex(v)}%`, top: 8, transform: "translateX(-50%)", opacity: locked ? 0.35 : 1 }}
          >
            <div style={{ width: 1, height: 8, background: isSel ? "var(--primary)" : locked ? "#ef4444" : "var(--border)" }} />
            <div className="text-[10px] font-700 mt-1" style={{ color: isSel ? "var(--primary)" : locked ? "#ef4444" : "var(--muted-foreground)" }}>{v}</div>
          </div>
        );
      })}
      <div
        className="absolute rounded-full transition-all"
        style={{
          left: `${pctForIndex(clamped)}%`,
          top: 16.5,
          width: 13,
          height: 13,
          marginLeft: -6.5,
          marginTop: -6.5,
          background: "var(--primary)",
          border: "2px solid var(--card)",
          boxShadow: "0 2px 6px rgba(37,99,235,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

const PHASES: { id: EvaluationPhase; label: string }[] = [
  { id: "midterm", label: "중간 평가" },
  { id: "final", label: "최종 평가" },
];

export default function PeerEvaluation() {
  const { project, team, currentMember } = useProject();
  const peers = team.members.filter((m) => m.id !== currentMember?.id && m.userId !== null);

  const [phase, setPhase] = useState<EvaluationPhase>("midterm");
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [average, setAverage] = useState<EvaluationAverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // phase별로 따로 유지 — 탭을 오가도 입력한 점수/코멘트가 남아있게.
  const [scoresByPhase, setScoresByPhase] = useState<Record<EvaluationPhase, Record<number, Scores>>>({ midterm: {}, final: {} });
  const [commentsByPhase, setCommentsByPhase] = useState<Record<EvaluationPhase, Record<number, string>>>({ midterm: {}, final: {} });
  const [selectedPeer, setSelectedPeer] = useState(0);

  const scores = scoresByPhase[phase];
  const comments = commentsByPhase[phase];
  const peerScores = scores[selectedPeer] || {};
  const peerComment = comments[selectedPeer] || "";
  const pool = peers.length * POOL_PER_PEER;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEvaluations(project.id, phase)
      .then((data) => {
        if (cancelled) return;
        setSubmitted(data.submitted);
        setAverage(data.average);
      })
      .catch(() => {
        if (!cancelled) setError("평가 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, phase]);

  function scoreFor(criterionId: string, peerIdx: number): number {
    return scores[peerIdx]?.[criterionId] ?? 1;
  }

  function criterionTotal(criterionId: string): number {
    return peers.reduce((sum, _, i) => sum + scoreFor(criterionId, i), 0);
  }

  function othersTotal(criterionId: string, excludeIdx: number): number {
    return peers.reduce((sum, _, i) => (i === excludeIdx ? sum : sum + scoreFor(criterionId, i)), 0);
  }

  // The most this peer can take for this criterion without pushing the
  // shared total past the pool — never above the flat per-person cap of 10.
  function maxAllowed(criterionId: string, peerIdx: number): number {
    return Math.max(1, Math.min(10, pool - othersTotal(criterionId, peerIdx)));
  }

  function handleScoreClick(criterionId: string, value: number) {
    if (submitted) return;
    const clamped = Math.min(Math.max(value, 1), maxAllowed(criterionId, selectedPeer));
    setScoresByPhase((p) => ({ ...p, [phase]: { ...p[phase], [selectedPeer]: { ...p[phase][selectedPeer], [criterionId]: clamped } } }));
  }

  const allBalanced = peers.length > 0 && criteria.every((c) => criterionTotal(c.id) === pool);

  async function submitEval() {
    if (!allBalanced || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitEvaluations(
        project.id,
        phase,
        peers.map((peer, i) => ({
          recipientId: peer.id,
          role: scoreFor("role", i),
          deadline: scoreFor("deadline", i),
          communication: scoreFor("communication", i),
          collaboration: scoreFor("collaboration", i),
          quality: scoreFor("quality", i),
          comment: comments[i] ?? "",
        })),
      );
      const fresh = await getEvaluations(project.id, phase);
      setSubmitted(fresh.submitted);
      setAverage(fresh.average);
    } catch (err) {
      setError(err instanceof Error ? err.message : "제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          동료 평가 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Peer Evaluation</h1>
      </div>

      <div className="flex gap-1.5 mb-5 p-1 w-fit" style={{ background: "var(--muted)", borderRadius: "10px" }}>
        {PHASES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPhase(p.id)}
            className="text-xs font-700 px-4 py-1.5 transition-all"
            style={{ background: phase === p.id ? "var(--card)" : "transparent", color: phase === p.id ? "var(--primary)" : "var(--muted-foreground)", borderRadius: "7px", boxShadow: phase === p.id ? "var(--shadow-card)" : "none" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        className="flex items-center gap-3 px-4 py-3 mb-5 text-sm"
        style={{
          background: phase === "final" ? "#22c55e12" : "#2563eb12",
          borderRadius: "12px",
          borderLeft: `3px solid ${phase === "final" ? "#22c55e" : "var(--primary)"}`,
        }}
      >
        <div
          className="w-7 h-7 flex items-center justify-center text-base shrink-0"
          style={{ background: phase === "final" ? "#22c55e18" : "#2563eb18", borderRadius: "8px", color: phase === "final" ? "#22c55e" : "var(--primary)" }}
        >
          {phase === "final" ? "★" : "◎"}
        </div>
        <div>
          {phase === "final" ? (
            <>
              <strong>최종 평가</strong>는 점수만 남깁니다(코멘트 없음) — <span style={{ color: "var(--muted-foreground)" }}>팀원 전체에게 공개되며, 팀원 전원이 나를 평가하면 내 평균 점수가 공개됩니다.</span>
            </>
          ) : (
            <>
              <strong>중간 평가</strong>는 나와 상대방만 볼 수 있는 비공개 피드백입니다 — <span style={{ color: "var(--muted-foreground)" }}>팀원 전원이 나를 평가하면 내 평균 점수와 코멘트가 나에게만 공개됩니다.</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>불러오는 중...</div>
      ) : peers.length === 0 ? (
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
        >
          <div className="text-3xl mb-3">◎</div>
          <div className="text-sm font-600">아직 평가할 동료가 없어요</div>
          <div className="text-sm mt-1">팀원을 초대하면 동료 평가를 진행할 수 있어요</div>
        </div>
      ) : submitted ? (
        <div>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="text-xs font-700 px-2.5 py-1" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
              ✓ 이번 {phase === "final" ? "최종" : "중간"} 평가를 이미 제출했습니다 (수정 불가)
            </span>
          </div>
          <div
            className="p-6 mb-5"
            style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", borderRadius: "var(--radius)", boxShadow: "0 8px 32px rgba(37,99,235,0.3)", color: "#fff" }}
          >
            <div className="text-xs font-600 uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
              나에 대한 {phase === "final" ? "최종" : "중간"} 평가 ({currentMember?.name ?? "참여자"}) · {project.name}
            </div>
            {average?.available ? (
              <>
                <div className="flex justify-center mb-2">
                  <PentagonChart
                    size={320}
                    gridColor="rgba(255,255,255,0.4)"
                    fillColor="#ffffff"
                    labelColor="#ffffff"
                    valueColor="rgba(255,255,255,0.85)"
                    data={criteria.map((c) => ({ label: c.label, value: average.criteria?.[c.id] ?? 0 }))}
                  />
                </div>
                <div className="flex items-baseline gap-2 justify-center mb-3">
                  <span className="text-4xl font-800" style={{ fontFamily: "var(--font-outfit)" }}>{average.score?.toFixed(1)}</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>/ 10.0 · {average.count}명 응답</span>
                </div>
                {average.comments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {average.comments.map((c, i) => (
                      <p key={i} className="text-sm leading-relaxed px-3 py-2.5" style={{ background: "rgba(255,255,255,0.12)", borderRadius: "10px" }}>
                        "{c}"
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                아직 나를 평가한 팀원이 {peers.length}명 중 일부뿐이에요 — 전원이 제출하면 익명 평균이 공개됩니다.
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 py-4 mb-5" style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "var(--shadow-card)" }}>
            <div className="text-xs font-600 mb-3" style={{ color: "var(--muted-foreground)" }}>
              항목별 공유 점수 배분 현황 · 동료 {peers.length}명 × {POOL_PER_PEER}점 = 총 {pool}점
            </div>
            <div className="grid grid-cols-5 gap-3">
              {criteria.map((c) => {
                const used = criterionTotal(c.id);
                const balanced = used === pool;
                return (
                  <div key={c.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-600">{c.label}</span>
                      <span style={{ fontFamily: "var(--font-jetbrains)", color: balanced ? "#22c55e" : "var(--primary)" }}>{used}/{pool}</span>
                    </div>
                    <div className="h-1.5 w-full" style={{ background: "var(--muted)", borderRadius: "4px" }}>
                      <div
                        className="h-1.5 transition-all"
                        style={{
                          width: `${pool > 0 ? Math.min((used / pool) * 100, 100) : 0}%`,
                          background: balanced ? "#22c55e" : "linear-gradient(90deg, var(--primary), #60a5fa)",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-5">
            <div className="col-span-2 flex flex-col gap-2.5">
              {peers.map((p, i) => {
                const peerTotal = criteria.reduce((sum, c) => sum + scoreFor(c.id, i), 0);
                const active = selectedPeer === i;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPeer(i)}
                    className="flex items-center gap-3 p-4 text-left transition-all"
                    style={{
                      background: active ? "var(--primary)" : "var(--card)",
                      borderRadius: "var(--radius)",
                      boxShadow: active ? "0 8px 24px rgba(37,99,235,0.25)" : "var(--shadow-card)",
                      color: active ? "#fff" : "var(--foreground)",
                    }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700 shrink-0 overflow-hidden" style={{ background: p.avatarUrl ? "var(--card)" : active ? "rgba(255,255,255,0.2)" : `${p.color}18`, color: active ? "#fff" : p.color }}>
                      {p.avatarUrl ? <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" /> : p.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-700 truncate">{p.name}</div>
                      <div className="text-xs truncate" style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>{p.major || p.role}</div>
                    </div>
                    <span
                      className="text-xs px-2.5 py-1 font-700 shrink-0"
                      style={{ background: active ? "rgba(255,255,255,0.2)" : "var(--muted)", color: active ? "#fff" : "var(--muted-foreground)", borderRadius: "20px", fontFamily: "var(--font-jetbrains)" }}
                    >
                      {peerTotal}점
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="col-span-3">
              <div className="p-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: "2px solid var(--muted)" }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-700 text-lg overflow-hidden" style={{ background: peers[selectedPeer]?.avatarUrl ? "var(--muted)" : `${peers[selectedPeer]?.color}18`, color: peers[selectedPeer]?.color }}>
                    {peers[selectedPeer]?.avatarUrl ? <img src={peers[selectedPeer].avatarUrl!} alt={peers[selectedPeer].name} className="w-full h-full object-cover" /> : peers[selectedPeer]?.avatar}
                  </div>
                  <div>
                    <div className="font-700">{peers[selectedPeer]?.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{peers[selectedPeer]?.major || peers[selectedPeer]?.role}</div>
                  </div>
                </div>

                <div className="flex justify-center mb-4">
                  <PentagonChart size={320} data={criteria.map((c) => ({ label: c.label, value: peerScores[c.id] ?? 1 }))} />
                </div>

                {criteria.map((c) => {
                  const current = peerScores[c.id] ?? 1;
                  const totalForCriterion = criterionTotal(c.id);
                  const remainingUnallocated = pool - totalForCriterion;
                  const capped = maxAllowed(c.id, selectedPeer);
                  const limitedByPool = capped < 10;
                  return (
                    <div key={c.id} className="mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 flex items-center justify-center text-xs" style={{ background: "var(--secondary)", borderRadius: "7px", color: "var(--primary)" }}>{c.icon}</span>
                        <span className="text-sm font-700">{c.label}</span>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{c.desc}</span>
                        <span className="ml-auto text-xs font-700 text-right" style={{ color: "var(--primary)", fontFamily: "var(--font-jetbrains)" }}>
                          {current}점 <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(전체 남음 {remainingUnallocated}점)</span>
                        </span>
                      </div>
                      <ScoreTrack value={current} limit={capped} onChange={(v) => handleScoreClick(c.id, v)} />
                      {limitedByPool && (
                        <div className="text-xs mt-1.5 font-600" style={{ color: "#ef4444" }}>
                          다른 동료들에게 이미 많이 배분해서 이 항목은 {capped}점까지만 줄 수 있어요 (공유 점수 초과 방지)
                        </div>
                      )}
                    </div>
                  );
                })}

                {phase === "midterm" && (
                  <div className="mb-4">
                    <label className="text-sm font-700 block mb-1.5">
                      종합 코멘트 <span className="font-400 text-xs" style={{ color: "var(--muted-foreground)" }}>(선택 · 최대 150자)</span>
                    </label>
                    <textarea
                      value={peerComment}
                      onChange={(e) => e.target.value.length <= 150 && setCommentsByPhase((p) => ({ ...p, [phase]: { ...p[phase], [selectedPeer]: e.target.value } }))}
                      placeholder="건설적인 피드백을 간단히 작성해주세요..."
                      rows={2}
                      className="w-full text-sm p-3 resize-none outline-none"
                      style={{ border: "2px solid var(--muted)", borderRadius: "10px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
                    />
                    <div className="text-right text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{peerComment.length}/150</div>
                  </div>
                )}

                {!allBalanced && (
                  <div className="text-xs text-center mb-2" style={{ color: "var(--muted-foreground)" }}>
                    모든 항목의 공유 점수를 남김없이 다 나눠줘야 제출할 수 있어요 — 위 배분 현황에서 남은 점수를 확인해주세요.
                  </div>
                )}
                <button
                  onClick={submitEval}
                  disabled={!allBalanced || submitting}
                  className="w-full py-3 text-sm font-700 transition-all"
                  style={{
                    background: allBalanced && !submitting ? "var(--primary)" : "var(--muted)",
                    color: allBalanced && !submitting ? "#fff" : "var(--muted-foreground)",
                    borderRadius: "40px",
                    boxShadow: allBalanced && !submitting ? "0 8px 20px rgba(37,99,235,0.3)" : "none",
                    cursor: allBalanced && !submitting ? "pointer" : "not-allowed",
                  }}
                >
                  {submitting ? "제출 중..." : `전체 동료 평가 제출 (${phase === "final" ? "공개" : "비공개"})`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
