import { useEffect, useSyncExternalStore } from "react";
import { dataRepository } from "../api";
import type { Announcement } from "../api/types";

// 지금 내가 받는 공지(시스템 공지 + 내가 참여한 프로젝트의 공지)를 화면 여러 곳이 함께 쓴다:
// 메인 화면 공지 띠·프로젝트 카드 배지, 대시보드 공지 카드, 사이드바 점, 중요·긴급 팝업.
// 한 번만 불러오고, 공지가 바뀌면(실시간 알림) 또는 1분마다·창으로 돌아올 때 다시 읽는다.
// "확인했어요"는 화면에 바로 반영하고 서버에 기록한다.
const REFRESH_MS = 60_000;

let items: Announcement[] = [];
let loaded = false;
const listeners = new Set<() => void>();
let users = 0;
let stop: (() => void) | null = null;

function emit() { for (const listener of listeners) listener(); }

export function refreshAnnouncements(): void {
  dataRepository.listActiveAnnouncements()
    .then((next) => { items = next; loaded = true; emit(); })
    .catch(() => { /* 일시적 오류는 다음 갱신에 */ });
}

function start() {
  refreshAnnouncements();
  const unsubscribe = dataRepository.subscribeToAnnouncements(refreshAnnouncements);
  const timer = window.setInterval(refreshAnnouncements, REFRESH_MS);
  const onVisible = () => { if (document.visibilityState === "visible") refreshAnnouncements(); };
  document.addEventListener("visibilitychange", onVisible);
  stop = () => { unsubscribe(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// 로그인한 화면에서만 쓴다(userId가 바뀌면 다시 불러온다).
export function useAnnouncements(userId: string | null | undefined): { items: Announcement[]; loaded: boolean } {
  useEffect(() => {
    if (!userId) return;
    users += 1;
    if (users === 1) start();
    else refreshAnnouncements();
    return () => {
      users -= 1;
      if (users === 0) { stop?.(); stop = null; items = []; loaded = false; }
    };
  }, [userId]);
  const current = useSyncExternalStore(subscribe, () => items);
  const isLoaded = useSyncExternalStore(subscribe, () => loaded);
  return { items: current, loaded: isLoaded };
}

export async function markAnnouncementRead(id: number): Promise<void> {
  items = items.map((a) => (a.id === id ? { ...a, read: true } : a));
  emit();
  try {
    await dataRepository.markAnnouncementRead(id);
  } catch {
    refreshAnnouncements(); // 기록하지 못했으면 서버 상태로 되돌린다
  }
}

const PRIORITY_RANK: Record<Announcement["priority"], number> = { urgent: 0, important: 1, normal: 2 };

// 확인 안 한 것 먼저, 그다음 중요도, 그다음 최근 순.
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => Number(!!a.read) - Number(!!b.read) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.id - a.id);
}

export const systemAnnouncements = (list: Announcement[]) => sortAnnouncements(list.filter((a) => a.targetAll));
export const projectAnnouncements = (list: Announcement[], projectId: string) => sortAnnouncements(list.filter((a) => !a.targetAll && a.projectIds.includes(projectId)));
export const unreadProjectCount = (list: Announcement[], projectId: string) => list.filter((a) => !a.targetAll && !a.read && a.projectIds.includes(projectId)).length;

export const PRIORITY_LABEL: Record<Announcement["priority"], { text: string; color: string; bg: string }> = {
  urgent: { text: "긴급", color: "#dc2626", bg: "rgba(220, 38, 38, 0.12)" },
  important: { text: "중요", color: "#d97706", bg: "rgba(245, 158, 11, 0.15)" },
  normal: { text: "공지", color: "var(--primary-text)", bg: "var(--secondary)" },
};
