import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ResetPassword() {
  const { user, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = password.length >= 6 && password === confirm;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  // No session at all means this wasn't reached via a valid reset link (or
  // an already logged-in user navigating here directly) — there's nothing to
  // reset.
  if (!user) return <Navigate to="/login" replace />;
  if (done) return <Navigate to="/dashboard" replace />;

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
        <h3 className="font-700 mb-1">비밀번호 재설정</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          새로 사용할 비밀번호를 입력해주세요.
        </p>

        <label className="text-xs font-600 block mb-1.5">새 비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="6자 이상"
          className="w-full text-sm px-3 py-2.5 outline-none mb-3"
          style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
        />

        <label className="text-xs font-600 block mb-1.5">새 비밀번호 확인</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="다시 입력"
          className="w-full text-sm px-3 py-2.5 outline-none mb-1.5"
          style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
        />
        {confirm.length > 0 && password !== confirm && (
          <div className="text-xs mb-3" style={{ color: "#ef4444" }}>비밀번호가 일치하지 않습니다.</div>
        )}

        {error && (
          <div className="text-xs mb-3 px-3 py-2 mt-3" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit || submitting}
          className="w-full py-2.5 text-sm font-700 transition-all mt-3"
          style={{
            background: canSubmit && !submitting ? "var(--primary)" : "var(--border)",
            color: canSubmit && !submitting ? "#fff" : "var(--muted-foreground)",
            borderRadius: "40px",
            boxShadow: canSubmit && !submitting ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "변경 중…" : "비밀번호 변경"}
        </button>
      </div>
    </div>
  );
}
