import { useCallback, useEffect, useState } from "react";
import { dataRepository } from "../api";
import type { Announcement } from "../api/types";
import { useAuth } from "../context/AuthContext";

// 관리자 공지 팝업: 화면 오른쪽 아래에 작게 띄운다. 로그인해 있는 동안 어느 화면에서든 보이고,
// 공지가 새로 올라오면(서버가 접속 중인 모두에게 알림) 바로 뜬다. 닫으면 이 로그인 동안만 숨기고,
// "다시 보지 않기"를 체크하고 닫으면 서버에 기록해 다른 기기에서도 다시 뜨지 않는다.
const MAX_VISIBLE = 3;
const REFRESH_MS = 60_000; // 실시간 알림을 놓쳤을 때를 위한 보조 갱신

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
  const [items, setItems] = useState<Announcement[]>([]);
  const [closed, setClosed] = useState<Set<number>>(() => readClosed(userId));
  const [never, setNever] = useState<Set<number>>(new Set()); // "다시 보지 않기"를 체크한 공지

  useEffect(() => { setClosed(readClosed(userId)); }, [userId]);

  const refresh = useCallback(() => {
    dataRepository.listActiveAnnouncements().then(setItems).catch(() => { /* 일시적 오류는 다음 갱신에 */ });
  }, []);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const unsubscribe = dataRepository.subscribeToAnnouncements(refresh);
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { unsubscribe(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId, refresh]);

  function close(item: Announcement) {
    const next = new Set(closed).add(item.id);
    setClosed(next);
    writeClosed(userId, next);
    if (never.has(item.id)) {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      dataRepository.dismissAnnouncement(item.id).catch(() => { /* 실패해도 이 로그인 동안은 숨겨져 있다 */ });
    }
  }
  function toggleNever(id: number) {
    setNever((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const visible = items.filter((x) => !closed.has(x.id));
  if (visible.length === 0) return null;
  const shown = visible.slice(0, MAX_VISIBLE);

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-3 pointer-events-none" style={{ width: "min(22rem, calc(100vw - 2rem))" }} aria-label="공지">
      {shown.map((item) => (
        <section
          key={item.id}
          role="status"
          aria-live="polite"
          className="pointer-events-auto p-4 border"
          style={{ background: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 12px 36px rgba(34,42,58,0.28)" }}
        >
          <div className="flex items-start gap-2">
            <span className="text-xs font-700 px-2 py-0.5 shrink-0" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>공지</span>
            <h2 className="text-sm font-700 flex-1 min-w-0 break-words">{item.title}</h2>
            <button type="button" onClick={() => close(item)} aria-label="공지 닫기" className="text-base leading-none shrink-0 px-1" style={{ color: "var(--muted-foreground)" }}>×</button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
            {formatDate(item.startDate)} ~ {formatDate(item.endDate)}{item.targetAll ? "" : " · 일부 프로젝트 대상"}
          </p>
          <p className="text-xs mt-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto" style={{ lineHeight: 1.6 }}>{item.body}</p>
          <div className="flex items-center justify-between gap-2 mt-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--muted-foreground)" }}>
              <input type="checkbox" checked={never.has(item.id)} onChange={() => toggleNever(item.id)} />
              다시 보지 않기
            </label>
            <button type="button" onClick={() => close(item)} className="text-xs font-700 px-3 py-1.5" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "20px" }}>닫기</button>
          </div>
        </section>
      ))}
      {visible.length > shown.length && (
        <p className="pointer-events-auto text-[11px] text-center px-3 py-1 self-end" style={{ background: "var(--card)", color: "var(--muted-foreground)", borderRadius: "20px", border: "1px solid var(--border)" }}>
          공지 {visible.length - shown.length}개 더 있어요
        </p>
      )}
    </div>
  );
}
