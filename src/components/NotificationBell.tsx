import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BOARD_NOTICE_PATH, useNotifications } from "../context/NotificationContext";
import type { AppNotification } from "../api/types";

// 화면 오른쪽 위의 전체 알림 종: 관리자 공지(공지 기간 동안 계속 조회 — 팝업을 닫거나 "다시 보지 않기"를 눌러도 남는다)와
// 게시판 공지사항(운영자가 쓰면 사용자 전체에게)을 한 목록으로 보여 준다. 읽지 않은 것은 점과 숫자로 표시한다.
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
const formatDay = (day: string) => `${day.slice(0, 4)}.${day.slice(5, 7)}.${day.slice(8, 10)}`;

export default function NotificationBell() {
  const { session } = useAuth();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // 내용을 펼친 관리자 공지

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!session) return null;

  function openItem(item: AppNotification) {
    markRead([item]);
    if (item.kind === "board_notice") { setOpen(false); navigate(BOARD_NOTICE_PATH); return; }
    const key = `${item.kind}:${item.refId}`;
    setExpanded((cur) => (cur === key ? null : key));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 안 읽음` : "알림"}
        aria-expanded={open}
        title="알림"
        className="fixed top-3 right-3 z-[65] w-9 h-9 flex items-center justify-center"
        style={{ background: "var(--card)", color: "var(--foreground)", borderRadius: "50%", boxShadow: "0 4px 14px rgba(34,42,58,0.22)", border: "1px solid var(--border)" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-800" style={{ background: "#ef4444", color: "#fff", borderRadius: "20px" }}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[64]" onMouseDown={() => setOpen(false)} />
          <div role="dialog" aria-label="알림 목록" className="fixed top-14 right-3 z-[66] flex flex-col"
            style={{ width: "min(24rem, calc(100vw - 1.5rem))", maxHeight: "70vh", background: "var(--card)", color: "var(--foreground)", borderRadius: "var(--radius)", border: "1px solid var(--border)", boxShadow: "0 18px 48px rgba(34,42,58,0.3)" }}>
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-sm font-700">알림</h2>
              <button type="button" onClick={markAllRead} disabled={unreadCount === 0} className="text-xs font-600 disabled:opacity-40" style={{ color: "var(--primary)" }}>모두 읽음</button>
            </div>
            <div className="overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: "var(--muted-foreground)" }}>새 알림이 없어요.</p>
              ) : (
                <ul>
                  {items.map((item) => {
                    const key = `${item.kind}:${item.refId}`;
                    const isOpen = expanded === key;
                    return (
                      <li key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                        <button type="button" onClick={() => openItem(item)} aria-expanded={item.kind === "announcement" ? isOpen : undefined} className="w-full text-left px-4 py-3 flex gap-2.5" style={{ background: item.read ? "transparent" : "color-mix(in srgb, var(--primary) 8%, transparent)" }}>
                          <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: item.read ? "transparent" : "var(--primary)" }} aria-label={item.read ? undefined : "안 읽음"} />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: item.kind === "announcement" ? "#f59e0b22" : "var(--muted)", color: item.kind === "announcement" ? "#b45309" : "var(--muted-foreground)", borderRadius: "20px" }}>{item.kind === "announcement" ? "관리자 공지" : "게시판 공지"}</span>
                              <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                                {item.kind === "announcement" && item.endDate ? `${formatDay(item.endDate)}까지` : formatDate(item.createdAt)}
                              </span>
                            </span>
                            <span className="block text-sm font-600 break-words">{item.title}</span>
                            {item.kind === "announcement" && isOpen && (
                              <span className="block mt-1.5">
                                {item.startDate && item.endDate && <span className="block text-[11px] mb-1" style={{ color: "var(--muted-foreground)" }}>공지 기간 {formatDay(item.startDate)} ~ {formatDay(item.endDate)}</span>}
                                <span className="block text-xs whitespace-pre-wrap break-words" style={{ lineHeight: 1.6 }}>{item.body}</span>
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-[11px] px-4 py-2 shrink-0" style={{ color: "var(--muted-foreground)", borderTop: "1px solid var(--border)" }}>관리자 공지는 공지 기간 동안 여기서 계속 볼 수 있어요.</p>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
