import type { EvaluationPhase, EvaluationEntry, EvaluationData } from "../api/types";
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { dataRepository } from "../api";
import type {
  Project,
  NewProjectInput,
  TeamData,
  Folder,
  WorkspaceFile,
  Task,
  NewTaskInput,
  TaskStatus,
  TaskPriority,
  ScheduleEvent,
  NewScheduleEventInput,
  ScheduleEventType,
  ScheduleEventVisibility,
  Member,
  ProfileLink,
  ChatMessage,
} from "../api/types";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE, supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import CreateProjectModal from "../components/CreateProjectModal";
import JoinProjectModal from "../components/JoinProjectModal";
import AdminPanel from "../components/AdminPanel";

export type {
  Project,
  NewProjectInput,
  Member,
  TeamData,
  FileVersion,
  FileComment,
  WorkspaceFile,
  Folder,
  Task,
  NewTaskInput,
  TaskStatus,
  TaskPriority,
  ChecklistItem,
  TaskComment,
  ScheduleEvent,
  NewScheduleEventInput,
  ScheduleEventType,
  ScheduleEventScope,
  ScheduleEventVisibility,
} from "../api/types";

const SHORT_TERM_THRESHOLD_DAYS = 14;

// The 1:1 channel id for two members, independent of who's asking — sorted
// so both sides compute the same key.
export function dmChannelId(memberIdA: string, memberIdB: string): string {
  const [a, b] = [memberIdA, memberIdB].sort();
  return `dm:${a}:${b}`;
}

export function getDurationDays(p: Project): number | null {
  if (!p.startDate || !p.endDate) return null;
  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function isShortTermProject(p: Project): boolean {
  const days = getDurationDays(p);
  return days !== null && days < SHORT_TERM_THRESHOLD_DAYS;
}

interface ProjectContextValue {
  getMyEvaluationSummary: () => Promise<import("../lib/evaluationSummary").MyEvaluationSummary>;
  getEvaluationMode: () => Promise<boolean>;
  getEvaluations: (phase: EvaluationPhase) => Promise<EvaluationData>;
  submitEvaluations: (phase: EvaluationPhase, entries: EvaluationEntry[]) => Promise<void>;
  completeProject: () => Promise<void>;
  projects: Project[];
  project: Project;
  setProjectId: (id: string) => void;
  addProject: (input: NewProjectInput) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  lookupProject: (projectId: string) => Promise<Project | null>;
  joinProject: (projectId: string, input: { school: string; major: string; student: string }) => Promise<void>;
  markProjectDone: () => Promise<void>;
  kickMember: (memberId: string) => Promise<void>;
  team: TeamData;
  transferLeadership: (targetName: string) => Promise<void>;
  updateMyProfile: (patch: {
    name?: string; major?: string; student?: string; school?: string; avatarFile?: File;
    contact?: string | null; org?: string | null; bannerColor?: string | null; bannerImageUrl?: string | null; bannerImageFile?: File; links?: ProfileLink[];
  }) => Promise<void>;
  isShortTerm: boolean;
  folders: Folder[];
  files: WorkspaceFile[];
  deleteWorkspaceFile: (id: number) => Promise<void>;
  deleteWorkspaceFolder: (id: number) => Promise<void>;
  pendingWorkspaceCleanup: () => Promise<string[]>;
  cleanupWorkspaceFiles: () => Promise<void>;
  addFolder: (name: string) => Promise<void>;
  uploadWorkspaceFile: (input: import("../api/types").FileUploadInput) => Promise<{ fileId: number; versionId: number; branched: boolean }>;
  promoteFileVersion: (fileId: number, versionId: number) => Promise<void>;
  // No longer called anywhere after the pdf-workspace-search merge — FileVersionPanel now
  // extracts text on-demand when a preview is opened instead of via a manual index button.
  indexFileVersion: (version: import("../api/types").FileVersion) => Promise<void>;
  setFileTags: (fileId: number, tags: string[]) => Promise<void>;
  pinFileVersion: (fileId: number, versionId: number, pinned: boolean) => Promise<void>;
  downloadFileVersion: (versionId: number) => Promise<Blob>;
  setFileCommentReaction: (commentId: number, emoji: string, active: boolean) => Promise<void>;
  addFileComment: (fileId: number, text: string) => Promise<void>;
  tasks: Task[];
  addTask: (input: NewTaskInput) => Promise<void>;
  moveTask: (taskId: number, status: TaskStatus) => Promise<void>;
  updateTaskDetails: (
    taskId: number,
    patch: Partial<{ title: string; assigneeIds: string[]; priority: TaskPriority; due: string; tags: string[] }>
  ) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  addTaskChecklistItem: (taskId: number, text: string) => Promise<void>;
  toggleTaskChecklistItem: (taskId: number, itemId: number, done: boolean) => Promise<void>;
  addTaskComment: (taskId: number, text: string) => Promise<void>;
  toggleTaskCommentReaction: (commentId: number, emoji: string) => Promise<void>;
  toggleTaskTeamSchedule: (taskId: number, checked: boolean) => Promise<void>;
  toggleTaskPersonalSchedule: (taskId: number, checked: boolean) => Promise<void>;
  scheduleEvents: ScheduleEvent[];
  addScheduleEvent: (input: NewScheduleEventInput) => Promise<void>;
  updateScheduleEvent: (
    id: number,
    patch: Partial<{ title: string; date: string; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>
  ) => Promise<void>;
  removeScheduleEvent: (id: number) => Promise<void>;
  chatUnread: Record<string, number>;
  chatUnreadTotal: number;
  chatMessages: Record<string, ChatMessage[]>;
  sendChatMessage: (channelId: string, text: string, fileId?: number) => Promise<void>;
  toggleChatReaction: (messageId: number, emoji: string) => Promise<void>;
  markChannelMessagesRead: (channelId: string) => Promise<void>;
  currentMember: Member | null;
  isLeader: boolean;
  loading: boolean;
  // Which member's profile card (Sidebar's bottom-left avatar modal) is
  // currently open, if any — set from anywhere a member's avatar is
  // clickable (chat, comments, task cards, team view) so the same modal
  // opens for them, not just for the signed-in user's own avatar.
  viewedMemberId: string | null;
  openMemberProfile: (memberId: string) => void;
  closeMemberProfile: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function StatusScreen({ kind, message }: { kind: "loading" | "error"; message?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
      <div
        className="max-w-sm px-6 py-5 text-center"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        {kind === "loading" && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>}
        {kind === "error" && (
          <>
            <div className="text-sm font-700 mb-1" style={{ color: "#ef4444" }}>
              데이터를 불러오지 못했습니다
            </div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {message}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shown when the signed-in account has no projects yet (a genuinely common
// state now that every account starts with zero memberships) — this is the
// one place `ProjectProvider` needs to render project-creating UI itself,
// since it replaces `children` (and therefore the whole routed app,
// including Sidebar) before any project exists to select. For an admin
// account specifically, zero projects is the *expected* steady state (an
// admin who only ever reviews other people's projects never needs one of
// their own) — AdminPanel doesn't depend on any project being selected, so
// it's rendered directly here instead of being unreachable behind Layout.
function EmptyProjectsScreen({
  isAdmin, signOut, addProject, lookupProject, joinProject,
}: {
  isAdmin: boolean;
  signOut: () => void;
  addProject: (input: NewProjectInput) => Promise<string>;
  lookupProject: (projectId: string) => Promise<Project | null>;
  joinProject: (projectId: string, input: { school: string; major: string; student: string }) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  if (isAdmin) {
    return (
      <div className="h-full w-full overflow-y-auto" style={{ background: "var(--background)" }}>
        <div className="flex items-center justify-between px-6 pt-6 max-w-5xl mx-auto">
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            아직 직접 만든 프로젝트가 없어요 — 관리자는 없어도 괜찮아요.
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setCreateOpen(true)}
              className="text-xs font-700 px-3.5 py-2"
              style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
            >
              내 프로젝트 만들기
            </button>
            <button
              onClick={signOut}
              className="text-xs font-600 px-3.5 py-2"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}
            >
              로그아웃
            </button>
          </div>
        </div>
        <AdminPanel />
        {createOpen && <CreateProjectModal onCancel={() => setCreateOpen(false)} onCreate={(input) => addProject(input)} />}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
      <div
        className="max-w-sm px-6 py-6 text-center"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="text-sm font-700 mb-1">아직 참여한 프로젝트가 없어요</div>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          새 프로젝트를 만들거나, 팀장에게 받은 참여 코드로 참여해보세요.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setJoinOpen(true)}
            className="flex-1 py-2.5 text-sm font-700"
            style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "40px" }}
          >
            참여하기
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex-1 py-2.5 text-sm font-700"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px" }}
          >
            새 프로젝트
          </button>
        </div>
      </div>
      {createOpen && <CreateProjectModal onCancel={() => setCreateOpen(false)} onCreate={(input) => addProject(input)} />}
      {joinOpen && (
        <JoinProjectModal
          lookupProject={lookupProject}
          joinProject={joinProject}
          onCancel={() => setJoinOpen(false)}
          onJoined={() => setJoinOpen(false)}
        />
      )}
    </div>
  );
}

const ProjectManagementContext = createContext<{
  isAdmin: boolean;
  retryFileCleanup: () => Promise<void>;
  cleanupProjectFiles: typeof dataRepository.cleanupWorkspaceFiles;
  listProjects: typeof dataRepository.listProjects;
  approveProject: typeof dataRepository.approveProject;
  rejectProject: typeof dataRepository.rejectProject;
  deleteProject: typeof dataRepository.deleteProject;
  getAdminTeam: (projectId: string) => Promise<TeamData>;
  kickMember: typeof dataRepository.kickMember;
  searchAdmins: typeof dataRepository.searchAdmins;
} | null>(null);
const managementActions = {
  retryFileCleanup: async () => {
    for (const id of await dataRepository.listWorkspaceCleanupProjects()) await dataRepository.cleanupWorkspaceFiles(id);
  },
  cleanupProjectFiles: (id: string) => dataRepository.cleanupWorkspaceFiles(id),
  listProjects: () => dataRepository.listProjects(),
  approveProject: (id: string) => dataRepository.approveProject(id),
  rejectProject: (id: string) => dataRepository.rejectProject(id),
  deleteProject: (id: string) => dataRepository.deleteProject(id),
  getAdminTeam: (id: string) => dataRepository.getTeam(id, true),
  kickMember: (id: string) => dataRepository.kickMember(id),
  searchAdmins: (query: string) => dataRepository.searchAdmins(query),
};
export function useProjectManagement() {
  const context = useContext(ProjectManagementContext);
  if (!context) throw new Error("ProjectProvider is required");
  return context;
}
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [identity, setIdentity] = useState<{ id: string; admin: boolean } | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setRoleError(null);
    if (!session) { setIdentity(null); return; }
    const id = session.user.id;
    dataRepository.isCurrentUserAdmin().then(admin => { if (active) setIdentity({ id, admin }); })
      .catch(() => { if (active) setRoleError("관리자 권한을 확인하지 못했습니다. DB 마이그레이션 적용 여부와 연결을 확인한 뒤 새로고침해 주세요."); });
    return () => { active = false; };
  }, [session?.user.id]);
  if (session && roleError) return <StatusScreen kind="error" message={roleError} />;
  if (session && identity?.id !== session.user.id) return <StatusScreen kind="loading" />;
  const isAdmin = !!session && identity?.id === session.user.id && identity.admin;
  return <ProjectManagementContext.Provider value={{ ...managementActions, isAdmin }}><ProjectDataProvider>{children}</ProjectDataProvider></ProjectManagementContext.Provider>;
}
function ProjectDataProvider({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const { isAdmin } = useProjectManagement();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const evaluationProjectRef = useRef(projectId);
  evaluationProjectRef.current = projectId;
  const [team, setTeam] = useState<TeamData>({ teamLabel: "", teamSub: "", members: [] });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  // Real chat messages, keyed by channel id, for the currently selected
  // project only. Eagerly loaded for every channel once the team is known
  // (see the effect below) and kept live via the realtime subscription.
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [viewedMemberId, setViewedMemberId] = useState<string | null>(null);
  // A project-scoped Realtime Presence channel supplies the member ids that
  // currently have this project open in one or more browser tabs.
  const [onlineMemberIds, setOnlineMemberIds] = useState<Set<string>>(new Set());
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const activityRevision = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Computed early (duplicating the later `currentMember` derivation) so the
  // effects below — which must run unconditionally, before any early return
  // — can depend on it.
  const myMemberId = session ? team.members.find((m) => m.userId === session.user.id)?.id ?? null : null;

  // Load the project list whenever the signed-in user changes (login,
  // logout, or switching accounts) and select the first project.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(SUPABASE_SETUP_MESSAGE);
      setProjectsLoaded(true);
      return;
    }
    if (!session) {
      // Not logged in — nothing to load. The router shows /login; render
      // children as-is below instead of an empty/loading screen.
      setProjectsLoaded(false);
      setProjects([]);
      setProjectId(null);
      setError(null);
      return;
    }
    let cancelled = false;
    Promise.all([dataRepository.listProjects(), dataRepository.listMyProjectIds()])
      .then(([list, myProjectIds]) => {
        if (cancelled) return;
        // `listProjects` returns every project in the database (RLS allows
        // any signed-in user to preview one by id before joining — see
        // `lookupProject`), so it must be filtered down to "my projects"
        // here before it's exposed as app state. Otherwise every account
        // would see every other account's projects in their own switcher.
        const mine = list.filter((p) => myProjectIds.includes(p.id));
        setProjects(mine);
        setProjectId(mine[0]?.id ?? null);
        setProjectsLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "프로젝트 목록을 불러오지 못했습니다.");
        setProjectsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Load team/folders/files whenever the selected project changes.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    activityRevision.current++;
    Promise.all([
      dataRepository.getTeam(projectId),
      dataRepository.listFolders(projectId),
      dataRepository.listFiles(projectId),
      dataRepository.listTasks(projectId),
      dataRepository.listScheduleEvents(projectId),
    ])
      .then(([teamData, folderList, fileList, taskList, scheduleList]) => {
        if (cancelled) return;
        setTeam(teamData);
        setFolders(folderList);
        setFiles(fileList);
        setTasks(taskList);
        setScheduleEvents(scheduleList);
        setError(null);
        setInitialized(true);
        setLoadedProjectId(projectId);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "프로젝트 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Refresh activity after returning to the app and while it remains open.
  // Project existence is checked before exposing files from that project.
  useEffect(() => {
    if (!session || !projectsLoaded) return;
    let cancelled = false;
    let pending = false;
    async function syncActivity() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      const revision = activityRevision.current;
      try {
        const [list, myIds] = await Promise.all([dataRepository.listProjects(), dataRepository.listMyProjectIds()]);
        if (cancelled || revision !== activityRevision.current) return;
        const mine = list.filter(p => myIds.includes(p.id));
        setProjects(mine);
        if (!projectId || !mine.some(p => p.id === projectId)) {
          setFiles([]); setFolders([]); setScheduleEvents([]); setTasks([]); setChatMessages({});
          setLoadedProjectId(null); setError(null);
          setProjectId(mine[0]?.id ?? null);
          return;
        }
        if (loadedProjectId !== projectId) return;
        const [nextFiles, nextEvents] = await Promise.all([dataRepository.listFiles(projectId), dataRepository.listScheduleEvents(projectId)]);
        if (cancelled || revision !== activityRevision.current) return;
        setFiles(nextFiles); setScheduleEvents(nextEvents);
      } catch {
        // A transient network failure is not evidence that a project was deleted.
      } finally { pending = false; }
    }
    const refresh = () => { void syncActivity(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [session?.user.id, projectId, projectsLoaded, loadedProjectId]);

  // Private Realtime channels authorize their join with the Realtime
  // socket's JWT, which is separate from the REST client's request header.
  // Set it before creating any project subscriptions so a restored browser
  // session cannot attempt a Presence/chat join as the anonymous role.
  useEffect(() => {
    if (!session?.access_token) return;
    supabase.realtime.setAuth(session.access_token);
  }, [session?.access_token]);

  // Live chat: subscribe to new messages/reads for the current project so
  // the sidebar badge and any open chat view update without polling.
  useEffect(() => {
    setChatMessages({});
    if (!projectId) return;

    const unsubMessages = dataRepository.subscribeToMessages(
      projectId,
      (msg) => {
        setChatMessages((prev) => {
          const list = prev[msg.channelId] ?? [];
          if (list.some((m) => m.id === msg.id)) return prev;
          return { ...prev, [msg.channelId]: [...list, msg] };
        });
      },
      ({ active, reaction }) => {
        setChatMessages((prev) => {
          const next: Record<string, ChatMessage[]> = {};
          for (const [channelId, list] of Object.entries(prev)) {
            next[channelId] = list.map((message) => {
              if (message.id !== reaction.messageId) return message;
              const exists = message.reactions.some((item) => item.memberId === reaction.memberId && item.emoji === reaction.emoji);
              if (active && !exists) return { ...message, reactions: [...message.reactions, reaction] };
              if (!active && exists) return { ...message, reactions: message.reactions.filter((item) => item.memberId !== reaction.memberId || item.emoji !== reaction.emoji) };
              return message;
            });
          }
          return next;
        });
      }
    );
    const unsubReads = dataRepository.subscribeToReads(projectId, ({ messageId, memberId }) => {
      setChatMessages((prev) => {
        const next: Record<string, ChatMessage[]> = {};
        for (const [cid, list] of Object.entries(prev)) {
          next[cid] = list.map((m) => (m.id === messageId && !m.readBy.includes(memberId) ? { ...m, readBy: [...m.readBy, memberId] } : m));
        }
        return next;
      });
    });
    return () => {
      unsubMessages();
      unsubReads();
    };
  }, [projectId]);

  // Unlike chat messages, task comments are loaded with their task detail.
  // Refresh the project task list when any team member adds or removes a
  // comment reaction so already-open task panels stay in sync.
  useEffect(() => {
    if (!projectId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = dataRepository.subscribeToTaskCommentReactions(projectId, () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refreshTasks();
      }, 75);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
    // refreshTasks is recreated as context state changes; resubscribing on
    // every render would drop short-lived Realtime events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keep the current user's Presence entry while a project is open. Supabase
  // broadcasts a sync event whenever a teammate joins, leaves, reconnects,
  // or opens an additional tab.
  useEffect(() => {
    setOnlineMemberIds(new Set());
    if (!projectId || !myMemberId) return;
    return dataRepository.subscribeToPresence(projectId, myMemberId, setOnlineMemberIds);
  }, [projectId, myMemberId]);

  // Eagerly load every channel's message history (the group channel + one
  // DM per other member) once the team roster is known, so the sidebar
  // unread badge is accurate without first opening /chat.
  useEffect(() => {
    if (!projectId || !myMemberId) return;
    let cancelled = false;
    const channelIds = ["all", ...team.members.filter((m) => m.id !== myMemberId).map((m) => dmChannelId(myMemberId, m.id))];
    Promise.all(channelIds.map((cid) => dataRepository.listMessages(projectId, cid)))
      .then((results) => {
        if (cancelled) return;
        setChatMessages((prev) => {
          const next = { ...prev };
          channelIds.forEach((cid, i) => {
            next[cid] = results[i];
          });
          return next;
        });
      })
      .catch(() => {
        // Best-effort — the realtime subscription still keeps things live
        // going forward even if this initial bulk load fails.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, myMemberId, team.members.length]);

  async function refreshFolders() {
    if (!projectId) return;
    const refreshedFolders = await dataRepository.listFolders(projectId);
    if (evaluationProjectRef.current === projectId) setFolders(refreshedFolders);
  }

  async function refreshFiles() {
    activityRevision.current++;
    if (!projectId) return;
    const refreshedFiles = await dataRepository.listFiles(projectId);
    if (evaluationProjectRef.current === projectId) setFiles(refreshedFiles);
  }

  // Used when there's no existing project membership to derive a name from
  // (creating or joining a project) — falls back to the account's own
  // display name instead of `currentMember`. Reads a fresh `getUser()`
  // rather than trusting the `session` from React state, so a display name
  // set at signup is never missed due to any staleness in when that state
  // last updated.
  async function accountIdentity(): Promise<{ name: string; avatar: string }> {
    const { data } = await supabase.auth.getUser();
    const name = data.user?.user_metadata?.display_name?.trim() || data.user?.email?.split("@")[0] || "사용자";
    return { name, avatar: name.slice(0, 1) || "U" };
  }

  async function addProject(input: NewProjectInput): Promise<string> {
    const { name, avatar } = await accountIdentity();
    const created = await dataRepository.createProject(input, name, avatar);
    setProjects((prev) => [...prev, created]);
    setProjectId(created.id);
    return created.id;
  }

  async function deleteProject(targetId: string) {
    activityRevision.current++;
    await dataRepository.deleteProject(targetId);
    const remaining = projects.filter((p) => p.id !== targetId);
    setProjects(remaining);
    if (targetId === projectId) {
      activityRevision.current++;
      setFiles([]); setFolders([]); setScheduleEvents([]); setTasks([]); setChatMessages({});
      setLoadedProjectId(null);
      setProjectId(remaining[0]?.id ?? null);
    }
  }

  async function lookupProject(targetId: string) {
    return dataRepository.getProjectById(targetId);
  }

  async function joinProject(targetId: string, input: { school: string; major: string; student: string }) {
    const { name, avatar } = await accountIdentity();
    await dataRepository.joinProject(targetId, name, avatar, input);
    // `projects` is filtered to "my projects" (see the load effect above),
    // so the newly-joined project has to be added here explicitly.
    const joined = await dataRepository.getProjectById(targetId);
    if (joined) setProjects((prev) => (prev.some((p) => p.id === targetId) ? prev : [...prev, joined]));
    setProjectId(targetId);
  }

  async function transferLeadership(targetName: string) {
    if (!projectId) return;
    await dataRepository.transferLeadership(projectId, targetName);
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function markProjectDone() {
    if (!projectId || !(isLeader || isAdmin)) return;
    await dataRepository.completeProject(projectId);
    const updated = await dataRepository.getProjectById(projectId);
    if (updated) setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
  }

  async function kickMember(memberId: string) {
    if (!projectId || !(isLeader || isAdmin)) return;
    await dataRepository.kickMember(memberId);
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function updateMyProfile(patch: {
    name?: string; major?: string; student?: string; school?: string; avatarFile?: File;
    contact?: string | null; org?: string | null; bannerColor?: string | null; bannerImageUrl?: string | null; bannerImageFile?: File; links?: ProfileLink[];
  }) {
    if (!projectId || !currentMember) return;
    const avatarUrl = patch.avatarFile ? await dataRepository.uploadAvatar(patch.avatarFile) : undefined;
    const bannerImageUrl = patch.bannerImageFile ? await dataRepository.uploadBannerImage(patch.bannerImageFile) : patch.bannerImageUrl;
    await dataRepository.updateMyProfile({
      name: patch.name, major: patch.major, student: patch.student, school: patch.school, avatarUrl,
      contact: patch.contact, org: patch.org, bannerColor: patch.bannerColor, bannerImageUrl, links: patch.links,
    });
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function addFolder(name: string) {
    if (!projectId || !currentMember) throw new Error("프로젝트 참여자만 폴더를 만들 수 있습니다.");
    if (!name.trim()) throw new Error("폴더 이름을 입력해 주세요.");
    if (project.status === "done") throw new Error("종료된 프로젝트에는 폴더를 만들 수 없습니다.");
    const created = await dataRepository.createFolder(projectId, name, currentMember.name);
    if (evaluationProjectRef.current === projectId) setFolders((prev) => prev.some((folder) => folder.id === created.id) ? prev : [...prev, created]);
  }

  async function uploadWorkspaceFile(input: import("../api/types").FileUploadInput) {
    if (!projectId || !currentMember) throw new Error("프로젝트 참여자만 업로드할 수 있습니다.");
    if (input.file.size > 50 * 1024 * 1024) throw new Error("파일은 50MB까지 업로드할 수 있습니다.");
    const { extractWorkspaceText } = await import("../lib/extractWorkspaceText");
    const extractedText = await extractWorkspaceText(input.file).catch(() => ({ text: "", status: "failed" as const }));
    const result = await dataRepository.uploadFile(projectId, { ...input, extractedText });
    await refreshFiles();
    return result;
  }

  async function promoteFileVersion(fileId: number, versionId: number) {
    await dataRepository.promoteFileVersion(fileId, versionId);
    await refreshFiles();
  }

  async function pinFileVersion(fileId: number, versionId: number, pinned: boolean) {
    await dataRepository.pinFileVersion(fileId, versionId, pinned);
    await refreshFiles();
  }

  async function addFileComment(fileId: number, text: string) {
    if (!text.trim() || !currentMember) return;
    await dataRepository.addFileComment(fileId, currentMember.name, currentMember.avatar, text);
    await refreshFiles();
  }

  async function refreshTasks() {
    if (!projectId) return;
    setTasks(await dataRepository.listTasks(projectId));
  }

  async function refreshScheduleEvents() {
    activityRevision.current++;
    if (!projectId) return;
    setScheduleEvents(await dataRepository.listScheduleEvents(projectId));
  }

  async function addTask(input: NewTaskInput) {
    if (!projectId || !isLeader) return;
    await dataRepository.createTask(projectId, input);
    await refreshTasks();
  }

  async function moveTask(taskId: number, status: TaskStatus) {
    if (!projectId) return;
    await dataRepository.updateTaskStatus(taskId, status);
    setTasks(await dataRepository.listTasks(projectId));
  }

  async function updateTaskDetails(
    taskId: number,
    patch: Partial<{ title: string; assigneeIds: string[]; priority: TaskPriority; due: string; tags: string[] }>
  ) {
    if (!isLeader) return;
    await dataRepository.updateTaskDetails(taskId, patch);
    await refreshTasks();
  }

  async function deleteTask(taskId: number) {
    if (!isLeader) return;
    await dataRepository.deleteTask(taskId);
    await Promise.all([refreshTasks(), refreshScheduleEvents()]);
  }

  function isTaskAssignee(taskId: number): boolean {
    if (!currentMember) return false;
    return !!tasks.find((t) => t.id === taskId)?.assigneeIds.includes(currentMember.id);
  }

  async function addTaskChecklistItem(taskId: number, text: string) {
    if (!isTaskAssignee(taskId)) return;
    await dataRepository.addTaskChecklistItem(taskId, text);
    await refreshTasks();
  }

  async function toggleTaskChecklistItem(taskId: number, itemId: number, done: boolean) {
    if (!isTaskAssignee(taskId)) return;
    await dataRepository.toggleTaskChecklistItem(itemId, done);
    await refreshTasks();
  }

  async function addTaskComment(taskId: number, text: string) {
    if (!text.trim() || !currentMember) return;
    await dataRepository.addTaskComment(taskId, currentMember.id, currentMember.name, currentMember.avatar, text);
    await refreshTasks();
  }

  async function toggleTaskCommentReaction(commentId: number, emoji: string) {
    if (!currentMember) return;
    const comment = tasks.flatMap((task) => task.comments).find((item) => item.id === commentId);
    if (!comment) return;
    const active = !comment.reactions.some((reaction) => reaction.memberId === currentMember.id && reaction.emoji === emoji);
    await dataRepository.setTaskCommentReaction(commentId, currentMember.id, emoji, active);
    await refreshTasks();
  }

  async function addScheduleEvent(input: NewScheduleEventInput) {
    if (!projectId || !currentMember) return;
    if (input.scope === "team" && !isLeader) return;
    await dataRepository.addScheduleEvent(projectId, currentMember.id, input);
    await refreshScheduleEvents();
  }

  async function updateScheduleEvent(
    id: number,
    patch: Partial<{ title: string; date: string; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>
  ) {
    await dataRepository.updateScheduleEvent(id, patch);
    await refreshScheduleEvents();
  }

  async function removeScheduleEvent(id: number) {
    await dataRepository.removeScheduleEvent(id);
    await refreshScheduleEvents();
  }

  async function toggleTaskTeamSchedule(taskId: number, checked: boolean) {
    if (!isLeader) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (checked) {
      if (!task.due) return;
      const created = await dataRepository.addScheduleEvent(projectId!, currentMember!.id, {
        title: task.title,
        date: task.due,
        type: "deadline",
        scope: "team",
      });
      await dataRepository.setTaskScheduleLink(taskId, "team", created.id);
    } else if (task.teamScheduleEventId) {
      await dataRepository.removeScheduleEvent(task.teamScheduleEventId);
    }
    await Promise.all([refreshTasks(), refreshScheduleEvents()]);
  }

  async function toggleTaskPersonalSchedule(taskId: number, checked: boolean) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !currentMember || !isTaskAssignee(taskId)) return;
    if (checked) {
      if (!task.due) return;
      const created = await dataRepository.addScheduleEvent(projectId!, currentMember.id, {
        title: task.title,
        date: task.due,
        type: "deadline",
        scope: "personal",
        visibility: "private",
      });
      await dataRepository.setTaskScheduleLink(taskId, "personal", created.id);
    } else if (task.personalScheduleEventId) {
      await dataRepository.removeScheduleEvent(task.personalScheduleEventId);
    }
    await Promise.all([refreshTasks(), refreshScheduleEvents()]);
  }

  async function sendChatMessage(channelId: string, text: string, fileId?: number) {
    if (!projectId || !currentMember) return;
    if (!text.trim() && !fileId) return;
    const msg = await dataRepository.sendMessage(projectId, channelId, currentMember.id, { text: text.trim(), fileId });
    setChatMessages((prev) => {
      const list = prev[channelId] ?? [];
      if (list.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [channelId]: [...list, msg] };
    });
  }

  async function toggleChatReaction(messageId: number, emoji: string) {
    if (!projectId || !currentMember) return;
    const message = Object.values(chatMessages).flat().find((item) => item.id === messageId);
    if (!message) return;
    const active = !message.reactions.some((reaction) => reaction.memberId === currentMember.id && reaction.emoji === emoji);
    await dataRepository.setMessageReaction(projectId, messageId, currentMember.id, emoji, active);
    setChatMessages((prev) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [channelId, list] of Object.entries(prev)) {
        next[channelId] = list.map((item) => {
          if (item.id !== messageId) return item;
          const exists = item.reactions.some((reaction) => reaction.memberId === currentMember.id && reaction.emoji === emoji);
          if (active && !exists) return { ...item, reactions: [...item.reactions, { messageId, memberId: currentMember.id, emoji }] };
          if (!active && exists) return { ...item, reactions: item.reactions.filter((reaction) => reaction.memberId !== currentMember.id || reaction.emoji !== emoji) };
          return item;
        });
      }
      return next;
    });
  }

  async function markChannelMessagesRead(channelId: string) {
    if (!projectId || !currentMember) return;
    const list = chatMessages[channelId] ?? [];
    const unreadIds = list.filter((m) => m.senderId !== currentMember.id && !m.readBy.includes(currentMember.id)).map((m) => m.id);
    if (unreadIds.length === 0) return;
    await dataRepository.markChannelRead(projectId, channelId, currentMember.id, unreadIds);
    setChatMessages((prev) => ({
      ...prev,
      [channelId]: (prev[channelId] ?? []).map((m) => (unreadIds.includes(m.id) ? { ...m, readBy: [...m.readBy, currentMember.id] } : m)),
    }));
  }

  if (error) return <StatusScreen kind="error" message={error} />;
  // Not logged in — let the router render /login instead of a loading/empty
  // screen (RequireAuth handles the redirect; there's nothing to load here).
  if (!session) return <>{children}</>;
  if (!projectsLoaded) return <StatusScreen kind="loading" />;
  if (projects.length === 0)
    return <EmptyProjectsScreen isAdmin={isAdmin} signOut={signOut} addProject={addProject} lookupProject={lookupProject} joinProject={joinProject} />;
  if (!initialized || loadedProjectId !== projectId) return <StatusScreen kind="loading" />;

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const liveTeam: TeamData = { ...team, members: team.members.map((m) => ({ ...m, online: onlineMemberIds.has(m.id) })) };
  const currentMember = liveTeam.members.find((m) => m.userId === session.user.id) ?? null;
  const isLeader = currentMember?.isLeader === true;
  const chatUnread: Record<string, number> = {};
  for (const [cid, list] of Object.entries(chatMessages)) {
    chatUnread[cid] = currentMember
      ? list.filter((m) => m.senderId !== currentMember.id && !m.readBy.includes(currentMember.id)).length
      : 0;
  }
  const chatUnreadTotal = Object.values(chatUnread).reduce((sum, n) => sum + n, 0);

  return (
    <ProjectContext.Provider
      value={{
        getMyEvaluationSummary: () => dataRepository.getMyEvaluationSummary(),
        getEvaluationMode: () => dataRepository.getEvaluationMode(),
        getEvaluations: async (phase) => {
          const [result, refreshedTeam] = await Promise.all([
            dataRepository.getEvaluations(project.id, phase),
            dataRepository.getTeam(project.id),
          ]);
          if (evaluationProjectRef.current === project.id) setTeam(refreshedTeam);
          return result;
        },
        submitEvaluations: async (phase, entries) => {
          await dataRepository.submitEvaluations(project.id, phase, entries);
        },
        completeProject: async () => {
          const completed = await dataRepository.completeProject(project.id);
          setProjects((prev) => prev.map((p) => p.id === completed.id ? completed : p));
        },
        projects,
        project,
        setProjectId,
        addProject,
        deleteProject,
        lookupProject,
        joinProject,
        markProjectDone,
        kickMember,
        team: liveTeam,
        transferLeadership,
        updateMyProfile,
        isShortTerm: isShortTermProject(project),
        folders,
        files,
        deleteWorkspaceFile: async (id) => { await dataRepository.deleteWorkspaceFile(id); await refreshFiles(); },
        deleteWorkspaceFolder: async (id) => { await dataRepository.deleteWorkspaceFolder(id); await refreshFolders(); },
        pendingWorkspaceCleanup: () => dataRepository.pendingWorkspaceCleanup(project.id),
        cleanupWorkspaceFiles: () => dataRepository.cleanupWorkspaceFiles(project.id),
        addFolder,
        uploadWorkspaceFile,
        promoteFileVersion,
        // Unused since the pdf-workspace-search merge — see the type declaration above.
        indexFileVersion: async (version) => {
          const blob = await dataRepository.downloadFileVersion(version.id);
          const { extractWorkspaceText } = await import("../lib/extractWorkspaceText");
          const result = await extractWorkspaceText(new File([blob], version.originalName ?? "file", { type: version.mimeType }));
          await dataRepository.setFileVersionText(version.id, result);
          await refreshFiles();
        },
        setFileTags: async (fileId, tags) => { await dataRepository.setFileTags(fileId, tags); await refreshFiles(); },
        pinFileVersion,
        downloadFileVersion: (versionId) => dataRepository.downloadFileVersion(versionId),
        setFileCommentReaction: async (commentId, emoji, active) => {
          if (!currentMember) throw new Error("프로젝트 참여자만 반응할 수 있습니다.");
          await dataRepository.setFileCommentReaction(commentId, currentMember.id, emoji, active);
          await refreshFiles();
        },
        addFileComment,
        tasks,
        addTask,
        moveTask,
        updateTaskDetails,
        deleteTask,
        addTaskChecklistItem,
        toggleTaskChecklistItem,
        addTaskComment,
        toggleTaskCommentReaction,
        toggleTaskTeamSchedule,
        toggleTaskPersonalSchedule,
        scheduleEvents,
        addScheduleEvent,
        updateScheduleEvent,
        removeScheduleEvent,
        chatUnread,
        chatUnreadTotal,
        chatMessages,
        sendChatMessage,
        toggleChatReaction,
        markChannelMessagesRead,
        currentMember,
        isLeader,
        loading,
        viewedMemberId,
        openMemberProfile: setViewedMemberId,
        closeMemberProfile: () => setViewedMemberId(null),
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
