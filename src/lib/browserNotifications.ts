// OS-level notifications (Notification API) so a new task/일정/파일/채팅이
// still surfaces while the user is on a different browser tab or app — the
// in-app bell in Sidebar.tsx only helps while this tab is the visible one.
const STORAGE_KEY = "collabpeer.browser-notifications-enabled";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : "denied";
}

// Must be called from a user gesture (a click handler) — browsers ignore or
// reject a permission prompt triggered from anywhere else.
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  const result = await Notification.requestPermission();
  if (result === "granted") setBrowserNotificationsEnabled(true);
  return result;
}

export function isBrowserNotificationsEnabled(): boolean {
  if (getNotificationPermission() !== "granted") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBrowserNotificationsEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private browsing; the in-memory
    // Notification.permission check still gates notify() either way.
  }
}

// Fires only while this tab isn't the one the user is looking at — when it's
// visible and focused, the in-app bell (Sidebar.tsx) already covers it, and a
// system popup on top would just be a redundant interruption.
export function notifyIfAway(title: string, body: string, onClick?: () => void) {
  if (!isBrowserNotificationsEnabled()) return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, tag: "collabpeer-unread" });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // New Notification() can throw in contexts that require a service
    // worker (some mobile browsers) — a missed popup isn't worth crashing over.
  }
}
