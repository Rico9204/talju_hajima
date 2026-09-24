import { useEffect, useState } from "react";
import { useProjectManagement } from "../context/ProjectContext";
import type { Project } from "../api/types";
import { useAuth } from "../context/AuthContext";
import AdminProjectMembers from "./AdminProjectMembers";
import AdminReports from "./AdminReports";

const STATUS_LABEL: Record<Project["approvalStatus"], { text: string; bg: string; color: string }> = {
  pending: { text: "승인 대기", bg: "#f59e0b18", color: "#f59e0b" },
  approved: { text: "승인됨", bg: "#22c55e18", color: "#22c55e" },
  rejected: { text: "반려됨", bg: "#ef444418", color: "#ef4444" },
};

function AdminTabs({ tab, onChange, openReports }: { tab: "projects" | "reports"; onChange: (t: "projects" | "reports") => void; openReports: number | null }) {
  const item = (value: "projects" | "reports", label: string) => (
    <button
      role="tab"
      aria-selected={tab === value}
      onClick={() => onChange(value)}
      className="text-sm font-700 px-4 py-2"
      style={{ background: tab === value ? "var(--primary)" : "var(--muted)", color: tab === value ? "#fff" : "var(--foreground)", borderRadius: "20px" }}
    >
      {label}
    </button>
  );
  return (
    <div className="mb-5 flex gap-2" role="tablist" aria-label="관리자 메뉴">
      {item("projects", "프로젝트 관리")}
      {item("reports", openReports ? `신고 관리 (${openReports})` : "신고 관리")}
    </div>
  );
}

export default function AdminPanel() {
  const dataRepository = useProjectManagement();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [viewingMembers, setViewingMembers] = useState<Project | null>(null);
  const [cleanupNotice, setCleanupNotice] = useState("");
  const [evalMode, setEvalMode] = useState<boolean | null>(null);
  const [evalModeBusy, setEvalModeBusy] = useState(false);
  const [tab, setTab] = useState<"projects" | "reports">("projects");
  const [openReports, setOpenReports] = useState<number | null>(null);

  async function retryCleanup() {
    setBusyId("cleanup"); setError(null); setCleanupNotice("");
    try { await dataRepository.retryFileCleanup(); setCleanupNotice("대기 중인 원본 파일 정리를 완료했습니다."); }
    catch { setError("원본 파일 정리를 완료하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusyId(null); }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await dataRepository.listProjects();
      setProjects(list);
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "요청을 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    dataRepository.getEvaluationMode().then(setEvalMode).catch(() => setEvalMode(null));
  }, []);

  async function toggleEvalMode() {
    if (evalMode === null || evalModeBusy) return;
    setEvalModeBusy(true);
    setError(null);
    try {
      await dataRepository.setEvaluationMode(!evalMode);
      setEvalMode(!evalMode);
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "요청을 처리하지 못했습니다.");
    } finally {
      setEvalModeBusy(false);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await dataRepository.approveProject(id);
      await refresh();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "요청을 처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await dataRepository.rejectProject(id);
      await refresh();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "요청을 처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setError(null);
    try {
      await dataRepository.deleteProject(pendingDelete.id);
      const deletedId = pendingDelete.id;
      setPendingDelete(null);
      await refresh();
      await dataRepository.cleanupProjectFiles(deletedId);
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "요청을 처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // Scoped to requests routed to me specifically, plus untargeted ones
  // (admin-created/legacy rows) — matches the projects_update RLS policy,
  // which blocks approving a project routed to a *different* admin.
  const pending = projects.filter(
    (p) => p.approvalStatus === "pending" && (!p.requestedAdminId || p.requestedAdminId === user?.id)
  );
  const rest = projects.filter((p) => !pending.includes(p));

  if (tab === "reports") {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <AdminTabs tab={tab} onChange={setTab} openReports={openReports} />
        <div className="mb-6">
          <h1 className="text-2xl font-700">신고 관리</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>게시판에 들어온 신고를 상태와 구분별로 확인하고 처리해요.</p>
        </div>
        <AdminReports onOpenCountChange={setOpenReports} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AdminTabs tab={tab} onChange={setTab} openReports={openReports} />
      <div className="mb-6">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          관리자
        </div>
        <h1 className="text-2xl font-700">프로젝트 관리</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          조장이 만든 프로젝트를 승인·반려하고, 필요하면 프로젝트를 영구 삭제할 수 있어요. 프로젝트를 클릭하면 팀원을 확인하고 제외할 수 있어요.
        </p>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex items-center justify-between gap-3 p-4" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        <div>
          <div className="text-sm font-700">동료평가 테스트 모드</div>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            켜져 있으면 프로젝트 상태·기간, 전원 제출 여부와 무관하게 평가 제출과 평판 조회가 가능해요. 실제 운영 시에는 꺼주세요.
          </p>
        </div>
        <button
          onClick={toggleEvalMode}
          disabled={evalMode === null || evalModeBusy}
          role="switch"
          aria-checked={evalMode === true}
          className="text-xs font-700 px-4 py-2 shrink-0 transition-all"
          style={{
            background: evalMode ? "#22c55e18" : "var(--muted)",
            color: evalMode ? "#22c55e" : "var(--muted-foreground)",
            borderRadius: "20px",
          }}
        >
          {evalMode === null ? "불러오는 중…" : evalModeBusy ? "변경 중…" : evalMode ? "켜짐" : "꺼짐"}
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3 text-xs">
        <button disabled={busyId !== null} onClick={retryCleanup} className="rounded-full px-3 py-2" style={{ background: "var(--muted)", color: "var(--primary)" }}>원본 파일 정리 재시도</button>
        {cleanupNotice && <span role="status">{cleanupNotice}</span>}
      </div>
      {loading && (
        <div className="text-sm text-center py-8" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>
      )}

      {!loading && (
        <>
          <div className="mb-6">
            <h2 className="text-sm font-700 mb-3">승인 대기 ({pending.length})</h2>
            {pending.length === 0 ? (
              <div
                className="p-6 border text-center text-sm"
                style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
              >
                승인 대기 중인 프로젝트가 없어요.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {pending.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setViewingMembers(p)}
                    className="flex items-center justify-between gap-3 p-4 cursor-pointer transition-all"
                    style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-700 truncate">{p.name}</div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
                        {p.org} · {p.period}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={busyId === p.id}
                        onClick={(e) => { e.stopPropagation(); reject(p.id); }}
                        className="text-xs font-700 px-3.5 py-2 transition-all"
                        style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}
                      >
                        반려
                      </button>
                      <button
                        disabled={busyId === p.id}
                        onClick={(e) => { e.stopPropagation(); approve(p.id); }}
                        className="text-xs font-700 px-3.5 py-2 transition-all"
                        style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}
                      >
                        승인
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-700 mb-3">전체 프로젝트 ({rest.length})</h2>
            <div className="flex flex-col gap-2">
              {rest.map((p) => {
                const label = STATUS_LABEL[p.approvalStatus];
                return (
                  <div
                    key={p.id}
                    onClick={() => setViewingMembers(p)}
                    className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-all"
                    style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span
                        className="text-xs px-2 py-0.5 font-600 shrink-0"
                        style={{ background: label.bg, color: label.color, borderRadius: "20px" }}
                      >
                        {label.text}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-700 truncate">{p.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{p.org}</div>
                      </div>
                    </div>
                    <button
                      disabled={busyId === p.id}
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                      title="프로젝트 삭제"
                      className="w-7 h-7 flex items-center justify-center shrink-0 transition-all"
                      style={{ background: "#ef444418", borderRadius: "8px" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center mb-3" style={{ background: "#ef444418", borderRadius: "12px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <h3 className="font-700 mb-1">프로젝트를 삭제할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingDelete.name}</strong>의 팀원·과제·파일·일정이 스냅샷 없이 즉시 모두 삭제되며, 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={busyId === pendingDelete.id}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyId === pendingDelete.id}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}
              >
                {busyId === pendingDelete.id ? "삭제 중…" : "삭제하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingMembers && (
        <AdminProjectMembers project={viewingMembers} onClose={() => setViewingMembers(null)} />
      )}
    </div>
  );
}
