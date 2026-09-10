import { useState } from "react";
import { useProject } from "../context/ProjectContext";

const criteria = [
  { id: "role", label: "역할 이행", desc: "맡은 역할과 작업을 수행했는지", icon: "✓" },
  { id: "deadline", label: "약속 및 마감 준수", desc: "합의한 기한과 약속을 지켰는지", icon: "◷" },
  { id: "communication", label: "의사소통", desc: "요청·질문·진행 상황 공유에 적절히 응답했는지", icon: "◎" },
  { id: "collaboration", label: "협업 태도", desc: "팀 의사결정과 문제 해결 과정에 협조적으로 참여했는지", icon: "⊙" },
];

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
      scores: { role: 4, deadline: 5, communication: 5, collaboration: 4 },
      reapply: true,
      comment: "일정 관리 능력이 뛰어나고 팀 전체를 잘 이끌어줬습니다.",
      date: "2026-06-20",
    },
    {
      from: "오유진", avatar: "오", color: "#2563eb",
      scores: { role: 5, deadline: 4, communication: 4, collaboration: 5 },
      reapply: true,
      comment: "주도적으로 역할을 수행하며 팀 분위기를 긍정적으로 이끌었습니다.",
      date: "2026-06-21",
    },
  ],
};

type Scores = Record<string, number>;

function ExtremeReasonModal({
  score, criterion, onConfirm, onCancel,
}: { score: number; criterion: string; onConfirm: (r: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
      <div className="w-96 p-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)" }}>
        <div
          className="w-10 h-10 flex items-center justify-center text-lg font-700 mb-3"
          style={{ background: score === 1 ? "#ef444418" : "#2563eb18", color: score === 1 ? "#ef4444" : "#2563eb", borderRadius: "12px" }}
        >
          {score}
        </div>
        <h3 className="font-700 mb-1">{score}점 선택 — 사유 입력</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          <strong>{criterion}</strong> 항목에서 {score === 1 ? "최저점(1점)" : "최고점(5점)"}을 선택했습니다.
          공정한 평가를 위해 간단한 이유를 입력해주세요.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="구체적인 상황이나 이유를 작성해주세요 (최대 200자)"
          maxLength={200}
          rows={3}
          className="w-full text-sm p-3 resize-none outline-none mb-1"
          style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
        />
        <div className="text-xs mb-4 text-right" style={{ color: "var(--muted-foreground)" }}>{reason.length}/200</div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>
            취소
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason)}
            className="flex-1 py-2.5 text-sm font-700 transition-all"
            style={{
              background: reason.trim() ? "var(--primary)" : "var(--border)",
              color: reason.trim() ? "#fff" : "var(--muted-foreground)",
              borderRadius: "40px",
              boxShadow: reason.trim() ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
              cursor: reason.trim() ? "pointer" : "not-allowed",
            }}
          >
            확인
          </button>
        </div>
      </div>
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
  const [reasons, setReasons] = useState<Record<string, Record<number, Record<string, string>>>>({});
  const [submitted, setSubmitted] = useState<Record<string, Set<number>>>({});
  const [pendingScore, setPendingScore] = useState<{ criterion: string; value: number } | null>(null);

  const pid = project.id;
  const peerScores = scores[pid]?.[selectedPeer] || {};
  const peerComment = comments[pid]?.[selectedPeer] || "";
  const peerReasons = reasons[pid]?.[selectedPeer] || {};
  const submittedSet = submitted[pid] || new Set<number>();
  const isSubmitted = submittedSet.has(selectedPeer);
  const submittedCount = submittedSet.size;

  function handleScoreClick(criterion: string, value: number) {
    if (isSubmitted || isDone) return;
    if (value === 1 || value === 5) setPendingScore({ criterion, value });
    else applyScore(criterion, value);
  }

  function applyScore(criterion: string, value: number, reason?: string) {
    setScores((p) => ({ ...p, [pid]: { ...p[pid], [selectedPeer]: { ...p[pid]?.[selectedPeer], [criterion]: value } } }));
    if (reason) {
      setReasons((p) => ({ ...p, [pid]: { ...p[pid], [selectedPeer]: { ...p[pid]?.[selectedPeer], [criterion]: reason } } }));
    }
  }

  function submitEval() {
    const allFilled = criteria.every((c) => peerScores[c.id]);
    if (!allFilled) return;
    setSubmitted((p) => ({ ...p, [pid]: new Set([...(p[pid] || new Set()), selectedPeer]) }));
  }

  const allFilled = criteria.every((c) => peerScores[c.id]);

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
            : "중간 점검(형성적) · 항목별 1~5점 · 극단 점수 사유 필수"}
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
          {/* Progress */}
          <div className="px-5 py-3 mb-5 flex items-center gap-4" style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "var(--shadow-card)" }}>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-600">{submittedCount}/{peers.length}명 제출 완료</span>
                <span style={{ fontFamily: "var(--font-jetbrains)", color: "var(--primary)" }}>{Math.round((submittedCount / peers.length) * 100)}%</span>
              </div>
              <div className="h-2 w-full" style={{ background: "var(--muted)", borderRadius: "4px" }}>
                <div className="h-2 transition-all" style={{ width: `${(submittedCount / peers.length) * 100}%`, background: "linear-gradient(90deg, var(--primary), #60a5fa)", borderRadius: "4px" }} />
              </div>
            </div>
          </div>

          {pendingScore && (
            <ExtremeReasonModal
              score={pendingScore.value}
              criterion={criteria.find((c) => c.id === pendingScore.criterion)?.label || ""}
              onConfirm={(reason) => { applyScore(pendingScore.criterion, pendingScore.value, reason); setPendingScore(null); }}
              onCancel={() => setPendingScore(null)}
            />
          )}

          <div className="grid grid-cols-5 gap-5">
            {/* Peer list */}
            <div className="col-span-2 flex flex-col gap-2.5">
              {peers.map((p, i) => {
                const done = submittedSet.has(i);
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
                    {done && (
                      <span className="text-xs px-2.5 py-1 font-700 shrink-0" style={{ background: active ? "rgba(255,255,255,0.2)" : "#22c55e18", color: active ? "#fff" : "#22c55e", borderRadius: "20px" }}>
                        완료
                      </span>
                    )}
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

                {/* Criteria */}
                {criteria.map((c) => (
                  <div key={c.id} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 flex items-center justify-center text-xs" style={{ background: "var(--secondary)", borderRadius: "7px", color: "var(--primary)" }}>{c.icon}</span>
                      <span className="text-sm font-700">{c.label}</span>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{c.desc}</span>
                      <span className="ml-auto text-xs font-700" style={{ color: peerScores[c.id] ? "var(--primary)" : "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
                        {peerScores[c.id] ? `${peerScores[c.id]}점` : "—"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((v) => {
                        const isExtreme = v === 1 || v === 5;
                        const isSel = peerScores[c.id] === v;
                        return (
                          <button
                            key={v}
                            disabled={isSubmitted}
                            onClick={() => handleScoreClick(c.id, v)}
                            className="flex-1 h-10 text-sm font-700 relative transition-all"
                            style={{
                              background: isSel ? "var(--primary)" : "var(--muted)",
                              color: isSel ? "#fff" : isExtreme ? "var(--foreground)" : "var(--muted-foreground)",
                              borderRadius: "10px",
                              boxShadow: isSel ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
                              border: isExtreme && !isSel ? "2px solid var(--border)" : "2px solid transparent",
                              cursor: isSubmitted ? "default" : "pointer",
                            }}
                          >
                            {v}
                            {isExtreme && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: isSel ? "#fff" : "var(--accent)" }} title="극단 점수 — 사유 입력 필요" />}
                          </button>
                        );
                      })}
                    </div>
                    {peerReasons[c.id] && (
                      <div className="mt-1.5 text-xs px-3 py-2" style={{ background: "var(--muted)", borderRadius: "8px", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                        사유: {peerReasons[c.id]}
                      </div>
                    )}
                  </div>
                ))}

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
                  <button
                    onClick={submitEval}
                    className="w-full py-3 text-sm font-700 transition-all"
                    style={{
                      background: allFilled ? "var(--primary)" : "var(--muted)",
                      color: allFilled ? "#fff" : "var(--muted-foreground)",
                      borderRadius: "40px",
                      boxShadow: allFilled ? "0 8px 20px rgba(37,99,235,0.3)" : "none",
                      cursor: allFilled ? "pointer" : "not-allowed",
                    }}
                  >
                    중간 점검 제출 (비공개)
                  </button>
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
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {criteria.map((c) => {
                    const avg = completedEvals.reduce((a, e) => a + e.scores[c.id], 0) / completedEvals.length;
                    return (
                      <div key={c.id} className="p-3" style={{ background: "rgba(255,255,255,0.12)", borderRadius: "12px" }}>
                        <div className="text-2xl font-800 mb-0.5" style={{ fontFamily: "var(--font-outfit)" }}>{avg.toFixed(1)}</div>
                        <div className="text-xs font-600">{c.label}</div>
                        <div className="mt-2 h-1.5 w-full" style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px" }}>
                          <div className="h-1.5" style={{ width: `${(avg / 5) * 100}%`, background: "#fff", borderRadius: "4px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-800" style={{ fontFamily: "var(--font-outfit)" }}>
                    {(completedEvals.reduce((sum, e) => sum + avgScore(e.scores), 0) / completedEvals.length).toFixed(1)}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>/ 5.0 이 프로젝트 협업 평점</span>
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
