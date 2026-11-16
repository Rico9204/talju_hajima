import { ApiClient } from "./apiClient";
import { accessToken } from "./session";

// 로컬 폴더 동기화의 "지금 누가 이 폴더를 동기화 중인지" 표시용. DataRepository 밖의 작은 보조 API다.
const client = new ApiClient(String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, ""), accessToken);

export interface SyncPresence { userId: string; root: number } // root: 동기화 대상 폴더 id, 0 = 워크스페이스 루트

export function pingSyncPresence(projectId: string, root: number): Promise<void> {
  return client.request<void>(`/projects/${projectId}/sync-presence`, { method: "POST", body: JSON.stringify({ root }) });
}

export async function listSyncPresence(projectId: string): Promise<SyncPresence[]> {
  return (await client.request<{ active: SyncPresence[] }>(`/projects/${projectId}/sync-presence`)).active;
}
