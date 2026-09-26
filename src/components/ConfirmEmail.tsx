import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmEmail } from "../api/rest/authApi";

export default function ConfirmEmail() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("이메일 인증을 처리하고 있습니다…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setMessage("인증 링크가 올바르지 않습니다."); return; }
    confirmEmail(token).then(() => setMessage("이메일 인증이 완료되었습니다. 로그인해 주세요.")).catch((error) => setMessage(error instanceof Error ? error.message : "인증하지 못했습니다."));
  }, [params]);
  return <div className="flex h-full items-center justify-center"><div className="w-[24rem] max-w-[92vw] p-6 text-sm" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}><p>{message}</p><Link className="inline-block mt-4 text-sm font-700" style={{ color: "var(--primary)" }} to="/login">로그인으로 이동</Link></div></div>;
}
