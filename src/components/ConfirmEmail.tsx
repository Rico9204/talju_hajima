import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmEmail } from "../api/rest/authApi";

// 인증 링크는 1회용 — 개발 모드(StrictMode)에서 effect가 두 번 돌아도 서버에는 한 번만 보낸다.
const confirming = new Map<string, Promise<void>>();

// 인증만 하고 로그인은 직접 하게 한다(남이 내 이메일로 먼저 만든 계정에 로그인되는 일 방지 — 서버 confirm 설명 참고).
export default function ConfirmEmail() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("이메일 인증을 처리하고 있습니다…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setMessage("인증 링크가 올바르지 않습니다."); return; }
    if (!confirming.has(token)) confirming.set(token, confirmEmail(token));
    confirming.get(token)!.then(() => setMessage("이메일 인증이 완료되었습니다. 로그인해 주세요.")).catch((error) => setMessage(error instanceof Error ? error.message : "인증하지 못했습니다."));
  }, [params]);
  return <div className="flex h-full items-center justify-center"><div className="w-[24rem] max-w-[92vw] p-6 text-sm" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}><p>{message}</p><Link className="inline-block mt-4 text-sm font-700" style={{ color: "var(--primary)" }} to="/login">로그인으로 이동</Link></div></div>;
}
