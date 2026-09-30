import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ngrokHeaders } from "../api/rest/ngrok";
import { accessToken, announce, readSession, refreshSession, sessionChangedEvent, writeSession, type SessionUser, type StoredSession } from "../api/rest/session";

export type AuthUser = SessionUser;
export type AuthSession = StoredSession;
interface AuthContextValue { user: AuthUser | null; session: AuthSession | null; loading: boolean; signIn: (email: string, password: string) => Promise<{ error: string | null }>; signUp: (email: string, password: string, displayName: string, signupType?: "admin") => Promise<{ error: string | null; signedIn: boolean }>; signOut: () => Promise<void>; updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>; }
const AuthContext = createContext<AuthContextValue | null>(null);
const serverUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
// credentials: 로그인·로그아웃·비밀번호 변경 응답이 리프레시 토큰 쿠키(httpOnly)를 심고 지운다.
async function serverRequest<T>(path: string, init: RequestInit = {}, token?: string | null) { if (!serverUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다."); const headers = new Headers(init.headers); for (const [name, value] of Object.entries(ngrokHeaders(serverUrl))) headers.set(name, value); if (token) headers.set("Authorization", `Bearer ${token}`); if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json"); const response = await fetch(`${serverUrl}${path}`, { ...init, headers, credentials: "include" }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.message || `요청을 처리하지 못했습니다(HTTP ${response.status}).`); return body as T; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession); const [loading, setLoading] = useState(true);
  useEffect(() => {
    // 토큰 갱신·로그아웃(다른 탭 포함)은 session.ts가 알린다.
    const sync = () => setSession(readSession());
    window.addEventListener(sessionChangedEvent, sync);
    // 새로 고침: 쿠키로 로그인 상태를 되찾는다. 서버에 닿지 않으면 로그아웃된 화면으로 시작한다.
    void refreshSession().catch(() => null).finally(() => { sync(); setLoading(false); });
    return () => window.removeEventListener(sessionChangedEvent, sync);
  }, []);
  async function signIn(email: string, password: string) { try { writeSession(await serverRequest<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })); announce("login"); return { error: null }; } catch (error) { return { error: error instanceof Error ? error.message : "로그인하지 못했습니다." }; } }
  async function signUp(email: string, password: string, displayName: string, signupType?: "admin") { try { await serverRequest("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, displayName, ...(signupType === "admin" ? { signupType } : {}) }) }); return { error: null, signedIn: false }; } catch (error) { return { error: error instanceof Error ? error.message : "가입하지 못했습니다.", signedIn: false }; } }
  async function signOut() { writeSession(null); announce("logout"); await serverRequest("/auth/logout", { method: "POST" }).catch(() => {}); }
  async function updatePassword(currentPassword: string, newPassword: string) { try { const token = await accessToken(); const current = readSession(); if (!token || !current) throw new Error("로그인이 필요합니다."); const result = await serverRequest<{ accessToken: string }>("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }, token); writeSession({ ...current, accessToken: result.accessToken }); return { error: null }; } catch (error) { return { error: error instanceof Error ? error.message : "비밀번호를 변경하지 못했습니다." }; } }
  return <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signIn, signUp, signOut, updatePassword }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error("useAuth must be used within an AuthProvider"); return ctx; }
