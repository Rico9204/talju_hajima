import type { MedalShape } from "../components/MedalIcon";
import type { MyEvaluationSummary } from "./evaluationSummary";

export interface Tier {
  id: string;
  label: string;
  shape: MedalShape;
  colors: readonly [string, string]; // gradient stops, light → dark
  color: string; // flat accent for text/borders elsewhere (tier label, progress circle)
  min: number;
}

// Ordered lowest to highest; tierFor() walks forward and keeps the last one
// whose threshold the score clears, so thresholds must stay ascending.
// Shape/gradient pairing follows the "Ranking Badges" Figma kit: shield for
// bronze, diamond for silver, pentagon for gold, hexagon for platinum.
export const TIERS: Tier[] = [
  { id: "bronze", label: "브론즈", shape: "shield", colors: ["#d9a468", "#9c6a35"], color: "#b08d57", min: 0 },
  { id: "silver", label: "실버", shape: "diamond", colors: ["#d3dce6", "#8b98a8"], color: "#8a94a6", min: 4 },
  { id: "gold", label: "골드", shape: "pentagon", colors: ["#f7cd6a", "#d89a28"], color: "#d9a441", min: 7 },
  { id: "platinum", label: "플래티넘", shape: "hexagon", colors: ["#8fd0f5", "#3182c9"], color: "#38bdf8", min: 9 },
];

// null score (평가 미공개) has no tier yet — distinct from "브론즈", not a
// judgment, just "not enough data".
export function tierFor(score: number | null): Tier | null {
  if (score === null) return null;
  let current = TIERS[0];
  for (const tier of TIERS) if (score >= tier.min) current = tier;
  return current;
}

// Score at which a tier's climb is "complete" — the next tier's floor, or a
// flat cap for the top tier (there's no tier above it to borrow a floor
// from, and score already tops out at 10).
const TOP_TIER_CAP = 10;
export function tierUpperBound(tierIndex: number): number {
  return tierIndex + 1 < TIERS.length ? TIERS[tierIndex + 1].min : TOP_TIER_CAP;
}

// Which of a tier's 3 sub-divisions (0 = "III", just entered .. 2 = "I",
// about to promote) a score sits in — a lighter-weight rank ladder than a
// full named sub-tier system, just enough to drive progress pips.
export function subTierIndex(score: number, tierIndex: number): number {
  const tier = TIERS[tierIndex];
  const span = (tierUpperBound(tierIndex) - tier.min) / 3;
  if (span <= 0) return 2;
  return Math.min(2, Math.max(0, Math.floor((score - tier.min) / span)));
}

// A "도전과제": one stat, one target — no sub-levels. Below 100% it's just
// progress; at 100% it's earned, and the most-cleared earned one is shown
// automatically next to the tier medal on the profile card (see
// bestEarnedAchievement below).
export type AchievementIconId = "flag" | "people" | "heart" | "star" | "check" | "clock" | "chat" | "link" | "sparkle";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  unit: string;
  icon: AchievementIconId;
  colors: readonly [string, string]; // crest gradient, light → dark
  threshold: number;
  metric: (summary: MyEvaluationSummary) => number;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "projects",
    label: "베테랑",
    description: "프로젝트에 3회 이상 참여하면 획득해요",
    unit: "회",
    icon: "flag",
    colors: ["#6ee7a0", "#16a34a"],
    threshold: 3,
    metric: (s) => s.projectCount,
  },
  {
    id: "collaborators",
    label: "인싸",
    description: "동료 5명 이상과 함께하면 획득해요",
    unit: "명",
    icon: "people",
    colors: ["#7dd3fc", "#0284c7"],
    threshold: 5,
    metric: (s) => s.collaboratorCount,
  },
  {
    id: "trusted",
    label: "신뢰받는 동료",
    description: "동료 평가 5건 이상 받으면 획득해요",
    unit: "건",
    icon: "heart",
    colors: ["#f9a8d4", "#db2777"],
    threshold: 5,
    metric: (s) => s.count,
  },
  {
    id: "score",
    label: "만점왕",
    description: "평가 평균 7점 이상이면 획득해요",
    unit: "점",
    icon: "star",
    colors: ["#fde68a", "#d97706"],
    threshold: 7,
    metric: (s) => s.score ?? 0,
  },
  {
    id: "criteria-role",
    label: "역할 이행",
    description: "역할 이행 평가 6.5점 이상이면 획득해요",
    unit: "점",
    icon: "check",
    colors: ["#c4b5fd", "#7c3aed"],
    threshold: 6.5,
    metric: (s) => s.criteria.role,
  },
  {
    id: "criteria-deadline",
    label: "약속의 아이콘",
    description: "약속·마감 준수 평가 6.5점 이상이면 획득해요",
    unit: "점",
    icon: "clock",
    colors: ["#fdba74", "#ea580c"],
    threshold: 6.5,
    metric: (s) => s.criteria.deadline,
  },
  {
    id: "criteria-communication",
    label: "소통왕",
    description: "의사소통 평가 6.5점 이상이면 획득해요",
    unit: "점",
    icon: "chat",
    colors: ["#67e8f9", "#0891b2"],
    threshold: 6.5,
    metric: (s) => s.criteria.communication,
  },
  {
    id: "criteria-collaboration",
    label: "협업의 달인",
    description: "협업 태도 평가 6.5점 이상이면 획득해요",
    unit: "점",
    icon: "link",
    colors: ["#5eead4", "#0d9488"],
    threshold: 6.5,
    metric: (s) => s.criteria.collaboration,
  },
  {
    id: "criteria-quality",
    label: "품질 장인",
    description: "결과물 품질 평가 6.5점 이상이면 획득해요",
    unit: "점",
    icon: "sparkle",
    colors: ["#a5b4fc", "#4338ca"],
    threshold: 6.5,
    metric: (s) => s.criteria.quality,
  },
];

export interface AchievementProgress {
  value: number;
  pct: number; // 0-100, clamped
  earned: boolean;
}

export function achievementProgress(achievement: Achievement, summary: MyEvaluationSummary): AchievementProgress {
  const value = achievement.metric(summary);
  const pct = Math.max(0, Math.min(100, Math.round((value / achievement.threshold) * 100)));
  return { value, pct, earned: value >= achievement.threshold };
}

// Auto-picks the badge to show next to the tier medal on the profile card
// — no manual "equip" step. Among earned achievements, keeps whichever the
// member has cleared by the widest margin (value/threshold, uncapped so a
// tie at 100% still has a winner).
export function bestEarnedAchievement(summary: MyEvaluationSummary): { achievement: Achievement; progress: AchievementProgress } | null {
  let best: { achievement: Achievement; progress: AchievementProgress; ratio: number } | null = null;
  for (const achievement of ACHIEVEMENTS) {
    const progress = achievementProgress(achievement, summary);
    if (!progress.earned) continue;
    const ratio = progress.value / achievement.threshold;
    if (!best || ratio > best.ratio) best = { achievement, progress, ratio };
  }
  return best ? { achievement: best.achievement, progress: best.progress } : null;
}
