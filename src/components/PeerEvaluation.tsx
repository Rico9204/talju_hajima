import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";
import type { EvaluationData, EvaluationEntry, EvaluationPhase } from "../api/types";
import PentagonChart from "./PentagonChart";

const criteria = [
  { id: "role", label: "역할 이행" },
  { id: "deadline", label: "약속·마감 준수" },
  { id: "communication", label: "의사소통" },
  { id: "collaboration", label: "협업 태도" },
  { id: "quality", label: "결과물 품질" },
] as const;
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
  return <EvaluationPanel key={project.id + ":" + project.status + ":" + currentMember?.id} />;
}
function EvaluationPanel() {
  const { project, team, currentMember, isLeader, isShortTerm, getEvaluations, submitEvaluations, completeProject } = useProject();
  const phase: EvaluationPhase = project.status === "done" ? "final" : "midterm";
  const skipped = phase === "midterm" && isShortTerm;
  const [data, setData] = useState<EvaluationData | null>(null);
  const [draft, setDraft] = useState<Record<string, EvaluationEntry>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewedMemberId, setViewedMemberId] = useState(currentMember?.id ?? "");
  useEffect(() => {
    let active = true;
    setError("");
    getEvaluations(phase).then((result) => {
      if (active) setData(result);
    }).catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
    // The panel remounts for project, phase and account changes.
  }, [phase, refresh]);
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
    setBusy(true); setError("");
    try {
      await submitEvaluations(phase, entries);
      setSaved(true);
      setRefresh((n) => n + 1);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function closeProject() {
    setBusy(true); setError("");
    try { await completeProject(); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-700">동료 평가 · {project.name}</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {phase === "final" ? "종료 평가 · 제출한 점수와 의견은 팀원에게 공개되고 이 프로젝트 평판에 반영됩니다." :
          "중간 점검 · 작성자와 평가받는 사람만 조회할 수 있으며 프로필 평판에는 반영되지 않습니다."}
      </p>
      {isLeader && phase === "midterm" && (
        <div className="my-4 p-4 border rounded-xl" style={{ borderColor: "var(--border)" }}>
          {!confirmClose ? <button type="button" onClick={() => setConfirmClose(true)} disabled={busy}>프로젝트 종료 및 종료 평가 열기</button> :
            <div>
              <p>프로젝트를 종료하면 중간 평가는 마감되고 종료 평가가 열립니다. 종료하시겠습니까?</p>
              <div className="flex gap-4 mt-3">
                <button type="button" disabled={busy} onClick={closeProject}>{busy ? "처리 중…" : "프로젝트 종료"}</button>
                <button type="button" disabled={busy} onClick={() => setConfirmClose(false)}>취소</button>
              </div>
            </div>}
        </div>
      )}
      {error && <div role="alert" className="my-4 p-4 rounded-xl" style={{ background: "#ef444418" }}>
        {error} <button type="button" className="underline ml-2" disabled={busy} onClick={() => { setData(null); setRefresh((n) => n + 1); }}>다시 불러오기</button>
      </div>}
      {!data && !error && <p role="status" className="my-6">평가를 불러오는 중…</p>}
      {skipped && <p className="my-6 p-5 border rounded-xl">2주 미만 프로젝트는 중간 점검을 생략합니다. 프로젝트 종료 후 종료 평가를 진행해 주세요.</p>}
      {!skipped && !submitted && currentMember && peers.length === 0 && <p className="my-6">아직 평가할 동료가 없습니다. 실제 계정으로 팀에 참여한 동료를 평가할 수 있습니다.</p>}
      {!currentMember && <p className="my-6">팀 참여 정보를 확인해 주세요.</p>}
      {data && !skipped && currentMember && (peers.length > 0 || submitted) && (
        <section className="mt-6" aria-label="평가 작성">
          <h2 className="text-lg font-700">{phase === "final" ? "종료 평가 작성" : "중간 평가 작성"}</h2>
          <p className="text-sm mt-2">각 항목은 1~10점입니다. 항목마다 동료 {peers.length}명에게 총 {pool}점을 배분해 주세요. 제출 후에는 수정할 수 없습니다.</p>
          <p className="text-xs mt-1">작성 중인 내용은 이 화면을 벗어나면 사라집니다. 제출한 평가는 저장됩니다.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 my-4" aria-live="polite">
            {criteria.map((c) => <div key={c.id} className="p-3 rounded-xl" style={{ background: total(c.id) === pool ? "#22c55e18" : "var(--muted)" }}>
              <div className="text-xs">{c.label}</div><strong>{total(c.id)} / {pool}</strong>
            </div>)}
          </div>
          {peers.map((peer, index) => {
            const entry = entries[index];
            return <fieldset key={peer.id} disabled={busy || submitted} className="p-4 mb-4 border rounded-xl" style={{ borderColor: "var(--border)" }}>
              <legend className="px-2 font-700">{peer.name} · {peer.major}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {criteria.map((c) => <label key={c.id} className="text-sm">
                  {c.label}
                  <select aria-label={peer.name + " " + c.label} value={entry[c.id]} className="block w-full p-2 mt-1 border rounded-lg" style={{ background: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" }}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [peer.id]: { ...entry, [c.id]: Number(e.target.value) } }))}>
                    {Array.from({ length: 10 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}점</option>)}
                  </select>
                </label>)}
              </div>
              <label className="block text-sm mt-4">의견 (선택, 150자 이내)
                <textarea maxLength={150} value={entry.comment} rows={2} className="block w-full mt-1 p-3 border rounded-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [peer.id]: { ...entry, comment: e.target.value } }))} />
              </label>
            </fieldset>;
          })}
          {submitted ? <p role="status" className="font-700">평가 제출이 완료되었습니다.</p> :
            <button type="button" onClick={submit} disabled={busy || !balanced} className="px-6 py-3 rounded-full disabled:opacity-40" style={{ background: "var(--primary)", color: "#fff" }}>
              {busy ? "제출 중…" : "전체 동료 평가 제출"}
            </button>}
          {!submitted && !balanced && <p className="text-sm mt-2">모든 항목의 합계가 {pool}점이 되면 제출할 수 있습니다.</p>}
        </section>
      )}
      {data && <section className="mt-8" aria-label="받은 평가">
        <div className="flex gap-4 items-center">
          <h2 className="text-lg font-700">{phase === "final" && viewedMemberId !== currentMember?.id ? memberName(viewedMemberId) + " 님이 받은" : "내가 받은"} {phase === "final" ? "종료 평가" : "중간 피드백"} · {received.length}건</h2>
          <button type="button" className="text-sm underline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>새로고침</button>
        </div>
        {phase === "final" && <label className="block text-sm mt-3">평가 결과 대상
          <select className="ml-3 p-2 border rounded-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }} value={viewedMemberId} onChange={(e) => setViewedMemberId(e.target.value)}>
            {team.members.filter((m) => m.userId !== null).map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === currentMember?.id ? " (나)" : ""}</option>)}
          </select>
        </label>}
        {!received.length && <p className="text-sm mt-3">아직 받은 평가가 없습니다.</p>}
        {received.length > 0 && <PentagonChart size={260} data={criteria.map((c) => ({ label: c.label, value: received.reduce((n, r) => n + r[c.id], 0) / received.length }))} />}
        {received.map((record) => <article key={record.id} className="p-4 mt-3 border rounded-xl" style={{ borderColor: "var(--border)" }}>
          <div className="font-700">{memberName(record.evaluator_id)} <span className="text-xs font-normal">{new Date(record.created_at).toLocaleDateString("ko-KR")}</span></div>
          <p className="text-sm mt-2">{criteria.map((c) => c.label + " " + record[c.id] + "점").join(" · ")}</p>
          {record.comment && <p className="mt-3 whitespace-pre-wrap">{record.comment}</p>}
        </article>)}
      </section>}
    </div>
  );
}
