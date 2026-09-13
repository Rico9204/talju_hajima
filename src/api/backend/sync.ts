import { apiClient } from "./client";

// 워크스페이스 실시간 동기화(폴더 연동) 전용 저수준 API. DataRepository 인터페이스 밖 —
// Supabase 쪽엔 대응 개념이 없어서(경로 기반 버전/분기 모델 자체가 이 백엔드만의 것) 여기서 직접 부른다.

export interface RawSyncFile {
  id: string;
  path: string;
  content: string;
  currentVersionId: string | null;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  branched: { path: string; versionId: string }[];
  alreadyBranched: { path: string; versionId: string }[];
  unchanged: string[];
}

export function listProjectFiles(projectId: string) {
  return apiClient.get<RawSyncFile[]>(`/projects/${projectId}/files`);
}

export function syncFiles(projectId: string, files: { path: string; content: string; baseVersionId?: string }[]) {
  return apiClient.post<SyncResult>(`/projects/${projectId}/files/sync`, { files });
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
