import { useEffect, useState } from "react";
import { useProjectManagement } from "../context/ProjectContext";
import type { Project, TeamData } from "../api/types";

// The dedicated admin RPC returns the roster without exposing evaluation scores.
export default function AdminProjectMembers({ project, onClose }: { project: Project; onClose: () => void }) {
  const dataRepository = useProjectManagement();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [pendingKick, setPendingKick] = useState<{ id: string; name: string } | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const [viceError, setViceError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setTeam(await dataRepository.getAdminTeam(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "팀원 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [project.id]);

  async function toggleViceLeader(memberId: string, enabled: boolean) {
    setBusyMemberId(memberId);
    setViceError(null);
    try {
      await dataRepository.setViceLeader(memberId, enabled);
      await refresh();
    } catch (err) {
      setViceError(err instanceof Error ? err.message : "부팀장 지정을 변경하지 못했습니다.");
    } finally {
      setBusyMemberId(null);
    }
  }

  async function kick(memberId: string) {
    setBusyMemberId(memberId);
    setKickError(null);
    try {
      await dataRepository.kickMember(memberId);
      setPendingKick(null);
      await refresh();
    } catch (err) {
      setKickError(err instanceof Error ? err.message : "제외하지 못했습니다.");
    } finally {
      setBusyMemberId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
        style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>
              팀원 관리
            </div>
            <h3 className="text-lg font-700 truncate">{project.name}</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{project.org} · {project.period}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center text-lg"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
          >
            ×
          </button>
        </div>

        {loading && <div className="text-sm text-center py-8" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>}
        {error && <div className="text-sm text-center py-4" style={{ color: "#ef4444" }}>{error}</div>}
        {viceError && <div role="alert" className="text-xs text-center pb-3" style={{ color: "#ef4444" }}>{viceError}</div>}

        {!loading && !error && team && (
          team.members.length === 0 ? (
            <div
              className="p-6 border text-center text-sm"
              style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
            >
              아직 팀원이 없어요.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {team.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-3" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 shrink-0 overflow-hidden"
                      style={{ background: m.avatarUrl ? "var(--card)" : `${m.color}18`, color: m.color }}
                    >
                      {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : m.avatar}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-700 truncate flex items-center gap-1.5">
                        {m.name}
                        {m.isViceLeader && (
                          <span className="text-xs font-600 px-1.5 py-0.5 shrink-0" style={{ background: "#3b82f618", color: "#3b82f6", borderRadius: "20px" }}>
                            부팀장
                          </span>
                        )}
                        {m.isLeader && (
                          <span className="text-xs font-600 px-1.5 py-0.5 shrink-0" style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: "20px" }}>
                            팀장
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                        {m.major}{m.student ? ` · ${m.student}` : ""}
                      </div>
                    </div>
                  </div>
                  {!m.isLeader && project.status === "active" && project.approvalStatus === "approved" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        disabled={busyMemberId === m.id}
                        onClick={() => toggleViceLeader(m.id, !m.isViceLeader)}
                        className="text-xs font-700 px-3 py-1.5 transition-all"
                        style={{ background: "#3b82f618", color: "#3b82f6", borderRadius: "20px" }}
                      >
                        {m.isViceLeader ? "부팀장 해임" : "부팀장 임명"}
                      </button>
                      <button
                        disabled={busyMemberId === m.id}
                        onClick={() => { setKickError(null); setPendingKick({ id: m.id, name: m.name }); }}
                        className="text-xs font-700 px-3 py-1.5 transition-all"
                        style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}
                      >
                        제외
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {pendingKick && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[60]"
          style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}
          onClick={() => { setPendingKick(null); setKickError(null); }}
        >
          <div
            className="w-96 p-6"
            style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-700 mb-1">팀에서 제외할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingKick.name}</strong>님이 이 프로젝트에서 제외됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            {kickError && <p className="text-xs mb-3" style={{ color: "#ef4444" }}>{kickError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPendingKick(null); setKickError(null); }}
                disabled={busyMemberId === pendingKick.id}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                onClick={() => kick(pendingKick.id)}
                disabled={busyMemberId === pendingKick.id}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}
              >
                {busyMemberId === pendingKick.id ? "제외 중…" : "제외하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
