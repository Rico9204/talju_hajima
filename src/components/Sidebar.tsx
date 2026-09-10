import { useState } from "react";
import { Page } from "../App";
import { useProject } from "../context/ProjectContext";
import CreateProjectModal from "./CreateProjectModal";

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
  const { projects, project, setProjectId, addProject, team } = useProject();
  const myRole = team.members.find((m) => m.name === "김지수")?.role || "참여자";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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
                {item.label}
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
            김
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-700">김지수</div>
            <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
              {myRole} · 이 프로젝트
            </div>
          </div>
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: "#22c55e" }}
          />
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
    </>
  );
}
