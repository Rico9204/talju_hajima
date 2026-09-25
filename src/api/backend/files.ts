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
  // 특정 버전(페이지)에 남긴 댓글이면 그 버전 id, 파일 전체에 대한 일반 댓글이면 null.
  versionId: string | null;
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

// OnlyOffice(워드/엑셀/PPT 인앱 편집기) 설정 — 그대로 OnlyOffice의 DocEditor에 넘기면 된다.
export interface OnlyofficeConfig {
  document: { fileType: string; key: string; title: string; url: string; permissions: Record<string, boolean> };
  documentType: "word" | "cell" | "slide";
  editorConfig: { callbackUrl: string; lang: string; user: { id: string; name: string }; customization: Record<string, boolean> };
  token: string;
}

export function getOnlyofficeConfig(projectId: string, fileId: string) {
  return apiClient.get<OnlyofficeConfig>(`/projects/${projectId}/files/${fileId}/onlyoffice/config`);
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

export interface VersionCalendarEntry {
  id: string;
  fileId: string;
  path: string;
  authorId: string;
  createdAt: string;
}

// 버전 이력 달력용 — fileId를 주면 그 파일만, 안 주면 프로젝트 전체 파일의 업로드 이력.
export function listVersionCalendar(projectId: string, fileId?: string) {
  return apiClient.get<VersionCalendarEntry[]>(`/projects/${projectId}/files/versions-calendar`, { params: { fileId } });
}

// 파일 목록에서 "핀 N" 배지를 보여주기 위한 파일별 핀 개수 (listBranches와 같은 용도).
export function listPinCounts(projectId: string) {
  return apiClient.get<{ fileId: string; count: number }[]>(`/projects/${projectId}/files/pins`);
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

export function addFileComment(projectId: string, fileId: string, content: string, versionId?: string) {
  return apiClient.post<FileComment>(`/projects/${projectId}/files/${fileId}/comments`, { content, versionId });
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

export interface CollabActiveFile {
  fileId: string;
  users: { userId: string; name: string }[];
}

// "바로 수정"(실시간 공동편집) 중인 파일별 참여자 목록 — 파일 목록에 "N명이 바로 수정 중" 배지를
// 보여주기 위해 주기적으로 폴링한다. 실제 편집 동기화 자체는 웹소켓(collab.service.ts)이 맡고,
// 이건 그 웹소켓에 지금 붙어있는 사람이 누군지만 가볍게 REST로 확인하는 용도.
export function listActiveCollabUsers(projectId: string) {
  return apiClient.get<CollabActiveFile[]>(`/projects/${projectId}/collab/active`);
}
