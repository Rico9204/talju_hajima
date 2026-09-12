import { useState } from "react";
import { Page } from "../App";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "대시보드", icon: "⊞" },
  { id: "team", label: "팀 관리", icon: "◎" },
  { id: "chat", label: "팀 채팅", icon: "◐" },
  { id: "tasks", label: "과제 보드", icon: "≡" },
  { id: "schedule", label: "일정", icon: "▤" },
  { id: "workspace", label: "워킹스페이스", icon: "⬡" },
  { id: "collector", label: "정보 수집", icon: "⌕" },
  { id: "evaluation", label: "동료 평가", icon: "★" },
];

export default function Sidebar({ currentPage, onNavigate }: { currentPage: Page; onNavigate: (p: Page) => void }) {
  const { projects, project, setProjectId, addProject, deleteProject, lookupProject, joinProject, chatUnreadTotal, isLeader, currentMember } = useProject();
  const { signOut } = useAuth();
  const myName = currentMember?.name ?? "참여자";
  const myRole = currentMember?.role ?? "참여자";
  const myAvatar = currentMember?.avatar ?? "?";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    await deleteProject(project.id);
    setDeleting(false);
    setPendingDelete(false);
    onNavigate("dashboard");
  }

  return (
    <>
    <aside
      className="flex flex-col w-60 h-full shrink-0 p-4"
      style={{ background: "var(--background)" }}
    >
      {/* Logo card */}
      <div
        className="px-4 py-4 mb-5 relative"
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center text-xs font-800"
            style={{
              background: "var(--primary)",
              color: "#fff",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(37,99,235,0.35)",
            }}
          >
            CP
          </div>
          <div>
            <div className="text-sm font-700 leading-none">CollabPeer</div>
            <div
              className="text-xs mt-0.5"
              style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}
            >
              v2.4.1
            </div>
          </div>
        </div>

        {/* Project switcher */}
        <button
          onClick={() => setSwitcherOpen((v) => !v)}
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

        <div className="mt-1.5 px-3 flex items-center justify-between gap-2">
          <span className="text-xs truncate" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            참여 코드: {project.id}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(project.id);
              setCodeCopied(true);
              setTimeout(() => setCodeCopied(false), 1500);
            }}
            className="text-xs font-600 px-2 py-0.5 shrink-0"
            style={{ background: "var(--muted)", color: "var(--primary)", borderRadius: "20px" }}
          >
            {codeCopied ? "복사됨!" : "복사"}
          </button>
        </div>

        {switcherOpen && (
          <div
            className="absolute left-4 right-4 top-full mt-1.5 p-1.5 z-20"
            style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "0 16px 40px rgba(15,18,53,0.18)" }}
          >
            <div className="text-xs font-600 uppercase tracking-widest px-2.5 pt-1.5 pb-2" style={{ color: "var(--muted-foreground)" }}>
              내 프로젝트 전환
            </div>
            {projects.map((p) => {
              const isCurrent = p.id === project.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { setProjectId(p.id); setSwitcherOpen(false); }}
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
                  {isCurrent && isLeader && (
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
          background: "var(--card)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="text-xs font-600 uppercase tracking-widest px-2 mb-3" style={{ color: "var(--muted-foreground)" }}>
          메뉴
        </div>
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="flex items-center gap-3 px-3 py-2.5 text-left w-full transition-all"
                style={{
                  borderRadius: "10px",
                  background: active ? "var(--primary)" : "transparent",
                  color: active ? "#fff" : "var(--foreground)",
                  fontWeight: active ? 600 : 400,
                  fontSize: "13.5px",
                  boxShadow: active ? "0 4px 12px rgba(37,99,235,0.25)" : "none",
                }}
              >
                <span
                  className="text-sm w-6 h-6 flex items-center justify-center shrink-0"
                  style={{
                    background: active ? "rgba(255,255,255,0.2)" : "var(--muted)",
                    borderRadius: "7px",
                  }}
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.id === "chat" && chatUnreadTotal > 0 && (
                  <span
                    className="text-xs font-700 min-w-5 h-5 px-1 flex items-center justify-center shrink-0"
                    style={{ background: active ? "#fff" : "var(--accent)", color: active ? "var(--primary)" : "#fff", borderRadius: "20px" }}
                  >
                    {chatUnreadTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* User card */}
      <div
        className="mt-4 px-4 py-3"
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 shrink-0"
            style={{
              background: "var(--accent)",
              color: "#fff",
              boxShadow: "0 4px 10px rgba(245,158,11,0.3)",
            }}
          >
            {myAvatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-700">{myName}</div>
            <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
              {myRole} · 이 프로젝트
            </div>
          </div>
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
        onCreate={(input) => {
          addProject(input);
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
        <div className="w-96 p-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)" }}>
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
    </>
  );
}
