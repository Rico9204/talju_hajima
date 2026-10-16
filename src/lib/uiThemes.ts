// UI theme presets: the account's background + card translucency + backdrop
// blur bundled into one switchable look. They map 1:1 onto the existing
// per-account profile columns (background_color / background_gradient /
// glass_opacity / glass_blur), so applying one needs no new storage — it just
// fills those four values (and drops any uploaded background photo).

export interface BackgroundPreset {
  label: string;
  value: string;
  kind: "color" | "gradient";
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { label: "인디고 미스트", value: "#e8ecfb", kind: "color" },
  { label: "웜 샌드", value: "#f6f1e7", kind: "color" },
  { label: "민트", value: "#e4f7f0", kind: "color" },
  { label: "선셋", value: "linear-gradient(135deg, #ff9a8b, #ff6a88, #ff99ac)", kind: "gradient" },
  { label: "오로라", value: "linear-gradient(135deg, #43cea2, #185a9d)", kind: "gradient" },
  { label: "미드나잇", value: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", kind: "gradient" },
  { label: "라벤더", value: "linear-gradient(135deg, #a18cd1, #fbc2eb)", kind: "gradient" },
  { label: "피치", value: "linear-gradient(135deg, #ffecd2, #fcb69f)", kind: "gradient" },
];

const backgroundValue = (label: string) => BACKGROUND_PRESETS.find((preset) => preset.label === label)!.value;

export interface UiTheme {
  id: string;
  label: string;
  // null = the app's default background (--background), i.e. no color/gradient override.
  background: { kind: "color" | "gradient"; value: string } | null;
  glassOpacity: number; // card opacity, percent
  glassBlur: number; // backdrop blur, px
  // A photo background (already uploaded; its URL). When set it wins over `background`.
  imageUrl?: string | null;
  swatch: string; // CSS background for the picker dot
}

export const UI_THEMES: UiTheme[] = [
  // The design before the glass/background customization existed: the plain
  // #edf0fb background with fully opaque white cards and no blur.
  { id: "classic", label: "기존 UI", background: null, glassOpacity: 100, glassBlur: 0, swatch: "#edf0fb" },
  { id: "soft-glass", label: "소프트 글라스", background: { kind: "color", value: backgroundValue("인디고 미스트") }, glassOpacity: 60, glassBlur: 8, swatch: backgroundValue("인디고 미스트") },
  { id: "sunset-glass", label: "선셋 글라스", background: { kind: "gradient", value: backgroundValue("선셋") }, glassOpacity: 46, glassBlur: 10, swatch: backgroundValue("선셋") },
  { id: "lavender-glass", label: "라벤더 글라스", background: { kind: "gradient", value: backgroundValue("라벤더") }, glassOpacity: 46, glassBlur: 10, swatch: backgroundValue("라벤더") },
  { id: "peach-glass", label: "피치 글라스", background: { kind: "gradient", value: backgroundValue("피치") }, glassOpacity: 50, glassBlur: 8, swatch: backgroundValue("피치") },
];

export interface UiThemeState {
  backgroundColor: string | null;
  backgroundGradient: string | null;
  backgroundImageUrl: string | null; // an already-uploaded photo in effect
  hasLocalImage: boolean; // a just-picked photo that isn't uploaded yet (no URL to keep)
  glassOpacity: number;
  glassBlur: number;
}

// A preset the member saved from their own settings. Like the card-effect
// theme choice it's kept per-browser (localStorage), so no DB column is needed.
// A photo background is stored as its public URL: uploads get unique
// timestamped paths and old files are never deleted, so the URL stays valid
// after switching away from the photo.
export interface CustomUiTheme extends UiTheme {
  custom: true;
}

export const MAX_CUSTOM_UI_THEMES = 8;
const CUSTOM_STORAGE_KEY = "customUiThemes";

// The URL ends up inside a CSS url(...) — only accept plain http(s) addresses.
const isSafeImageUrl = (value: unknown): value is string => typeof value === "string" && /^https?:\/\/[^\s"'()<>\\]+$/.test(value);

const swatchFor = (background: UiTheme["background"], imageUrl: string | null | undefined) =>
  imageUrl ? `url("${imageUrl}") center / cover` : background?.value ?? "#edf0fb";

export function loadCustomUiThemes(): CustomUiTheme[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) =>
      !!t && typeof t.id === "string" && typeof t.label === "string" &&
      typeof t.glassOpacity === "number" && typeof t.glassBlur === "number" &&
      (t.imageUrl == null || isSafeImageUrl(t.imageUrl)) &&
      (t.background === null || (typeof t.background?.value === "string" && (t.background.kind === "color" || t.background.kind === "gradient"))))
      .map((t): CustomUiTheme => ({
        id: t.id, label: t.label, custom: true, background: t.background, glassOpacity: t.glassOpacity, glassBlur: t.glassBlur,
        imageUrl: t.imageUrl ?? null, swatch: swatchFor(t.background, t.imageUrl),
      }))
      .slice(0, MAX_CUSTOM_UI_THEMES);
  } catch {
    return [];
  }
}

export function saveCustomUiThemes(themes: CustomUiTheme[]) {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // storage blocked (private mode etc.) — the preset just won't persist
  }
}

export function makeCustomUiTheme(label: string, state: UiThemeState): CustomUiTheme {
  const imageUrl = isSafeImageUrl(state.backgroundImageUrl) ? state.backgroundImageUrl : null;
  // With a photo the flat color/gradient underneath is never shown, so it isn't kept.
  const background = imageUrl ? null
    : state.backgroundGradient
      ? { kind: "gradient" as const, value: state.backgroundGradient }
      : state.backgroundColor
        ? { kind: "color" as const, value: state.backgroundColor }
        : null;
  return {
    id: `custom-${Date.now()}`,
    custom: true,
    label,
    background,
    glassOpacity: state.glassOpacity,
    glassBlur: state.glassBlur,
    imageUrl,
    swatch: swatchFor(background, imageUrl),
  };
}

// The preset the given settings exactly match, or undefined for a custom mix
// (tweaked sliders, or a photo that isn't uploaded yet).
export function matchUiTheme(state: UiThemeState, themes: UiTheme[] = UI_THEMES): UiTheme | undefined {
  if (state.hasLocalImage) return undefined;
  return themes.find((theme) => {
    if (theme.glassOpacity !== state.glassOpacity || theme.glassBlur !== state.glassBlur) return false;
    if (theme.imageUrl || state.backgroundImageUrl) return (theme.imageUrl ?? null) === state.backgroundImageUrl;
    return (theme.background?.kind === "color" ? theme.background.value : null) === state.backgroundColor &&
      (theme.background?.kind === "gradient" ? theme.background.value : null) === state.backgroundGradient;
  });
}
