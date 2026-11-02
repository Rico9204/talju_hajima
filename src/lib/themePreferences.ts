import { useEffect, useState } from "react";

// adaptive(적응형): 계정 배경이 어두우면 다크, 밝으면 라이트 모드를 자동으로 쓴다(반투명도·블러는 건드리지 않는다).
export type ThemeMode = "light" | "dark" | "adaptive";

const STORAGE_KEY = "collabpeer.theme-mode";
const ADAPTIVE_KEY = "collabpeer.adaptive-dark"; // 배경이 어두운지(배경을 잰 결과)
const GLASS_KEY = "collabpeer.bg-dark-glass"; // 어두운 배경이 비쳐 반투명 창 안 글자도 밝게 써야 하는지
const CHANGE_EVENT = "collabpeer:theme-mode";

export function readThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "adaptive" ? value : "light";
  } catch {
    return "light";
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "adaptive" && readFlag(ADAPTIVE_KEY));
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const isDark = resolveIsDark(mode);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.classList.toggle("dark", isDark);
  // 라이트 모드인데 배경이 어두우면, 배경 위에 바로 놓인 글자(메뉴 등)만 밝게 쓴다(index.css의 [data-bg-dark]).
  const lightOnDark = mode === "light" && readFlag(ADAPTIVE_KEY);
  if (lightOnDark) document.documentElement.dataset.bgDark = "true";
  else delete document.documentElement.dataset.bgDark;
  if (lightOnDark && readFlag(GLASS_KEY)) document.documentElement.dataset.bgDarkGlass = "true";
  else delete document.documentElement.dataset.bgDarkGlass;
}

export function saveThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable in private browsing
  }
  applyThemeMode(mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// 배경을 잰 결과를 저장한다. 값이 바뀔 때만 테마를 다시 계산한다.
export function saveAdaptiveDark(dark: boolean, glassLight = false) {
  if (readFlag(ADAPTIVE_KEY) === dark && readFlag(GLASS_KEY) === glassLight) return;
  try {
    localStorage.setItem(ADAPTIVE_KEY, dark ? "1" : "0");
    localStorage.setItem(GLASS_KEY, glassLight ? "1" : "0");
  } catch {
    // Storage may be unavailable in private browsing
  }
  applyThemeMode(readThemeMode());
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Initial theme apply on import to prevent flash
if (typeof window !== "undefined") {
  applyThemeMode(readThemeMode());
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);
  const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark(readThemeMode()));

  useEffect(() => {
    applyThemeMode(mode);
    setIsDark(resolveIsDark(mode));
  }, [mode]);

  useEffect(() => {
    const update = () => {
      const nextMode = readThemeMode();
      setMode(nextMode);
      setIsDark(resolveIsDark(nextMode));
    };
    window.addEventListener(CHANGE_EVENT, update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
    };
  }, []);

  return [mode, saveThemeMode, isDark] as const;
}
