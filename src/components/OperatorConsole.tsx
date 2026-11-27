import { useState } from "react";
import AdminAccountWithdrawals from "./AdminAccountWithdrawals";
import AdminOperatorPanel from "./AdminOperatorPanel";
import AuditPanel from "./AuditPanel";

// 운영자 창: 맨 위의 버튼으로 "관리자 신청 관리"(관리자 신청 + 계정 탈퇴·복구)와 "접속 감사"를 오간다.
// 두 화면 모두 운영자만 볼 수 있다(서버·DB도 같은 규칙).
type View = "applications" | "audit";
const VIEWS: { id: View; label: string }[] = [
  { id: "applications", label: "관리자 신청 관리" },
  { id: "audit", label: "접속 감사" },
];

export default function OperatorConsole({ onPendingCountChange }: { onPendingCountChange?: (count: number) => void }) {
  const [view, setView] = useState<View>("applications");
  return (
    <div>
      <div role="tablist" aria-label="운영자 메뉴" className="flex gap-2 mb-5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className="text-sm font-700 px-4 py-2 transition-all"
            style={{ borderRadius: "40px", background: view === v.id ? "var(--primary)" : "var(--muted)", color: view === v.id ? "#fff" : "var(--foreground)" }}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "applications" ? (
        <>
          <AdminOperatorPanel onPendingCountChange={onPendingCountChange} />
          <AdminAccountWithdrawals />
        </>
      ) : (
        <AuditPanel />
      )}
    </div>
  );
}
