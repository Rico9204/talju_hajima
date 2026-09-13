import { useEffect, useState, type ChangeEvent } from "react";
import { Page } from "../App";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { isValidDepartmentName } from "../lib/validators";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";
import Avatar from "./Avatar";

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
  const { projects, project, setProjectId, addProject, deleteProject, lookupProject, joinProject, chatUnreadTotal, isLeader, currentMember, updateMyProfile } = useProject();
  const { signOut, updatePassword } = useAuth();
  const myName = currentMember?.name ?? "참여자";
  const myRole = currentMember?.role ?? "참여자";
  const myAvatar = currentMember?.avatar ?? "?";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
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

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileSchool, setProfileSchool] = useState("");
  const [profileMajor, setProfileMajor] = useState("");
  const [profileStudent, setProfileStudent] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ next: "", confirm: "" });
  const [passwordNotice, setPasswordNotice] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  async function confirmDelete() {
    setDeleting(true);
    await deleteProject(project.id);
    setDeleting(false);
    setPendingDelete(false);
    onNavigate("dashboard");
  }

  function openProfile() {
    setProfileName(currentMember?.name ?? "");
    setProfileSchool(currentMember?.school ?? "");
    setProfileMajor(currentMember?.major ?? "");
    setProfileStudent(currentMember?.student ?? "");
    setAvatarFile(null);
    setAvatarPreview(null);
    setProfileError(null);
    setProfileOpen(true);
  }

  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function saveProfile() {
    const majorTrimmed = profileMajor.trim();
    if (majorTrimmed && !isValidDepartmentName(majorTrimmed)) {
      setProfileError("학과 이름은 한글/영문으로 입력해주세요.");
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      await updateMyProfile({
        name: profileName.trim() || undefined,
        school: profileSchool.trim() || undefined,
        major: majorTrimmed || undefined,
        student: profileStudent.trim() || undefined,
        avatarFile: avatarFile ?? undefined,
      });
      setProfileOpen(false);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPasswordChange() {
    if (passwordForm.next.length < 6) {
      setPasswordNotice("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordNotice("새 비밀번호와 확인이 일치하지 않습니다.");
      return;
    }
    setChangingPassword(true);
    const result = await updatePassword(passwordForm.next);
    setChangingPassword(false);
    if (result.error) {
      setPasswordNotice(result.error);
      return;
    }
    setPasswordNotice("비밀번호가 변경되었습니다.");
    setPasswordForm({ next: "", confirm: "" });
    setTimeout(() => {
      setPasswordOpen(false);
      setPasswordNotice("");
    }, 1200);
  }

  return (
    <>
    {/* Always reachable on mobile, even while the sidebar itself is hidden. */}
    <button
      onClick={() => setMobileOpen(true)}
      className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center text-lg"
      style={{ background: "var(--card)", color: "var(--foreground)", borderRadius: "10px", boxShadow: "var(--shadow-card)" }}
      aria-label="메뉴 열기"
    >
      ☰
    </button>
    <aside
      className={`${mobileOpen ? "flex" : "hidden"} md:flex flex-col w-full md:w-60 h-full shrink-0 p-4 fixed md:relative inset-0 z-40 overflow-y-auto`}
      style={{ background: "var(--background)" }}
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
                onClick={() => navigate(item.id)}
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
          <button type="button" onClick={openProfile} className="shrink-0" title="프로필 설정">
            <Avatar url={currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={36} />
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
    {profileOpen && (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.42)", backdropFilter: "blur(4px)" }} onClick={() => setProfileOpen(false)}>
        <div className="w-[420px] max-w-[92vw] p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-700">프로필 설정</h3>
            <button type="button" onClick={() => setProfileOpen(false)} className="w-8 h-8 flex items-center justify-center text-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>
              ×
            </button>
          </div>

          <div className="flex items-center gap-4 mb-5">
            <Avatar url={avatarPreview ?? currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={64} />
            <div className="flex-1">
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>프로필 이미지</label>
              <label className="inline-flex items-center justify-center px-3 py-2 text-sm font-600 cursor-pointer" style={{ background: "var(--primary)", color: "#fff", borderRadius: "10px" }}>
                이미지 선택
                <input type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>이름</label>
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>학교</label>
              <input
                value={profileSchool}
                onChange={(e) => setProfileSchool(e.target.value)}
                placeholder="예: 동명대학교"
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>학과</label>
              <input
                value={profileMajor}
                onChange={(e) => setProfileMajor(e.target.value)}
                placeholder="예: 컴퓨터공학과"
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--muted)", border: `1px solid ${profileError ? "#ef4444" : "var(--border)"}`, borderRadius: "10px", color: "var(--foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>학번</label>
              <input
                value={profileStudent}
                onChange={(e) => setProfileStudent(e.target.value)}
                placeholder="예: 2021123456"
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)", fontFamily: "var(--font-jetbrains)" }}
              />
            </div>
            <button
              type="button"
              onClick={() => { setProfileOpen(false); setPasswordOpen(true); }}
              className="text-left text-xs font-600 px-3 py-2.5"
              style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "10px" }}
            >
              비밀번호 변경
            </button>
          </div>

          {profileError && (
            <div className="text-xs mt-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>{profileError}</div>
          )}

          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              className="flex-1 py-2.5 text-sm font-600"
              style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="flex-1 py-2.5 text-sm font-700"
              style={{ background: "var(--primary)", borderRadius: "40px", color: "#fff" }}
            >
              {savingProfile ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    )}
    {passwordOpen && (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.42)", backdropFilter: "blur(4px)" }} onClick={() => setPasswordOpen(false)}>
        <div className="w-[380px] max-w-[92vw] p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-700">비밀번호 변경</h3>
            <button
              type="button"
              onClick={() => { setPasswordOpen(false); setPasswordNotice(""); }}
              className="w-8 h-8 flex items-center justify-center text-lg"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>새 비밀번호</label>
              <input
                type="password"
                value={passwordForm.next}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))}
                placeholder="6자 이상"
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>새 비밀번호 확인</label>
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submitPasswordChange()}
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
              />
            </div>
          </div>

          {passwordNotice && (
            <div className="mt-3 text-xs font-600" style={{ color: passwordNotice.includes("변경되었습니다") ? "#22c55e" : "#ef4444" }}>
              {passwordNotice}
            </div>
          )}

          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={() => { setPasswordOpen(false); setPasswordNotice(""); }}
              className="flex-1 py-2.5 text-sm font-600"
              style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={submitPasswordChange}
              disabled={changingPassword}
              className="flex-1 py-2.5 text-sm font-700"
              style={{ background: "var(--primary)", borderRadius: "40px", color: "#fff" }}
            >
              {changingPassword ? "변경 중…" : "변경하기"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
