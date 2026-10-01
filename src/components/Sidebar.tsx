import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Page } from "../App";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import { formatChatTime } from "../lib/chatDate";
import { useAuth } from "../context/AuthContext";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";
import Avatar from "./Avatar";
import AvatarFrame from "./AvatarFrame";
import MedalIcon from "./MedalIcon";
import ProfileModal from "./ProfileModal";
import { useMyProfileTheme } from "../lib/useMyProfileTheme";
import type { Tier } from "../lib/achievements";
import { useMenuOrder, reorderMenuItem, type NavPage } from "../lib/menuPreferences";

// Small medal pinned to an Avatar's corner (see Avatar's `badge` prop) —
// same tier medal shown on the 업적 page and profile card, just shrunk to
// fit. No circular frame — matches the profile card's tier icon treatment.
function TierMedal({ tier }: { tier: Tier }) {
  return (
    <span title={tier.label} className="flex items-center justify-center w-full h-full">
      <MedalIcon shape={tier.shape} colors={tier.colors} size={18} />
    </span>
  );
}

const navItems: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "dashboard", label: "대시보드", icon: "⊞" },
  { id: "team", label: "팀 관리", icon: "◎" },
  {
    id: "chat",
    label: "채팅",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  },
  { id: "tasks", label: "과제 보드", icon: "≡" },
  { id: "schedule", label: "일정", icon: "▤" },
  { id: "workspace", label: "워크스페이스", icon: "⬡" },
  { id: "evaluation", label: "동료 평가", icon: "★" },
];

const adminNavItem: { id: Page; label: string; icon: string } = { id: "admin", label: "관리자", icon: "⚙" };

export default function Sidebar({ currentPage, onNavigate, onHome }: { currentPage: Page; onNavigate: (p: Page) => void; onHome: () => void }) {
  const routerNavigate = useNavigate();
  const {
    projects, project, setProjectId, addProject, deleteProject, lookupProject, joinProject, getJoinCode, rotateJoinCode, isLeader, isViceLeader, chatUnreadTotal, unreadMentions, currentMember,
    openMemberProfile, tasksUnread, scheduleUnread, workspaceUnread,
    newTasks, newScheduleEvents, newFiles,
  } = useProject();
  const navUnread: Partial<Record<Page, number>> = { chat: chatUnreadTotal, tasks: tasksUnread, schedule: scheduleUnread, workspace: workspaceUnread };
  const totalUnread = chatUnreadTotal + tasksUnread + scheduleUnread + workspaceUnread;
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPos, setNotifPos] = useState<{ top: number; left: number } | null>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);

  function toggleNotif() {
    if (!notifOpen && notifButtonRef.current) {
      const rect = notifButtonRef.current.getBoundingClientRect();
      const panelWidth = 288; // w-72
      const left = Math.min(rect.right + 8, window.innerWidth - panelWidth - 8);
      setNotifPos({ top: rect.top, left: Math.max(8, left) });
    }
    setNotifOpen((v) => !v);
    setSwitcherOpen(false);
  }
  const { signOut } = useAuth();
  const { isAdmin } = useProjectManagement();
  const [menuOrder, saveMenuOrder] = useMenuOrder();
  const [draggedPage, setDraggedPage] = useState<NavPage | null>(null);
  const [dragOverPage, setDragOverPage] = useState<NavPage | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);

  const navItemsMap = useMemo(() => {
    const map = new Map<Page, { id: Page; label: string; icon: ReactNode }>();
    for (const item of navItems) {
      map.set(item.id, item);
    }
    return map;
  }, []);

  const orderedNavItems = useMemo(() => {
    const list: { id: Page; label: string; icon: ReactNode }[] = [];
    for (const id of menuOrder) {
      const item = navItemsMap.get(id);
      if (item) list.push(item);
    }
    return list;
  }, [menuOrder, navItemsMap]);

  const visibleNavItems = isAdmin ? [...orderedNavItems, adminNavItem] : orderedNavItems;

  function handleDragStart(e: DragEvent<HTMLDivElement>, page: NavPage) {
    e.dataTransfer.setData("text/plain", page);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPage(page);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, page: NavPage) {
    if (!draggedPage || draggedPage === page) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const pos = e.clientY < midpoint ? "before" : "after";

    if (dragOverPage !== page || dropPosition !== pos) {
      setDragOverPage(page);
      setDropPosition(pos);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    const related = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(related)) {
      setDragOverPage(null);
      setDropPosition(null);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, targetPage: NavPage) {
    e.preventDefault();
    if (!draggedPage || draggedPage === targetPage) {
      setDraggedPage(null);
      setDragOverPage(null);
      setDropPosition(null);
      return;
    }

    const fromIdx = menuOrder.indexOf(draggedPage);
    const toIdx = menuOrder.indexOf(targetPage);

    if (fromIdx !== -1 && toIdx !== -1) {
      let insertIdx = toIdx;
      if (dropPosition === "after" && fromIdx > toIdx) {
        insertIdx = toIdx + 1;
      } else if (dropPosition === "before" && fromIdx < toIdx) {
        insertIdx = toIdx - 1;
      }
      saveMenuOrder(reorderMenuItem(menuOrder, fromIdx, insertIdx));
    }

    setDraggedPage(null);
    setDragOverPage(null);
    setDropPosition(null);
  }

  function handleDragEnd() {
    setDraggedPage(null);
    setDragOverPage(null);
    setDropPosition(null);
  }
  const myName = currentMember?.name ?? "참여자";
  const myRole = currentMember?.role ?? "참여자";
  const myAvatar = currentMember?.avatar ?? "?";
  const { myTier, avatarFrame, cardC1, cardC2 } = useMyProfileTheme();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const logoCardRef = useRef<HTMLDivElement>(null);
  // The notif panel is portaled to document.body (see below — a backdrop-filter
  // ancestor was clipping/mispositioning it as a position:fixed element), so
  // it's no longer a DOM descendant of logoCardRef and needs its own ref to
  // stay excluded from the outside-click close check.
  const notifPanelRef = useRef<HTMLDivElement>(null);

  // Close the project switcher / notification dropdowns when clicking
  // anywhere else — the switcher lives under logoCardRef, the notif panel
  // under notifPanelRef (portaled to document.body).
  useEffect(() => {
    if (!switcherOpen && !notifOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (logoCardRef.current?.contains(target)) return;
      if (notifPanelRef.current?.contains(target)) return;
      setSwitcherOpen(false);
      setNotifOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [switcherOpen, notifOpen]);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  // 참여 코드: 생성 후 6시간 유효. 만료 시각이 지나면 다시 받아 오고(서버가 새로 발급), 남은 시간은 1분마다 갱신.
  const [joinCode, setJoinCode] = useState<{ projectId: string; joinCode: string; joinCodeExpiresAt: string } | null>(null);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [rotatingCode, setRotatingCode] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const projectIdForCode = project?.id;
  const codeExpiresAt = joinCode?.projectId === projectIdForCode ? joinCode?.joinCodeExpiresAt : undefined;
  useEffect(() => {
    if (!projectIdForCode) return;
    let cancelled = false;
    const load = () => getJoinCode(projectIdForCode)
      .then((code) => { if (!cancelled) { setJoinCode({ projectId: projectIdForCode, ...code }); setJoinCodeError(null); } })
      .catch((error) => { if (!cancelled) setJoinCodeError(error instanceof Error ? error.message : "참여 코드를 불러오지 못했습니다."); });
    const wait = codeExpiresAt ? new Date(codeExpiresAt).getTime() - Date.now() : 0;
    const timer = setTimeout(load, Math.max(0, wait) + (codeExpiresAt ? 1000 : 0));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectIdForCode, codeExpiresAt]); // getJoinCode는 렌더마다 새 함수라 넣지 않는다(넣으면 매번 다시 요청)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const shownCode = joinCode?.projectId === projectIdForCode ? joinCode.joinCode : null;
  const remaining = (() => {
    if (!codeExpiresAt) return "";
    const minutes = Math.max(0, Math.floor((new Date(codeExpiresAt).getTime() - now) / 60_000));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 남음` : `${minutes}분 남음`;
  })();
  async function reissueJoinCode() {
    if (!projectIdForCode || rotatingCode) return;
    setRotatingCode(true);
    try {
      setJoinCode({ projectId: projectIdForCode, ...(await rotateJoinCode(projectIdForCode)) });
      setNow(Date.now());
    } catch (error) {
      setJoinCodeError(error instanceof Error ? error.message : "참여 코드를 재발급하지 못했습니다.");
    } finally {
      setRotatingCode(false);
    }
  }
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Below the md breakpoint the sidebar is hidden behind a hamburger button
  // and takes over the full screen when opened (there's no room for a
  // permanent 240px rail on a phone). At md and up this state is unused —
  // the aside is always shown inline.
  const [mobileOpen, setMobileOpen] = useState(false);

  function navigate(p: Page) {
    setMobileOpen(false);
    onNavigate(p);
  }

  async function confirmDelete() {
    setDeleting(true);
    await deleteProject(project.id);
    setDeleting(false);
    setPendingDelete(false);
    onNavigate("dashboard");
  }

  function openProfile() {
    if (currentMember) openMemberProfile(currentMember.id);
  }

  return (
    <>
    {/* Always reachable on mobile, even while the sidebar itself is hidden. */}
    <button
      onClick={() => setMobileOpen(true)}
      className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center text-lg"
      style={{ background: "var(--card-glass)", color: "var(--foreground)", borderRadius: "10px", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
      aria-label="메뉴 열기"
    >
      ☰
    </button>
    <aside
      className={`${mobileOpen ? "flex" : "hidden"} md:flex flex-col w-full md:w-60 h-full shrink-0 p-4 fixed md:relative inset-0 z-40 overflow-y-auto bg-[var(--background)] md:bg-transparent`}
    >
      <button
        onClick={() => setMobileOpen(false)}
        className="md:hidden self-end w-9 h-9 flex items-center justify-center text-lg mb-2"
        style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
        aria-label="메뉴 닫기"
      >
        ✕
      </button>
      {/* Logo card */}
      <div
        ref={logoCardRef}
        className="px-4 py-4 mb-5 relative"
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
          // backdrop-filter creates a new stacking context, which would
          // otherwise trap the z-20 project-switcher dropdown below the
          // Nav card right after it (that card is its own stacking context
          // too, and later in DOM order). An explicit z-index here lifts
          // this whole card — dropdown included — above it.
          zIndex: 20,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => { setMobileOpen(false); onHome(); }}
            title="메인 화면으로"
            aria-label="메인 화면으로"
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <img
              src="/slackerspace_icon.png"
              alt="Slackerspace"
              className="w-9 h-9 shrink-0"
              style={{ borderRadius: "20%" }}
            />
            <div className="min-w-0">
              <div className="text-sm font-700 leading-none">Slackerspace</div>
              <div
                className="text-xs mt-0.5"
                style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}
              >
                v1.0.0
              </div>
            </div>
          </button>
          <button
            ref={notifButtonRef}
            type="button"
            onClick={toggleNotif}
            title="알림"
            aria-label="알림"
            className="w-8 h-8 relative flex items-center justify-center text-sm shrink-0 transition-all"
            style={{ background: notifOpen ? "var(--primary)" : "var(--muted)", color: notifOpen ? "#fff" : "var(--muted-foreground)", borderRadius: "8px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {totalUnread > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-700"
                style={{ background: "#ef4444", color: "#fff", borderRadius: "20px" }}
              >
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </button>
        </div>

        {notifOpen && notifPos && createPortal(
          <div
            ref={notifPanelRef}
            className="w-72 max-w-[85vw] p-2 z-[999] border animate-fadeIn"
            style={{
              position: "fixed",
              top: notifPos.top,
              left: notifPos.left,
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              borderRadius: "14px",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.25)",
              backdropFilter: "var(--panel-blur)",
              WebkitBackdropFilter: "var(--panel-blur)",
              maxHeight: 380,
              overflowY: "auto",
            }}
          >
            <div className="text-xs font-600 uppercase tracking-widest px-2.5 pt-1.5 pb-2" style={{ color: "var(--muted-foreground)" }}>
              알림
            </div>
            {totalUnread === 0 && (
              <div className="px-2.5 py-4 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
                새로운 알림이 없어요
              </div>
            )}
            {unreadMentions.length > 0 && (
              <div
                className="p-2 mb-2 rounded-xl border transition-all"
                style={{
                  background: "rgba(59, 130, 246, 0.08)",
                  borderColor: "rgba(59, 130, 246, 0.25)",
                }}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>📢 멘션 알림</span>
                    <span
                      className="text-[10px] px-1.5 py-0.2 rounded-full font-bold"
                      style={{ background: "var(--primary)", color: "#fff" }}
                    >
                      {unreadMentions.length}
                    </span>
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>클릭하여 바로가기</span>
                </div>
                <div className="space-y-1">
                  {unreadMentions.slice(0, 5).map((m) => (
                    <button
                      key={m.messageId}
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        setMobileOpen(false);
                        routerNavigate(`/chat/${encodeURIComponent(m.channelId)}?messageId=${m.messageId}`);
                      }}
                      className="w-full text-left p-2 rounded-lg transition-all hover:bg-[var(--card)] hover:shadow-xs group cursor-pointer border border-transparent hover:border-[var(--border)]"
                      style={{ background: "var(--card)" }}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <span className="font-bold truncate" style={{ color: "var(--foreground)" }}>
                          {m.senderName}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                          {formatChatTime(m.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs truncate font-medium" style={{ color: "var(--foreground)" }}>
                        {m.text}
                      </div>
                    </button>
                  ))}
                  {unreadMentions.length > 5 && (
                    <button
                      type="button"
                      onClick={() => { setNotifOpen(false); navigate("chat"); }}
                      className="w-full text-center text-[11px] font-700 py-1"
                      style={{ color: "var(--primary)" }}
                    >
                      외 {unreadMentions.length - 5}건 더 보기
                    </button>
                  )}
                </div>
              </div>
            )}
            {Math.max(0, chatUnreadTotal - unreadMentions.length) > 0 && (
              <button
                onClick={() => { setNotifOpen(false); navigate("chat"); }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-all"
                style={{ borderRadius: "8px" }}
              >
                <span className="text-xs font-700">💬 새 메시지</span>
                <span className="text-xs font-700" style={{ color: "var(--primary)" }}>{Math.max(0, chatUnreadTotal - unreadMentions.length)}건</span>
              </button>
            )}
            {newTasks.length > 0 && (
              <div className="px-2.5 py-2">
                <button onClick={() => { setNotifOpen(false); navigate("tasks"); }} className="w-full flex items-center justify-between gap-2 text-left mb-1">
                  <span className="text-xs font-700">📋 새 과제</span>
                  <span className="text-xs font-700" style={{ color: "var(--primary)" }}>{newTasks.length}건</span>
                </button>
                {newTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="text-xs truncate pl-1" style={{ color: "var(--muted-foreground)" }}>· {t.title}</div>
                ))}
              </div>
            )}
            {newScheduleEvents.length > 0 && (
              <div className="px-2.5 py-2">
                <button onClick={() => { setNotifOpen(false); navigate("schedule"); }} className="w-full flex items-center justify-between gap-2 text-left mb-1">
                  <span className="text-xs font-700">🗓 새 일정</span>
                  <span className="text-xs font-700" style={{ color: "var(--primary)" }}>{newScheduleEvents.length}건</span>
                </button>
                {newScheduleEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="text-xs truncate pl-1" style={{ color: "var(--muted-foreground)" }}>· {e.hideTitle ? "바쁨" : e.title}</div>
                ))}
              </div>
            )}
            {newFiles.length > 0 && (
              <div className="px-2.5 py-2">
                <button onClick={() => { setNotifOpen(false); navigate("workspace"); }} className="w-full flex items-center justify-between gap-2 text-left mb-1">
                  <span className="text-xs font-700">📁 새 파일</span>
                  <span className="text-xs font-700" style={{ color: "var(--primary)" }}>{newFiles.length}건</span>
                </button>
                {newFiles.slice(0, 3).map((f) => (
                  <div key={f.id} className="text-xs truncate pl-1" style={{ color: "var(--muted-foreground)" }}>· {f.name}</div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Project switcher */}
        <button
          onClick={() => { setSwitcherOpen((v) => !v); setNotifOpen(false); }}
          className="mt-3 px-3 py-2.5 w-full text-left transition-all"
          style={{ background: "var(--muted)", borderRadius: "10px" }}
        >
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-600 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              현재 프로젝트
            </span>
            <span
              className="text-xs px-1.5 py-0.5 font-600"
              style={{
                background: project.status === "active" ? "#22c55e18" : "var(--card)",
                color: project.status === "active" ? "#22c55e" : "var(--muted-foreground)",
                borderRadius: "3px",
              }}
            >
              {project.status === "active" ? "진행 중" : "완료"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-700 leading-snug">{project.name}</div>
            <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
              {switcherOpen ? "▲" : "▼"}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {project.org}
          </div>
        </button>

        <div className="mt-1.5 px-3">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs truncate flex-1 select-all" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }} title={shownCode ?? undefined}>
              참여 코드: {shownCode ?? (joinCodeError ? "불러오지 못함" : "…")}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {(isLeader || isViceLeader) && (
                <button
                  onClick={reissueJoinCode}
                  disabled={rotatingCode}
                  title="지금 새 코드로 재발급(이전 코드는 바로 무효, 6시간 유효)"
                  className="text-xs px-1.5 py-0.5 hover:opacity-80"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "6px" }}
                >
                  {rotatingCode ? "…" : "↻"}
                </button>
              )}
              <button
                onClick={() => {
                  if (!shownCode) return;
                  navigator.clipboard.writeText(shownCode);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 1500);
                }}
                disabled={!shownCode}
                className="text-xs font-600 px-2 py-0.5 shrink-0"
                style={{ background: "var(--muted)", color: "var(--primary)", borderRadius: "20px" }}
              >
                {codeCopied ? "복사됨!" : "복사"}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end text-[10px] mt-0.5 px-0.5" style={{ color: "var(--muted-foreground)" }}>
            <span>{joinCodeError && !shownCode ? joinCodeError : remaining}</span>
          </div>
        </div>

        {switcherOpen && (
          <div
            className="absolute left-4 right-4 top-full mt-1.5 p-1.5 z-20"
            style={{
              // A floating menu needs to read as clearly separate from
              // whatever's behind it, so it stays near-opaque regardless
              // of the account's card-transparency setting.
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              borderRadius: "14px",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.25)",
              backdropFilter: "var(--panel-blur)",
              WebkitBackdropFilter: "var(--panel-blur)",
            }}
          >
            <div className="text-xs font-600 uppercase tracking-widest px-2.5 pt-1.5 pb-2" style={{ color: "var(--muted-foreground)" }}>
              내 프로젝트 전환
            </div>
            <div className="max-h-64 overflow-y-auto">
              {projects.map((p) => {
                const isCurrent = p.id === project.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setProjectId(p.id); setSwitcherOpen(false); setMobileOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-all"
                    style={{ background: isCurrent ? "var(--secondary)" : "transparent", borderRadius: "8px" }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-700 truncate" style={{ color: isCurrent ? "var(--primary)" : "var(--foreground)" }}>
                        {p.name}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                        {p.org}
                      </div>
                    </div>
                    <span
                      className="text-xs px-1.5 py-0.5 font-600 shrink-0"
                      style={{
                        background: p.status === "active" ? "#22c55e18" : "var(--muted)",
                        color: p.status === "active" ? "#22c55e" : "var(--muted-foreground)",
                        borderRadius: "3px",
                      }}
                    >
                      {p.status === "active" ? "진행 중" : "완료"}
                    </span>
                    {isCurrent && isAdmin && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setSwitcherOpen(false); setPendingDelete(true); }}
                        className="w-6 h-6 flex items-center justify-center shrink-0 transition-all"
                        style={{ background: "#ef444418", borderRadius: "6px" }}
                        title="프로젝트 삭제"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 pt-1.5" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => { setSwitcherOpen(false); setCreateOpen(true); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-all"
                style={{ borderRadius: "8px" }}
              >
                <span
                  className="w-5 h-5 flex items-center justify-center text-xs font-700 shrink-0"
                  style={{ background: "#2563eb18", color: "var(--primary)", borderRadius: "6px" }}
                >
                  +
                </span>
                <span className="text-xs font-700" style={{ color: "var(--primary)" }}>새 프로젝트 만들기</span>
              </button>
              <button
                onClick={() => { setSwitcherOpen(false); setJoinOpen(true); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-all"
                style={{ borderRadius: "8px" }}
              >
                <span
                  className="w-5 h-5 flex items-center justify-center text-xs font-700 shrink-0"
                  style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "6px" }}
                >
                  →
                </span>
                <span className="text-xs font-700" style={{ color: "#22c55e" }}>프로젝트 참여하기</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        className="flex-1 px-3 py-3"
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-xs font-600 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            메뉴
          </span>
          <span className="text-[10px] hidden md:inline-block select-none" style={{ color: "var(--muted-foreground)", opacity: 0.7 }} title="메뉴를 드래그하여 순서를 바꿀 수 있습니다">
            끌어서 정렬
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {visibleNavItems.map((item) => {
            const active = currentPage === item.id;
            const isReorderable = item.id !== "admin";
            const isDragging = draggedPage === item.id;
            const isOver = dragOverPage === item.id;

            return (
              <div
                key={item.id}
                draggable={isReorderable}
                onDragStart={isReorderable ? (e) => handleDragStart(e, item.id as NavPage) : undefined}
                onDragOver={isReorderable ? (e) => handleDragOver(e, item.id as NavPage) : undefined}
                onDragLeave={isReorderable ? handleDragLeave : undefined}
                onDrop={isReorderable ? (e) => handleDrop(e, item.id as NavPage) : undefined}
                onDragEnd={isReorderable ? handleDragEnd : undefined}
                className="relative group transition-all"
                style={{
                  opacity: isDragging ? 0.35 : 1,
                  transform: isDragging ? "scale(0.98)" : "none",
                }}
              >
                {/* Visual drop indicator line */}
                {isOver && dropPosition === "before" && (
                  <div
                    className="absolute -top-1 left-2 right-2 h-0.5 rounded-full z-20 pointer-events-none"
                    style={{ background: "var(--primary)", boxShadow: "0 0 8px var(--primary)" }}
                  />
                )}
                {isOver && dropPosition === "after" && (
                  <div
                    className="absolute -bottom-1 left-2 right-2 h-0.5 rounded-full z-20 pointer-events-none"
                    style={{ background: "var(--primary)", boxShadow: "0 0 8px var(--primary)" }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => navigate(item.id)}
                  className="flex items-center gap-3 px-3 py-2.5 text-left w-full transition-all"
                  style={{
                    borderRadius: "10px",
                    background: active ? "var(--nav-active-bg)" : "transparent",
                    color: active ? "var(--nav-active-text)" : "var(--foreground)",
                    fontWeight: active ? 600 : 400,
                    fontSize: "13.5px",
                    border: active ? "var(--nav-active-border)" : "1px solid transparent",
                    boxShadow: active ? "var(--nav-active-shadow)" : "none",
                    cursor: isReorderable ? "grab" : "pointer",
                  }}
                  title={isReorderable ? `${item.label} (드래그하여 순서 변경)` : item.label}
                >
                  <span
                    className="text-sm w-6 h-6 flex items-center justify-center shrink-0"
                    style={{
                      background: active ? "var(--nav-active-icon-bg)" : "var(--muted)",
                      borderRadius: "7px",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {!!navUnread[item.id] && (
                    <span
                      className="text-xs font-700 min-w-5 h-5 px-1 flex items-center justify-center shrink-0"
                      style={{ background: active ? "#fff" : "var(--accent)", color: active ? "var(--primary)" : "#fff", borderRadius: "20px" }}
                    >
                      {navUnread[item.id]}
                    </span>
                  )}
                  {isReorderable && (
                    <span
                      className="text-xs opacity-0 group-hover:opacity-40 transition-opacity select-none hidden md:inline-block"
                      style={{ color: "var(--muted-foreground)" }}
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </nav>

      {/* User card */}
      <div
        className="mt-4 px-4 py-3"
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={openProfile} className="shrink-0" title="프로필 설정">
            {avatarFrame
              ? <AvatarFrame kind={avatarFrame} size={36} c1={cardC1} c2={cardC2}><Avatar url={currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={36} badge={myTier && <TierMedal tier={myTier} />} /></AvatarFrame>
              : <Avatar url={currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={36} badge={myTier && <TierMedal tier={myTier} />} />}
          </button>
          <button type="button" onClick={openProfile} className="flex-1 min-w-0 text-left">
            <div className="text-sm font-700">{myName}</div>
            <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
              {myRole} · 이 프로젝트
            </div>
          </button>
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: "#22c55e" }}
          />
          <button
            onClick={signOut}
            title="로그아웃"
            className="w-7 h-7 flex items-center justify-center shrink-0 transition-all"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "8px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
    {createOpen && (
      <CreateProjectModal
        onCancel={() => setCreateOpen(false)}
        onCreate={async (input) => {
          await addProject(input);
          setCreateOpen(false);
          onNavigate("dashboard");
        }}
      />
    )}
    {joinOpen && (
      <JoinProjectModal
        lookupProject={lookupProject}
        joinProject={joinProject}
        onCancel={() => setJoinOpen(false)}
        onJoined={() => {
          setJoinOpen(false);
          onNavigate("dashboard");
        }}
      />
    )}
    {pendingDelete && (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
        <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
          <div className="w-10 h-10 flex items-center justify-center mb-3" style={{ background: "#ef444418", borderRadius: "12px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </div>
          <h3 className="font-700 mb-1">프로젝트를 삭제할까요?</h3>
          <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
            <strong>{project.name}</strong>의 팀원·과제·파일·일정이 모두 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingDelete(false)}
              disabled={deleting}
              className="flex-1 py-2.5 text-sm font-600"
              style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
            >
              취소
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="flex-1 py-2.5 text-sm font-700 transition-all"
              style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}
            >
              {deleting ? "삭제 중…" : "삭제하기"}
            </button>
          </div>
        </div>
      </div>
    )}
    <ProfileModal />
    </>
  );
}
