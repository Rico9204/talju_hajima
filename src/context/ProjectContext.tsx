import type { EvaluationPhase, EvaluationEntry, EvaluationData, AdminApplicationInput } from "../api/types";
import { createContext, useContext, useEffect, useState, useRef, useMemo, type ReactNode } from "react";
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
  ChatToolEvent,
} from "../api/types";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE, supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useLocation } from "react-router-dom";
import CreateProjectModal from "../components/CreateProjectModal";
import JoinProjectModal from "../components/JoinProjectModal";
import AdminPanel from "../components/AdminPanel";
import AdminApplicationNotice from "../components/AdminApplicationNotice";
import AdminOperatorPanel from "../components/AdminOperatorPanel";
import UnreadNotifier from "../components/UnreadNotifier";
import { retainSnapshot, shareInFlight } from "../lib/refreshOptimization";
import { TOOL_ACTION_PREFIX } from "../lib/chatTools";

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
  setViceLeader: (memberId: string, enabled: boolean) => Promise<void>;
  team: TeamData;
  transferLeadership: (targetName: string) => Promise<void>;
  updateMyProfile: (patch: {
    name?: string; major?: string; student?: string; school?: string; avatarFile?: File;
    contact?: string | null; org?: string | null; bannerColor?: string | null; bannerImageUrl?: string | null; bannerImageFile?: File;
    backgroundColor?: string | null; backgroundGradient?: string | null; backgroundImageUrl?: string | null; backgroundImageFile?: File;
    glassOpacity?: number | null; glassBlur?: number | null;
    links?: ProfileLink[];
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
  addFileComment: (fileId: number, text: string, versionId?: number | null) => Promise<void>;
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
    patch: Partial<{ title: string; date: string; endDate: string | null; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>
  ) => Promise<void>;
  removeScheduleEvent: (id: number) => Promise<void>;
  chatUnread: Record<string, number>;
  chatUnreadTotal: number;
  chatHistoryLoaded: boolean; // 채널 기록을 처음 다 불러왔는지(그 전의 안 읽음 수 변화는 새 메시지가 아님)
  chatMessages: Record<string, ChatMessage[]>;
  sendChatMessage: (channelId: string, text: string, fileId?: number) => Promise<number | null>;
  chatToolEvents: Record<number, ChatToolEvent[]>;
  createChatTool: (channelId: string, text: string, config: Record<string, unknown>) => Promise<void>;
  actChatTool: (messageId: number, action: string, args?: Record<string, unknown>) => Promise<ChatToolEvent>;
  toggleChatReaction: (messageId: number, emoji: string) => Promise<void>;
  markChannelMessagesRead: (channelId: string) => Promise<void>;
  tasksUnread: number;
  scheduleUnread: number;
  workspaceUnread: number;
  newTasks: Task[];
  newScheduleEvents: ScheduleEvent[];
  newFiles: WorkspaceFile[];
  markSectionViewed: (section: "tasks" | "schedule" | "workspace") => Promise<void>;
  currentMember: Member | null;
  isLeader: boolean;
  isViceLeader: boolean;
  isManager: boolean;
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
        style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
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
  const { isOperator } = useProjectManagement();

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
        {/* 프로젝트가 없는 운영자도 운영자 기능을 쓸 수 있도록 여기에서도 보여준다. */}
        {isOperator && (
          <div className="p-6 pb-0 max-w-5xl mx-auto">
            <AdminOperatorPanel />
          </div>
        )}
        <AdminPanel />
        {createOpen && <CreateProjectModal onCancel={() => setCreateOpen(false)} onCreate={(input) => addProject(input)} />}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
      <div
        className="max-w-sm px-6 py-6 text-center"
        style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
      >
        <div className="text-left"><AdminApplicationNotice /></div>
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
  setViceLeader: typeof dataRepository.setViceLeader;
  isOperator: boolean;
  getMyAdminApplication: typeof dataRepository.getMyAdminApplication;
  submitAdminApplication: typeof dataRepository.submitAdminApplication;
  listAdminApplications: typeof dataRepository.listAdminApplications;
  getAdminApplicationDocumentUrl: typeof dataRepository.getAdminApplicationDocumentUrl;
  reviewAdminApplication: typeof dataRepository.reviewAdminApplication;
  cleanupAdminDocument: typeof dataRepository.cleanupAdminDocument;
  listAdminAccounts: typeof dataRepository.listAdminAccounts;
  revokeAdmin: typeof dataRepository.revokeAdmin;
  searchAdmins: typeof dataRepository.searchAdmins;
  getEvaluationMode: typeof dataRepository.getEvaluationMode;
  setEvaluationMode: typeof dataRepository.setEvaluationMode;
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
  setViceLeader: (id: string, enabled: boolean) => dataRepository.setViceLeader(id, enabled),
  getMyAdminApplication: () => dataRepository.getMyAdminApplication(),
  submitAdminApplication: (input: AdminApplicationInput) => dataRepository.submitAdminApplication(input),
  listAdminApplications: () => dataRepository.listAdminApplications(),
  getAdminApplicationDocumentUrl: (path: string) => dataRepository.getAdminApplicationDocumentUrl(path),
  reviewAdminApplication: (id: string, approve: boolean, note: string) => dataRepository.reviewAdminApplication(id, approve, note),
  cleanupAdminDocument: (id: string, path: string) => dataRepository.cleanupAdminDocument(id, path),
  listAdminAccounts: () => dataRepository.listAdminAccounts(),
  revokeAdmin: (userId: string) => dataRepository.revokeAdmin(userId),
  searchAdmins: (query: string) => dataRepository.searchAdmins(query),
  getEvaluationMode: () => dataRepository.getEvaluationMode(),
  setEvaluationMode: (enabled: boolean) => dataRepository.setEvaluationMode(enabled),
};
export function useProjectManagement() {
  const context = useContext(ProjectManagementContext);
  if (!context) throw new Error("ProjectProvider is required");
  return context;
}
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [identity, setIdentity] = useState<{ id: string; admin: boolean; operator: boolean } | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setRoleError(null);
    if (!session) { setIdentity(null); return; }
    const id = session.user.id;
    Promise.all([dataRepository.isCurrentUserAdmin(), dataRepository.isCurrentUserOperator()]).then(([admin, operator]) => { if (active) setIdentity({ id, admin, operator }); })
      .catch(() => { if (active) setRoleError("관리자 권한을 확인하지 못했습니다. DB 마이그레이션 적용 여부와 연결을 확인한 뒤 새로고침해 주세요."); });
    return () => { active = false; };
  }, [session?.user.id]);
  if (session && roleError) return <StatusScreen kind="error" message={roleError} />;
  if (session && identity?.id !== session.user.id) return <StatusScreen kind="loading" />;
  const isAdmin = !!session && identity?.id === session.user.id && identity.admin;
  const isOperator = !!session && identity?.id === session.user.id && identity.operator;
  return <ProjectManagementContext.Provider value={{ ...managementActions, isAdmin, isOperator }}><ProjectDataProvider>{children}</ProjectDataProvider></ProjectManagementContext.Provider>;
}
function ProjectDataProvider({ children }: { children: ReactNode }) {
  // 관리자 신청서 화면은 프로젝트가 없어도 열려야 하므로 프로젝트 게이트를 거치지 않는다.
  const { pathname } = useLocation();
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
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [chatToolEvents, setChatToolEvents] = useState<Record<number, ChatToolEvent[]>>({});
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

  // Sidebar, profile and achievements can mount together. Share their active
  // request, scoped to this account and data revision, without a stale TTL cache.
  const getMyEvaluationSummary = useMemo(
    () => shareInFlight(() => dataRepository.getMyEvaluationSummary()),
    [session?.user.id, projectId, team, projects],
  );

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
        setProjects((previous) => retainSnapshot(previous, mine));
        if (!projectId || !mine.some(p => p.id === projectId)) {
          setFiles([]); setFolders([]); setScheduleEvents([]); setTasks([]); setChatMessages({});
          setLoadedProjectId(null); setError(null);
          setProjectId(mine[0]?.id ?? null);
          return;
        }
        if (loadedProjectId !== projectId) return;
        const [nextFiles, nextEvents] = await Promise.all([dataRepository.listFiles(projectId), dataRepository.listScheduleEvents(projectId)]);
        if (cancelled || revision !== activityRevision.current) return;
        setFiles((previous) => retainSnapshot(previous, nextFiles));
        setScheduleEvents((previous) => retainSnapshot(previous, nextEvents));
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
    setChatToolEvents({});
    if (!projectId) return;
    let cancelled = false;
    const putToolEvents = (events: ChatToolEvent[]) => {
      if (cancelled || events.length === 0) return;
      setChatToolEvents((prev) => {
        const next = { ...prev };
        for (const e of events) {
          const list = next[e.messageId] ?? [];
          if (list.some((x) => x.id === e.id)) continue;
          next[e.messageId] = [...list, e].sort((a, b) => a.id - b.id);
        }
        return next;
      });
    };
    void dataRepository.listChatToolEvents(projectId).then(putToolEvents).catch(() => {});
    const unsubToolEvents = dataRepository.subscribeToChatToolEvents(projectId, (e) => putToolEvents([e]));

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
      cancelled = true;
      unsubMessages();
      unsubReads();
      unsubToolEvents();
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

  // Live task board / schedule / workspace updates — a teammate's change
  // (new task, moved deadline, uploaded file…) shows up immediately instead
  // of waiting for the next visit or the 30s activity poll below.
  useEffect(() => {
    if (!projectId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = dataRepository.subscribeToTasks(projectId, () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = dataRepository.subscribeToScheduleEvents(projectId, () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refreshScheduleEvents();
      }, 75);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = dataRepository.subscribeToFiles(projectId, () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refreshFiles();
      }, 75);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
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
    setChatHistoryLoaded(false);
    if (!projectId || !myMemberId) return;
    let cancelled = false;
    const channelIds = ["all", ...team.members.filter((m) => m.id !== myMemberId).map((m) => dmChannelId(myMemberId, m.id))];
    Promise.all(channelIds.map((cid) => dataRepository.listMessages(projectId, cid)))
      .then((results) => {
        if (cancelled) return;
        setChatHistoryLoaded(true);
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
        if (!cancelled) setChatHistoryLoaded(true);
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

  async function setViceLeader(memberId: string, enabled: boolean) {
    if (!projectId || !(isLeader || isAdmin)) return;
    await dataRepository.setViceLeader(memberId, enabled);
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function kickMember(memberId: string) {
    if (!projectId || !(isLeader || isAdmin)) return;
    await dataRepository.kickMember(memberId);
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function updateMyProfile(patch: {
    name?: string; major?: string; student?: string; school?: string; avatarFile?: File;
    contact?: string | null; org?: string | null; bannerColor?: string | null; bannerImageUrl?: string | null; bannerImageFile?: File;
    backgroundColor?: string | null; backgroundGradient?: string | null; backgroundImageUrl?: string | null; backgroundImageFile?: File;
    glassOpacity?: number | null; glassBlur?: number | null;
    links?: ProfileLink[];
  }) {
    if (!projectId || !currentMember) return;
    const avatarUrl = patch.avatarFile ? await dataRepository.uploadAvatar(patch.avatarFile) : undefined;
    const bannerImageUrl = patch.bannerImageFile ? await dataRepository.uploadBannerImage(patch.bannerImageFile) : patch.bannerImageUrl;
    const backgroundImageUrl = patch.backgroundImageFile ? await dataRepository.uploadBackgroundImage(patch.backgroundImageFile) : patch.backgroundImageUrl;
    await dataRepository.updateMyProfile({
      name: patch.name, major: patch.major, student: patch.student, school: patch.school, avatarUrl,
      contact: patch.contact, org: patch.org, bannerColor: patch.bannerColor, bannerImageUrl,
      backgroundColor: patch.backgroundColor, backgroundGradient: patch.backgroundGradient, backgroundImageUrl,
      glassOpacity: patch.glassOpacity, glassBlur: patch.glassBlur, links: patch.links,
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
    // Uploading your own file shouldn't leave a "new content" badge for yourself.
    void markSectionViewed("workspace");
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

  async function addFileComment(fileId: number, text: string, versionId?: number | null) {
    if (!text.trim() || !currentMember) return;
    await dataRepository.addFileComment(fileId, currentMember.name, currentMember.avatar, text, versionId);
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
    if (!projectId || !isManager) return;
    await dataRepository.createTask(projectId, input);
    await refreshTasks();
    // Creating your own task shouldn't leave a "new content" badge for yourself.
    void markSectionViewed("tasks");
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
    if (!isManager) return;
    await dataRepository.updateTaskDetails(taskId, patch);
    await refreshTasks();
  }

  async function deleteTask(taskId: number) {
    if (!isManager) return;
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
    if (input.scope === "team" && !isManager) return;
    await dataRepository.addScheduleEvent(projectId, currentMember.id, input);
    await refreshScheduleEvents();
    // Creating your own event shouldn't leave a "new content" badge for yourself.
    void markSectionViewed("schedule");
  }

  async function updateScheduleEvent(
    id: number,
    patch: Partial<{ title: string; date: string; endDate: string | null; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>
  ) {
    await dataRepository.updateScheduleEvent(id, patch);
    await refreshScheduleEvents();
  }

  async function removeScheduleEvent(id: number) {
    await dataRepository.removeScheduleEvent(id);
    await refreshScheduleEvents();
  }

  async function toggleTaskTeamSchedule(taskId: number, checked: boolean) {
    if (!isManager) return;
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
      void markSectionViewed("schedule");
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
      void markSectionViewed("schedule");
    } else if (task.personalScheduleEventId) {
      await dataRepository.removeScheduleEvent(task.personalScheduleEventId);
    }
    await Promise.all([refreshTasks(), refreshScheduleEvents()]);
  }

  async function sendChatMessage(channelId: string, text: string, fileId?: number): Promise<number | null> {
    if (!projectId || !currentMember) return null;
    if (!text.trim() && !fileId) return null;
    const msg = await dataRepository.sendMessage(projectId, channelId, currentMember.id, { text: text.trim(), fileId });
    setChatMessages((prev) => {
      const list = prev[channelId] ?? [];
      if (list.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [channelId]: [...list, msg] };
    });
    return msg.id;
  }

  // 서버가 결과를 정한 도구 이벤트. 실시간 구독보다 응답이 먼저 오는 경우를 위해 바로 반영한다.
  function recordToolEvent(e: ChatToolEvent) {
    setChatToolEvents((prev) => {
      const list = prev[e.messageId] ?? [];
      if (list.some((x) => x.id === e.id)) return prev;
      return { ...prev, [e.messageId]: [...list, e].sort((a, b) => a.id - b.id) };
    });
    return e;
  }
  async function createChatTool(channelId: string, text: string, config: Record<string, unknown>) {
    if (!projectId) return;
    const { message, event } = await dataRepository.chatToolCreate(projectId, channelId, text, config);
    setChatMessages((prev) => {
      const list = prev[channelId] ?? [];
      if (list.some((m) => m.id === message.id)) return prev;
      return { ...prev, [channelId]: [...list, message] };
    });
    recordToolEvent(event);
  }
  async function actChatTool(messageId: number, action: string, args: Record<string, unknown> = {}) {
    return recordToolEvent(await dataRepository.chatToolAct(messageId, action, args));
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
  if (pathname === "/admin-application") return <>{children}</>;
  if (!projectsLoaded) return <StatusScreen kind="loading" />;
  if (projects.length === 0)
    return <EmptyProjectsScreen isAdmin={isAdmin} signOut={signOut} addProject={addProject} lookupProject={lookupProject} joinProject={joinProject} />;
  if (!initialized || loadedProjectId !== projectId) return <StatusScreen kind="loading" />;

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const liveTeam: TeamData = { ...team, members: team.members.map((m) => ({ ...m, online: onlineMemberIds.has(m.id) })) };
  const currentMember = liveTeam.members.find((m) => m.userId === session.user.id) ?? null;
  const isLeader = currentMember?.isLeader === true;
  const isViceLeader = currentMember?.isViceLeader === true;
  // 팀장 또는 부팀장: 과제·팀 일정·워크스페이스 정리 같은 일상 운영 권한. 팀원 제외·프로젝트 종료·위임은 isLeader만.
  const isManager = isLeader || isViceLeader;
  const chatUnread: Record<string, number> = {};
  for (const [cid, list] of Object.entries(chatMessages)) {
    chatUnread[cid] = currentMember
      // 채팅 도구(투표·뽑기 등)의 행동 메시지는 화면에 보이지 않으므로 읽지 않음·알림 개수에서 제외한다.
      ? list.filter((m) => m.senderId !== currentMember.id && !m.readBy.includes(currentMember.id) && !m.text?.startsWith(TOOL_ACTION_PREFIX)).length
      : 0;
  }
  const chatUnreadTotal = Object.values(chatUnread).reduce((sum, n) => sum + n, 0);

  function createdAfter<T extends { createdAt?: string | null }>(items: T[], viewedAt: string | null): T[] {
    if (!currentMember) return [];
    const since = viewedAt ? new Date(viewedAt).getTime() : 0;
    return items.filter((item) => item.createdAt && new Date(item.createdAt).getTime() > since);
  }
  const newTasks = createdAfter(tasks, currentMember?.tasksViewedAt ?? null);
  const newScheduleEvents = createdAfter(scheduleEvents, currentMember?.scheduleViewedAt ?? null);
  const newFiles = createdAfter(files, currentMember?.workspaceViewedAt ?? null);
  const tasksUnread = newTasks.length;
  const scheduleUnread = newScheduleEvents.length;
  const workspaceUnread = newFiles.length;
  async function markSectionViewed(section: "tasks" | "schedule" | "workspace") {
    if (!currentMember) return;
    await dataRepository.markSectionViewed(project.id, section);
    if (evaluationProjectRef.current === project.id) setTeam(await dataRepository.getTeam(project.id));
  }

  return (
    <ProjectContext.Provider
      value={{
        getMyEvaluationSummary,
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
        setViceLeader,
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
        chatHistoryLoaded,
        chatMessages,
        sendChatMessage,
        chatToolEvents,
        createChatTool,
        actChatTool,
        toggleChatReaction,
        markChannelMessagesRead,
        tasksUnread,
        scheduleUnread,
        workspaceUnread,
        newTasks,
        newScheduleEvents,
        newFiles,
        markSectionViewed,
        currentMember,
        isLeader,
        isViceLeader,
        isManager,
        loading,
        viewedMemberId,
        openMemberProfile: setViewedMemberId,
        closeMemberProfile: () => setViewedMemberId(null),
      }}
    >
      {children}
      <UnreadNotifier />
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
