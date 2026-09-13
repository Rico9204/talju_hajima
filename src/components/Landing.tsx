import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/myprojects" replace />;

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
      <div className="max-w-lg w-full px-6 text-center">
        <div
          className="w-14 h-14 flex items-center justify-center text-lg font-800 mx-auto mb-5"
          style={{ background: "var(--primary)", color: "#fff", borderRadius: "16px", boxShadow: "0 8px 24px rgba(37,99,235,0.35)" }}
        >
          CP
        </div>
        <h1 className="text-3xl font-800 mb-3">CollabPeer</h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--muted-foreground)" }}>
          팀 프로젝트를 위한 온라인 협업 플랫폼입니다. 팀 관리, 채팅, 과제 보드, 워킹스페이스, 동료 평가까지
          — 프로젝트를 만들거나 참여 코드로 팀에 합류해서 바로 시작해보세요.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => navigate("/login")}
            className="px-6 py-3 text-sm font-700 transition-all"
            style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px" }}
          >
            로그인
          </button>
          <button
            onClick={() => navigate("/login?mode=signup")}
            className="px-6 py-3 text-sm font-700 transition-all"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", boxShadow: "0 8px 20px rgba(37,99,235,0.3)" }}
          >
            회원가입하고 시작하기 →
          </button>
        </div>
      </div>
    </div>
  );
}
