import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { requestPasswordReset, resendConfirmation } from "../api/rest/authApi";
import { useAuth } from "../context/AuthContext";
import { adminApplicationSeenKey } from "../lib/adminApplication";

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
  const { user, loading, signIn, signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode");
  const [mode, setMode] = useState<Mode>(initialMode === "signup" ? "signup" : initialMode === "admin" ? "admin" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  // 로그인 화면 안의 "계정 찾기": 비밀번호 재설정 링크·가입 인증 메일 다시 받기.
  const [recovering, setRecovering] = useState(false);
  const [recoverNotice, setRecoverNotice] = useState<string | null>(null);

  async function recover(send: (email: string) => Promise<unknown>) {
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setRecoverNotice(null);
    try {
      await send(email.trim());
      setRecoverNotice("해당 이메일로 가입된 계정이 있으면 메일을 보냈습니다. 받은 편지함을 확인해주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "메일을 보내지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (mode === "signin" || displayName.trim().length > 0);

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
    // 가입은 항상 메일 인증을 거친다. 관리자 신청서(소속·직위·증명서 PDF)는 인증 후 처음 로그인할 때 열리는
    // 신청서 화면에서 받는다(예전엔 가입 폼에서 받았지만, 가입 직후엔 로그인되지 않아 제출되지 못하고 버려졌다).
    const result = await signUp(email.trim(), password, displayName.trim(), mode === "admin" ? "admin" : undefined);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSignedUp(true);
  }

  // Already signed in (just logged in, just signed up with email
  // confirmation off, or opened /login directly while authenticated) —
  // there was previously no redirect here at all, so the login button
  // appeared to do nothing.
  // 가입 폼에서 넘어온 신청 내용이 있으면 "이미 봤음" 표시와 무관하게 신청서 화면에서 제출해야 한다.
  if (loading) return null; // 새로 고침 직후 로그인 상태를 되찾는 중
  if (user) return <Navigate to={wantsAdminApplication(user) ? "/admin-application" : "/home"} replace />;

  return (
    <div className="flex h-full w-full justify-center overflow-y-auto py-6" style={{ background: "var(--background)" }}>
      <div
        className="w-[24rem] max-w-[92vw] p-6 my-auto"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        <img src="/slackerspace_icon.png" alt="Slackerspace" className="w-10 h-10 mb-3" style={{ borderRadius: "20%" }} />
        <h3 className="font-700 mb-1">{mode === "signin" ? "로그인" : mode === "admin" ? "관리자 회원가입" : "회원가입"}</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          {mode === "admin" ? "교수·교원 등 프로젝트를 관리하는 분을 위한 가입입니다." : "팀 프로젝트에 참여하려면 계정이 필요합니다."}
        </p>

        <div className="flex gap-1 p-0.5 mb-4" style={{ background: "var(--muted)", borderRadius: "20px" }}>
          {(["signin", "signup", "admin"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setSignedUp(false);
                setRecovering(false);
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

        {signedUp ? (
          <div className="text-sm p-3" style={{ background: "#22c55e12", color: "#22c55e", borderRadius: "10px" }}>
            인증 이메일을 보냈습니다. 받은 편지함을 확인해주세요.
            <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>메일이 보이지 않으면 <strong>스팸함</strong>을 확인해 주세요. 스팸함에 있었다면 "스팸 아님"으로 표시하면 다음부터 받은 편지함으로 옵니다.</div>
            {mode === "admin" && (
              <div className="text-xs mt-2" style={{ color: "var(--foreground)" }}>
                이메일 인증 후 로그인하면 <strong>관리자 신청서</strong> 화면이 열립니다. 증명서 PDF를 제출하고 운영자의 확인·승인을 받으면 관리자가 됩니다.
              </div>
            )}
          </div>
        ) : recovering ? (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              가입한 이메일을 입력하세요. 비밀번호 재설정 링크(1시간 유효) 또는 가입 인증 메일을 다시 보내 드립니다.
            </p>
            <label className="text-xs font-600 block mb-1.5">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-sm px-3 py-2.5 outline-none mb-3"
              style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
            />
            {recoverNotice && (
              <div role="status" className="text-xs mb-3 px-3 py-2" style={{ background: "#22c55e12", color: "#22c55e", borderRadius: "10px" }}>
                {recoverNotice}
              </div>
            )}
            {error && (
              <div role="alert" className="text-xs mb-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>
                {error}
              </div>
            )}
            <button
              onClick={() => recover(requestPasswordReset)}
              disabled={!email.trim() || submitting}
              className="w-full py-2.5 text-sm font-700 mb-2"
              style={{ background: email.trim() && !submitting ? "var(--primary)" : "var(--border)", color: email.trim() && !submitting ? "#fff" : "var(--muted-foreground)", borderRadius: "40px", cursor: email.trim() && !submitting ? "pointer" : "not-allowed" }}
            >
              {submitting ? "처리 중…" : "비밀번호 재설정 링크 받기"}
            </button>
            <button
              onClick={() => recover(resendConfirmation)}
              disabled={!email.trim() || submitting}
              className="w-full py-2.5 text-sm font-600 mb-3"
              style={{ background: "transparent", color: email.trim() && !submitting ? "var(--primary)" : "var(--muted-foreground)", border: "2px solid var(--border)", borderRadius: "40px", cursor: email.trim() && !submitting ? "pointer" : "not-allowed" }}
            >
              가입 인증 메일 다시 받기
            </button>
            <button type="button" onClick={() => { setRecovering(false); setError(null); setRecoverNotice(null); }} className="w-full text-xs" style={{ color: "var(--muted-foreground)" }}>
              로그인으로 돌아가기
            </button>
          </>
        ) : (
          <>
            {mode === "admin" && (
              <div className="text-xs mb-4 p-3" style={{ background: "#3b82f612", color: "var(--foreground)", borderRadius: "10px", lineHeight: 1.6 }}>
                <div className="font-700 mb-1">관리자 가입 절차</div>
                <ol className="list-decimal pl-4">
                  <li>아래에서 계정을 만들고, 받은 메일의 링크로 이메일 인증을 합니다.</li>
                  <li>인증 후 처음 로그인하면 <strong>관리자 신청서</strong> 화면이 열립니다. 소속·직위와 <strong>교수·교원 증명서(PDF)</strong>를 제출해 주세요.</li>
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
            {mode === "signin" && (
              <button type="button" onClick={() => { setRecovering(true); setError(null); setRecoverNotice(null); }} className="w-full text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
                비밀번호를 잊으셨나요? · 인증 메일을 못 받으셨나요?
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
