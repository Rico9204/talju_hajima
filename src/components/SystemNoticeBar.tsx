import { useState } from "react";
import type { Announcement } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { markAnnouncementRead, PRIORITY_LABEL, systemAnnouncements, useAnnouncements } from "../lib/announcementsStore";

// 메인 화면("내 프로젝트") 위쪽의 시스템 공지 띠(운영자가 보낸 전체 공지).
// 확인하지 않은 공지가 있으면 가장 중요한 것 하나를 한 줄로 크게 보여 주고, 모두 확인하면 작은 줄로 접힌다.
// 펼치면 기간 안의 시스템 공지를 모두 볼 수 있다(확인한 공지도 다시 볼 수 있게).
const formatDate = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;

export default function SystemNoticeBar() {
  const { user } = useAuth();
  const { items } = useAnnouncements(user?.id);
  const [open, setOpen] = useState(false);
  const list = systemAnnouncements(items);
  if (list.length === 0) return null;
  const unread = list.filter((a) => !a.read);
  const top = unread[0];

  return (
    <section aria-label="시스템 공지" className="mb-5">
      {top ? (
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-2.5 border"
          style={{ background: top.priority === "urgent" ? "rgba(220, 38, 38, 0.08)" : "var(--card-glass)", borderColor: top.priority === "urgent" ? "rgba(220, 38, 38, 0.35)" : "var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
        >
          <span aria-hidden="true">📢</span>
          <Badge item={top} />
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 min-w-40 text-left text-sm font-700 truncate" title="눌러서 내용 보기">
            {top.title}
          </button>
          {unread.length > 1 && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>외 {unread.length - 1}건</span>}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-600 px-2.5 py-1" style={{ background: "var(--muted)", borderRadius: "20px" }}>
            {open ? "접기" : "전체 보기"}
          </button>
          <button type="button" onClick={() => void markAnnouncementRead(top.id)} className="text-xs font-700 px-3 py-1" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>확인</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs font-600 px-3 py-1.5 flex items-center gap-1.5"
          style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}
        >
          📢 시스템 공지 {list.length}건 {open ? "접기" : "보기"}
        </button>
      )}
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id} className="px-4 py-3 border" style={{ background: "var(--card)", borderColor: a.read ? "var(--border)" : "rgba(74, 116, 181, 0.4)", borderRadius: "var(--radius)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge item={a} />
                <span className="text-sm font-700 flex-1 min-w-0 break-words">{a.title}</span>
                <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{formatDate(a.startDate)} ~ {formatDate(a.endDate)}</span>
              </div>
              <p className="text-xs mt-1.5 whitespace-pre-wrap break-words" style={{ lineHeight: 1.6 }}>{a.body}</p>
              <div className="mt-2 flex justify-end">
                {a.read
                  ? <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>✓ 확인함</span>
                  : <button type="button" onClick={() => void markAnnouncementRead(a.id)} className="text-xs font-700 px-3 py-1" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>확인</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Badge({ item }: { item: Announcement }) {
  const label = PRIORITY_LABEL[item.priority];
  return <span className="text-[11px] font-700 px-2 py-0.5 shrink-0" style={{ background: label.bg, color: label.color, borderRadius: "20px" }}>{item.priority === "normal" ? "시스템" : label.text}</span>;
}
