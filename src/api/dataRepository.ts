import type { Project, NewProjectInput, TeamData, Folder, WorkspaceFile, FileComment } from "./types";

/**
 * Every persistence-touching operation the app needs, independent of which
 * backend actually stores the data. Today `./supabase/supabaseDataRepository.ts`
 * is the only implementation. Moving to a self-hosted DB server later means
 * writing a new implementation of this same interface (e.g.
 * `./rest/restDataRepository.ts` calling your own API) and pointing
 * `./index.ts` at it — nothing outside this folder needs to change.
 */
export interface DataRepository {
  listProjects(): Promise<Project[]>;
  createProject(input: NewProjectInput): Promise<Project>;

  getTeam(projectId: string): Promise<TeamData>;
  transferLeadership(projectId: string, targetName: string): Promise<void>;

  listFolders(projectId: string): Promise<Folder[]>;
  createFolder(projectId: string, name: string): Promise<Folder>;

  listFiles(projectId: string): Promise<WorkspaceFile[]>;
  createFile(
    projectId: string,
    input: { name: string; size: number; folderId: number | null; note?: string }
  ): Promise<WorkspaceFile>;
  addFileVersion(fileId: number, note?: string): Promise<void>;
  addFileComment(fileId: number, text: string): Promise<FileComment>;
}
