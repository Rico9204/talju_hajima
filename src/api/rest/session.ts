import { setAccessToken, clearAccessToken } from "../backend/client";

// 로그인 상태. backend/(NestJS)는 쿠키 기반 리프레시 토큰을 지원하지 않는(무상태 JWT,
// 24시간 만료) 단순한 구조라, 토큰을 localStorage에 직접 저장해 새로고침 후에도 복원한다
// (XSS에 더 취약하지만, 이 백엔드가 지원하는 유일한 방식). nestDataRepository가 쓰는
// apiClient(client.ts)는 자기만의 localStorage 토큰 저장소를 따로 갖고 있어서, 여기서
// 세션을 쓸 때마다 그쪽에도 같이 반영해야 실제 데이터 요청에 Authorization 헤더가 붙는다.
export type SessionUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
export type StoredSession = { user: SessionUser; accessToken: string };

const STORAGE_KEY = "talju_session";

export const sessionChangedEvent = "talju-session-changed";

function loadFromStorage(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || isExpired(parsed.accessToken)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

let current: StoredSession | null = loadFromStorage();
if (current) setAccessToken(current.accessToken);

try { localStorage.removeItem("talju-server-session"); } catch { /* 예전 버전이 저장해 둔 토큰은 지운다 */ }

export function readSession(): StoredSession | null { return current; }
export function writeSession(session: StoredSession | null) {
  current = session;
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setAccessToken(session.accessToken);
  } else {
    localStorage.removeItem(STORAGE_KEY);
    clearAccessToken();
  }
  window.dispatchEvent(new Event(sessionChangedEvent));
}

// 다른 탭에 로그인·로그아웃을 알린다. localStorage 변경 자체도 storage 이벤트로 다른 탭에
// 전파되지만, 같은 값으로 다시 써도 이벤트가 안 오는 등 미묘한 차이가 있어 명시적으로 알린다.
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("talju-session") : null;
(channel as { unref?: () => void } | null)?.unref?.(); // Node(테스트)에서 프로세스가 끝나지 않는 것 방지. 브라우저에는 없다.
export function announce(kind: "login" | "logout") { channel?.postMessage(kind); }
if (channel) channel.onmessage = (event) => {
  if (event.data === "logout") writeSession(null);
  if (event.data === "login") { const next = loadFromStorage(); if (next) writeSession(next); }
};

// 리프레시 토큰이 없으므로 "갱신"은 없다 — 만료됐으면 로그아웃 상태로 돌아간다(다시 로그인 필요).
export async function refreshSession(): Promise<string | null> {
  const stored = loadFromStorage();
  if (!stored) {
    if (current) writeSession(null);
    return null;
  }
  if (current?.accessToken !== stored.accessToken) writeSession(stored);
  return stored.accessToken;
}

// 요청에 쓸 액세스 토큰(로그인 전이거나 만료됐으면 null).
export async function accessToken(): Promise<string | null> {
  if (!current || isExpired(current.accessToken)) {
    if (current) writeSession(null);
    return null;
  }
  return current.accessToken;
}
