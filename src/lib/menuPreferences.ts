import { useEffect, useState } from "react";
import type { Page } from "../App";

export type NavPage = "dashboard" | "team" | "chat" | "tasks" | "schedule" | "workspace" | "evaluation";

export const DEFAULT_MENU_ORDER: readonly NavPage[] = [
  "dashboard",
  "team",
  "chat",
  "tasks",
  "schedule",
  "workspace",
  "evaluation",
];

export interface MenuItemMeta {
  id: NavPage;
  label: string;
  icon: string;
  description: string;
}

export const MENU_ITEMS_META: Record<NavPage, MenuItemMeta> = {
  dashboard: {
    id: "dashboard",
    label: "대시보드",
    icon: "⊞",
    description: "프로젝트 진행 현황 및 핵심 요약 카드",
  },
  team: {
    id: "team",
    label: "팀 관리",
    icon: "◎",
    description: "팀원 목록, 권한 및 접속 상태 확인",
  },
  chat: {
    id: "chat",
    label: "채팅",
    icon: "💬",
    description: "팀 실시간 메신저 및 협업 도구",
  },
  tasks: {
    id: "tasks",
    label: "과제 보드",
    icon: "≡",
    description: "칸반 보드 및 과제 진행 상태 관리",
  },
  schedule: {
    id: "schedule",
    label: "일정",
    icon: "▤",
    description: "캘린더 및 마일스톤 일정 관리",
  },
  workspace: {
    id: "workspace",
    label: "워크스페이스",
    icon: "⬡",
    description: "공동 작업 문서, 슬라이드 및 파일 공유",
  },
  evaluation: {
    id: "evaluation",
    label: "동료 평가",
    icon: "★",
    description: "중간/최종 팀원 상호 기여도 평가",
  },
};

const STORAGE_KEY = "collabpeer.menu-order";
const CHANGE_EVENT = "collabpeer:menu-order";

const VALID_SET = new Set<string>(DEFAULT_MENU_ORDER);

export function sanitizeMenuOrder(raw: unknown): NavPage[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_MENU_ORDER];
  }

  const result: NavPage[] = [];
  const seen = new Set<NavPage>();

  for (const item of raw) {
    if (typeof item === "string" && VALID_SET.has(item) && !seen.has(item as NavPage)) {
      result.push(item as NavPage);
      seen.add(item as NavPage);
    }
  }

  for (const item of DEFAULT_MENU_ORDER) {
    if (!seen.has(item)) {
      result.push(item);
      seen.add(item);
    }
  }

  return result;
}

export function readMenuOrder(): NavPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_MENU_ORDER];
    const parsed = JSON.parse(raw);
    return sanitizeMenuOrder(parsed);
  } catch {
    return [...DEFAULT_MENU_ORDER];
  }
}

export function saveMenuOrder(order: NavPage[]) {
  const sanitized = sanitizeMenuOrder(order);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Storage might fail in private browsing
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resetMenuOrder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isDefaultMenuOrder(order: NavPage[]): boolean {
  if (order.length !== DEFAULT_MENU_ORDER.length) return false;
  return order.every((id, i) => id === DEFAULT_MENU_ORDER[i]);
}

export function reorderMenuItem(order: NavPage[], fromIndex: number, toIndex: number): NavPage[] {
  if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) {
    return order;
  }
  if (fromIndex === toIndex) return order;

  const next = [...order];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

export function moveMenuItem(order: NavPage[], index: number, direction: "up" | "down"): NavPage[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  return reorderMenuItem(order, index, targetIndex);
}

export function useMenuOrder() {
  const [order, setOrder] = useState<NavPage[]>(readMenuOrder);

  useEffect(() => {
    const update = () => setOrder(readMenuOrder());
    window.addEventListener(CHANGE_EVENT, update);
    return () => window.removeEventListener(CHANGE_EVENT, update);
  }, []);

  return [order, saveMenuOrder, resetMenuOrder] as const;
}

// -------------------------------------------------------------
// Home (Main screen) menu preferences
// -------------------------------------------------------------

export type HomeNavTab = "projects" | "board" | "achievements" | "settings";

export const DEFAULT_HOME_MENU_ORDER: readonly HomeNavTab[] = [
  "projects",
  "board",
  "achievements",
  "settings",
];

export interface HomeMenuItemMeta {
  id: HomeNavTab;
  label: string;
  icon: string;
  description: string;
}

export const HOME_MENU_ITEMS_META: Record<HomeNavTab, HomeMenuItemMeta> = {
  projects: {
    id: "projects",
    label: "내 프로젝트",
    icon: "📁",
    description: "참여 중이거나 완료된 내 팀 프로젝트 목록",
  },
  board: {
    id: "board",
    label: "게시판",
    icon: "💬",
    description: "전체 팀원 모집 및 자유 커뮤니티 게시판",
  },
  achievements: {
    id: "achievements",
    label: "업적",
    icon: "◈",
    description: "나의 티어, 메달 및 협업 업적 점수 현황",
  },
  settings: {
    id: "settings",
    label: "설정",
    icon: "⚙",
    description: "화면 테마, 그래픽 성능, 알림 및 메뉴 순서 설정",
  },
};

const HOME_STORAGE_KEY = "collabpeer.home-menu-order";
const HOME_CHANGE_EVENT = "collabpeer:home-menu-order";

const VALID_HOME_SET = new Set<string>(DEFAULT_HOME_MENU_ORDER);

export function sanitizeHomeMenuOrder(raw: unknown): HomeNavTab[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_HOME_MENU_ORDER];
  }

  const result: HomeNavTab[] = [];
  const seen = new Set<HomeNavTab>();

  for (const item of raw) {
    if (typeof item === "string" && VALID_HOME_SET.has(item) && !seen.has(item as HomeNavTab)) {
      result.push(item as HomeNavTab);
      seen.add(item as HomeNavTab);
    }
  }

  for (const item of DEFAULT_HOME_MENU_ORDER) {
    if (!seen.has(item)) {
      result.push(item);
      seen.add(item);
    }
  }

  return result;
}

export function readHomeMenuOrder(): HomeNavTab[] {
  try {
    const raw = localStorage.getItem(HOME_STORAGE_KEY);
    if (!raw) return [...DEFAULT_HOME_MENU_ORDER];
    const parsed = JSON.parse(raw);
    return sanitizeHomeMenuOrder(parsed);
  } catch {
    return [...DEFAULT_HOME_MENU_ORDER];
  }
}

export function saveHomeMenuOrder(order: HomeNavTab[]) {
  const sanitized = sanitizeHomeMenuOrder(order);
  try {
    localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Storage might fail in private browsing
  }
  window.dispatchEvent(new Event(HOME_CHANGE_EVENT));
}

export function resetHomeMenuOrder() {
  try {
    localStorage.removeItem(HOME_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(HOME_CHANGE_EVENT));
}

export function isDefaultHomeMenuOrder(order: HomeNavTab[]): boolean {
  if (order.length !== DEFAULT_HOME_MENU_ORDER.length) return false;
  return order.every((id, i) => id === DEFAULT_HOME_MENU_ORDER[i]);
}

export function reorderHomeMenuItem(order: HomeNavTab[], fromIndex: number, toIndex: number): HomeNavTab[] {
  if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) {
    return order;
  }
  if (fromIndex === toIndex) return order;

  const next = [...order];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

export function moveHomeMenuItem(order: HomeNavTab[], index: number, direction: "up" | "down"): HomeNavTab[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  return reorderHomeMenuItem(order, index, targetIndex);
}

export function useHomeMenuOrder() {
  const [order, setOrder] = useState<HomeNavTab[]>(readHomeMenuOrder);

  useEffect(() => {
    const update = () => setOrder(readHomeMenuOrder());
    window.addEventListener(HOME_CHANGE_EVENT, update);
    return () => window.removeEventListener(HOME_CHANGE_EVENT, update);
  }, []);

  return [order, saveHomeMenuOrder, resetHomeMenuOrder] as const;
}
