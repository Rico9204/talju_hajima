import type { ReactNode } from "react";
import AnnouncementPopup from "./AnnouncementPopup";
import NoticeBanner from "./NoticeBanner";
import NotificationBell from "./NotificationBell";
import NotificationProvider from "../context/NotificationContext";

// 로그인한 모든 화면의 공통 껍데기: 맨 위 공지 배너, 오른쪽 위 알림 종, 오른쪽 아래 관리자 공지 팝업.
// ProjectProvider 바깥에 둔다 — 프로젝트가 없는 사용자는 앱 전체가 다른 화면(NoProjectHome 등)으로 바뀌므로, 안쪽에 두면 그 사용자에게는 보이지 않는다.
// 로그인하지 않았으면 세 가지 모두 아무것도 그리지 않는다(구조는 그대로라 로그인 직후에도 화면이 다시 만들어지지 않는다).
export default function AppChrome({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex flex-col h-full w-full">
        <NoticeBanner />
        <div className="flex-1 min-h-0 relative">{children}</div>
      </div>
      <NotificationBell />
      <AnnouncementPopup />
    </NotificationProvider>
  );
}
