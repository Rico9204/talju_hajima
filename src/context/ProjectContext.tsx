import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  Member,
  ChatMessage,
} from "../api/types";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE, supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import CreateProjectModal from "../components/CreateProjectModal";
import JoinProjectModal from "../components/JoinProjectModal";

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
  projects: Project[];
  project: Project;
  setProjectId: (id: string) => void;
  addProject: (input: NewProjectInput) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  lookupProject: (projectId: string) => Promise<Project | null>;
  joinProject: (projectId: string, input: { school: string; major: string; student: string }) => Promise<void>;
  team: TeamData;
  transferLeadership: (targetName: string) => Promise<void>;
  updateMyProfile: (patch: { name?: string; major?: string; student?: string; school?: string; avatarFile?: File }) => Promise<void>;
  isShortTerm: boolean;
  folders: Folder[];
  files: WorkspaceFile[];
  addFolder: (name: string) => Promise<void>;
  addFile: (name: string, size: number, folderId: number | null, note?: string) => Promise<void>;
  addFileVersion: (fileId: number, note?: string) => Promise<void>;
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
  toggleTaskTeamSchedule: (taskId: number, checked: boolean) => Promise<void>;
  toggleTaskPersonalSchedule: (taskId: number, checked: boolean) => Promise<void>;
  scheduleEvents: ScheduleEvent[];
  addScheduleEvent: (input: NewScheduleEventInput) => Promise<void>;
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
// including Sidebar) before any project exists to select.
function EmptyProjectsScreen({
  addProject, lookupProject, joinProject,
}: {
  addProject: (input: NewProjectInput) => Promise<string>;
  lookupProject: (projectId: string) => Promise<Project | null>;
  joinProject: (projectId: string, input: { school: string; major: string; student: string }) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

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

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamData>({ teamLabel: "", teamSub: "", members: [] });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  // Real chat messages, keyed by channel id, for the currently selected
  // project only. Eagerly loaded for every channel once the team is known
  // (see the effect below) and kept live via the realtime subscription.
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  // A project-scoped Realtime Presence channel supplies the member ids that
  // currently have this project open in one or more browser tabs.
  const [onlineMemberIds, setOnlineMemberIds] = useState<Set<string>>(new Set());
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);
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
    setFolders(await dataRepository.listFolders(projectId));
  }

  async function refreshFiles() {
    if (!projectId) return;
    setFiles(await dataRepository.listFiles(projectId));
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
    await dataRepository.deleteProject(targetId);
    const remaining = projects.filter((p) => p.id !== targetId);
    setProjects(remaining);
    if (targetId === projectId) setProjectId(remaining[0]?.id ?? null);
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

  async function updateMyProfile(patch: { name?: string; major?: string; student?: string; school?: string; avatarFile?: File }) {
    if (!projectId || !currentMember) return;
    const avatarUrl = patch.avatarFile ? await dataRepository.uploadAvatar(patch.avatarFile) : undefined;
    await dataRepository.updateMyProfile({ name: patch.name, major: patch.major, student: patch.student, school: patch.school, avatarUrl });
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function addFolder(name: string) {
    if (!projectId || !name.trim() || !currentMember) return;
    await dataRepository.createFolder(projectId, name, currentMember.name);
    await refreshFolders();
  }

  async function addFile(name: string, size: number, folderId: number | null, note?: string) {
    if (!projectId || !currentMember) return;
    await dataRepository.createFile(projectId, { name, size, folderId, note }, currentMember.name, currentMember.avatar);
    await refreshFiles();
  }

  async function addFileVersion(fileId: number, note?: string) {
    if (!currentMember) return;
    await dataRepository.addFileVersion(fileId, currentMember.name, note);
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

  async function addScheduleEvent(input: NewScheduleEventInput) {
    if (!projectId || !currentMember) return;
    if (input.scope === "team" && !isLeader) return;
    await dataRepository.addScheduleEvent(projectId, currentMember.id, input);
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
  if (projects.length === 0) return <EmptyProjectsScreen addProject={addProject} lookupProject={lookupProject} joinProject={joinProject} />;
  if (!initialized) return <StatusScreen kind="loading" />;

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
        projects,
        project,
        setProjectId,
        addProject,
        deleteProject,
        lookupProject,
        joinProject,
        team: liveTeam,
        transferLeadership,
        updateMyProfile,
        isShortTerm: isShortTermProject(project),
        folders,
        files,
        addFolder,
        addFile,
        addFileVersion,
        addFileComment,
        tasks,
        addTask,
        moveTask,
        updateTaskDetails,
        deleteTask,
        addTaskChecklistItem,
        toggleTaskChecklistItem,
        addTaskComment,
        toggleTaskTeamSchedule,
        toggleTaskPersonalSchedule,
        scheduleEvents,
        addScheduleEvent,
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
