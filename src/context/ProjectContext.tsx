import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dataRepository } from "../api";
import type { Project, NewProjectInput, TeamData, Folder, WorkspaceFile } from "../api/types";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE } from "../lib/supabase";

export type { Project, NewProjectInput, Member, TeamData, FileVersion, FileComment, WorkspaceFile, Folder } from "../api/types";

const SHORT_TERM_THRESHOLD_DAYS = 14;

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
    Promise.all([dataRepository.getTeam(projectId), dataRepository.listFolders(projectId), dataRepository.listFiles(projectId)])
      .then(([teamData, folderList, fileList]) => {
        if (cancelled) return;
        setTeam(teamData);
        setFolders(folderList);
        setFiles(fileList);
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

  if (error) return <StatusScreen kind="error" message={error} />;
  if (!projectsLoaded) return <StatusScreen kind="loading" />;
  if (projects.length === 0) return <StatusScreen kind="empty" />;
  if (!initialized) return <StatusScreen kind="loading" />;

  const project = projects.find((p) => p.id === projectId) ?? projects[0];

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
