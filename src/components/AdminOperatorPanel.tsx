import { useEffect, useState } from "react";
import { useProjectManagement } from "../context/ProjectContext";
import type { AdminAccount, AdminApplicationRecord } from "../api/types";
import { SHOW_EMAIL_VERIFICATION_BADGE, adminDocTypeLabel, formatDateTime, formatFileSize } from "../lib/adminApplication";

function errorText(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string" && err.message ? err.message : fallback;
}

const STATUS_BADGE = {
  pending: { text: "검토 대기", bg: "#f59e0b18", color: "#f59e0b" },
  approved: { text: "승인됨", bg: "#22c55e18", color: "#22c55e" },
  rejected: { text: "반려됨", bg: "#ef444418", color: "#ef4444" },
} as const;

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div
        className="w-96 max-w-full p-6"
        style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// 운영자 전용: 관리자 가입 신청을 확인·승인·반려하고, 현재 관리자를 관리한다.
export default function AdminOperatorPanel({ onPendingCountChange }: { onPendingCountChange?: (count: number) => void }) {
  const api = useProjectManagement();
  const [applications, setApplications] = useState<AdminApplicationRecord[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<AdminApplicationRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminApplicationRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<AdminAccount | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [apps, admins] = await Promise.all([api.listAdminApplications(), api.listAdminAccounts()]);
      setApplications(apps);
      onPendingCountChange?.(apps.filter((a) => a.status === "pending").length);
      setAccounts(admins);
      // 처리가 끝난 증명서 원본은 지운다. 실패한 것은 다음에 열 때 다시 시도한다.
      let failed = 0;
      let cleaned = 0;
      for (const rec of apps) {
        if (rec.status === "pending" || !rec.docPath) continue;
        try {
          await api.cleanupAdminDocument(rec.id, rec.docPath);
          cleaned++;
        } catch {
          failed++;
        }
      }
      setNotice(failed > 0 ? `증명서 파일 ${failed}건을 아직 삭제하지 못했어요. 새로고침하면 다시 시도합니다.` : "");
      if (cleaned > 0) setApplications(await api.listAdminApplications());
    } catch (err) {
      setError(errorText(err, "관리자 신청 정보를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function viewDocument(rec: AdminApplicationRecord) {
    if (!rec.docPath) return;
    // 비동기 작업 뒤에 창을 열면 팝업 차단에 걸리므로 먼저 빈 창을 열어 둔다.
    const win = window.open("about:blank", "_blank");
    if (!win) {
      setError("팝업이 차단되어 증명서를 열지 못했습니다. 이 사이트의 팝업을 허용해 주세요.");
      return;
    }
    try {
      const url = await api.getAdminApplicationDocumentUrl(rec.docPath);
      win.opener = null;
      win.location.href = url;
    } catch (err) {
      win.close();
      setError(errorText(err, "증명서를 열지 못했습니다."));
    }
  }

  async function decide(rec: AdminApplicationRecord, approve: boolean, note: string) {
    setBusyId(rec.id);
    setDialogError(null);
    try {
      await api.reviewAdminApplication(rec.id, approve, note);
      setApproveTarget(null);
      setRejectTarget(null);
      setRejectNote("");
      await load();
    } catch (err) {
      setDialogError(errorText(err, "처리하지 못했습니다."));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(account: AdminAccount) {
    setBusyId(account.userId);
    setDialogError(null);
    try {
      await api.revokeAdmin(account.userId);
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setDialogError(errorText(err, "관리자 권한을 해제하지 못했습니다."));
    } finally {
      setBusyId(null);
    }
  }

  const pending = applications.filter((a) => a.status === "pending");
  const decided = applications.filter((a) => a.status !== "pending").slice(0, 10);
  const card = { background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" };

  return (
    <div className="mb-8">
      <div className="mb-4">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>운영자</div>
        <h2 className="text-xl font-700">관리자 신청 관리</h2>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          교수·교원 증명서를 직접 확인한 뒤 승인해 주세요. 처리가 끝나면 증명서 파일은 자동으로 삭제됩니다.
        </p>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="mb-3 text-xs" style={{ color: "#f59e0b" }}>{notice}</p>}
      {loading && <div className="text-sm py-6 text-center" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>}

      {!loading && (
        <>
          <h3 className="text-sm font-700 mb-2">승인 대기 ({pending.length})</h3>
          {pending.length === 0 ? (
            <div className="p-5 mb-5 border text-center text-sm" style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              대기 중인 관리자 신청이 없어요.
            </div>
          ) : (
            <div className="flex flex-col gap-3 mb-5">
              {pending.map((rec) => (
                <div key={rec.id} className="p-4" style={card}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-700">{rec.displayName}</span>
                        {SHOW_EMAIL_VERIFICATION_BADGE && (
                        <span className="text-xs px-2 py-0.5 font-600" style={{ background: rec.emailConfirmed ? "#22c55e18" : "#ef444418", color: rec.emailConfirmed ? "#22c55e" : "#ef4444", borderRadius: "20px" }}>
                          {rec.emailConfirmed ? "이메일 인증됨" : "이메일 미인증"}
                        </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5 break-all" style={{ color: "var(--muted-foreground)" }}>{rec.email}</div>
                    </div>
                    <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{formatDateTime(rec.submittedAt)}</span>
                  </div>
                  <div className="text-sm">{rec.org} · {rec.jobTitle}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>연락처 {rec.contact}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    {adminDocTypeLabel(rec.docType)} · {rec.docName} ({formatFileSize(rec.docSize)})
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => viewDocument(rec)} disabled={!rec.docPath} className="text-xs font-700 px-3.5 py-2" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                      증명서 보기
                    </button>
                    <button onClick={() => { setDialogError(null); setApproveTarget(rec); }} className="text-xs font-700 px-3.5 py-2" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}>
                      승인
                    </button>
                    <button onClick={() => { setDialogError(null); setRejectNote(""); setRejectTarget(rec); }} className="text-xs font-700 px-3.5 py-2" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>
                      반려
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {decided.length > 0 && (
            <>
              <h3 className="text-sm font-700 mb-2">최근 처리</h3>
              <div className="flex flex-col gap-2 mb-5">
                {decided.map((rec) => {
                  const badge = STATUS_BADGE[rec.status];
                  return (
                    <div key={rec.id} className="flex items-start justify-between gap-3 p-3" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-700">{rec.displayName}</span>
                          <span className="text-xs font-600 px-2 py-0.5" style={{ background: badge.bg, color: badge.color, borderRadius: "20px" }}>{badge.text}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          {rec.org} · {rec.jobTitle}{rec.reviewNote ? ` · ${rec.reviewNote}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-right shrink-0" style={{ color: "var(--muted-foreground)" }}>
                        <div>{rec.reviewedAt ? formatDateTime(rec.reviewedAt) : ""}</div>
                        <div>{rec.reviewedByName ? `처리 ${rec.reviewedByName}` : ""}</div>
                        <div>{rec.docDeleted ? "증명서 삭제됨" : rec.docPath ? "삭제 대기" : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h3 className="text-sm font-700 mb-2">현재 관리자 ({accounts.length})</h3>
          <div className="flex flex-col gap-2">
            {accounts.map((acct) => (
              <div key={acct.userId} className="flex items-center justify-between gap-3 p-3" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-700">{acct.displayName}</span>
                    {acct.isOperator && (
                      <span className="text-xs font-600 px-2 py-0.5" style={{ background: "#3b82f618", color: "#3b82f6", borderRadius: "20px" }}>운영자</span>
                    )}
                    {acct.pendingProjects > 0 && (
                      <span className="text-xs font-600 px-2 py-0.5" style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: "20px" }}>승인 대기 프로젝트 {acct.pendingProjects}건</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5 break-all" style={{ color: "var(--muted-foreground)" }}>{acct.email}{acct.org ? ` · ${acct.org}` : ""}</div>
                </div>
                {!acct.isOperator && (
                  <button onClick={() => { setDialogError(null); setRevokeTarget(acct); }} className="text-xs font-700 px-3.5 py-2 shrink-0" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>
                    관리자 해제
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {approveTarget && (
        <Modal onClose={() => setApproveTarget(null)}>
          <h3 className="font-700 mb-1">관리자로 승인할까요?</h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            <strong>{approveTarget.displayName}</strong>님({approveTarget.org} · {approveTarget.jobTitle})에게 관리자 권한이 바로 적용됩니다. 증명서를 확인하셨나요?
          </p>
          {dialogError && <p role="alert" className="text-xs mb-3" style={{ color: "#ef4444" }}>{dialogError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setApproveTarget(null)} disabled={busyId === approveTarget.id} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>취소</button>
            <button onClick={() => decide(approveTarget, true, "")} disabled={busyId === approveTarget.id} className="flex-1 py-2.5 text-sm font-700" style={{ background: "#22c55e", color: "#fff", borderRadius: "40px" }}>
              {busyId === approveTarget.id ? "처리 중…" : "승인하기"}
            </button>
          </div>
        </Modal>
      )}

      {rejectTarget && (
        <Modal onClose={() => setRejectTarget(null)}>
          <h3 className="font-700 mb-1">신청을 반려할까요?</h3>
          <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
            <strong>{rejectTarget.displayName}</strong>님에게 표시될 반려 사유를 적어 주세요. 반려 후 24시간이 지나면 다시 신청할 수 있어요.
          </p>
          <textarea
            value={rejectNote}
            maxLength={500}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="예: 증명서의 직위를 확인할 수 없습니다."
            rows={3}
            className="w-full text-sm px-3 py-2.5 outline-none mb-1"
            style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
          />
          {dialogError && <p role="alert" className="text-xs mb-2" style={{ color: "#ef4444" }}>{dialogError}</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => setRejectTarget(null)} disabled={busyId === rejectTarget.id} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>취소</button>
            <button
              onClick={() => decide(rejectTarget, false, rejectNote)}
              disabled={busyId === rejectTarget.id || !rejectNote.trim()}
              className="flex-1 py-2.5 text-sm font-700"
              style={{ background: rejectNote.trim() ? "#ef4444" : "var(--border)", color: rejectNote.trim() ? "#fff" : "var(--muted-foreground)", borderRadius: "40px" }}
            >
              {busyId === rejectTarget.id ? "처리 중…" : "반려하기"}
            </button>
          </div>
        </Modal>
      )}

      {revokeTarget && (
        <Modal onClose={() => setRevokeTarget(null)}>
          <h3 className="font-700 mb-1">관리자 권한을 해제할까요?</h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            <strong>{revokeTarget.displayName}</strong>님은 일반 사용자로 돌아갑니다. 승인 대기 프로젝트를 맡고 있으면 해제할 수 없어요.
          </p>
          {dialogError && <p role="alert" className="text-xs mb-3" style={{ color: "#ef4444" }}>{dialogError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setRevokeTarget(null)} disabled={busyId === revokeTarget.userId} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>취소</button>
            <button onClick={() => revoke(revokeTarget)} disabled={busyId === revokeTarget.userId} className="flex-1 py-2.5 text-sm font-700" style={{ background: "#ef4444", color: "#fff", borderRadius: "40px" }}>
              {busyId === revokeTarget.userId ? "처리 중…" : "해제하기"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
