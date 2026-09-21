// Selectable effect presets for the profile card (Sidebar.tsx). A theme picks
// which effects are on, the border ring style, and optionally its own color
// palette; without a palette the tier colors from TIERS (achievements.ts) are
// used. Themes with `unlockedBy` are rewards: they stay locked in the
// profile editor's picker until that achievement (ACHIEVEMENTS) is earned.
// Add a preset here and it shows up in the picker automatically.

export type RingStyle = "spin" | "hairline" | "pulse" | "comet" | "flicker" | "none";
// "tier" = the original tier-scaled stars/motes; the rest are theme-specific.
export type ParticleKind = "tier" | "leaf" | "bubble" | "heart" | "meteor" | "spark" | "ghost" | "dream";
// What bursts out past the card edge (EdgeAura.tsx); same names as the
// matching particle kinds.
export type AuraKind = Exclude<ParticleKind, "tier" | "dream">;
// Illustrated frame drawn around the card (CardDecoration.tsx).
// Matching frame drawn around the member's round avatar (AvatarFrame.tsx).
export type AvatarFrameKind =
  | "tier" | "sprout" | "bubble" | "heart" | "meteor" | "electric"
  | "planet" | "skull" | "thorn" | "cat" | "rose-white" | "rose-black" | "pinkdog";
export type DecorationKind = "planet" | "skull" | "thorn" | "cat" | "rose-white" | "rose-black" | "pinkdog";

export interface ProfileCardTheme {
  id: string;
  label: string;
  ringStyle: RingStyle;
  // Border-ring spin/cycle duration per tier id; null keeps the ring still.
  ring: Record<string, string | null>;
  // Card glow animation (CSS `animation` value); undefined = tier-based,
  // "" = a steady, unanimated glow in the theme's palette.
  glow?: string;
  particles: ParticleKind | null;
  flame: boolean; // soft flame behind the card (gold/platinum)
  flameColors?: [string, string, string]; // custom flame palette (core, mid, outer); forces the flame on for any tier
  flameScale?: number; // flame warp strength override (bigger = wilder)
  aura?: AuraKind; // effect bursting out past the card edge
  decoration?: DecorationKind; // illustrated frame around the card
  avatarFrame?: AvatarFrameKind; // matching frame around the avatar (profile card + sidebar)
  adminOnly?: boolean; // only offered to (and applied for) admins
  allowedUserIds?: string[]; // only offered to (and applied for) these accounts, admins included only if listed
  shine: boolean; // holographic diagonal sweep (platinum)
  palette?: { c1: string; c2: string }; // overrides the tier colors
  unlockedBy?: string; // achievement id that unlocks this theme
}

const sameForAllTiers = (speed: string | null): Record<string, string | null> => ({
  bronze: speed,
  silver: speed,
  gold: speed,
  platinum: speed,
});

export const PROFILE_CARD_THEMES: ProfileCardTheme[] = [
  {
    id: "profile1",
    label: "프로필1",
    ringStyle: "spin",
    ring: { bronze: null, silver: "6s", gold: "4s", platinum: "2.6s" },
    particles: "tier",
    flame: true,
    shine: true,
    avatarFrame: "tier",
  },
  {
    id: "plain",
    label: "기본",
    ringStyle: "spin",
    ring: sameForAllTiers(null),
    particles: null,
    flame: false,
    shine: false,
  },
  {
    id: "sprout",
    label: "새싹 숲",
    ringStyle: "spin",
    ring: sameForAllTiers("9s"),
    glow: "tier-card-shimmer 3.6s ease-in-out infinite",
    particles: "leaf",
    flame: false,
    aura: "leaf",
    shine: false,
    palette: { c1: "#6ee7a0", c2: "#16a34a" },
    unlockedBy: "projects",
    avatarFrame: "sprout",
  },
  {
    id: "bubble",
    label: "버블",
    ringStyle: "hairline",
    ring: sameForAllTiers("0s"),
    glow: "tier-card-shimmer 3.2s ease-in-out infinite",
    particles: "bubble",
    flame: false,
    aura: "bubble",
    shine: false,
    palette: { c1: "#7dd3fc", c2: "#0284c7" },
    unlockedBy: "collaborators",
    avatarFrame: "bubble",
  },
  {
    id: "heart",
    label: "러브",
    ringStyle: "pulse",
    ring: sameForAllTiers("6s"),
    glow: "tier-card-pulse 1.6s ease-in-out infinite",
    particles: "heart",
    flame: false,
    aura: "heart",
    shine: false,
    palette: { c1: "#f9a8d4", c2: "#db2777" },
    unlockedBy: "trusted",
    avatarFrame: "heart",
  },
  {
    id: "meteor",
    label: "별똥별",
    ringStyle: "comet",
    ring: sameForAllTiers("3.4s"),
    glow: "tier-card-shimmer 3s ease-in-out infinite",
    particles: "meteor",
    flame: false,
    aura: "meteor",
    shine: false,
    palette: { c1: "#fde68a", c2: "#d97706" },
    unlockedBy: "score",
    avatarFrame: "meteor",
  },
  {
    id: "electric",
    label: "전기",
    ringStyle: "flicker",
    ring: sameForAllTiers("2.2s"),
    glow: "tier-card-pulse 1.1s ease-in-out infinite",
    particles: "spark",
    flame: false,
    aura: "spark",
    shine: false,
    palette: { c1: "#fde047", c2: "#ea580c" },
    unlockedBy: "criteria-deadline",
    avatarFrame: "electric",
  },
  {
    id: "deco-planet",
    label: "행성",
    ringStyle: "none",
    ring: sameForAllTiers(null),
    glow: "",
    particles: null,
    flame: false,
    shine: false,
    decoration: "planet",
    palette: { c1: "#e5e7ee", c2: "#8b8fa3" },
    adminOnly: true,
    avatarFrame: "planet",
  },
  {
    id: "deco-skull",
    label: "해골 불꽃",
    ringStyle: "hairline",
    ring: sameForAllTiers("0s"),
    glow: "tier-card-shimmer 3.4s ease-in-out infinite",
    particles: "ghost",
    aura: "ghost",
    flame: true,
    flameColors: ["#e0ffff", "#22d3ee", "#0e7490"],
    flameScale: 34,
    shine: false,
    decoration: "skull",
    palette: { c1: "#67e8f9", c2: "#0891b2" },
    adminOnly: true,
    avatarFrame: "skull",
  },
  {
    id: "deco-thorn",
    label: "가시덩굴",
    ringStyle: "none",
    ring: sameForAllTiers(null),
    glow: "",
    particles: null,
    flame: false,
    shine: false,
    decoration: "thorn",
    palette: { c1: "#86a6b3", c2: "#3c4f59" },
    adminOnly: true,
    avatarFrame: "thorn",
  },
  {
    id: "deco-cat",
    label: "고양이",
    ringStyle: "none",
    ring: sameForAllTiers(null),
    glow: "",
    particles: null,
    flame: false,
    shine: false,
    decoration: "cat",
    palette: { c1: "#fbcfe8", c2: "#ec8fa8" },
    adminOnly: true,
    avatarFrame: "cat",
  },
  {
    id: "deco-rose-white",
    label: "흰 장미",
    ringStyle: "none",
    ring: sameForAllTiers(null),
    glow: "",
    particles: null,
    flame: false,
    shine: false,
    decoration: "rose-white",
    palette: { c1: "#f0e6ff", c2: "#b9a7dc" },
    adminOnly: true,
    avatarFrame: "rose-white",
  },
  {
    id: "deco-rose-black",
    label: "검은 장미",
    ringStyle: "none",
    ring: sameForAllTiers(null),
    glow: "",
    particles: null,
    flame: false,
    shine: false,
    decoration: "rose-black",
    palette: { c1: "#8a8a99", c2: "#2c2c34" },
    adminOnly: true,
    avatarFrame: "rose-black",
  },
  {
    id: "deco-pinkdog",
    label: "우핑강",
    ringStyle: "hairline",
    ring: sameForAllTiers("0s"),
    glow: "tier-card-shimmer 3.8s ease-in-out infinite",
    particles: "dream",
    flame: false,
    shine: false,
    decoration: "pinkdog",
    avatarFrame: "pinkdog",
    palette: { c1: "#fbcfe8", c2: "#f472b6" },
    // 우핑강 is DORO's (황성환) personal frame — not offered to other accounts, admins included.
    allowedUserIds: ["d162ba01-9ef9-4ec5-9640-d4983e025499"],
  },
];

export const DEFAULT_PROFILE_THEME_ID = "profile1";

// Whether this account may pick/apply the theme. Reward-theme locks
// (`unlockedBy`) are checked separately against earned achievements.
// Client-side only: the choice lives in localStorage, so this hides the theme
// in the UI and stops it rendering for others, but isn't a security boundary.
export function canUseTheme(theme: ProfileCardTheme, viewer: { isAdmin: boolean; userId: string | null | undefined }): boolean {
  if (theme.allowedUserIds) return !!viewer.userId && theme.allowedUserIds.includes(viewer.userId);
  if (theme.adminOnly) return viewer.isAdmin;
  return true;
}

// Dev-server-only preview: with localStorage "previewAllThemes" = "1", every
// theme is selectable — admin-only frames and still-locked reward themes —
// without changing the account's real admin flag or achievements. Ignored in
// production builds. Toggle it from the browser console:
//   localStorage.setItem("previewAllThemes", "1")   // on
//   localStorage.removeItem("previewAllThemes")     // off
export function previewAllThemes(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem("previewAllThemes") === "1";
  } catch {
    return false;
  }
}
const STORAGE_KEY = "profileCardTheme";

export function getProfileCardTheme(id: string | null | undefined): ProfileCardTheme {
  return PROFILE_CARD_THEMES.find((theme) => theme.id === id) ?? PROFILE_CARD_THEMES[0];
}

// Per-viewer choice kept in localStorage; storage can throw (private mode,
// blocked site data), so fall back to the default preset.
export function loadProfileThemeId(): string {
  try {
    return getProfileCardTheme(localStorage.getItem(STORAGE_KEY)).id;
  } catch {
    return DEFAULT_PROFILE_THEME_ID;
  }
}

export function saveProfileThemeId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Selection still applies for this session.
  }
}
