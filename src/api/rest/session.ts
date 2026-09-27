import { ngrokHeaders } from "./ngrok.ts";

// 로그인 상태. 액세스 토큰(1시간)은 이 탭의 메모리에만 두고, 리프레시 토큰은 서버가 httpOnly 쿠키로 들고 있어
// 화면의 스크립트는 볼 수 없다(XSS로 훔쳐 가도 1시간짜리 액세스 토큰뿐). 새로 고침하면 쿠키로 다시 받는다.
export type SessionUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
export type StoredSession = { user: SessionUser; accessToken: string };

export const sessionChangedEvent = "talju-session-changed";
const baseUrl = String(import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "");
let current: StoredSession | null = null;

try { localStorage.removeItem("talju-server-session"); } catch { /* 예전 버전이 저장해 둔 토큰은 지운다 */ }

export function readSession(): StoredSession | null { return current; }
export function writeSession(session: StoredSession | null) {
  current = session;
  window.dispatchEvent(new Event(sessionChangedEvent));
}

// 다른 탭에 로그인·로그아웃을 알린다. 쿠키는 탭끼리 같이 쓰므로 로그인한 탭이 알리면 나머지는 refresh로 따라온다.
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("talju-session") : null;
(channel as { unref?: () => void } | null)?.unref?.(); // Node(테스트)에서 프로세스가 끝나지 않는 것 방지. 브라우저에는 없다.
export function announce(kind: "login" | "logout") { channel?.postMessage(kind); }
if (channel) channel.onmessage = (event) => {
  if (event.data === "logout") writeSession(null);
  if (event.data === "login" && !current) void refreshSession().catch(() => {});
};

// 액세스 토큰이 1분 안에 끝나면 미리 갱신한다.
function expiresSoon(token: string) {
  try { const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return exp * 1000 - Date.now() < 60_000; } catch { return true; }
}

// 리프레시 토큰은 1회용이라 여러 요청·탭이 동시에 갱신하면 하나만 성공한다 → 탭 사이에서도 한 번에 하나만 갱신하고,
// 기다린 쪽은 (같은 탭이면) 새 토큰을 그대로 쓰거나 (다른 탭이면) 새로 바뀐 쿠키로 갱신한다.
function withRefreshLock<T>(run: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request("talju-session-refresh", run) as Promise<T> : run();
}

// 쿠키로 새 액세스 토큰을 받는다(새로 고침 직후 로그인 복원에도 쓴다). 로그인이 끝났으면(401) null, 네트워크 오류는 그대로 던진다.
export function refreshSession(staleToken?: string): Promise<string | null> {
  return withRefreshLock(async () => {
    if (current && current.accessToken !== staleToken && !expiresSoon(current.accessToken)) return current.accessToken;
    const response = await fetch(`${baseUrl}/auth/refresh`, { method: "POST", credentials: "include", headers: ngrokHeaders(baseUrl) });
    if (response.status === 401) { if (current) writeSession(null); return null; }
    if (!response.ok) throw new Error("로그인을 갱신하지 못했습니다.");
    const next = await response.json() as StoredSession;
    writeSession(next);
    return next.accessToken;
  });
}

// 요청에 쓸 액세스 토큰(로그인 전이면 null). forceRefresh는 서버가 401을 돌려준 토큰을 바꿀 때.
export async function accessToken(forceRefresh = false): Promise<string | null> {
  if (!current) return null;
  if (forceRefresh) return refreshSession(current.accessToken);
  return expiresSoon(current.accessToken) ? refreshSession() : current.accessToken;
}
