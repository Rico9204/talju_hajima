import { useEffect, useState } from "react";
import type { Announcement } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { markAnnouncementRead, PRIORITY_LABEL, sortAnnouncements, useAnnouncements } from "../lib/announcementsStore";

// 중요·긴급 공지 팝업: 화면 오른쪽 아래에 작게 띄운다. 로그인해 있는 동안 어느 화면에서든 보이고,
// 공지가 새로 올라오면(서버가 접속 중인 모두에게 알림) 바로 뜬다. 일반 공지는 팝업 없이 공지 자리에만 뜬다
// (시스템 공지는 메인 화면 공지 띠, 프로젝트 공지는 대시보드 공지 카드).
// "확인했어요"를 누르면 서버에 기록해 다시 뜨지 않고(다른 기기에서도), "닫기"는 이 로그인 동안만 숨긴다.
const MAX_VISIBLE = 3;

function closedKey(userId: string) { return `talju-announcements-closed:${userId}`; }
function readClosed(userId: string): Set<number> {
  try { return new Set(JSON.parse(sessionStorage.getItem(closedKey(userId)) ?? "[]") as number[]); } catch { return new Set(); }
}
function writeClosed(userId: string, ids: Set<number>) {
  try { sessionStorage.setItem(closedKey(userId), JSON.stringify([...ids])); } catch { /* 저장소를 못 쓰면 이 탭에서만 기억 */ }
}

const formatDate = (iso: string) => `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}`;

export default function AnnouncementPopup() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { items } = useAnnouncements(userId);
  const [closed, setClosed] = useState<Set<number>>(() => readClosed(userId));

  useEffect(() => { setClosed(readClosed(userId)); }, [userId]);

  function close(item: Announcement) {
    const next = new Set(closed).add(item.id);
    setClosed(next);
    writeClosed(userId, next);
  }

  const visible = sortAnnouncements(items.filter((x) => x.priority !== "normal" && !x.read && !closed.has(x.id)));
  if (!userId || visible.length === 0) return null;
  const shown = visible.slice(0, MAX_VISIBLE);

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-3 pointer-events-none" style={{ width: "min(22rem, calc(100vw - 2rem))" }} aria-label="공지">
      {shown.map((item) => {
        const label = PRIORITY_LABEL[item.priority];
        return (
          <section
            key={item.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto p-4 border"
            style={{ background: "var(--card)", color: "var(--foreground)", borderColor: item.priority === "urgent" ? "rgba(220, 38, 38, 0.45)" : "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 12px 36px rgba(34,42,58,0.28)" }}
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-700 px-2 py-0.5 shrink-0" style={{ background: label.bg, color: label.color, borderRadius: "20px" }}>{label.text}</span>
              <h2 className="text-sm font-700 flex-1 min-w-0 break-words">{item.title}</h2>
              <button type="button" onClick={() => close(item)} aria-label="공지 닫기" className="text-base leading-none shrink-0 px-1" style={{ color: "var(--muted-foreground)" }}>×</button>
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
              {item.targetAll ? "시스템 공지" : `${item.authorName || "관리자"} · 프로젝트 공지`} · {formatDate(item.startDate)} ~ {formatDate(item.endDate)}
            </p>
            <p className="text-xs mt-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto" style={{ lineHeight: 1.6 }}>{item.body}</p>
            <div className="flex items-center justify-end gap-2 mt-3">
              <button type="button" onClick={() => close(item)} className="text-xs font-600 px-3 py-1.5" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>나중에</button>
              <button type="button" onClick={() => void markAnnouncementRead(item.id)} className="text-xs font-700 px-3 py-1.5" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>확인했어요</button>
            </div>
          </section>
        );
      })}
      {visible.length > shown.length && (
        <p className="pointer-events-auto text-[11px] text-center px-3 py-1 self-end" style={{ background: "var(--card)", color: "var(--muted-foreground)", borderRadius: "20px", border: "1px solid var(--border)" }}>
          공지 {visible.length - shown.length}개 더 있어요
        </p>
      )}
    </div>
  );
}
