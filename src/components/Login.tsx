import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type Mode = "signin" | "signup";

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 6 && (mode === "signin" || displayName.trim().length > 0);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = mode === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password, displayName.trim());
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === "signup") setSignedUp(true);
  }

  // Already signed in (just logged in, just signed up with email
  // confirmation off, or opened /login directly while authenticated) —
  // there was previously no redirect here at all, so the login button
  // appeared to do nothing.
  if (user) return <Navigate to="/myprojects" replace />;

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
      <div
        className="w-[24rem] max-w-[92vw] p-6"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        <div
          className="w-10 h-10 flex items-center justify-center text-lg font-700 mb-3"
          style={{ background: "#2563eb18", color: "var(--primary)", borderRadius: "12px" }}
        >
          CP
        </div>
        <h3 className="font-700 mb-1">{mode === "signin" ? "로그인" : "회원가입"}</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          팀 프로젝트에 참여하려면 계정이 필요합니다.
        </p>

        <div className="flex gap-1 p-0.5 mb-4" style={{ background: "var(--muted)", borderRadius: "20px" }}>
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
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
              {m === "signin" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        {signedUp ? (
          <div className="text-sm p-3" style={{ background: "#22c55e12", color: "#22c55e", borderRadius: "10px" }}>
            인증 이메일을 보냈습니다. 받은 편지함을 확인해주세요.
          </div>
        ) : (
          <>
            {mode === "signup" && (
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
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={mode === "signup" ? "6자 이상" : "비밀번호"}
              className={`w-full text-sm px-3 py-2.5 outline-none ${mode === "signup" ? "mb-1.5" : "mb-4"}`}
              style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
            />
            {mode === "signup" && (
              <div className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>비밀번호는 6자 이상이어야 합니다.</div>
            )}

            {error && (
              <div className="text-xs mb-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>
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
              {submitting ? "처리 중…" : mode === "signin" ? "로그인" : "가입하기"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
