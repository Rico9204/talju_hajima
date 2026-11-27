import { useNavigate } from "react-router-dom";
import { BOARD_NOTICE_PATH, useNotifications } from "../context/NotificationContext";

// 운영자가 게시판에 공지사항을 쓰면 모든 화면 맨 위에 띄우는 배너(제목만 간략하게). 읽지 않은 공지사항이 있는 동안 보인다.
// "보기"는 게시판의 공지사항으로 이동하고, ×는 그 공지를 읽은 것으로 하고 닫는다(알림 목록에는 남는다).
export default function NoticeBanner() {
  const { unreadBoardNotices, markRead } = useNotifications();
  const navigate = useNavigate();
  if (unreadBoardNotices.length === 0) return null;
  const latest = unreadBoardNotices[0];
  const more = unreadBoardNotices.length - 1;

  return (
    <div role="status" aria-label="새 공지사항" className="shrink-0 flex items-center gap-3 pl-4 pr-14 py-2 text-sm" style={{ background: "var(--primary)", color: "#fff" }}>
      <span className="font-800 shrink-0">📋 공지사항</span>
      <span className="flex-1 min-w-0 truncate font-600" title={latest.title}>{latest.title}</span>
      {more > 0 && <span className="text-xs shrink-0 opacity-90">외 {more}건</span>}
      <button type="button" onClick={() => { markRead([latest]); navigate(BOARD_NOTICE_PATH); }} className="text-xs font-700 px-3 py-1 shrink-0" style={{ background: "rgba(255,255,255,0.22)", borderRadius: "20px" }}>보기</button>
      <button type="button" onClick={() => markRead([latest])} aria-label="공지 배너 닫기" className="text-base leading-none shrink-0 px-1">×</button>
    </div>
  );
}
