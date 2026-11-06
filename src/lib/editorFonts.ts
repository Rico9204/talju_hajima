// 한글 편집기(HWPX)와 MS 오피스 편집기(OnlyOffice) 공용 폰트 관리 시스템
// 기본 제공 표준/인기 한국어 폰트 + 사용자가 추가한 커스텀 폰트(웹폰트 CDN 지원)

export interface EditorFontItem {
  id: string;
  label: string;
  value: string; // CSS font-family
  webFontUrl?: string; // e.g. Google Fonts or Noonnu CDN URL
  isCustom?: boolean;
}

export const DEFAULT_EDITOR_FONTS: EditorFontItem[] = [
  { id: "batang", label: "바탕체 / 명조", value: "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif" },
  { id: "gothic", label: "고딕 / 돋움", value: "Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif" },
  { id: "pretendard", label: "프리텐다드 (Pretendard)", value: "Pretendard, -apple-system, sans-serif", webFontUrl: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" },
  { id: "nanum-square", label: "나눔스퀘어 네오", value: "'NanumSquareNeo', sans-serif", webFontUrl: "https://hangeul.pstatic.net/hangeul_static/css/nanum-square-neo.css" },
  { id: "maru-buri", label: "마루 부리", value: "'MaruBuri', serif", webFontUrl: "https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css" },
  { id: "score-dream", label: "에스코어 드림 (S-Core)", value: "'S-CoreDream', sans-serif", webFontUrl: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-4Regular.woff" },
  { id: "ridi-batang", label: "리디바탕 (RIDIBatang)", value: "'RIDIBatang', serif", webFontUrl: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/RIDIBatang.woff" },
  { id: "gungsuh", label: "궁서체", value: "'Gungsuh', 'GungsuhChe', serif" },
  { id: "gulim", label: "굴림체", value: "'Gulim', 'GulimChe', sans-serif" },
  { id: "d2coding", label: "D2Coding (코딩체)", value: "'D2Coding', 'Courier New', monospace", webFontUrl: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_three@1.0/D2Coding.woff" },
  { id: "times", label: "Times New Roman", value: "'Times New Roman', serif" },
  { id: "arial", label: "Arial", value: "Arial, sans-serif" },
];

export const POPULAR_FONT_PRESETS: { name: string; family: string; url?: string }[] = [
  { name: "지마켓 산스 (Gmarket Sans)", family: "'GmarketSansMedium', sans-serif", url: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansMedium.woff" },
  { name: "쿠키런체 (CookieRun)", family: "'CookieRun-Regular', sans-serif", url: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2004@1.0/CookieRun-Regular.woff" },
  { name: "메이플스토리체 (Maplestory)", family: "'MaplestoryOTFBold', sans-serif", url: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MaplestoryOTFBold.woff" },
  { name: "조선일보명조 (Chosun)", family: "'ChosunNm', serif", url: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunNm.woff" },
  { name: "빙그레체 (Binggrae)", family: "'Binggrae', sans-serif", url: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/Binggrae.woff" },
  { name: "원스토어 모바일고딕", family: "'ONE-Mobile-POP', sans-serif", url: "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/ONE-Mobile-POP.woff" },
];

const STORAGE_KEY = "collabpeer.custom-editor-fonts";
const DEFAULT_FONT_STORAGE_KEY = "collabpeer.editor-default-font";

export function loadCustomFonts(): EditorFontItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((f) => f && typeof f.label === "string" && typeof f.value === "string");
    }
  } catch {}
  return [];
}

export function saveCustomFonts(fonts: EditorFontItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
    window.dispatchEvent(new Event("editor-fonts-changed"));
  } catch {}
}

export function getAllEditorFonts(): EditorFontItem[] {
  const custom = loadCustomFonts();
  return [...DEFAULT_EDITOR_FONTS, ...custom];
}

export function injectWebFont(url: string, id: string): void {
  if (typeof document === "undefined" || !url) return;
  const elementId = `editor-font-${id}`;
  if (document.getElementById(elementId)) return;

  if (url.endsWith(".woff") || url.endsWith(".woff2") || url.endsWith(".ttf") || url.endsWith(".otf")) {
    const style = document.createElement("style");
    style.id = elementId;
    style.textContent = `@font-face { font-family: '${id}'; src: url('${url}') format('woff'); font-display: swap; }`;
    document.head.appendChild(style);
  } else {
    const link = document.createElement("link");
    link.id = elementId;
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }
}

export function injectAllWebFonts(): void {
  const all = getAllEditorFonts();
  for (const font of all) {
    if (font.webFontUrl) {
      injectWebFont(font.webFontUrl, font.id);
    }
  }
}

export function loadDefaultFontName(): string {
  if (typeof window === "undefined") return "맑은 고딕";
  try {
    return localStorage.getItem(DEFAULT_FONT_STORAGE_KEY) || "맑은 고딕";
  } catch {
    return "맑은 고딕";
  }
}

export function saveDefaultFontName(fontName: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEFAULT_FONT_STORAGE_KEY, fontName);
  } catch {}
}
