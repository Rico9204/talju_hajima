import StillImg from "./StillImg";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProject } from "../context/ProjectContext";
import type { EvaluationData, EvaluationEntry, EvaluationPhase, EvaluationScoreMethod } from "../api/types";
import PentagonChart from "./PentagonChart";
import { useConfirm } from "./ConfirmDialog";
import EvaluationInfoButton from "./EvaluationInfoButton";
import CcaBadge from "./CcaBadge";
import WindowPanel from "./WindowPanel";
import { EVALUATION_CRITERIA } from "../lib/evaluationGuide";

const criteria = EVALUATION_CRITERIA;

// One continuous track over a fixed min..max range (0..10 per person) —
// click anywhere or drag across it and the value snaps to whichever zone
// the pointer is over.
function ScoreTrack({
  value, min = 0, max = 10, limit, onChange, disabled, label,
}: { value: number | null; min?: number; max?: number; limit?: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const steps = max - min + 1;
  const effectiveLimit = Math.min(limit ?? max, max);
  // value가 null이면 아직 고르지 않은 상태: 손잡이·채운 막대를 그리지 않는다(시작점이 점수에 영향을 주지 않게).
  const clamped = value === null ? null : Math.min(Math.max(value, min), effectiveLimit);

  function zoneFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return clamped ?? min;
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
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? "미선택" : `${value}점`}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        // 아직 고르지 않았으면 화살표는 가운데(5점)부터 시작한다.
        const base = value ?? Math.round((min + max) / 2);
        const next = e.key === "Home" ? min : e.key === "End" ? effectiveLimit
          : ["ArrowRight", "ArrowUp"].includes(e.key) ? (value === null ? base : value + 1)
          : ["ArrowLeft", "ArrowDown"].includes(e.key) ? (value === null ? base : value - 1) : null;
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
        style={{ top: 15, height: 3, width: clamped === null ? 0 : `${pctForIndex(clamped)}%`, background: "var(--primary)", borderRadius: "4px" }}
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
            <div className="text-[10px] font-700 mt-1" style={{ color: isSel ? "var(--primary-text)" : locked ? "#ef4444" : "var(--muted-foreground)" }}>{v}</div>
          </div>
        );
      })}
      {/* thumb */}
      {clamped !== null && <div
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
          boxShadow: "0 2px 6px rgba(74,116,181,0.4)",
          pointerEvents: "none",
        }}
      />}
    </div>
  );
}

type CriterionId = typeof criteria[number]["id"];
// 작성 중인 평가: 고른 항목만 값이 있다. 기본값(예전 1점)을 두지 않아, 모든 항목을 직접 골라야 제출할 수 있다.
type Draft = Partial<Record<CriterionId, number>> & { comment?: string };
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
// 점수 방식 비교에서 고른 방식은 이 브라우저에 기억한다(다른 화면에 갔다 와도 유지).
const SCORE_METHOD_KEY = "talju:evaluation-score-method";
function readScoreMethod(): EvaluationScoreMethod | null {
  try { const v = localStorage.getItem(SCORE_METHOD_KEY); return v === "raw" || v === "cca" ? v : null; } catch { return null; }
}
function EvaluationSelector() {
  const { project, getEvaluationMode, getEvaluationMethodPreview, getEvaluationScoreCca } = useProject();
  const [prototype, setPrototype] = useState<boolean | null>(null);
  // 점수 방식 토글은 관리자 설정(점수 방식 비교)이 켜져 있을 때만. 테스트 모드와 따로 켜고 끈다.
  const [methodPreview, setMethodPreview] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [phase, setPhase] = useState<EvaluationPhase>(project.status === "done" ? "final" : "midterm");
  // 공식 점수 방식(관리자 설정). 실제 평점·프로필·상위 %는 이 방식으로 계산된다.
  const [official, setOfficial] = useState<EvaluationScoreMethod | null>(null);
  // 점수 방식 비교에서 고른 방식. 고른 적이 없으면 공식 방식.
  const [picked, setPicked] = useState<EvaluationScoreMethod | null>(readScoreMethod);
  const method = picked ?? official ?? "raw";
  function pickMethod(value: EvaluationScoreMethod) {
    setPicked(value);
    try { localStorage.setItem(SCORE_METHOD_KEY, value); } catch { /* 저장할 수 없어도 이 화면에서는 쓴다 */ }
  }
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([getEvaluationMode(), getEvaluationMethodPreview(), getEvaluationScoreCca()]).then(([enabled, preview, cca]) => {
      if (active) { setPrototype(enabled); setMethodPreview(preview); setOfficial(cca ? "cca" : "raw"); }
    }).catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [retry]);
  if (error) return <div role="alert" className="p-6">{error} <button onClick={() => setRetry((n) => n + 1)}>다시 불러오기</button></div>;
  if (prototype === null || methodPreview === null || official === null) return <p role="status" className="p-6">평가 설정을 불러오는 중…</p>;
  const phases: EvaluationPhase[] = prototype ? ["midterm", "final"] : [phase];
  return <div>
    {(prototype || methodPreview) && <div className="px-4 pt-4 md:px-6 max-w-5xl mx-auto">
      {prototype && <><div role="tablist" aria-label="평가 유형" className="flex items-center gap-2">
        <span className="px-2 py-0.5 text-[11px] font-700 rounded-full" title="기간과 프로젝트 상태에 관계없이 두 평가를 선택할 수 있습니다."
          style={{ background: "#f59e0b18", color: "#d97706" }}>테스트 모드</span>
        {phases.map((value) => <button key={value} type="button" role="tab" id={"evaluation-tab-" + value}
          aria-selected={phase === value} aria-controls={"evaluation-panel-" + value} disabled={submitting}
          onClick={() => setPhase(value)} className="px-5 py-2 rounded-full disabled:opacity-50"
          style={{ background: phase === value ? "var(--primary)" : "var(--muted)", color: phase === value ? "#fff" : "var(--foreground)" }}>
          {value === "midterm" ? "중간 평가" : "최종 평가"}
        </button>)}
      </div></>}
      {methodPreview && <div role="radiogroup" aria-label="점수 방식" className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>점수 방식</span>
        {([["raw", "원점수 평균"], ["cca", "CCA"]] as const).map(([value, label]) => <button key={value} type="button" role="radio"
          aria-checked={method === value} disabled={submitting} onClick={() => pickMethod(value)}
          className="px-3 py-1 text-xs font-700 rounded-full disabled:opacity-50"
          style={{ background: method === value ? "var(--primary)" : "var(--muted)", color: method === value ? "#fff" : "var(--foreground)" }}>
          {label}{value === official ? " · 반영 중" : ""}
        </button>)}
        {method !== official && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>미리보기</span>}
      </div>}
    </div>}
    {phases.map((value) => <div key={value} hidden={phase !== value} role={prototype ? "tabpanel" : undefined}
      id={"evaluation-panel-" + value} aria-labelledby={prototype ? "evaluation-tab-" + value : undefined}>
      <EvaluationPanel phase={value} prototype={prototype} active={phase === value} method={methodPreview ? method : undefined} methodPreview={methodPreview} onBusyChange={setSubmitting} />
    </div>)}
  </div>;
}
function EvaluationPanel({ phase, prototype, active, method, methodPreview, onBusyChange }: {
  phase: EvaluationPhase; prototype: boolean; active: boolean; method?: EvaluationScoreMethod; methodPreview: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { project, team, currentMember, isLeader, isShortTerm, getEvaluations, submitEvaluations, completeProject } = useProject();
  const skipped = !prototype && phase === "midterm" && isShortTerm;
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [data, setData] = useState<EvaluationData | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [ask, confirmDialog] = useConfirm();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    setError("");
    getEvaluations(phase, method).then((result) => {
      if (mounted) setData(result);
    }).catch((e) => { if (mounted) setError(errorMessage(e)); });
    return () => { mounted = false; };
    // Each phase keeps its own draft; project/account changes remount the selector.
  }, [phase, refresh, active, method]);
  const submitted = saved || !!data?.submitted;
  // 제출 직후 새 데이터를 받기 전에는 내 기록이 아직 없으므로, 그동안은 작성하던 목록을 그대로 쓴다.
  const myRecords = data?.records.filter((r) => r.evaluator_id === currentMember?.id) ?? [];
  const peers = team.members.filter((m) => submitted && myRecords.length > 0
    ? myRecords.some((r) => r.recipient_id === m.id)
    : m.id !== currentMember?.id && m.userId !== null);
  // 제출한 뒤에는 저장된 평가를, 작성 중에는 고른 값만(고르지 않은 항목은 null) 쓴다.
  function recordFor(peerId: string) {
    return submitted ? data?.records.find((r) => r.evaluator_id === currentMember?.id && r.recipient_id === peerId) : undefined;
  }
  function scoreOf(peerId: string, id: CriterionId): number | null {
    const record = recordFor(peerId);
    return record ? record[id] : draft[peerId]?.[id] ?? null;
  }
  // 동료마다 아직 고르지 않은 항목 수. 모두 0이어야 제출할 수 있다(예전처럼 1점으로 채워 제출하지 않는다).
  const remaining = peers.map((peer) => ({ peer, left: criteria.filter((c) => scoreOf(peer.id, c.id) === null).length }))
    .filter((item) => item.left > 0);
  const balanced = peers.length > 0 && remaining.length === 0;
  async function submit() {
    if (!data || !currentMember || busy || submitted || !balanced || skipped) return;
    const ok = await ask({
      title: "동료 평가를 제출할까요?",
      message: <>제출한 평가는 수정할 수 없습니다.</>,
      confirmLabel: "제출",
    });
    if (!ok) return;
    const entries: EvaluationEntry[] = peers.map((peer) => {
      const d = draft[peer.id] ?? {};
      return { recipient_id: peer.id, role: d.role!, deadline: d.deadline!, communication: d.communication!, collaboration: d.collaboration!, quality: d.quality!, comment: d.comment ?? "" };
    });
    setBusy(true); onBusyChange(true); setError("");
    try {
      await submitEvaluations(phase, entries);
      setSaved(true);
      setRefresh((n) => n + 1);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function closeProject() {
    if (busy || !isLeader || project.status !== "active") return;
    setBusy(true); onBusyChange(true); setError("");
    try { await completeProject(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); onBusyChange(false); }
  }

  const selectedPeer = Math.max(0, peers.findIndex((peer) => peer.id === selectedPeerId));
  const selectedPeerId_ = peers[selectedPeer]?.id;
  const peerScores = Object.fromEntries(criteria.map((c) => [c.id, selectedPeerId_ ? scoreOf(selectedPeerId_, c.id) : null])) as Record<CriterionId, number | null>;
  const peerComment = selectedPeerId_ ? recordFor(selectedPeerId_)?.comment ?? draft[selectedPeerId_]?.comment ?? "" : "";
  const isDone = phase === "final";
  const midtermSkipped = skipped;
  const isSubmitted = submitted;
  const allBalanced = balanced;
  const submitEval = submit;
  const average = data?.average;
  function setSelectedPeer(index: number) { setSelectedPeerId(peers[index].id); }
  function scoreFor(id: CriterionId, index: number) { return peers[index] ? scoreOf(peers[index].id, id) : null; }
  function maxAllowed(_id: CriterionId, _index: number) { return 10; }
  function handleScoreClick(id: CriterionId, value: number) {
    if (!selectedPeerId_ || isSubmitted || busy) return;
    const score = Math.max(0, Math.min(value, maxAllowed(id, selectedPeer)));
    setDraft((prev) => ({ ...prev, [selectedPeerId_]: { ...prev[selectedPeerId_], [id]: score } }));
  }
  function updateComment(comment: string) {
    if (!selectedPeerId_ || isDone || isSubmitted || busy || comment.length > 150) return;
    setDraft((prev) => ({ ...prev, [selectedPeerId_]: { ...prev[selectedPeerId_], comment } }));
  }

  const feedbackAvailable = average?.available && average.criteria !== null;
  const cardStyle = { background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" };
  const feedbackPanel = (
    <WindowPanel id="eval-feedback" title={isDone ? "프로젝트 최종 평가 평균" : "내가 받은 중간 피드백"} style={cardStyle} bodyClassName="p-4">
      <div aria-label={isDone ? "프로젝트 최종 평가 평균" : "내 중간 피드백 평균"}>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {currentMember?.name ?? "참여자"} · {project.name}{data?.average?.method === "cca" ? " · CCA" : ""}
        </p>
        {!isDone && (
          <div className="flex items-center justify-between gap-2 mt-1 mb-2">
            <span className="text-xs font-700">{feedbackAvailable ? "중간 피드백 수신 완료" : "중간 피드백 수신 중"}</span>
            <button type="button" className="text-xs underline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>새로고침</button>
          </div>
        )}
        {feedbackAvailable && average?.score != null ? (
          <>
            <div className="flex justify-center my-2">
              <PentagonChart size={230} data={criteria.map((c) => ({ label: c.label, value: average!.criteria![c.id] }))} />
            </div>
            <div className="flex items-baseline gap-2 justify-center flex-wrap text-center">
              <span className="text-3xl font-300" style={{ fontFamily: "var(--font-outfit)", color: "var(--primary-text)" }}>{average?.score?.toFixed(2)}</span>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>/ 10.0 {isDone ? "이 프로젝트 협업 평점" : "중간 피드백 평균"}</span>
              {data?.average?.method === "cca" && <CcaBadge />}
            </div>
            {!isDone && (
              <div className="grid gap-2 mt-4" aria-label="받은 종합 코멘트">
                <h3 className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>동료들의 종합 코멘트</h3>
                {(average?.comments?.length ?? 0) > 0 ? (
                  <div className="grid gap-2 max-h-[240px] overflow-y-auto pr-1">
                    {average!.comments!.map((comment, index) => (
                      <p key={index} className="p-3 text-sm leading-relaxed" style={{ background: "var(--muted)", borderRadius: "10px", overflowWrap: "anywhere" }}>{comment}</p>
                    ))}
                  </div>
                ) : (
                  <p className="p-3 text-xs" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--muted-foreground)" }}>아직 받은 코멘트가 없어요.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm py-4 text-center" style={{ color: "var(--muted-foreground)" }}>{isDone ? "아직 제출된 평가가 없습니다." : "공개 대기"}</p>
        )}
      </div>
    </WindowPanel>
  );
  const showFeedback = !!data && (!isDone || prototype || methodPreview) && !midtermSkipped && !!currentMember;
  const totalFields = peers.length * criteria.length;
  const filledFields = totalFields - remaining.reduce((n, item) => n + item.left, 0);
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {confirmDialog}
      {/* Header: 이 화면의 설명은 오른쪽 위 ⓘ 하나로 연다. */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-xs font-600" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            동료 평가
          </div>
          <EvaluationInfoButton section="phases" />
        </div>
        <h1 className="text-2xl font-700">{project.name}</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          {isDone
            ? "최종 평가(총괄) · 동료 평가 작성"
            : midtermSkipped
            ? "2주 미만 단기 프로젝트 · 중간 점검 생략"
            : "중간 점검(형성적) · 항목별 0~10점으로 피드백을 남겨보세요"}
        </p>
      </div>

      {/* Info strip: 단계별 한 줄 요약 — 형성적·총괄 평가와 2주 기준 설명은 오른쪽 위 ⓘ 안내에서 본다. */}
      <div
        className="inline-flex items-center gap-2 px-3.5 py-2 mb-4 text-sm"
        style={{
          background: isDone ? "rgba(91,154,116,0.16)" : midtermSkipped ? "rgba(75,86,107,0.10)" : "rgba(74,116,181,0.14)",
          borderRadius: "12px",
        }}
      >
        <span style={{ color: isDone ? "#2f6b4a" : midtermSkipped ? "#4b566b" : "#2f4e80" }}>{isDone ? "★" : midtermSkipped ? "◷" : "◎"}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isDone ? (
            <><strong>최종 평가</strong><span style={{ color: "var(--muted-foreground)" }}>· 평균이 프로필 평점이 됩니다</span></>
          ) : midtermSkipped ? (
            <><strong>2주 미만 프로젝트</strong><span style={{ color: "var(--muted-foreground)" }}>· 중간 점검 없이 최종 평가만 진행</span></>
          ) : (
            <><strong>중간 점검</strong><span style={{ color: "var(--muted-foreground)" }}>· 프로필에 반영되지 않음{prototype ? "" : " · 최종 평가는 프로젝트 종료 후"}</span></>
          )}
        </div>
      </div>

      {error && <div role="alert" className="mb-4 p-4 rounded-xl" style={{ background: "#ef444418" }}>
        {error} <button type="button" className="underline ml-2" disabled={busy} onClick={() => { setData(null); setRefresh((n) => n + 1); }}>다시 불러오기</button>
      </div>}
      {!data && !error && <p role="status" className="mb-4">평가를 불러오는 중…</p>}
      {!currentMember && <p className="mb-4">팀 참여 정보를 확인해 주세요.</p>}
      {!prototype && isLeader && project.status === "active" && phase === "midterm" && <div className="mb-4">
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
          <div className={`grid grid-cols-1 gap-4 items-start ${showFeedback ? "lg:grid-cols-[230px_minmax(0,1fr)_270px]" : "lg:grid-cols-[230px_minmax(0,1fr)]"}`}>
            {/* Peer list */}
            <WindowPanel id="eval-peers" title={`평가할 동료 ${peers.length}`} style={cardStyle} bodyClassName="p-2.5">
              <div className="flex flex-col gap-1.5">
                {peers.map((p, i) => {
                  const values = criteria.map((c) => scoreFor(c.id, i)).filter((v): v is number => v !== null);
                  const peerDone = values.length === criteria.length;
                  const peerAverage = peerDone ? values.reduce((sum, v) => sum + v, 0) / criteria.length : 0;
                  const active = selectedPeer === i;
                  return (
                    <button
                      key={p.id}
                      aria-pressed={selectedPeer === i}
                      onClick={() => setSelectedPeer(i)}
                      className="flex items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--muted)]"
                      style={{
                        background: active ? "var(--primary)" : undefined,
                        borderRadius: "14px",
                        color: active ? "#fff" : "var(--foreground)",
                      }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 shrink-0 overflow-hidden" style={{ background: p.avatarUrl ? "var(--card)" : active ? "rgba(255,255,255,0.2)" : "var(--surface-opaque)", color: active ? "#fff" : p.color }}>
                        {p.avatarUrl ? <StillImg src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" /> : p.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-700 truncate">{p.name}</div>
                        <div className="text-[11px] truncate" style={{ opacity: 0.75 }}>{p.major}</div>
                      </div>
                      <span
                        className="text-[11px] px-2 py-0.5 font-700 shrink-0"
                        style={{ background: active ? "rgba(255,255,255,0.22)" : peerDone ? "var(--muted)" : "rgba(214,154,78,0.2)", color: active ? "#fff" : peerDone ? "var(--muted-foreground)" : "#7a4f12", borderRadius: "20px", fontFamily: "var(--font-jetbrains)" }}
                      >
                        {peerDone ? `평균 ${peerAverage.toFixed(1)}` : `${values.length}/${criteria.length} 입력`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </WindowPanel>

            {/* Eval form */}
            <WindowPanel id="eval-form" title={`${peers[selectedPeer]?.name ?? ""} 평가`} collapsible={false} style={cardStyle} bodyClassName="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-700 shrink-0 overflow-hidden" style={{ background: peers[selectedPeer]?.avatarUrl ? "var(--card)" : "var(--surface-opaque)", color: peers[selectedPeer]?.color }}>
                  {peers[selectedPeer]?.avatarUrl ? <StillImg src={peers[selectedPeer].avatarUrl} alt={peers[selectedPeer].name} className="w-full h-full object-cover" /> : peers[selectedPeer]?.avatar}
                </div>
                <div className="min-w-0">
                  <div className="font-700 truncate">{peers[selectedPeer]?.name}</div>
                  <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{peers[selectedPeer]?.major}</div>
                </div>
                {isSubmitted && (
                  <span className="ml-auto text-xs font-700 px-3 py-1.5" style={{ background: "rgba(91,154,116,0.16)", color: "#2f6b4a", borderRadius: "20px" }}>
                    ✓ 제출 완료 (비공개)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
                <div>
                  {/* Live score preview */}
                  <div className="flex justify-center" role="group" aria-label="선택한 동료의 항목별 평가 오각형 차트">
                    <PentagonChart
                      size={300}
                      data={criteria.map((c) => ({ label: c.label, value: peerScores[c.id] ?? 0, display: peerScores[c.id] === null ? "—" : undefined }))}
                      onValueChange={(index, value) => handleScoreClick(criteria[index].id, value)}
                      limits={criteria.map((c) => maxAllowed(c.id, selectedPeer))}
                      disabled={isSubmitted || busy}
                    />
                  </div>
                  <p className="text-xs text-center mt-1" style={{ color: "var(--muted-foreground)" }}>
                    {isSubmitted ? "제출한 평가는 수정할 수 없습니다." : "꼭짓점을 끌거나 안쪽을 눌러 점수를 조절하세요."}
                  </p>
                </div>

                <div className="min-w-0">
                  {criteria.map((c) => {
                    const current = peerScores[c.id];
                    return (
                      <div key={c.id} className="py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 flex items-center justify-center text-xs shrink-0" style={{ background: "var(--secondary)", borderRadius: "7px", color: "var(--primary-text)" }}>{c.icon}</span>
                          <span className="text-sm font-700 truncate">{c.label}</span>
                          <span className="ml-auto text-xs font-700 shrink-0" style={{ color: current === null ? "var(--warning-text)" : "var(--primary-text)", fontFamily: "var(--font-jetbrains)" }}>
                            {current === null ? "미선택" : `${current}점`}
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5 mb-0.5" style={{ color: "var(--muted-foreground)" }}>{c.desc}</p>
                        <ScoreTrack
                          label={c.label}
                          value={current}
                          limit={maxAllowed(c.id, selectedPeer)}
                          disabled={isSubmitted || busy}
                          onChange={(v) => handleScoreClick(c.id, v)}
                        />
                      </div>
                    );
                  })}
                  {!isDone && (
                    <div className="pt-3">
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
                  )}
                </div>
              </div>
            </WindowPanel>

            {showFeedback && feedbackPanel}
          </div>

          {/* 제출 줄: 입력 진행과 남은 항목을 항상 보여 준다 */}
          <div className="flex items-center gap-4 flex-wrap mt-4 px-5 py-3" style={cardStyle}>
            {isSubmitted ? (
              <div className="flex-1 text-sm font-700" style={{ color: "#2f6b4a" }}>✓ 전체 동료 평가 제출 완료 (비공개)</div>
            ) : (
              <>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-700">입력한 항목 {filledFields} / {totalFields}</div>
                  <div className="h-1.5 mt-1.5" style={{ background: "var(--border)", borderRadius: "4px" }} aria-hidden="true">
                    <div className="h-1.5" style={{ width: `${totalFields ? (filledFields / totalFields) * 100 : 0}%`, background: "var(--primary)", borderRadius: "4px" }} />
                  </div>
                </div>
                {remaining.length > 0 && (
                  <p className="text-xs" style={{ color: "var(--warning-text)" }}>
                    모든 동료의 모든 항목을 골라야 제출할 수 있어요 · 남은 항목: {remaining.map(({ peer, left }) => `${peer.name} ${left}개`).join(", ")}
                  </p>
                )}
                <button
                  onClick={submitEval}
                  disabled={!allBalanced || busy}
                  className="px-6 py-2.5 text-sm font-700 transition-all"
                  style={{
                    background: allBalanced ? "var(--primary)" : "var(--muted)",
                    color: allBalanced ? "#fff" : "var(--muted-foreground)",
                    borderRadius: "40px",
                    boxShadow: allBalanced ? "0 8px 20px rgba(74,116,181,0.3)" : "none",
                    cursor: allBalanced ? "pointer" : "not-allowed",
                  }}
                >
                  {busy ? "제출 중…" : "전체 동료 평가 제출"} (비공개)
                </button>
              </>
            )}
          </div>
        </>
      )}

    </div>
  );
}
