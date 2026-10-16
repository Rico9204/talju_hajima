import { useEffect, useState } from "react";

export type PerformanceMode = "default" | "reduced-motion" | "performance";

const STORAGE_KEY = "collabpeer.performance-mode";
const CHANGE_EVENT = "collabpeer:performance-mode";

function readPerformanceMode(): PerformanceMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "reduced-motion" || value === "performance" ? value : "default";
  } catch {
    return "default";
  }
}

function applyPerformanceMode(mode: PerformanceMode) {
  document.documentElement.dataset.performanceMode = mode;
}

export function savePerformanceMode(mode: PerformanceMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable in private browsing; keep the live setting.
  }
  applyPerformanceMode(mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePerformanceMode() {
  const [mode, setMode] = useState<PerformanceMode>(readPerformanceMode);

  useEffect(() => {
    applyPerformanceMode(mode);
  }, [mode]);

  useEffect(() => {
    const update = () => setMode(readPerformanceMode());
    window.addEventListener(CHANGE_EVENT, update);
    return () => window.removeEventListener(CHANGE_EVENT, update);
  }, []);

  return [mode, savePerformanceMode] as const;
}
