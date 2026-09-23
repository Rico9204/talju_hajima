import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";
import BoardView from "./BoardView";
import AdminApplicationNotice from "./AdminApplicationNotice";
import AdminOperatorPanel from "./AdminOperatorPanel";
import Avatar from "./Avatar";
import AvatarFrame from "./AvatarFrame";
import MedalIcon from "./MedalIcon";
import ProfileModal from "./ProfileModal";
import { useAccountBackground } from "../lib/useAccountBackground";
import { useMyProfileTheme } from "../lib/useMyProfileTheme";
import type { Tier } from "../lib/achievements";

// Small medal pinned to an Avatar's corner (see Avatar's `badge` prop) —
// mirrors the same treatment in Sidebar.tsx's bottom user card.
function TierMedal({ tier }: { tier: Tier }) {
  return (
    <span title={tier.label} className="flex items-center justify-center w-full h-full">
      <MedalIcon shape={tier.shape} colors={tier.colors} size={18} />
    </span>
  );
}

const statusStyle: Record<"active" | "done", { label: string; bg: string; color: string }> = {
  active: { label: "진행 중", bg: "#22c55e18", color: "#22c55e" },
  done: { label: "완료", bg: "var(--muted)", color: "var(--muted-foreground)" },
};

type HomeTab = "projects" | "board" | "operator";

export default function Home() {
  const { projects, setProjectId, addProject, lookupProject, joinProject, currentMember, openMemberProfile } = useProject();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const myName = currentMember?.name ?? "참여자";
  const myAvatar = currentMember?.avatar ?? "?";
  const { backgroundStyle, glassStyle, hasCustomBackground, lineSafeStyle } = useAccountBackground();
  const { myTier, avatarFrame, cardC1, cardC2 } = useMyProfileTheme();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTab>("projects");
  const [mobileOpen, setMobileOpen] = useState(false);
  // 운영자 전용 메뉴: 대기 중인 관리자 신청 수를 배지로 보여준다(운영자가 아니면 조회하지 않는다).
  const { isOperator, listAdminApplications } = useProjectManagement();
  const [pendingApplications, setPendingApplications] = useState(0);
  useEffect(() => {
    if (!isOperator) return;
    let active = true;
    listAdminApplications()
      .then((apps) => active && setPendingApplications(apps.filter((a) => a.status === "pending").length))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isOperator]);

  function enterProject(id: string) {
    setProjectId(id);
    navigate("/dashboard");
  }

  function selectTab(tab: HomeTab) {
    setActiveTab(tab);
    setMobileOpen(false);
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={glassStyle as CSSProperties}>
      {/* The background sits on its own layer, scaled up and blurred by the
          same slider that controls card blur — matches Layout in App.tsx.
          Skipped without a custom background — see the comment there. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={
          hasCustomBackground
            ? {
                ...backgroundStyle,
                filter: "blur(var(--panel-blur-px)) saturate(1.15)",
                transform: "scale(1.1) translateZ(0)",
                // Same tile-rasterization-seam fix as App.tsx's Layout — see the
                // comment there (deliberately no will-change: transform; it broke
                // backdrop-filter rendering on the fixed notification popup).
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }
            : backgroundStyle
        }
      />
      <div className="relative flex h-full w-full overflow-hidden">
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

        <div className="px-4 py-4 mb-5" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 flex items-center justify-center text-xs font-800 shrink-0"
              style={{ background: "var(--primary)", color: "#fff", borderRadius: "10px", boxShadow: "0 4px 12px rgba(37,99,235,0.35)" }}
            >
              CP
            </div>
            <div className="min-w-0">
              <div className="text-sm font-700 leading-none">CollabPeer</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>v2.4.1</div>
            </div>
          </div>
        </div>

        <div className="text-xs font-600 uppercase tracking-widest px-2 mb-2" style={{ color: "var(--muted-foreground)" }}>
          메뉴
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          <button
            onClick={() => selectTab("projects")}
            className="flex items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-700 transition-all"
            style={{ borderRadius: "10px", background: activeTab === "projects" ? "var(--primary)" : "transparent", color: activeTab === "projects" ? "#fff" : "var(--foreground)" }}
          >
            <span className="flex items-center gap-2.5">
              <span>📁</span>
              <span>내 프로젝트</span>
            </span>
            <span
              className="text-xs px-1.5 py-0.5 font-700 shrink-0"
              style={{ background: activeTab === "projects" ? "rgba(255,255,255,0.2)" : "var(--muted)", color: activeTab === "projects" ? "#fff" : "var(--muted-foreground)", borderRadius: "20px" }}
            >
              {projects.length}
            </span>
          </button>
          <button
            onClick={() => selectTab("board")}
            className="flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-700 transition-all"
            style={{ borderRadius: "10px", background: activeTab === "board" ? "var(--primary)" : "transparent", color: activeTab === "board" ? "#fff" : "var(--foreground)" }}
          >
            <span>💬</span>
            <span>게시판</span>
          </button>
          {isOperator && (
            <button
              onClick={() => selectTab("operator")}
              className="flex items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-700 transition-all"
              style={{ borderRadius: "10px", background: activeTab === "operator" ? "var(--primary)" : "transparent", color: activeTab === "operator" ? "#fff" : "var(--foreground)" }}
            >
              <span className="flex items-center gap-2.5">
                <span>🛡️</span>
                <span>운영자</span>
              </span>
              {pendingApplications > 0 && (
                <span
                  aria-label={`대기 중인 관리자 신청 ${pendingApplications}건`}
                  className="text-xs px-1.5 py-0.5 font-700 shrink-0"
                  style={{ background: activeTab === "operator" ? "rgba(255,255,255,0.2)" : "#ef444418", color: activeTab === "operator" ? "#fff" : "#ef4444", borderRadius: "20px" }}
                >
                  {pendingApplications}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* User card */}
        <div className="mt-4 px-4 py-3" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => currentMember && openMemberProfile(currentMember.id)} className="shrink-0" title="프로필 설정">
              {avatarFrame
                ? <AvatarFrame kind={avatarFrame} size={36} c1={cardC1} c2={cardC2}><Avatar url={currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={36} badge={myTier && <TierMedal tier={myTier} />} /></AvatarFrame>
                : <Avatar url={currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={36} badge={myTier && <TierMedal tier={myTier} />} />}
            </button>
            <button type="button" onClick={() => currentMember && openMemberProfile(currentMember.id)} className="flex-1 min-w-0 text-left">
              <div className="text-sm font-700">{myName}</div>
              <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{user?.email}</div>
            </button>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22c55e" }} />
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

      <main className="flex-1 overflow-y-auto p-6 md:p-8 pt-16 md:pt-8">
        <div className="max-w-5xl mx-auto">
          <AdminApplicationNotice />
          {activeTab === "operator" && isOperator ? (
            <AdminOperatorPanel onPendingCountChange={setPendingApplications} />
          ) : activeTab === "board" ? (
            <BoardView />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-6">
                <div>
                  <h1 className="text-xl font-700">내 프로젝트</h1>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>참여 중인 팀 협업 프로젝트 목록입니다.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setJoinOpen(true)}
                    className="text-xs font-700 px-3.5 py-2"
                    style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}
                  >
                    참여하기
                  </button>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="text-xs font-700 px-3.5 py-2"
                    style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
                  >
                    새 프로젝트
                  </button>
                </div>
              </div>

              {projects.length === 0 ? (
                <div
                  className="p-8 text-center border-2 border-dashed"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}
                >
                  참여 중인 프로젝트가 없어요
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map((p) => {
                    const st = statusStyle[p.status];
                    return (
                      <button
                        key={p.id}
                        onClick={() => enterProject(p.id)}
                        className="text-left p-5 transition-all"
                        style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                          <span className="text-xs font-700 px-2 py-0.5" style={{ background: st.bg, color: st.color, borderRadius: "20px" }}>
                            {st.label}
                          </span>
                          {p.approvalStatus === "pending" && (
                            <span className="text-xs font-700 px-2 py-0.5" style={{ background: "#f0a50018", color: "#f0a500", borderRadius: "20px" }}>
                              승인 대기
                            </span>
                          )}
                          {p.approvalStatus === "rejected" && (
                            <span className="text-xs font-700 px-2 py-0.5" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>
                              반려됨
                            </span>
                          )}
                        </div>
                        <div className="text-base font-700 truncate mb-1">{p.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{p.org}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{p.period}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {createOpen && (
        <CreateProjectModal
          onCancel={() => setCreateOpen(false)}
          onCreate={async (input) => {
            const id = await addProject(input);
            setCreateOpen(false);
            navigate("/dashboard");
            return id;
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
            navigate("/dashboard");
          }}
        />
      )}
      <ProfileModal />
      </div>
    </div>
  );
}
