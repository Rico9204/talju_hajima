import { useEffect, useState, type ChangeEvent } from "react";
import { Page } from "../App";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { isValidDepartmentName } from "../lib/validators";
import { detectLink } from "../lib/links";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";
import Avatar from "./Avatar";
import PentagonChart from "./PentagonChart";
import BrandIcon, { type KnownLinkType } from "./BrandIcon";

type ProfileFieldKey = "name" | "major" | "student" | "contact";

const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  name: "이름",
  major: "학과",
  student: "학번",
  contact: "연락처",
};

const BANNER_COLOR_PALETTE = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#64748b"];

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
  const { user, signOut, updatePassword } = useAuth();
  const myName = currentMember?.name ?? "참여자";
  const myRole = currentMember?.role ?? "참여자";
  const myAvatar = currentMember?.avatar ?? "?";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [editingField, setEditingField] = useState<ProfileFieldKey | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [linkAddOpen, setLinkAddOpen] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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
    setEditingField(null);
    setFieldError(null);
    setAvatarPreview(null);
    setAvatarError(null);
    setBannerPickerOpen(false);
    setBannerError(null);
    setLinkAddOpen(false);
    setNewLinkUrl("");
    setLinkError(null);
    setProfileOpen(true);
  }

  function fieldValue(field: ProfileFieldKey): string {
    if (field === "name") return currentMember?.name ?? "";
    if (field === "major") return currentMember?.major ?? "";
    if (field === "student") return currentMember?.student ?? "";
    return currentMember?.contact ?? "";
  }

  function startEditField(field: ProfileFieldKey) {
    setEditingField(field);
    setFieldDraft(fieldValue(field));
    setFieldError(null);
  }

  function cancelEditField() {
    setEditingField(null);
    setFieldError(null);
  }

  async function saveEditField() {
    if (!editingField) return;
    const trimmed = fieldDraft.trim();
    if (editingField === "major" && trimmed && !isValidDepartmentName(trimmed)) {
      setFieldError("학과 이름은 한글/영문으로 입력해주세요.");
      return;
    }
    if (editingField !== "contact" && !trimmed) {
      setFieldError(`${PROFILE_FIELD_LABELS[editingField]}을(를) 입력해주세요.`);
      return;
    }
    setFieldSaving(true);
    setFieldError(null);
    try {
      if (editingField === "name") await updateMyProfile({ name: trimmed });
      else if (editingField === "major") await updateMyProfile({ major: trimmed });
      else if (editingField === "student") await updateMyProfile({ student: trimmed });
      else await updateMyProfile({ contact: trimmed });
      setEditingField(null);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setFieldSaving(false);
    }
  }

  async function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      await updateMyProfile({ avatarFile: file });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "이미지를 저장하지 못했습니다.");
    } finally {
      setAvatarSaving(false);
    }
  }

  async function pickBannerColor(hex: string) {
    setBannerPickerOpen(false);
    setBannerSaving(true);
    setBannerError(null);
    try {
      await updateMyProfile({ bannerColor: hex, bannerImageUrl: null });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "배너 색상을 저장하지 못했습니다.");
    } finally {
      setBannerSaving(false);
    }
  }

  async function handleBannerImagePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setBannerPickerOpen(false);
    setBannerSaving(true);
    setBannerError(null);
    try {
      await updateMyProfile({ bannerImageFile: file });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "배너 이미지를 저장하지 못했습니다.");
    } finally {
      setBannerSaving(false);
    }
  }

  async function clearBannerImage() {
    setBannerPickerOpen(false);
    setBannerSaving(true);
    setBannerError(null);
    try {
      await updateMyProfile({ bannerImageUrl: null });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "배너 이미지를 제거하지 못했습니다.");
    } finally {
      setBannerSaving(false);
    }
  }

  async function addLink() {
    const url = newLinkUrl.trim();
    if (!url) {
      setLinkError("링크 URL을 입력해주세요.");
      return;
    }
    const detected = detectLink(url);
    const links = [
      ...(currentMember?.links ?? []),
      { id: crypto.randomUUID(), type: detected.type, url: url.includes("://") ? url : `https://${url}`, label: detected.label },
    ];
    setLinkSaving(true);
    setLinkError(null);
    try {
      await updateMyProfile({ links });
      setNewLinkUrl("");
      setLinkAddOpen(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "링크를 저장하지 못했습니다.");
    } finally {
      setLinkSaving(false);
    }
  }

  async function removeLink(id: string) {
    const links = (currentMember?.links ?? []).filter((l) => l.id !== id);
    setLinkError(null);
    try {
      await updateMyProfile({ links });
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "링크를 삭제하지 못했습니다.");
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

  function renderProfileField(field: ProfileFieldKey, opts?: { placeholder?: string; mono?: boolean; emptyText?: string; big?: boolean }) {
    const label = PROFILE_FIELD_LABELS[field];
    const isEditing = editingField === field;
    const valueFont = opts?.big ? "text-xl font-800" : "text-sm font-600";

    if (isEditing) {
      return (
        <div key={field} className="mb-3">
          {!opts?.big && (
            <div className="text-[11px] font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
          )}
          <input
            autoFocus
            value={fieldDraft}
            onChange={(e) => setFieldDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEditField();
              if (e.key === "Escape") cancelEditField();
            }}
            onBlur={() => { if (editingField === field) cancelEditField(); }}
            placeholder={opts?.placeholder}
            readOnly={fieldSaving}
            className={`w-full outline-none bg-transparent ${valueFont}`}
            style={{
              border: "none",
              borderBottom: `1px solid ${fieldError ? "#ef4444" : "var(--primary)"}`,
              color: "var(--foreground)",
              paddingBottom: 2,
              fontFamily: opts?.mono ? "var(--font-jetbrains)" : undefined,
            }}
          />
          {fieldError && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{fieldError}</p>}
        </div>
      );
    }

    const value = fieldValue(field);
    return (
      <div key={field} onClick={() => startEditField(field)} className="mb-3 cursor-pointer">
        {!opts?.big && (
          <div className="text-[11px] font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
        )}
        <div
          className={`truncate ${valueFont}`}
          style={{ color: value ? "var(--foreground)" : "var(--muted-foreground)", fontFamily: opts?.mono && value ? "var(--font-jetbrains)" : undefined }}
        >
          {value || opts?.emptyText || "미입력"}
        </div>
      </div>
    );
  }

  // TEST-ONLY: forces the "내 협업 평판" panel to render as if evaluated, for
  // visually testing the filled-in layout without real eval data. DEV-gated
  // so it can never affect a production build; remove this block and its use
  // below once the user is done testing the design.
  const PREVIEW_EVAL = import.meta.env.DEV
    ? { score: 8.7, evalCount: 5, criteriaScores: { role: 9, deadline: 8, communication: 7.5, collaboration: 9.2, quality: 8.5 } }
    : null;
  const evalPreview =
    PREVIEW_EVAL ?? (currentMember && currentMember.evalCount > 0
      ? { score: currentMember.score, evalCount: currentMember.evalCount, criteriaScores: currentMember.criteriaScores }
      : null);

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
        <div className="w-[700px] max-w-[95vw] overflow-hidden" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)" }} onClick={(e) => e.stopPropagation()}>
          {/* Banner */}
          <div
            className="relative"
            style={
              currentMember?.bannerImageUrl
                ? { height: 88, backgroundImage: `url(${currentMember.bannerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : {
                    height: 88,
                    background: `linear-gradient(135deg, ${currentMember?.bannerColor ?? currentMember?.color ?? "#f59e0b"}, ${currentMember?.bannerColor ?? currentMember?.color ?? "#f59e0b"}88)`,
                  }
            }
          >
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-sm"
              style={{ background: "rgba(15,18,53,0.35)", color: "#fff", borderRadius: "999px" }}
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => setBannerPickerOpen((v) => !v)}
              title="배너 변경"
              className="absolute top-3 right-14 w-7 h-7 flex items-center justify-center text-xs"
              style={{ background: "rgba(15,18,53,0.35)", color: "#fff", borderRadius: "999px" }}
            >
              {bannerSaving ? "…" : "✎"}
            </button>
            {bannerPickerOpen && (
              <div className="absolute top-12 right-3 p-3" style={{ width: 220, background: "var(--card)", borderRadius: "14px", boxShadow: "0 8px 24px rgba(15,18,53,0.25)" }}>
                <div className="text-[11px] font-700 uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>배경 색상</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BANNER_COLOR_PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => pickBannerColor(hex)}
                      title={hex}
                      className="w-6 h-6 shrink-0"
                      style={{
                        background: hex,
                        borderRadius: "999px",
                        border: !currentMember?.bannerImageUrl && (currentMember?.bannerColor ?? currentMember?.color) === hex ? "2px solid var(--foreground)" : "2px solid transparent",
                      }}
                    />
                  ))}
                </div>
                <div className="h-px my-3" style={{ background: "var(--border)" }} />
                <label className="block text-center text-xs font-600 py-2 cursor-pointer" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "10px" }}>
                  이미지 업로드
                  <input type="file" accept="image/*" onChange={handleBannerImagePick} className="hidden" />
                </label>
                {currentMember?.bannerImageUrl && (
                  <button type="button" onClick={clearBannerImage} className="w-full text-center text-xs font-600 py-2 mt-1.5" style={{ color: "#ef4444" }}>
                    이미지 제거
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px]">
            {/* Left: identity + editable fields */}
            <div className="px-5 pb-5" style={{ borderRight: "1px solid var(--border)" }}>
              <div className="relative inline-block -mt-9 mb-3" style={{ border: "4px solid var(--card)", borderRadius: "999px", background: "var(--card)" }}>
                <Avatar url={avatarPreview ?? currentMember?.avatarUrl} initial={myAvatar} color={currentMember?.color ?? "#f59e0b"} size={72} />
                <label
                  className="absolute bottom-0 right-0 w-6 h-6 flex items-center justify-center text-xs cursor-pointer"
                  style={{ background: "var(--primary)", color: "#fff", borderRadius: "999px", boxShadow: "0 0 0 2px var(--card)" }}
                  title="프로필 이미지 수정"
                >
                  {avatarSaving ? "…" : "✎"}
                  <input type="file" accept="image/*" onChange={handleAvatarPick} disabled={avatarSaving} className="hidden" />
                </label>
              </div>
              {avatarError && <p className="text-xs mb-2" style={{ color: "#ef4444" }}>{avatarError}</p>}
              {bannerError && <p className="text-xs mb-2" style={{ color: "#ef4444" }}>{bannerError}</p>}

              {renderProfileField("name", { big: true })}

              <div className="h-px my-3" style={{ background: "var(--border)" }} />

              {renderProfileField("major", { placeholder: "예: 컴퓨터공학과" })}
              {renderProfileField("student", { placeholder: "예: 2021123456", mono: true })}
              {renderProfileField("contact", { placeholder: "카카오톡 ID 또는 연락 가능한 방법", emptyText: "미입력" })}
              <div className="mb-3">
                <div className="text-[11px] font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>이메일</div>
                <div className="text-sm font-600 truncate" style={{ color: "var(--muted-foreground)" }}>{user?.email ?? ""}</div>
              </div>

              <div>
                <div className="text-[11px] font-700 uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>링크</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(currentMember?.links ?? []).map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-600"
                      style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "999px" }}
                    >
                      {link.type !== "other" && <BrandIcon type={link.type as KnownLinkType} size={12} />}
                      <span className="max-w-[110px] truncate">{link.label}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          removeLink(link.id);
                        }}
                        title="링크 삭제"
                        className="w-4 h-4 shrink-0 flex items-center justify-center"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        ×
                      </button>
                    </a>
                  ))}
                  {linkAddOpen ? (
                    <input
                      autoFocus
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addLink();
                        if (e.key === "Escape") { setLinkAddOpen(false); setNewLinkUrl(""); setLinkError(null); }
                      }}
                      onBlur={() => { if (!newLinkUrl.trim()) setLinkAddOpen(false); }}
                      placeholder="https://..."
                      readOnly={linkSaving}
                      className="text-xs px-2.5 py-1.5 outline-none"
                      style={{ width: 150, background: "var(--muted)", border: `1px solid ${linkError ? "#ef4444" : "var(--border)"}`, borderRadius: "999px", color: "var(--foreground)" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinkAddOpen(true)}
                      title="링크 추가"
                      className="w-6 h-6 shrink-0 flex items-center justify-center text-sm"
                      style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "999px" }}
                    >
                      +
                    </button>
                  )}
                </div>
                {linkError && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{linkError}</p>}
              </div>
            </div>

            {/* Right: peer-evaluation reputation, always visible */}
            <div className="p-4" style={{ background: "var(--muted)" }}>
              <div className="text-[11px] font-700 uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
                내 협업 평판{PREVIEW_EVAL && <span style={{ color: "#f59e0b" }}> (미리보기용 임시 데이터)</span>}
              </div>
              {evalPreview ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-800" style={{ color: "var(--primary)", fontFamily: "var(--font-outfit)" }}>
                      {evalPreview.score.toFixed(1)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>/ 10.0</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {project.status === "done"
                      ? `종료 평가 ${evalPreview.evalCount}건 기준`
                      : `참고 점수 · ${evalPreview.evalCount}건 (형성적 평가)`}
                  </div>
                  <div className="mt-1.5 h-1 w-full" style={{ background: "var(--border)", borderRadius: "4px" }}>
                    <div className="h-1" style={{ width: `${(evalPreview.score / 10) * 100}%`, background: "linear-gradient(90deg, var(--primary), #60a5fa)", borderRadius: "4px" }} />
                  </div>
                  <div className="flex justify-center mt-3">
                    <PentagonChart
                      size={270}
                      data={[
                        { label: "역할 이행", value: evalPreview.criteriaScores.role },
                        { label: "약속·마감 준수", value: evalPreview.criteriaScores.deadline },
                        { label: "의사소통", value: evalPreview.criteriaScores.communication },
                        { label: "협업 태도", value: evalPreview.criteriaScores.collaboration },
                        { label: "결과물 품질", value: evalPreview.criteriaScores.quality },
                      ]}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  {project.status === "done"
                    ? "이 프로젝트에서 받은 종료 평가가 아직 없어요."
                    : "프로젝트가 진행 중이라 아직 평판 점수가 없어요. 종료 평가는 프로젝트 종료 후 공개됩니다."}
                </p>
              )}
            </div>
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
