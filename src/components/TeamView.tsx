import { useEffect, useState } from "react";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import PentagonChart from "./PentagonChart";

export default function TeamView({ onMessage }: { onMessage?: (memberId: string) => void }) {
  const { project, team, transferLeadership, markProjectDone, kickMember, currentMember, isLeader, openMemberProfile } = useProject();
  const { isAdmin } = useProjectManagement();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [pendingTransfer, setPendingTransfer] = useState<{ id: string; name: string } | null>(null);
  const [pendingKick, setPendingKick] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function runAction(action: () => Promise<void>, done: () => void) {
    if (busy) return; setBusy(true); setActionError(null);
    try { await action(); done(); }
    catch (err) { setActionError(err && typeof err === "object" && "message" in err ? String(err.message) : "처리에 실패했습니다."); }
    finally { setBusy(false); }
  }
  const [pendingFinish, setPendingFinish] = useState(false);

  useEffect(() => {
    setSelectedId(null);
    setMemberSearch("");
  }, [project.id]);

  const members = team.members;
  const memberSearchTrimmed = memberSearch.trim().toLowerCase();
  const filteredMembers = memberSearchTrimmed
    ? members.filter((m) => m.name.toLowerCase().includes(memberSearchTrimmed))
    : members;
  const showMemberSearch = members.length > 6;

  if (members.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            팀 구성원
          </div>
          <h1 className="text-2xl font-700">{team.teamLabel}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{team.teamSub}</p>
        </div>
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
        >
          <div className="text-3xl mb-3">◎</div>
          <div className="text-sm font-600">아직 팀원이 없어요</div>
          <div className="text-sm mt-1">이 프로젝트에 참여한 팀원만 여기에 표시됩니다</div>
        </div>
      </div>
    );
  }

  const sel = members.find((m) => m.id === selectedId) ?? members[0];
  const canManage = isLeader || isAdmin;
  const canTransfer = isLeader && project.status !== "done" && sel && sel.id !== currentMember?.id && !sel.isLeader;
  const canKick = canManage && project.status === "active" && project.approvalStatus === "approved" && sel && sel.id !== currentMember?.id && !sel.isLeader;
  const canFinish = canManage && project.status === "active";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            팀 구성원
          </div>
          <h1 className="text-2xl font-700">{team.teamLabel}</h1>
          <div className="flex items-center justify-between gap-3 mt-1">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{team.teamSub}</p>
            {showMemberSearch && (
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="팀원 검색"
                className="w-40 min-w-0 shrink-0 text-xs px-3 py-1.5 border outline-none"
                style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
              />
            )}
          </div>
        </div>
        {canFinish && (
          <button
            onClick={() => { setActionError(null); setPendingFinish(true); }}
            className="text-xs font-700 px-3.5 py-2 shrink-0 transition-all"
            style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}
          >
            프로젝트 종료
          </button>
        )}
      </div>

      {/* Member cards grid */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {filteredMembers.map((m) => {
          const isSelected = sel.id === m.id;
          return (
          <button
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            className="flex flex-col items-center p-4 shrink-0 transition-all"
            style={{
              background: isSelected ? "var(--primary)" : "var(--card)",
              borderRadius: "var(--radius)",
              boxShadow: isSelected ? "0 8px 24px rgba(37,99,235,0.3)" : "var(--shadow-card)",
              width: 110,
              color: isSelected ? "#fff" : "var(--foreground)",
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-700 mb-2 relative overflow-hidden"
              style={{ background: m.avatarUrl ? "var(--card)" : isSelected ? "rgba(255,255,255,0.2)" : `${m.color}18`, color: isSelected ? "#fff" : m.color }}
            >
              {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : m.avatar}
              {m.isLeader && (
                <span className="absolute -top-1.5 -right-1.5 text-xs" title="팀장">🧭</span>
              )}
            </div>
            <div className="text-xs font-700">{m.name}</div>
            <div className="text-xs mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>
              {m.role}
            </div>
            {m.id === currentMember?.id && m.evalCount > 0 ? (
              <div className="flex items-center gap-1 mt-2">
                <span className="text-xs">★</span>
                <span className="text-xs font-700">{m.score.toFixed(1)}</span>
              </div>
            ) : (
              <div className="text-xs mt-2" style={{ color: isSelected ? "rgba(255,255,255,0.6)" : "var(--muted-foreground)" }}>
                평가 대기
              </div>
            )}
            {m.online && <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: isSelected ? "#fff" : "#22c55e" }} />}
          </button>
          );
        })}
        {filteredMembers.length === 0 && (
          <div className="text-xs py-4" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</div>
        )}
      </div>

      {/* Detail */}
      <div className="p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Left: profile */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-start gap-4 mb-5">
              <button
                type="button"
                onClick={() => openMemberProfile(sel.id)}
                title={`${sel.name} 프로필 보기`}
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-700 shrink-0 overflow-hidden"
                style={{ background: sel.avatarUrl ? "var(--card)" : `${sel.color}18`, color: sel.color }}
              >
                {sel.avatarUrl ? <img src={sel.avatarUrl} alt={sel.name} className="w-full h-full object-cover" /> : sel.avatar}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-700">{sel.name}</h2>
                  {sel.isLeader && (
                    <span className="text-xs px-2 py-0.5 font-600" style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: "20px" }}>
                      🧭 팀장
                    </span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 font-600"
                    style={{ background: sel.online ? "#22c55e18" : "var(--muted)", color: sel.online ? "#22c55e" : "var(--muted-foreground)", borderRadius: "20px" }}
                  >
                    {sel.online ? "온라인" : "오프라인"}
                  </span>
                </div>
                <div className="text-sm font-600 mt-0.5" style={{ color: sel.color }}>{sel.role}</div>
                <div className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>{sel.major}</div>
                <div className="flex items-center justify-between gap-2 mt-1.5 min-h-[24px]">
                  <div className="text-xs min-w-0 truncate" style={{ fontFamily: "var(--font-jetbrains)", color: "var(--muted-foreground)" }}>{sel.student}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sel.id !== currentMember?.id && onMessage && (
                      <button
                        onClick={() => onMessage(sel.id)}
                        title="메시지 보내기"
                        aria-label="메시지 보내기"
                        className="flex items-center gap-1 text-xs font-700 px-2 py-1 transition-all"
                        style={{ background: `${sel.color}12`, color: sel.color, borderRadius: "20px" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        채팅
                      </button>
                    )}
                    {canTransfer && (
                      <button
                        onClick={() => setPendingTransfer({ id: sel.id, name: sel.name })}
                        title="팀장 권한 위임"
                        aria-label="팀장 권한 위임"
                        className="flex items-center gap-1 text-xs font-700 px-2 py-1 transition-all"
                        style={{ background: "#f59e0b12", color: "#f59e0b", borderRadius: "20px" }}
                      >
                        🧭 위임
                      </button>
                    )}
                    {canKick && (
                      <button
                        onClick={() => { setActionError(null); setPendingKick({ id: sel.id, name: sel.name }); }}
                        title="팀에서 제외"
                        aria-label="팀에서 제외"
                        className="flex items-center gap-1 text-xs font-700 px-2 py-1 transition-all"
                        style={{ background: "#ef444412", color: "#ef4444", borderRadius: "20px" }}
                      >
                        ✕ 제외
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Responsibilities */}
            <div className="mb-4">
              <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>
                담당 역할
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sel.responsibilities.map((r) => (
                  <span key={r} className="text-xs font-500 px-2.5 py-1" style={{ background: `${sel.color}12`, color: sel.color, borderRadius: "20px" }}>
                    {r}
                  </span>
                ))}
                {sel.responsibilities.length === 0 && (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>아직 등록된 역할이 없어요</span>
                )}
              </div>
            </div>

            <div className="p-4" style={{ background: "var(--muted)", borderRadius: "12px" }}>
              <div className="text-xs font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                협업 평판 <span style={{ fontWeight: 400 }}>· {team.teamLabel.replace(" 팀", "")}</span>
              </div>
              {sel.evalCount > 0 ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-800" style={{ color: "var(--primary)", fontFamily: "var(--font-outfit)" }}>
                      {sel.score.toFixed(1)}
                    </span>
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>/ 10.0</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {`이 프로젝트 최종 평가 ${sel.evalCount}건 평균`}
                  </div>
                  <div className="mt-2 h-1.5 w-full" style={{ background: "var(--border)", borderRadius: "4px" }}>
                    <div className="h-1.5" style={{ width: `${(sel.score / 10) * 100}%`, background: "linear-gradient(90deg, var(--primary), #60a5fa)", borderRadius: "4px" }} />
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  평균 공개 대기 중입니다. 동료 2명 이상이 모두 제출하면 확인할 수 있습니다.
                </p>
              )}
            </div>
          </div>

          {/* Right: stats */}
          <div className="col-span-1 md:col-span-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {[
                { label: "완료 과제", value: `${sel.tasks.done}/${sel.tasks.total}`, icon: "✓", color: "#22c55e" },
                { label: "활동 횟수", value: `${sel.activities}`, icon: "◷", color: "var(--primary)" },
                { label: "완료율", value: `${sel.tasks.total ? Math.round((sel.tasks.done / sel.tasks.total) * 100) : 0}%`, icon: "⬤", color: sel.color },
              ].map((st) => (
                <div key={st.label} className="p-4" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                  <div className="text-xl font-800 mb-0.5" style={{ color: st.color, fontFamily: "var(--font-outfit)" }}>{st.value}</div>
                  <div className="text-xs font-600">{st.label}</div>
                </div>
              ))}
            </div>

            {/* Per-criterion radar chart */}
            <div className="text-xs font-600 uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
              동료 평가 항목별 점수 (참고)
            </div>
            {sel.evalCount > 0 ? (
              <div className="flex justify-center">
                <PentagonChart
                  data={[
                    { label: "역할 이행", value: sel.criteriaScores.role },
                    { label: "약속·마감 준수", value: sel.criteriaScores.deadline },
                    { label: "의사소통", value: sel.criteriaScores.communication },
                    { label: "협업 태도", value: sel.criteriaScores.collaboration },
                    { label: "결과물 품질", value: sel.criteriaScores.quality },
                  ]}
                />
              </div>
            ) : (
              <div className="text-xs p-3" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--muted-foreground)" }}>
                최종 평가 평균 공개 후 표시됩니다. {sel.id === currentMember?.id && "중간 평균은 동료 평가 탭에서 확인하세요."}
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingTransfer && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#f59e0b18", borderRadius: "12px" }}>🧭</div>
            <h3 className="font-700 mb-1">팀장 권한을 위임할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingTransfer.name}</strong>님에게 팀장 권한이 넘어가고, 나는 팀원으로 전환됩니다. 이 작업은 즉시 적용됩니다.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingTransfer(null)}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                onClick={() => { transferLeadership(pendingTransfer.id); setPendingTransfer(null); }}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}
              >
                위임하기
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingKick && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#ef444418", borderRadius: "12px" }}>✕</div>
            <h3 className="font-700 mb-1">팀에서 제외할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingKick.name}</strong>님이 이 프로젝트에서 제외됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingKick(null)}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={() => runAction(() => kickMember(pendingKick.id), () => { setSelectedId(null); setPendingKick(null); })}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}
              >
                제외하기
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingFinish && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#22c55e18", borderRadius: "12px" }}>✓</div>
            <h3 className="font-700 mb-1">프로젝트를 종료할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              종료하면 프로젝트가 읽기 전용으로 전환되며 종료 평가를 작성할 수 있습니다.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingFinish(false)}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={() => runAction(markProjectDone, () => setPendingFinish(false))}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#22c55e", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(34,197,94,0.3)" }}
              >
                종료하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
