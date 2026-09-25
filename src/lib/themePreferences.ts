import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "collabpeer.theme-mode";
const CHANGE_EVENT = "collabpeer:theme-mode";

export function readThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark";
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const isDark = resolveIsDark(mode);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.classList.toggle("dark", isDark);
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
