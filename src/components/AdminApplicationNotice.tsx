import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProjectManagement } from "../context/ProjectContext";
import type { MyAdminApplication } from "../api/types";
import { formatDateTime } from "../lib/adminApplication";

// 관리자 신청 진행 상황을 알리는 배너. 신청과 무관한 일반 사용자에게는 아무것도 보이지 않는다.
export default function AdminApplicationNotice() {
  const { user } = useAuth();
  const { isAdmin, getMyAdminApplication } = useProjectManagement();
  const navigate = useNavigate();
  const [application, setApplication] = useState<MyAdminApplication | null>(null);
  const wantsAdmin = user?.user_metadata?.signup_type === "admin";

  useEffect(() => {
    if (isAdmin) return;
    let active = true;
    // 신청 기능이 아직 없는 DB에서도 홈이 깨지지 않도록 실패는 조용히 넘긴다.
    getMyAdminApplication()
      .then((a) => active && setApplication(a))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isAdmin, user?.id]);

  if (isAdmin) return null;

  let tone: { bg: string; color: string } | null = null;
  let title = "";
  let detail = "";
  let action = "";
  if (application?.status === "pending") {
    tone = { bg: "#f59e0b18", color: "#f59e0b" };
    title = "관리자 신청을 검토하고 있어요";
    detail = `${formatDateTime(application.submittedAt)}에 제출됨 · 승인되면 관리자 권한이 자동으로 적용돼요.`;
    action = "자세히";
  } else if (application?.status === "rejected") {
    tone = { bg: "#ef444418", color: "#ef4444" };
    title = "관리자 신청이 반려되었어요";
    detail = application.reviewNote ?? "";
    action = "다시 신청";
  } else if (!application && wantsAdmin) {
    tone = { bg: "#3b82f618", color: "#3b82f6" };
    title = "관리자 신청서를 아직 제출하지 않았어요";
    detail = "교수·교원 증명서(PDF)를 제출하면 운영자가 확인한 뒤 관리자로 승인해요.";
    action = "신청서 작성";
  }
  if (!tone) return null;

  return (
    <div role="status" className="flex items-center justify-between gap-3 p-3.5 mb-4" style={{ background: tone.bg, borderRadius: "var(--radius)" }}>
      <div className="min-w-0">
        <div className="text-sm font-700" style={{ color: tone.color }}>{title}</div>
        {detail && <div className="text-xs mt-0.5 break-words" style={{ color: "var(--muted-foreground)" }}>{detail}</div>}
      </div>
      <button onClick={() => navigate("/admin-application")} className="text-xs font-700 px-3.5 py-2 shrink-0" style={{ background: "var(--card)", color: tone.color, borderRadius: "20px" }}>
        {action}
      </button>
    </div>
  );
}
