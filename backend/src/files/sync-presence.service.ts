import { Injectable } from '@nestjs/common';

interface PresenceEntry {
  userId: string;
  lastSeenAt: number;
}

export interface ActivePresence {
  userId: string;
  root: string;
}

// 2초 폴링 주기를 감안해 여유있게 8초 이내에 핑이 있으면 "지금 동기화 중"으로 간주.
// 여러 서버 인스턴스로 확장할 계획이 없는 소규모 프로젝트라 메모리에만 보관.
const TTL_MS = 8000;

// root 자신 + 그 상위 폴더들(워크스페이스 루트까지) 목록. ["docs/team1/sub", "docs/team1", "docs", ""]
function selfAndAncestors(root: string): string[] {
  const result = [root];
  let cur = root;
  while (cur.includes('/')) {
    cur = cur.slice(0, cur.lastIndexOf('/'));
    result.push(cur);
  }
  if (root !== '') result.push('');
  return result;
}

@Injectable()
export class SyncPresenceService {
  private presence = new Map<string, Map<string, PresenceEntry>>();

  ping(projectId: string, root: string, userId: string): void {
    const key = `${projectId}:${root}`;
    const entries = this.presence.get(key) ?? new Map<string, PresenceEntry>();
    entries.set(userId, { userId, lastSeenAt: Date.now() });
    this.presence.set(key, entries);
  }

  // 같은 폴더뿐 아니라, 그 상위 폴더(워크스페이스 루트 포함)를 동기화 중인 사람도 함께 반환한다 —
  // 상위 폴더 동기화는 이 폴더의 파일도 같이 건드리므로 충돌 위험이 있기 때문.
  listActive(projectId: string, root: string, excludeUserId: string): ActivePresence[] {
    const now = Date.now();
    const seen = new Map<string, string>(); // userId -> 가장 가까운(구체적인) root

    for (const candidate of selfAndAncestors(root)) {
      const key = `${projectId}:${candidate}`;
      const entries = this.presence.get(key);
      if (!entries) continue;

      for (const [userId, entry] of entries) {
        if (now - entry.lastSeenAt > TTL_MS) {
          entries.delete(userId);
          continue;
        }
        if (userId === excludeUserId) continue;
        if (!seen.has(userId)) seen.set(userId, candidate);
      }
    }

    return Array.from(seen, ([userId, matchedRoot]) => ({ userId, root: matchedRoot }));
  }

  // 프로젝트 전체에서 지금 동기화 중인 모든 (userId, root) — 워크스페이스 탭에서 "이 파일을 지금
  // 누군가 동기화 중인지" 표시하는 데 씀. 본인도 포함(자기 자신이 연동 중인 파일도 표시해야 하므로).
  listAllActive(projectId: string): ActivePresence[] {
    const now = Date.now();
    const prefix = `${projectId}:`;
    const result: ActivePresence[] = [];

    for (const [key, entries] of this.presence) {
      if (!key.startsWith(prefix)) continue;
      const root = key.slice(prefix.length);
      for (const [userId, entry] of entries) {
        if (now - entry.lastSeenAt > TTL_MS) {
          entries.delete(userId);
          continue;
        }
        result.push({ userId, root });
      }
    }

    return result;
  }
}
