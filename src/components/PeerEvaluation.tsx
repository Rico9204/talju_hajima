import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProject } from "../context/ProjectContext";
import PentagonChart from "./PentagonChart";

const criteria = [
  { id: "role", label: "역할 이행", desc: "맡은 역할과 작업을 수행했는지", icon: "✓" },
  { id: "deadline", label: "약속 및 마감 준수", desc: "합의한 기한과 약속을 지켰는지", icon: "◷" },
  { id: "communication", label: "의사소통", desc: "요청·질문·진행 상황 공유에 적절히 응답했는지", icon: "◎" },
  { id: "collaboration", label: "협업 태도", desc: "팀 의사결정과 문제 해결 과정에 협조적으로 참여했는지", icon: "⊙" },
  { id: "quality", label: "결과물 품질", desc: "결과물의 완성도가 기대 수준을 충족했는지", icon: "★" },
];

// Each person still gets a 1-10 score per criterion, but the sum across all
// peers for a given criterion must land exactly on a shared pool:
// pool = peers.length * POOL_PER_PEER. Enforced at submit time via
// `allBalanced`, not by capping any individual person's score below 10.
const POOL_PER_PEER = 5;

interface Peer { name: string; avatar: string; major: string; color: string }

const peersByProject: Record<string, Peer[]> = {
  heritage: [
    { name: "박민준", avatar: "박", major: "문헌정보학과", color: "#f59e0b" },
    { name: "이서연", avatar: "이", major: "시각디자인학과", color: "#22c55e" },
    { name: "정하늘", avatar: "정", major: "역사문화학과", color: "#8b5cf6" },
    { name: "최현우", avatar: "최", major: "미디어커뮤니케이션학과", color: "#ef4444" },
  ],
  dialect: [
    { name: "박민준", avatar: "박", major: "문헌정보학과", color: "#f59e0b" },
    { name: "오유진", avatar: "오", major: "국어국문학과", color: "#2563eb" },
    { name: "한소민", avatar: "한", major: "국어국문학과", color: "#8b5cf6" },
  ],
};

interface CompletedEval {
  from: string; avatar: string; color: string;
  scores: Record<string, number>;
  reapply: boolean;
  comment: string;
  date: string;
}

const completedEvalsByProject: Record<string, CompletedEval[]> = {
  heritage: [],
  dialect: [
    {
      from: "박민준", avatar: "박", color: "#f59e0b",
      scores: { role: 8, deadline: 10, communication: 9, collaboration: 8, quality: 9 },
      reapply: true,
      comment: "일정 관리 능력이 뛰어나고 팀 전체를 잘 이끌어줬습니다.",
      date: "2026-06-20",
    },
    {
      from: "오유진", avatar: "오", color: "#2563eb",
      scores: { role: 9, deadline: 8, communication: 8, collaboration: 9, quality: 9 },
      reapply: true,
      comment: "주도적으로 역할을 수행하며 팀 분위기를 긍정적으로 이끌었습니다.",
      date: "2026-06-21",
    },
  ],
};

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
      {/* base rail */}
      <div className="absolute left-0 right-0" style={{ top: 15, height: 3, background: "var(--muted)", borderRadius: "4px" }} />
      {/* locked-out rail beyond the pool limit */}
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
      {/* filled rail up to the selected zone */}
      <div
        className="absolute left-0 transition-all"
        style={{ top: 15, height: 3, width: `${pctForIndex(clamped)}%`, background: "var(--primary)", borderRadius: "4px" }}
      />
      {/* per-zone ticks + numbers */}
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
      {/* thumb */}
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

export default function PeerEvaluation() {
  const { project, isShortTerm } = useProject();
  const peers = peersByProject[project.id] || [];
  const completedEvals = completedEvalsByProject[project.id] || [];
  const isDone = project.status === "done";
  const midtermSkipped = !isDone && isShortTerm;

  const [selectedPeer, setSelectedPeer] = useState<number>(0);
  const [scores, setScores] = useState<Record<string, Record<number, Scores>>>({});
  const [comments, setComments] = useState<Record<string, Record<number, string>>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const pid = project.id;
  const peerScores = scores[pid]?.[selectedPeer] || {};
  const peerComment = comments[pid]?.[selectedPeer] || "";
  const isSubmitted = submitted[pid] ?? false;
  const pool = peers.length * POOL_PER_PEER;

  function scoreFor(criterionId: string, peerIdx: number): number {
    return scores[pid]?.[peerIdx]?.[criterionId] ?? 1;
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
    if (isSubmitted || isDone) return;
    const clamped = Math.min(Math.max(value, 1), maxAllowed(criterionId, selectedPeer));
    setScores((p) => ({ ...p, [pid]: { ...p[pid], [selectedPeer]: { ...p[pid]?.[selectedPeer], [criterionId]: clamped } } }));
  }

  function submitEval() {
    if (!allBalanced) return;
    setSubmitted((p) => ({ ...p, [pid]: true }));
  }

  const allBalanced = peers.length > 0 && criteria.every((c) => criterionTotal(c.id) === pool);

  function avgScore(s: Scores) {
    const v = Object.values(s);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          동료 평가 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Peer Evaluation</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          {isDone
            ? "종료 평가(총괄) · 프로젝트 종료 후 공개된 결과"
            : midtermSkipped
            ? "2주 미만 단기 프로젝트 · 중간 점검 생략"
            : `중간 점검(형성적) · 항목별 1~10점, 단 동료 전체 합은 ${peers.length}명 × ${POOL_PER_PEER}점 = ${pool}점`}
        </p>
      </div>

      {/* Info strip */}
      <div
        className="flex items-center gap-3 px-4 py-3 mb-5 text-sm"
        style={{
          background: isDone ? "#22c55e12" : midtermSkipped ? "#7b82a812" : "#2563eb12",
          borderRadius: "12px",
          borderLeft: `3px solid ${isDone ? "#22c55e" : midtermSkipped ? "#7b82a8" : "var(--primary)"}`,
        }}
      >
        <div
          className="w-7 h-7 flex items-center justify-center text-base shrink-0"
          style={{ background: isDone ? "#22c55e18" : midtermSkipped ? "#7b82a818" : "#2563eb18", borderRadius: "8px", color: isDone ? "#22c55e" : midtermSkipped ? "#7b82a8" : "var(--primary)" }}
        >
          {isDone ? "★" : midtermSkipped ? "◷" : "◎"}
        </div>
        <div>
          {isDone ? (
            <>
              <strong>종료 평가</strong>는 총괄 평가입니다 — 제출된 결과는 <span style={{ color: "var(--muted-foreground)" }}>프로필 평판에 그대로 누적되며, 개별적으로 숨기거나 제외할 수 없습니다.</span>
            </>
          ) : midtermSkipped ? (
            <>
              프로젝트 기간이 <strong>2주 미만</strong>이라 <strong>중간 점검</strong>이 적용되지 않습니다 — <span style={{ color: "var(--muted-foreground)" }}>형성적 피드백을 반영할 시간이 부족한 단기 프로젝트는 중간 점검 없이 종료 평가로 바로 넘어갑니다.</span>
            </>
          ) : (
            <>
              <strong>중간 점검</strong>은 형성적 평가입니다 — 피드백 목적으로만 사용되며 <span style={{ color: "var(--muted-foreground)" }}>프로필 평판에 반영되지 않습니다. 종료 평가는 프로젝트 종료 후 활성화됩니다.</span>
            </>
          )}
        </div>
      </div>

      {midtermSkipped && (
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
        >
          <div className="text-3xl mb-3">◷</div>
          <div className="text-sm font-600">이 프로젝트는 중간 점검이 생략됩니다</div>
          <div className="text-sm mt-1">프로젝트 종료 후 종료 평가만 진행돼요</div>
        </div>
      )}

      {!isDone && !midtermSkipped && (
        <>
          {/* Shared-pool allocation status per criterion */}
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
            {/* Peer list */}
            <div className="col-span-2 flex flex-col gap-2.5">
              {peers.map((p, i) => {
                const peerTotal = criteria.reduce((sum, c) => sum + scoreFor(c.id, i), 0);
                const active = selectedPeer === i;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedPeer(i)}
                    className="flex items-center gap-3 p-4 text-left transition-all"
                    style={{
                      background: active ? "var(--primary)" : "var(--card)",
                      borderRadius: "var(--radius)",
                      boxShadow: active ? "0 8px 24px rgba(37,99,235,0.25)" : "var(--shadow-card)",
                      color: active ? "#fff" : "var(--foreground)",
                    }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700 shrink-0" style={{ background: active ? "rgba(255,255,255,0.2)" : `${p.color}18`, color: active ? "#fff" : p.color }}>
                      {p.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-700">{p.name}</div>
                      <div className="text-xs" style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>{p.major}</div>
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

            {/* Eval form */}
            <div className="col-span-3">
              <div className="p-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
                {/* Peer header */}
                <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: "2px solid var(--muted)" }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-700 text-lg" style={{ background: `${peers[selectedPeer]?.color}18`, color: peers[selectedPeer]?.color }}>
                    {peers[selectedPeer]?.avatar}
                  </div>
                  <div>
                    <div className="font-700">{peers[selectedPeer]?.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{peers[selectedPeer]?.major}</div>
                  </div>
                  {isSubmitted && (
                    <span className="ml-auto text-xs font-700 px-3 py-1.5" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}>
                      ✓ 제출 완료 (비공개)
                    </span>
                  )}
                </div>

                {/* Live score preview */}
                <div className="flex justify-center mb-4">
                  <PentagonChart
                    size={320}
                    data={criteria.map((c) => ({ label: c.label, value: peerScores[c.id] ?? 1 }))}
                  />
                </div>

                {/* Criteria */}
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
                      <ScoreTrack
                        value={current}
                        limit={capped}
                        disabled={isSubmitted}
                        onChange={(v) => handleScoreClick(c.id, v)}
                      />
                      {limitedByPool && !isSubmitted && (
                        <div className="text-xs mt-1.5 font-600" style={{ color: "#ef4444" }}>
                          다른 동료들에게 이미 많이 배분해서 이 항목은 {capped}점까지만 줄 수 있어요 (공유 점수 초과 방지)
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Comment */}
                <div className="mb-4">
                  <label className="text-sm font-700 block mb-1.5">
                    종합 코멘트 <span className="font-400 text-xs" style={{ color: "var(--muted-foreground)" }}>(선택 · 최대 150자)</span>
                  </label>
                  <textarea
                    disabled={isSubmitted}
                    value={peerComment}
                    onChange={(e) => e.target.value.length <= 150 && setComments((p) => ({ ...p, [pid]: { ...p[pid], [selectedPeer]: e.target.value } }))}
                    placeholder="건설적인 피드백을 간단히 작성해주세요..."
                    rows={2}
                    className="w-full text-sm p-3 resize-none outline-none"
                    style={{ border: "2px solid var(--muted)", borderRadius: "10px", background: isSubmitted ? "var(--muted)" : "var(--background)", fontFamily: "var(--font-outfit)" }}
                  />
                  <div className="text-right text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{peerComment.length}/150</div>
                </div>

                {!isSubmitted && (
                  <>
                    {!allBalanced && (
                      <div className="text-xs text-center mb-2" style={{ color: "var(--muted-foreground)" }}>
                        모든 항목의 공유 점수를 남김없이 다 나눠줘야 제출할 수 있어요 — 위 배분 현황에서 남은 점수를 확인해주세요.
                      </div>
                    )}
                    <button
                      onClick={submitEval}
                      disabled={!allBalanced}
                      className="w-full py-3 text-sm font-700 transition-all"
                      style={{
                        background: allBalanced ? "var(--primary)" : "var(--muted)",
                        color: allBalanced ? "#fff" : "var(--muted-foreground)",
                        borderRadius: "40px",
                        boxShadow: allBalanced ? "0 8px 20px rgba(37,99,235,0.3)" : "none",
                        cursor: allBalanced ? "pointer" : "not-allowed",
                      }}
                    >
                      전체 동료 평가 제출 (비공개)
                    </button>
                  </>
                )}
                {isSubmitted && (
                  <div className="text-xs text-center font-700" style={{ color: "#22c55e" }}>
                    ✓ 전체 동료 평가 제출 완료 (비공개)
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {isDone && (
        <div>
          {/* No-hide policy notice */}
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="text-xs font-700 px-2.5 py-1" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
              🔒 종료 평가는 숨기기 옵션이 없습니다 — 제출된 모든 평가가 예외 없이 공개됩니다
            </span>
          </div>

          {/* Summary */}
          <div
            className="p-6 mb-5"
            style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", borderRadius: "var(--radius)", boxShadow: "0 8px 32px rgba(37,99,235,0.3)", color: "#fff" }}
          >
            <div className="text-xs font-600 uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
              나에 대한 종료 평가 (김지수) · {project.name} · {completedEvals.length}건
            </div>
            {completedEvals.length > 0 ? (
              <>
                <div className="flex justify-center mb-2">
                  <PentagonChart
                    size={320}
                    gridColor="rgba(255,255,255,0.4)"
                    fillColor="#ffffff"
                    labelColor="#ffffff"
                    valueColor="rgba(255,255,255,0.85)"
                    data={criteria.map((c) => ({
                      label: c.label,
                      value: completedEvals.reduce((a, e) => a + e.scores[c.id], 0) / completedEvals.length,
                    }))}
                  />
                </div>
                <div className="flex items-baseline gap-2 justify-center">
                  <span className="text-4xl font-800" style={{ fontFamily: "var(--font-outfit)" }}>
                    {(completedEvals.reduce((sum, e) => sum + avgScore(e.scores), 0) / completedEvals.length).toFixed(1)}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>/ 10.0 이 프로젝트 협업 평점</span>
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>아직 제출된 종료 평가가 없습니다.</p>
            )}
          </div>

          {/* Per-eval cards */}
          <div className="flex flex-col gap-4">
            {completedEvals.map((ev, i) => (
              <div key={i} className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700" style={{ background: `${ev.color}18`, color: ev.color }}>{ev.avatar}</div>
                    <div>
                      <div className="text-sm font-700">{ev.from}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{ev.date}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 flex-wrap">
                    {criteria.map((c) => (
                      <div key={c.id} className="text-center">
                        <div className="text-lg font-800" style={{ color: "var(--primary)", fontFamily: "var(--font-outfit)" }}>{ev.scores[c.id]}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{c.label}</div>
                      </div>
                    ))}
                    <div className="text-center">
                      <div className="text-xs font-700 px-2.5 py-1" style={{ background: ev.reapply ? "#22c55e18" : "var(--muted)", color: ev.reapply ? "#22c55e" : "var(--muted-foreground)", borderRadius: "20px" }}>
                        {ev.reapply ? "재참여 ✓" : "미표시"}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>재참여 의사</div>
                    </div>
                  </div>
                </div>
                {ev.comment && (
                  <p className="text-sm leading-relaxed px-3 py-2.5" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--muted-foreground)" }}>
                    "{ev.comment}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
