import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { markAnnouncementRead, PRIORITY_LABEL, projectAnnouncements, useAnnouncements } from "../lib/announcementsStore";

// 대시보드 맨 위의 "담당 교수 공지" 카드(프로젝트를 승인한 관리자가 이 프로젝트에 보낸 공지).
// 다른 위젯과 달리 옮기거나 숨길 수 없게 위젯 목록 밖에 고정한다(꼭 보이도록). 공지가 없으면 그리지 않는다.
// 확인하지 않은 공지는 펼쳐 두고, 확인한 공지는 "지난 공지"로 접는다. 확인 인원 수는 보낸 관리자만 본다(여기엔 없음).
const formatDate = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;

export default function ProjectNoticeCard({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { items } = useAnnouncements(user?.id);
  const [openId, setOpenId] = useState<number | null>(null);
  const list = projectAnnouncements(items, projectId);
  if (list.length === 0) return null;
  const unread = list.filter((a) => !a.read);
  const read = list.filter((a) => a.read);

  return (
    <section
      aria-label="담당 교수 공지"
      className="mb-4 p-4 border"
      style={{ background: "var(--card-glass)", borderColor: unread.length ? "rgba(74, 116, 181, 0.45)" : "var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span aria-hidden="true">📌</span>
        <h2 className="text-sm font-700">담당 교수 공지</h2>
        {unread.length > 0 && <span className="text-[11px] font-700 px-2 py-0.5" style={{ background: "#ef4444", color: "#fff", borderRadius: "20px" }}>새 공지 {unread.length}</span>}
      </div>
      {unread.length > 0 && (
        <ul className="flex flex-col gap-2">
          {unread.map((a) => {
            const label = PRIORITY_LABEL[a.priority];
            return (
              <li key={a.id} className="px-3 py-2.5" style={{ background: "var(--card)", borderRadius: "var(--radius-sm)", boxShadow: a.priority === "urgent" ? "inset 3px 0 0 #dc2626" : a.priority === "important" ? "inset 3px 0 0 #d97706" : "inset 3px 0 0 var(--primary)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-700 px-1.5 py-0.5" style={{ background: "#ef4444", color: "#fff", borderRadius: "6px" }}>NEW</span>
                  {a.priority !== "normal" && <span className="text-[10px] font-700 px-1.5 py-0.5" style={{ background: label.bg, color: label.color, borderRadius: "6px" }}>{label.text}</span>}
                  <span className="text-sm font-700 flex-1 min-w-0 break-words">{a.title}</span>
                  <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{a.authorName || "관리자"} · {formatDate(a.startDate)}</span>
                </div>
                <p className="text-xs mt-1.5 whitespace-pre-wrap break-words" style={{ lineHeight: 1.6 }}>{a.body}</p>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => void markAnnouncementRead(a.id)} className="text-xs font-700 px-3 py-1" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>확인했어요</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {read.length > 0 && (
        <div className={unread.length ? "mt-3" : ""}>
          {unread.length > 0 && <div className="text-[11px] font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>지난 공지</div>}
          <ul className="flex flex-col gap-1">
            {read.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setOpenId((id) => (id === a.id ? null : a.id))} aria-expanded={openId === a.id} className="w-full flex items-center gap-2 text-left text-xs py-1">
                  <span className="flex-1 min-w-0 truncate">{a.title}</span>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--muted-foreground)" }}>{a.authorName || "관리자"} · {formatDate(a.startDate)} {openId === a.id ? "▲" : "▼"}</span>
                </button>
                {openId === a.id && <p className="text-xs pb-2 whitespace-pre-wrap break-words" style={{ lineHeight: 1.6, color: "var(--muted-foreground)" }}>{a.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
