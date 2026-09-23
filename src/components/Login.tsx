import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { adminApplicationSeenKey, clearAdminApplicationDraft, hasAdminApplicationDraft, setAdminApplicationDraft } from "../lib/adminApplication";
import AdminApplicationFields, { useAdminApplicationForm } from "./AdminApplicationFields";

type Mode = "signin" | "signup" | "admin";

const MODE_LABEL: Record<Mode, string> = { signin: "로그인", signup: "일반 가입", admin: "관리자 가입" };

// 관리자 신청서 화면은 가입 직후 처음 로그인할 때 한 번만 자동으로 열어 준다(이후에는 홈의 안내 배너로 이어진다).
function wantsAdminApplication(user: { id: string; user_metadata?: Record<string, unknown> }): boolean {
  if (user.user_metadata?.signup_type !== "admin") return false;
  try {
    return !localStorage.getItem(adminApplicationSeenKey(user.id));
  } catch {
    return true;
  }
}

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode");
  const [mode, setMode] = useState<Mode>(initialMode === "signup" ? "signup" : initialMode === "admin" ? "admin" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  // 관리자 가입과 동시에 로그인된 경우: 신청서 화면이 열리면 그곳에서 자동으로 제출한다.
  const [redirecting, setRedirecting] = useState(false);
  const adminForm = useAdminApplicationForm();

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (mode === "signin" || displayName.trim().length > 0) &&
    (mode !== "admin" || adminForm.ready);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    if (mode === "signin") {
      const result = await signIn(email.trim(), password);
      setSubmitting(false);
      if (result.error) setError(result.error);
      return;
    }
    // 가입이 끝나 로그인되는 순간 화면이 다시 그려지므로, 신청 내용은 먼저 메모리에 맡겨 둔다.
    const draft = mode === "admin" ? adminForm.input() : null;
    if (draft) setAdminApplicationDraft(draft);
    const result = await signUp(email.trim(), password, displayName.trim(), mode === "admin" ? "admin" : undefined);
    setSubmitting(false);
    if (result.error) {
      clearAdminApplicationDraft();
      setError(result.error);
      return;
    }
    if (draft && result.signedIn) {
      setRedirecting(true);
      return;
    }
    // 이메일 인증이 필요한 설정이면 지금은 로그인할 수 없으므로 신청서는 로그인 뒤에 제출한다.
    clearAdminApplicationDraft();
    setSignedUp(true);
  }

  // Already signed in (just logged in, just signed up with email
  // confirmation off, or opened /login directly while authenticated) —
  // there was previously no redirect here at all, so the login button
  // appeared to do nothing.
  // 가입 폼에서 넘어온 신청 내용이 있으면 "이미 봤음" 표시와 무관하게 신청서 화면에서 제출해야 한다.
  if (user) return <Navigate to={hasAdminApplicationDraft() || wantsAdminApplication(user) ? "/admin-application" : "/home"} replace />;

  return (
    <div className="flex h-full w-full justify-center overflow-y-auto py-6" style={{ background: "var(--background)" }}>
      <div
        className="w-[24rem] max-w-[92vw] p-6 my-auto"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        <div
          className="w-10 h-10 flex items-center justify-center text-lg font-700 mb-3"
          style={{ background: "#2563eb18", color: "var(--primary)", borderRadius: "12px" }}
        >
          CP
        </div>
        <h3 className="font-700 mb-1">{mode === "signin" ? "로그인" : mode === "admin" ? "관리자 회원가입" : "회원가입"}</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          {mode === "admin" ? "교수·교원 등 프로젝트를 관리하는 분을 위한 가입입니다." : "팀 프로젝트에 참여하려면 계정이 필요합니다."}
        </p>

        <div className="flex gap-1 p-0.5 mb-4" style={{ background: "var(--muted)", borderRadius: "20px" }}>
          {(["signin", "signup", "admin"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={redirecting}
              onClick={() => {
                setMode(m);
                setError(null);
                setSignedUp(false);
              }}
              className="flex-1 text-xs font-600 px-2.5 py-1.5 transition-all"
              style={{
                background: mode === m ? "var(--card)" : "transparent",
                color: mode === m ? "var(--primary)" : "var(--muted-foreground)",
                borderRadius: "16px",
                boxShadow: mode === m ? "var(--shadow-card)" : "none",
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {redirecting ? (
          <div role="status" className="text-sm p-3" style={{ background: "#22c55e12", color: "#22c55e", borderRadius: "10px" }}>
            가입이 완료되었어요. 관리자 신청서를 제출하는 중입니다…
          </div>
        ) : signedUp ? (
          <div className="text-sm p-3" style={{ background: "#22c55e12", color: "#22c55e", borderRadius: "10px" }}>
            인증 이메일을 보냈습니다. 받은 편지함을 확인해주세요.
            {mode === "admin" && (
              <div className="text-xs mt-2" style={{ color: "var(--foreground)" }}>
                이메일 인증 후 로그인하면 <strong>관리자 신청서</strong> 화면이 열립니다. 증명서 PDF를 제출하고 운영자의 확인·승인을 받으면 관리자가 됩니다.
              </div>
            )}
          </div>
        ) : (
          <>
            {mode === "admin" && (
              <div className="text-xs mb-4 p-3" style={{ background: "#3b82f612", color: "var(--foreground)", borderRadius: "10px", lineHeight: 1.6 }}>
                <div className="font-700 mb-1">관리자 가입 절차</div>
                <ol className="list-decimal pl-4">
                  <li>계정 정보와 소속·직위, <strong>교수·교원 증명서(PDF)</strong>를 한 번에 입력합니다.</li>
                  <li>가입하면 신청서가 자동으로 제출됩니다.</li>
                  <li>운영자가 직접 확인해 승인하면 관리자가 됩니다.</li>
                </ol>
                <div className="mt-1.5" style={{ color: "var(--muted-foreground)" }}>승인 전에는 일반 사용자로 이용할 수 있습니다.</div>
              </div>
            )}

            {mode !== "signin" && (
              <>
                <label className="text-xs font-600 block mb-1.5">이름</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="예: 김지수"
                  className="w-full text-sm px-3 py-2.5 outline-none mb-3"
                  style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
                />
              </>
            )}

            <label className="text-xs font-600 block mb-1.5">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-sm px-3 py-2.5 outline-none mb-3"
              style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
            />

            <label className="text-xs font-600 block mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && mode !== "admin" && submit()}
              placeholder={mode !== "signin" ? "6자 이상" : "비밀번호"}
              className={`w-full text-sm px-3 py-2.5 outline-none ${mode !== "signin" ? "mb-1.5" : "mb-4"}`}
              style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
            />
            {mode !== "signin" && (
              <div className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>비밀번호는 6자 이상이어야 합니다.</div>
            )}

            {mode === "admin" && (
              <>
                <div className="text-sm font-700 mb-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>교수·교원 인증</div>
                <AdminApplicationFields form={adminForm} />
              </>
            )}

            {error && (
              <div role="alert" className="text-xs mb-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="w-full py-2.5 text-sm font-700 transition-all"
              style={{
                background: canSubmit && !submitting ? "var(--primary)" : "var(--border)",
                color: canSubmit && !submitting ? "#fff" : "var(--muted-foreground)",
                borderRadius: "40px",
                boxShadow: canSubmit && !submitting ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "처리 중…" : mode === "signin" ? "로그인" : mode === "admin" ? "관리자로 가입하기" : "가입하기"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
