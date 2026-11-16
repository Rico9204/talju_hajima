import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { dataRepository } from "../api";
import type { AppNotification } from "../api/types";
import { useAuth } from "./AuthContext";
import { notifyIfAway } from "../lib/browserNotifications";

// 전체 알림(관리자 공지 + 게시판 공지사항)의 공통 상태. 알림 종(NotificationBell)과 상단 배너(NoticeBanner)가 함께 쓴다.
// 서버가 "바뀌었다"를 실시간으로 알려 주면(공지사항 작성·삭제, 관리자 공지 등록·삭제) 바로 다시 읽고, 놓쳤을 때를 위해 1분마다도 읽는다.
const REFRESH_MS = 60_000;
const BANNER_DAYS = 7; // 상단 배너는 최근 이 기간의 새 공지사항만 띄운다(새로 가입한 사람에게 한 달 전 공지가 배너로 뜨지 않게). 알림 목록은 더 오래 보여 준다.
export const BOARD_NOTICE_PATH = "/home?tab=board&category=notice"; // 게시판의 공지사항 분류로 이동

type Key = string;
const keyOf = (n: Pick<AppNotification, "kind" | "refId">): Key => `${n.kind}:${n.refId}`;

interface NotificationValue {
  items: AppNotification[];
  unreadCount: number;
  unreadBoardNotices: AppNotification[]; // 상단 배너에 띄울 읽지 않은 게시판 공지사항(최신순)
  markRead: (targets: AppNotification[]) => void;
  markAllRead: () => void;
}

const Ctx = createContext<NotificationValue>({ items: [], unreadCount: 0, unreadBoardNotices: [], markRead: () => {}, markAllRead: () => {} });
export const useNotifications = () => useContext(Ctx);

export default function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const known = useRef<Set<Key> | null>(null); // 처음 불러온 목록은 알리지 않고, 그 뒤 새로 생긴 것만 알린다

  const refresh = useCallback(() => {
    dataRepository.listNotifications().then((list) => {
      // 탭이 백그라운드이거나 다른 창을 보고 있을 때 새 알림이 오면 운영체제 알림도 띄운다(설정에서 켠 사람만).
      if (known.current) {
        for (const n of list) {
          if (!n.read && !known.current.has(keyOf(n))) {
            notifyIfAway(n.kind === "announcement" ? "📢 관리자 공지" : "📋 공지사항", n.title, () => { if (n.kind === "board_notice") navigate(BOARD_NOTICE_PATH); });
          }
        }
      }
      known.current = new Set(list.map(keyOf));
      setItems(list);
    }).catch(() => { /* 일시적 오류는 다음 갱신에 */ });
  }, [navigate]);

  useEffect(() => {
    if (!userId) { setItems([]); known.current = null; return; }
    refresh();
    const unsubscribe = dataRepository.subscribeToAnnouncements(refresh);
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { unsubscribe(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId, refresh]);

  const markRead = useCallback((targets: AppNotification[]) => {
    const fresh = targets.filter((t) => !t.read);
    if (fresh.length === 0) return;
    const keys = new Set(fresh.map(keyOf));
    setItems((prev) => prev.map((n) => (keys.has(keyOf(n)) ? { ...n, read: true } : n))); // 먼저 화면에 반영
    dataRepository.markNotificationsRead(fresh.map((t) => ({ kind: t.kind, refId: t.refId }))).catch(refresh); // 실패하면 서버 기준으로 되돌린다
  }, [refresh]);

  const value = useMemo<NotificationValue>(() => {
    const unread = items.filter((n) => !n.read);
    return {
      items,
      unreadCount: unread.length,
      unreadBoardNotices: unread.filter((n) => n.kind === "board_notice" && Date.now() - new Date(n.createdAt).getTime() < BANNER_DAYS * 86_400_000),
      markRead,
      markAllRead: () => markRead(items),
    };
  }, [items, markRead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
