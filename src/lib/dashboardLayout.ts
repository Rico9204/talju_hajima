import { useEffect, useState } from "react";

export type DashboardWidgetId =
  | "profile"
  | "board"
  | "pace"
  | "achievements"
  | "mytasks"
  | "deadlines"
  | "evaluation"
  | "activity";

export type DashboardColumnId = "main" | "side";

export interface DashboardLayout {
  main: DashboardWidgetId[];
  side: DashboardWidgetId[];
}

export const ALL_DASHBOARD_WIDGETS: readonly DashboardWidgetId[] = [
  "profile",
  "board",
  "pace",
  "achievements",
  "mytasks",
  "deadlines",
  "evaluation",
  "activity",
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  main: ["profile", "board", "pace", "achievements"],
  side: ["mytasks", "deadlines", "evaluation", "activity"],
};

export interface WidgetMeta {
  id: DashboardWidgetId;
  label: string;
  icon: string;
  description: string;
}

export const DASHBOARD_WIDGETS_META: Record<DashboardWidgetId, WidgetMeta> = {
  profile: {
    id: "profile",
    label: "내 프로필",
    icon: "👤",
    description: "내 티어, 신뢰도, 프로젝트 종료 디데이 및 진행률 요약",
  },
  board: {
    id: "board",
    label: "프로젝트 현황판",
    icon: "📊",
    description: "과제 진행 바 및 예정/진행/검토 상태별 요약",
  },
  pace: {
    id: "pace",
    label: "우리 팀 속도",
    icon: "⚡",
    description: "경과 기간 대비 과제 완료율 비교 지표",
  },
  achievements: {
    id: "achievements",
    label: "다음에 달성할 업적",
    icon: "🏆",
    description: "현재 진행 중인 도전과제 및 달성률",
  },
  mytasks: {
    id: "mytasks",
    label: "나의 할 일",
    icon: "📋",
    description: "내가 담당한 오늘의 진행 과제 목록",
  },
  deadlines: {
    id: "deadlines",
    label: "다가오는 마감",
    icon: "⏰",
    description: "7일 이내 마감 임박 과제 및 일정 검색",
  },
  evaluation: {
    id: "evaluation",
    label: "내 평가 및 참여 현황",
    icon: "⭐",
    description: "협업 신뢰도 점수 및 동료 평가 참여 현황 요약",
  },
  activity: {
    id: "activity",
    label: "최근 활동 · 최근 3일",
    icon: "🕒",
    description: "최근 3일 이내 등록·수정된 일정 및 자료 활동 내역",
  },
};

const STORAGE_KEY = "collabpeer.dashboard-layout";
const CHANGE_EVENT = "collabpeer:dashboard-layout";

const VALID_SET = new Set<string>(ALL_DASHBOARD_WIDGETS);

export function sanitizeDashboardLayout(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== "object") {
    return {
      main: [...DEFAULT_DASHBOARD_LAYOUT.main],
      side: [...DEFAULT_DASHBOARD_LAYOUT.side],
    };
  }

  const obj = raw as { main?: unknown; side?: unknown };
  const mainRaw = Array.isArray(obj.main) ? obj.main : [];
  const sideRaw = Array.isArray(obj.side) ? obj.side : [];

  const main: DashboardWidgetId[] = [];
  const side: DashboardWidgetId[] = [];
  const seen = new Set<DashboardWidgetId>();

  for (const item of mainRaw) {
    if (typeof item === "string" && VALID_SET.has(item) && !seen.has(item as DashboardWidgetId)) {
      main.push(item as DashboardWidgetId);
      seen.add(item as DashboardWidgetId);
    }
  }

  for (const item of sideRaw) {
    if (typeof item === "string" && VALID_SET.has(item) && !seen.has(item as DashboardWidgetId)) {
      side.push(item as DashboardWidgetId);
      seen.add(item as DashboardWidgetId);
    }
  }

  // 누락된 위젯이 있다면 기본 위치로 보충
  for (const item of DEFAULT_DASHBOARD_LAYOUT.main) {
    if (!seen.has(item)) {
      main.push(item);
      seen.add(item);
    }
  }
  for (const item of DEFAULT_DASHBOARD_LAYOUT.side) {
    if (!seen.has(item)) {
      side.push(item);
      seen.add(item);
    }
  }

  return { main, side };
}

export function readDashboardLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { main: [...DEFAULT_DASHBOARD_LAYOUT.main], side: [...DEFAULT_DASHBOARD_LAYOUT.side] };
    return sanitizeDashboardLayout(JSON.parse(raw));
  } catch {
    return { main: [...DEFAULT_DASHBOARD_LAYOUT.main], side: [...DEFAULT_DASHBOARD_LAYOUT.side] };
  }
}

export function writeDashboardLayout(layout: DashboardLayout): void {
  const sanitized = sanitizeDashboardLayout(layout);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // 사생활 보호 모드 등에서는 무시
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: sanitized }));
  }
}

export function resetDashboardLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: DEFAULT_DASHBOARD_LAYOUT }));
  }
}

export function isDefaultDashboardLayout(layout: DashboardLayout): boolean {
  if (layout.main.length !== DEFAULT_DASHBOARD_LAYOUT.main.length || layout.side.length !== DEFAULT_DASHBOARD_LAYOUT.side.length) {
    return false;
  }
  for (let i = 0; i < layout.main.length; i++) {
    if (layout.main[i] !== DEFAULT_DASHBOARD_LAYOUT.main[i]) return false;
  }
  for (let i = 0; i < layout.side.length; i++) {
    if (layout.side[i] !== DEFAULT_DASHBOARD_LAYOUT.side[i]) return false;
  }
  return true;
}

export function moveWidget(
  layout: DashboardLayout,
  sourceWidgetId: DashboardWidgetId,
  targetColumn: DashboardColumnId,
  targetIndex?: number
): DashboardLayout {
  const next: DashboardLayout = {
    main: layout.main.filter((id) => id !== sourceWidgetId),
    side: layout.side.filter((id) => id !== sourceWidgetId),
  };

  const targetList = targetColumn === "main" ? next.main : next.side;
  const insertAt = targetIndex !== undefined ? Math.max(0, Math.min(targetIndex, targetList.length)) : targetList.length;

  targetList.splice(insertAt, 0, sourceWidgetId);
  return next;
}

export function moveWidgetStep(
  layout: DashboardLayout,
  widgetId: DashboardWidgetId,
  direction: "up" | "down" | "cross"
): DashboardLayout {
  const inMain = layout.main.includes(widgetId);
  const currentCol: DashboardColumnId = inMain ? "main" : "side";
  const list = inMain ? [...layout.main] : [...layout.side];
  const idx = list.indexOf(widgetId);
  if (idx === -1) return layout;

  if (direction === "cross") {
    const otherCol: DashboardColumnId = inMain ? "side" : "main";
    return moveWidget(layout, widgetId, otherCol);
  }

  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return layout;

  const [item] = list.splice(idx, 1);
  list.splice(targetIdx, 0, item);

  return inMain ? { ...layout, main: list } : { ...layout, side: list };
}

export function useDashboardLayout(): [DashboardLayout, (next: DashboardLayout) => void, () => void] {
  const [layout, setLayoutState] = useState<DashboardLayout>(readDashboardLayout);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setLayoutState(readDashboardLayout());
    }
    function onCustom(e: Event) {
      const custom = e as CustomEvent<DashboardLayout>;
      if (custom.detail) setLayoutState(sanitizeDashboardLayout(custom.detail));
      else setLayoutState(readDashboardLayout());
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom);
    };
  }, []);

  const save = (next: DashboardLayout) => {
    setLayoutState(sanitizeDashboardLayout(next));
    writeDashboardLayout(next);
  };

  const reset = () => {
    setLayoutState({ main: [...DEFAULT_DASHBOARD_LAYOUT.main], side: [...DEFAULT_DASHBOARD_LAYOUT.side] });
    resetDashboardLayout();
  };

  return [layout, save, reset];
}
