import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dataRepository } from "../api";
import type { Project, NewProjectInput, TeamData, Folder, WorkspaceFile, Task, TaskStatus } from "../api/types";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE } from "../lib/supabase";

export type { Project, NewProjectInput, Member, TeamData, FileVersion, FileComment, WorkspaceFile, Folder, Task, TaskStatus } from "../api/types";

const SHORT_TERM_THRESHOLD_DAYS = 14;

// Mirrors the mock unread counts in TeamChat.tsx's `chatByProject`, duplicated
// here only so the sidebar badge shows up without requiring a visit to /chat
// first. Goes away once chat moves to Supabase (see the project-supabase-
// migration memory note).
const INITIAL_CHAT_UNREAD: Record<string, Record<string, number>> = {
  heritage: { all: 0, 박민준: 2, 이서연: 0, 정하늘: 0, 최현우: 0 },
  dialect: { all: 0, 박민준: 0, 오유진: 0, 한소민: 0 },
};

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
  team: TeamData;
  transferLeadership: (targetName: string) => Promise<void>;
  isShortTerm: boolean;
  folders: Folder[];
  files: WorkspaceFile[];
  addFolder: (name: string) => Promise<void>;
  addFile: (name: string, size: number, folderId: number | null, note?: string) => Promise<void>;
  addFileVersion: (fileId: number, note?: string) => Promise<void>;
  addFileComment: (fileId: number, text: string) => Promise<void>;
  tasks: Task[];
  moveTask: (taskId: number, status: TaskStatus) => Promise<void>;
  chatUnread: Record<string, number>;
  chatUnreadTotal: number;
  seedChatUnread: (initial: Record<string, number>) => void;
  clearChatUnread: (channelId: string) => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function StatusScreen({ kind, message }: { kind: "loading" | "empty" | "error"; message?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
      <div
        className="max-w-sm px-6 py-5 text-center"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        {kind === "loading" && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>}
        {kind === "empty" && (
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            아직 프로젝트가 없습니다. Supabase에 <code>supabase/seed.sql</code>을 실행하거나 새 프로젝트를 만들어보세요.
          </div>
        )}
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

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamData>({ teamLabel: "", teamSub: "", members: [] });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Chat unread counts are still client-only mock state (TeamChat.tsx owns
  // the channel/message mock data) — lifted here just so the sidebar badge
  // can see them too, ahead of the real chat DB migration.
  const [chatUnreadByProject, setChatUnreadByProject] = useState<Record<string, Record<string, number>>>({});
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the project list once on mount and select the first project.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(SUPABASE_SETUP_MESSAGE);
      setProjectsLoaded(true);
      return;
    }
    let cancelled = false;
    dataRepository
      .listProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setProjectId(list[0]?.id ?? null);
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
  }, []);

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
    ])
      .then(([teamData, folderList, fileList, taskList]) => {
        if (cancelled) return;
        setTeam(teamData);
        setFolders(folderList);
        setFiles(fileList);
        setTasks(taskList);
        seedChatUnread(INITIAL_CHAT_UNREAD[projectId] || {});
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

  async function refreshFolders() {
    if (!projectId) return;
    setFolders(await dataRepository.listFolders(projectId));
  }

  async function refreshFiles() {
    if (!projectId) return;
    setFiles(await dataRepository.listFiles(projectId));
  }

  async function addProject(input: NewProjectInput): Promise<string> {
    const created = await dataRepository.createProject(input);
    setProjects((prev) => [...prev, created]);
    setProjectId(created.id);
    return created.id;
  }

  async function transferLeadership(targetName: string) {
    if (!projectId) return;
    await dataRepository.transferLeadership(projectId, targetName);
    setTeam(await dataRepository.getTeam(projectId));
  }

  async function addFolder(name: string) {
    if (!projectId || !name.trim()) return;
    await dataRepository.createFolder(projectId, name);
    await refreshFolders();
  }

  async function addFile(name: string, size: number, folderId: number | null, note?: string) {
    if (!projectId) return;
    await dataRepository.createFile(projectId, { name, size, folderId, note });
    await refreshFiles();
  }

  async function addFileVersion(fileId: number, note?: string) {
    await dataRepository.addFileVersion(fileId, note);
    await refreshFiles();
  }

  async function addFileComment(fileId: number, text: string) {
    if (!text.trim()) return;
    await dataRepository.addFileComment(fileId, text);
    await refreshFiles();
  }

  async function moveTask(taskId: number, status: TaskStatus) {
    if (!projectId) return;
    await dataRepository.updateTaskStatus(taskId, status);
    setTasks(await dataRepository.listTasks(projectId));
  }

  function seedChatUnread(initial: Record<string, number>) {
    if (!projectId) return;
    setChatUnreadByProject((p) => (p[projectId] ? p : { ...p, [projectId]: initial }));
  }

  function clearChatUnread(channelId: string) {
    if (!projectId) return;
    setChatUnreadByProject((p) => ({ ...p, [projectId]: { ...p[projectId], [channelId]: 0 } }));
  }

  if (error) return <StatusScreen kind="error" message={error} />;
  if (!projectsLoaded) return <StatusScreen kind="loading" />;
  if (projects.length === 0) return <StatusScreen kind="empty" />;
  if (!initialized) return <StatusScreen kind="loading" />;

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const chatUnread = chatUnreadByProject[project.id] || {};
  const chatUnreadTotal = Object.values(chatUnread).reduce((sum, n) => sum + n, 0);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        project,
        setProjectId,
        addProject,
        team,
        transferLeadership,
        isShortTerm: isShortTermProject(project),
        folders,
        files,
        addFolder,
        addFile,
        addFileVersion,
        addFileComment,
        tasks,
        moveTask,
        chatUnread,
        chatUnreadTotal,
        seedChatUnread,
        clearChatUnread,
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
