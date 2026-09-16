import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProject } from "../context/ProjectContext";
import type { EvaluationData, EvaluationEntry, EvaluationPhase } from "../api/types";
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
  value, min = 1, max = 10, limit, onChange, disabled, label,
}: { value: number; min?: number; max?: number; limit?: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
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
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={effectiveLimit}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        const next = e.key === "Home" ? min : e.key === "End" ? effectiveLimit
          : ["ArrowRight", "ArrowUp"].includes(e.key) ? value + 1
          : ["ArrowLeft", "ArrowDown"].includes(e.key) ? value - 1 : null;
        if (next !== null) { e.preventDefault(); onChange(Math.min(effectiveLimit, Math.max(min, next))); }
      }}
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

const emptyEntry = (id: string): EvaluationEntry => ({
  recipient_id: id, role: 1, deadline: 1, communication: 1, collaboration: 1, quality: 1, comment: "",
});
function errorMessage(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "요청에 실패했습니다.";
  if (/peer_evaluation|schema cache|complete_evaluation_project/.test(message)) {
    return "평가 기능을 불러오지 못했습니다. 관리자에게 평가 기능의 DB 설정 확인을 요청해 주세요.";
  }
  return message;
}
export default function PeerEvaluation() {
  const { project, currentMember } = useProject();
  return <EvaluationSelector key={project.id + ":" + project.status + ":" + currentMember?.id} />;
}
function EvaluationSelector() {
  const { project, getEvaluationMode } = useProject();
  const [prototype, setPrototype] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [phase, setPhase] = useState<EvaluationPhase>(project.status === "done" ? "final" : "midterm");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    getEvaluationMode().then((enabled) => { if (active) setPrototype(enabled); })
      .catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [retry]);
  if (error) return <div role="alert" className="p-6">{error} <button onClick={() => setRetry((n) => n + 1)}>다시 불러오기</button></div>;
  if (prototype === null) return <p role="status" className="p-6">평가 설정을 불러오는 중…</p>;
  const phases: EvaluationPhase[] = prototype ? ["midterm", "final"] : [phase];
  return <div>
    {prototype && <div className="px-4 pt-4 md:px-6 max-w-5xl mx-auto">
      <p className="text-sm mb-3">프로토타입 검증 모드 · 기간과 프로젝트 상태에 관계없이 두 평가를 선택할 수 있습니다. 제출한 최종 평가는 팀에 공개되고 평판에 반영됩니다.</p>
      <div role="tablist" aria-label="평가 유형" className="flex gap-2">
        {phases.map((value) => <button key={value} type="button" role="tab" id={"evaluation-tab-" + value}
          aria-selected={phase === value} aria-controls={"evaluation-panel-" + value} disabled={submitting}
          onClick={() => setPhase(value)} className="px-5 py-2 rounded-full disabled:opacity-50"
          style={{ background: phase === value ? "var(--primary)" : "var(--muted)", color: phase === value ? "#fff" : "var(--foreground)" }}>
          {value === "midterm" ? "중간 평가" : "최종 평가"}
        </button>)}
      </div>
    </div>}
    {phases.map((value) => <div key={value} hidden={phase !== value} role={prototype ? "tabpanel" : undefined}
      id={"evaluation-panel-" + value} aria-labelledby={prototype ? "evaluation-tab-" + value : undefined}>
      <EvaluationPanel phase={value} prototype={prototype} active={phase === value} onBusyChange={setSubmitting} />
    </div>)}
  </div>;
}
function EvaluationPanel({ phase, prototype, active, onBusyChange }: {
  phase: EvaluationPhase; prototype: boolean; active: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { project, team, currentMember, isLeader, isShortTerm, getEvaluations, submitEvaluations, completeProject } = useProject();
  const skipped = !prototype && phase === "midterm" && isShortTerm;
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [data, setData] = useState<EvaluationData | null>(null);
  const [draft, setDraft] = useState<Record<string, EvaluationEntry>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewedMemberId, setViewedMemberId] = useState(currentMember?.id ?? "");
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    setError("");
    getEvaluations(phase).then((result) => {
      if (mounted) setData(result);
    }).catch((e) => { if (mounted) setError(errorMessage(e)); });
    return () => { mounted = false; };
    // Each phase keeps its own draft; project/account changes remount the selector.
  }, [phase, refresh, active]);
  const submitted = saved || !!data?.submitted;
  const peers = team.members.filter((m) => submitted
    ? data?.records.some((r) => r.evaluator_id === currentMember?.id && r.recipient_id === m.id)
    : m.id !== currentMember?.id && m.userId !== null);
  const entries = peers.map((peer) => {
    const previous = data?.records.find((r) => r.evaluator_id === currentMember?.id && r.recipient_id === peer.id);
    return submitted && previous ? previous : draft[peer.id] ?? emptyEntry(peer.id);
  });
  const pool = peers.length * 5;
  const total = (key: typeof criteria[number]["id"]) => entries.reduce((sum, entry) => sum + entry[key], 0);
  const balanced = peers.length > 0 && criteria.every((c) => total(c.id) === pool);
  const received = data?.records.filter((r) => r.recipient_id === (phase === "final" ? viewedMemberId : currentMember?.id)) ?? [];
  const memberName = (id: string) => team.members.find((m) => m.id === id)?.name ?? "팀원";
  async function submit() {
    if (!data || !currentMember || busy || submitted || !balanced || skipped) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      await submitEvaluations(phase, entries);
      setSaved(true);
      setRefresh((n) => n + 1);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function closeProject() {
    setBusy(true); setError("");
    try { await completeProject(); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  }

  const selectedPeer = Math.max(0, peers.findIndex((peer) => peer.id === selectedPeerId));
  const selectedEntry = entries[selectedPeer];
  const peerScores: Scores = Object.fromEntries(criteria.map((c) => [c.id, selectedEntry?.[c.id] ?? 1]));
  const peerComment = selectedEntry?.comment ?? "";
  const isDone = phase === "final";
  const midtermSkipped = skipped;
  const isSubmitted = submitted;
  const allBalanced = balanced;
  const criterionTotal = total;
  const submitEval = submit;
  const completedEvals = received.map((record) => {
    const author = team.members.find((m) => m.id === record.evaluator_id);
    return {
      from: author?.name ?? "팀원", avatar: author?.avatar ?? "팀", color: author?.color ?? "#2563eb",
      scores: Object.fromEntries(criteria.map((c) => [c.id, record[c.id]])),
      reapply: false, comment: record.comment, date: new Date(record.created_at).toLocaleDateString("ko-KR"),
    };
  });
  function setSelectedPeer(index: number) { setSelectedPeerId(peers[index].id); }
  function scoreFor(id: typeof criteria[number]["id"], index: number) { return entries[index]?.[id] ?? 1; }
  function maxAllowed(id: typeof criteria[number]["id"], index: number) {
    const others = entries.reduce((sum, entry, i) => sum + (i === index ? 0 : entry[id]), 0);
    return Math.max(1, Math.min(10, pool - others));
  }
  function handleScoreClick(id: typeof criteria[number]["id"], value: number) {
    if (!selectedEntry || isSubmitted || busy) return;
    const score = Math.max(1, Math.min(value, maxAllowed(id, selectedPeer)));
    setDraft((prev) => ({ ...prev, [selectedEntry.recipient_id]: { ...selectedEntry, [id]: score } }));
  }
  function updateComment(comment: string) {
    if (!selectedEntry || isSubmitted || busy || comment.length > 150) return;
    setDraft((prev) => ({ ...prev, [selectedEntry.recipient_id]: { ...selectedEntry, comment } }));
  }
  function avgScore(scores: Scores) {
    const values = Object.values(scores);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          동료 평가 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Peer Evaluation</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          {isDone
            ? "최종 평가(총괄) · 평가 작성 및 공개된 결과"
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
              <strong>최종 평가</strong>는 총괄 평가입니다 — 제출된 결과는 <span style={{ color: "var(--muted-foreground)" }}>이 프로젝트 평판에 반영되며, 개별적으로 숨기거나 제외할 수 없습니다.</span>
            </>
          ) : midtermSkipped ? (
            <>
              프로젝트 기간이 <strong>2주 미만</strong>이라 <strong>중간 점검</strong>이 적용되지 않습니다 — <span style={{ color: "var(--muted-foreground)" }}>형성적 피드백을 반영할 시간이 부족한 단기 프로젝트는 중간 점검 없이 최종 평가로 바로 넘어갑니다.</span>
            </>
          ) : (
            <>
              <strong>중간 점검</strong>은 형성적 평가입니다 — 피드백 목적으로만 사용되며 <span style={{ color: "var(--muted-foreground)" }}>프로필 평판에 반영되지 않습니다. {prototype ? "프로토타입에서는 상단에서 최종 평가를 선택할 수 있습니다." : "최종 평가는 프로젝트 종료 후 활성화됩니다."}</span>
            </>
          )}
        </div>
      </div>


      {error && <div role="alert" className="mb-4 p-4 rounded-xl" style={{ background: "#ef444418" }}>
        {error} <button type="button" className="underline ml-2" disabled={busy} onClick={() => { setData(null); setRefresh((n) => n + 1); }}>다시 불러오기</button>
      </div>}
      {!data && !error && <p role="status" className="mb-4">평가를 불러오는 중…</p>}
      {!currentMember && <p className="mb-4">팀 참여 정보를 확인해 주세요.</p>}
      {!prototype && isLeader && phase === "midterm" && <div className="mb-4">
        {!confirmClose ? <button type="button" disabled={busy} onClick={() => setConfirmClose(true)}>프로젝트 종료 및 최종 평가 열기</button> :
          <div><p>프로젝트를 종료하면 중간 평가가 마감됩니다. 종료하시겠습니까?</p>
          <button type="button" disabled={busy} onClick={closeProject}>프로젝트 종료</button>
          <button type="button" disabled={busy} onClick={() => setConfirmClose(false)} className="ml-3">취소</button></div>}
      </div>}

      {midtermSkipped && (
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
        >
          <div className="text-3xl mb-3">◷</div>
          <div className="text-sm font-600">이 프로젝트는 중간 점검이 생략됩니다</div>
          <div className="text-sm mt-1">프로젝트 종료 후 최종 평가만 진행돼요</div>
        </div>
      )}

      {data && !midtermSkipped && peers.length === 0 && (
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
        >
          <div className="text-3xl mb-3">◎</div>
          <div className="text-sm font-600">아직 평가할 동료가 없어요</div>
          <div className="text-sm mt-1">팀원을 초대하면 동료 평가를 진행할 수 있어요</div>
        </div>
      )}

      {data && !midtermSkipped && peers.length > 0 && (
        <>
          {/* Shared-pool allocation status per criterion */}
          <div className="px-5 py-4 mb-5" style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "var(--shadow-card)" }}>
            <div className="text-xs font-600 mb-3" style={{ color: "var(--muted-foreground)" }}>
              항목별 공유 점수 배분 현황 · 동료 {peers.length}명 × {POOL_PER_PEER}점 = 총 {pool}점
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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

          <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
            {/* Peer list */}
            <div className="col-span-1 md:col-span-2 flex flex-col gap-2.5">
              {peers.map((p, i) => {
                const peerTotal = criteria.reduce((sum, c) => sum + scoreFor(c.id, i), 0);
                const active = selectedPeer === i;
                return (
                  <button
                    key={p.id}
                    aria-pressed={selectedPeer === i}
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
            <div className="col-span-1 md:col-span-3">
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
                      ✓ 제출 완료 ({isDone ? "팀 공개" : "비공개"})
                    </span>
                  )}
                </div>

                {/* Live score preview */}
                <div className="flex justify-center mb-4" role="group" aria-label="선택한 동료의 항목별 평가 오각형 차트">
                  <PentagonChart
                    size={320}
                    data={criteria.map((c) => ({ label: c.label, value: peerScores[c.id] ?? 1 }))}
                    onValueChange={(index, value) => handleScoreClick(criteria[index].id, value)}
                    limits={criteria.map((c) => maxAllowed(c.id, selectedPeer))}
                    disabled={isSubmitted || busy}
                  />
                </div>

                <p className="text-xs text-center mb-4" style={{ color: "var(--muted-foreground)" }}>
                  {isSubmitted ? "제출한 평가는 수정할 수 없습니다." : "오각형 꼭짓점을 잡아 바깥쪽이나 안쪽으로 움직여 점수를 조절하세요."}
                </p>
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
                        label={c.label}
                        value={current}
                        limit={capped}
                        disabled={isSubmitted || busy}
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
                    aria-label="종합 코멘트"
                    maxLength={150}
                    disabled={isSubmitted || busy}
                    value={peerComment}
                    onChange={(e) => updateComment(e.target.value)}
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
                      disabled={!allBalanced || busy}
                      className="w-full py-3 text-sm font-700 transition-all"
                      style={{
                        background: allBalanced ? "var(--primary)" : "var(--muted)",
                        color: allBalanced ? "#fff" : "var(--muted-foreground)",
                        borderRadius: "40px",
                        boxShadow: allBalanced ? "0 8px 20px rgba(37,99,235,0.3)" : "none",
                        cursor: allBalanced ? "pointer" : "not-allowed",
                      }}
                    >
                      {busy ? "제출 중…" : "전체 동료 평가 제출"} ({isDone ? "팀 공개" : "비공개"})
                    </button>
                  </>
                )}
                {isSubmitted && (
                  <div className="text-xs text-center font-700" style={{ color: "#22c55e" }}>
                    ✓ 전체 동료 평가 제출 완료 ({isDone ? "팀 공개" : "비공개"})
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {data && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            {isDone && <label className="text-sm">평가 결과 대상
              <select aria-label="평가 결과 대상" className="ml-2 px-3 py-2 rounded-lg" style={{ background: "var(--card)" }} value={viewedMemberId} onChange={(e) => setViewedMemberId(e.target.value)}>
                {team.members.filter((m) => m.userId !== null).map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === currentMember?.id ? " (나)" : ""}</option>)}
              </select>
            </label>}
            <button type="button" className="text-sm underline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>새로고침</button>
          </div>
          {/* No-hide policy notice */}
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="text-xs font-700 px-2.5 py-1" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
              {isDone ? "🔒 최종 평가는 숨기기 옵션이 없습니다 — 제출된 모든 평가가 팀에 공개됩니다" : "중간 피드백은 작성자와 받는 사람만 조회할 수 있습니다"}
            </span>
          </div>

          {/* Summary */}
          <div
            className="p-6 mb-5"
            style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", borderRadius: "var(--radius)", boxShadow: "0 8px 32px rgba(37,99,235,0.3)", color: "#fff" }}
          >
            <div className="text-xs font-600 uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
              {isDone ? "최종 평가" : "중간 피드백"} ({isDone ? memberName(viewedMemberId) : currentMember?.name ?? "참여자"}) · {project.name} · {completedEvals.length}건
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
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>아직 제출된 평가가 없습니다.</p>
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
