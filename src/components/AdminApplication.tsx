import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProjectManagement } from "../context/ProjectContext";
import type { MyAdminApplication } from "../api/types";
import { adminApplicationSeenKey, adminDocTypeLabel, formatDateTime, reapplyAvailableAt, takeAdminApplicationDraft } from "../lib/adminApplication";
import AdminApplicationFields, { useAdminApplicationForm } from "./AdminApplicationFields";

function errorText(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string" && err.message ? err.message : fallback;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-5 mb-4" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm py-1">
      <div className="w-20 shrink-0 text-xs pt-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}

export default function AdminApplication() {
  const { user, signOut } = useAuth();
  const { isAdmin, getMyAdminApplication, submitAdminApplication } = useProjectManagement();
  const navigate = useNavigate();
  const [application, setApplication] = useState<MyAdminApplication | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const form = useAdminApplicationForm();
  const [submitting, setSubmitting] = useState(false);
  // 관리자 가입 폼에서 넘어온 신청서를 자동으로 제출하는 중인지.
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // 가입 직후 자동 안내는 한 번만.
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(adminApplicationSeenKey(user.id), "1");
    } catch {
      /* 저장소를 못 써도 화면은 정상 동작한다 */
    }
  }, [user?.id]);

  async function load() {
    setLoadError(null);
    try {
      setApplication(await getMyAdminApplication());
    } catch (err) {
      setLoadError(errorText(err, "신청 정보를 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // 가입 폼에서 신청 내용을 함께 입력했다면 여기서 바로 제출한다. 실패하면 입력값을 채워 다시 제출할 수 있게 한다.
    const draft = takeAdminApplicationDraft();
    if (!draft) {
      void load();
      return;
    }
    setAutoSubmitting(true);
    void (async () => {
      try {
        await submitAdminApplication(draft);
      } catch (err) {
        form.load(draft);
        setError(errorText(err, "신청을 제출하지 못했습니다.") + " 아래에서 다시 제출해 주세요.");
      } finally {
        setAutoSubmitting(false);
        await load();
      }
    })();
  }, []);

  const pending = application?.status === "pending";
  const reapplyAt = application ? reapplyAvailableAt(application.status, application.reviewedAt) : null;
  const waiting = !!reapplyAt && reapplyAt.getTime() > Date.now();

  async function submit() {
    const input = form.input();
    if (!input || submitting || waiting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitAdminApplication(input);
      await load();
    } catch (err) {
      setError(errorText(err, "신청을 제출하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = form.ready && !submitting && !waiting;

  return (
    <div className="h-full w-full overflow-y-auto" style={{ background: "var(--background)" }}>
      <div className="max-w-xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
              관리자 신청
            </div>
            <h1 className="text-2xl font-700">관리자 신청서</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => navigate("/home")} className="text-xs font-600 px-3.5 py-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
              홈으로
            </button>
            <button onClick={signOut} className="text-xs font-600 px-3.5 py-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
              로그아웃
            </button>
          </div>
        </div>

        {isAdmin ? (
          <Card>
            <div className="text-sm font-700 mb-1">이미 관리자 계정입니다</div>
            <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>추가로 신청하실 필요가 없어요.</p>
            <button onClick={() => navigate("/admin")} className="text-xs font-700 px-4 py-2" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>
              관리자 화면으로
            </button>
          </Card>
        ) : autoSubmitting ? (
          <div role="status" className="text-sm text-center py-10" style={{ color: "var(--muted-foreground)" }}>
            가입한 정보로 관리자 신청서를 제출하는 중입니다…
          </div>
        ) : loadError ? (
          <Card>
            <div role="alert" className="text-sm mb-3" style={{ color: "#ef4444" }}>{loadError}</div>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>관리자 신청 기능이 아직 준비되지 않았거나 연결에 문제가 있을 수 있어요.</p>
            <button onClick={load} className="text-xs font-700 px-4 py-2" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
              다시 시도
            </button>
          </Card>
        ) : application === undefined ? (
          <div role="status" className="text-sm text-center py-10" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>
        ) : (
          <>
            {pending && application && (
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-700 px-2.5 py-1" style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: "20px" }}>검토 대기</span>
                  <span className="text-sm font-700">운영자가 증명서를 확인하고 있어요</span>
                </div>
                <Row label="소속" value={application.org} />
                <Row label="직위" value={application.jobTitle} />
                <Row label="증명서" value={`${adminDocTypeLabel(application.docType)} · ${application.docName}`} />
                <Row label="제출일" value={formatDateTime(application.submittedAt)} />
                <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
                  승인되면 관리자 권한이 자동으로 적용됩니다. 그동안에는 일반 사용자로 이용할 수 있어요.
                </p>
              </Card>
            )}

            {!pending && application?.status === "rejected" && (
              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-700 px-2.5 py-1" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>반려됨</span>
                  <span className="text-sm font-700">이전 신청이 반려되었어요</span>
                </div>
                {application.reviewNote && <Row label="사유" value={application.reviewNote} />}
                {application.reviewedAt && <Row label="처리일" value={formatDateTime(application.reviewedAt)} />}
                {waiting && reapplyAt && (
                  <p className="text-xs mt-2" style={{ color: "#f59e0b" }}>{formatDateTime(reapplyAt.toISOString())} 이후에 다시 신청할 수 있어요.</p>
                )}
              </Card>
            )}

            {!pending && application?.status === "approved" && (
              <Card>
                <div className="text-sm font-700 mb-1">이전 관리자 권한이 해제되었어요</div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>필요하면 아래에서 다시 신청할 수 있어요.</p>
              </Card>
            )}

            {!pending && (
              <Card>
                <div className="text-sm font-700 mb-1">교수·교원 인증</div>
                <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                  소속과 직위를 밝히고 교수·교원 등 주요 직위를 확인할 수 있는 증명서(PDF)를 제출해 주세요. 운영자가 직접 확인한 뒤 승인합니다.
                </p>

                <AdminApplicationFields form={form} />

                {error && <div role="alert" className="text-xs mb-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>{error}</div>}
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="w-full py-2.5 text-sm font-700 transition-all"
                  style={{
                    background: canSubmit ? "var(--primary)" : "var(--border)",
                    color: canSubmit ? "#fff" : "var(--muted-foreground)",
                    borderRadius: "40px",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                >
                  {submitting ? "제출 중…" : "신청서 제출"}
                </button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
