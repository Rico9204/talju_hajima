import { apiClient } from "./client";

// 워크스페이스(파일 버전/분기/핀/태그/댓글/동기화 현황) 전용 저수준 API. DataRepository 인터페이스
// 밖 — 제품개발/frontend의 api/files.ts를 이 앱의 axios client에 맞춰 그대로 이식함.

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content: string;
  currentVersionId: string | null;
  lastEditorId: string | null;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileVersion {
  id: string;
  fileId: string;
  parentVersionId: string | null;
  authorId: string;
  content: string;
  note: string | null;
  createdAt: string;
}

export interface FileBranches {
  file: ProjectFile;
  branches: FileVersion[];
}

export interface FileComment {
  id: string;
  fileId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  branched: { path: string; versionId: string }[];
  alreadyBranched: { path: string; versionId: string }[];
  unchanged: string[];
}

export function listFiles(projectId: string) {
  return apiClient.get<ProjectFile[]>(`/projects/${projectId}/files`);
}

export function listBranches(projectId: string) {
  return apiClient.get<FileBranches[]>(`/projects/${projectId}/files/branches`);
}

export function listFileVersions(projectId: string, fileId: string) {
  return apiClient.get<FileVersion[]>(`/projects/${projectId}/files/${fileId}/versions`);
}

export function promoteVersion(projectId: string, fileId: string, versionId: string) {
  return apiClient.post<ProjectFile>(`/projects/${projectId}/files/${fileId}/versions/${versionId}/promote`);
}

export function syncFiles(
  projectId: string,
  files: { path: string; content: string; baseVersionId?: string; note?: string; pinId?: string }[],
) {
  return apiClient.post<SyncResult>(`/projects/${projectId}/files/sync`, { files });
}

export interface FileVersionPin {
  id: string;
  fileId: string;
  label: string;
  versionId: string;
  createdAt: string;
  updatedAt: string;
}

export function listFilePins(projectId: string, fileId: string) {
  return apiClient.get<FileVersionPin[]>(`/projects/${projectId}/files/${fileId}/pins`);
}

export function createFilePin(projectId: string, fileId: string, versionId: string, label?: string) {
  return apiClient.post<FileVersionPin>(`/projects/${projectId}/files/${fileId}/pins`, { versionId, label });
}

export function deleteFilePin(projectId: string, fileId: string, pinId: string) {
  return apiClient.delete<void>(`/projects/${projectId}/files/${fileId}/pins/${pinId}`);
}

export function setFileTag(projectId: string, fileId: string, tag: string) {
  return apiClient.patch<ProjectFile>(`/projects/${projectId}/files/${fileId}/tag`, { tag });
}

export function listFileComments(projectId: string, fileId: string) {
  return apiClient.get<FileComment[]>(`/projects/${projectId}/files/${fileId}/comments`);
}

export function addFileComment(projectId: string, fileId: string, content: string) {
  return apiClient.post<FileComment>(`/projects/${projectId}/files/${fileId}/comments`, { content });
}

export interface ActivePresence {
  userId: string;
  root: string;
}

export function pingSyncPresence(projectId: string, root: string) {
  return apiClient.post<{ ok: true }>(`/projects/${projectId}/sync-presence`, { root });
}

export function listSyncPresence(projectId: string, root: string) {
  return apiClient.get<{ active: ActivePresence[] }>(`/projects/${projectId}/sync-presence`, { params: { root } });
}

// 프로젝트 전체에서 지금 동기화 중인 (userId, root) 전부 — 워크스페이스 파일 목록의 "지금 동기화 중" 표시용
export function listAllSyncPresence(projectId: string) {
  return apiClient.get<{ active: ActivePresence[] }>(`/projects/${projectId}/sync-presence/all`);
}
