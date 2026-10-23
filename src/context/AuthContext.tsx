import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ngrokHeaders } from "../api/rest/ngrok";
import { accessToken, announce, readSession, refreshSession, sessionChangedEvent, writeSession, type SessionUser, type StoredSession } from "../api/rest/session";
import { disablePush } from "../lib/webPush";

export type AuthUser = SessionUser;
export type AuthSession = StoredSession;
interface AuthContextValue { user: AuthUser | null; session: AuthSession | null; loading: boolean; signIn: (email: string, password: string) => Promise<{ error: string | null }>; signUp: (email: string, password: string, displayName: string, signupType?: "admin") => Promise<{ error: string | null; signedIn: boolean }>; signOut: () => Promise<void>; updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>; }
const AuthContext = createContext<AuthContextValue | null>(null);
const serverUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
// backend/(NestJS)는 무상태 JWT만 쓰고 쿠키 기반 리프레시 토큰이 없다 — credentials 없이
// Authorization 헤더로만 인증한다.
async function serverRequest<T>(path: string, init: RequestInit = {}, token?: string | null) { if (!serverUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다."); const headers = new Headers(init.headers); for (const [name, value] of Object.entries(ngrokHeaders(serverUrl))) headers.set(name, value); if (token) headers.set("Authorization", `Bearer ${token}`); if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json"); const response = await fetch(`${serverUrl}${path}`, { ...init, headers }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.message || `요청을 처리하지 못했습니다(HTTP ${response.status}).`); return body as T; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession); const [loading, setLoading] = useState(true);
  useEffect(() => {
    // 토큰 갱신·로그아웃(다른 탭 포함)은 session.ts가 알린다.
    const sync = () => setSession(readSession());
    window.addEventListener(sessionChangedEvent, sync);
    // 새로 고침: localStorage에 저장된(아직 안 만료된) 토큰으로 로그인 상태를 되찾는다.
    void refreshSession().catch(() => null).finally(() => { sync(); setLoading(false); });
    return () => window.removeEventListener(sessionChangedEvent, sync);
  }, []);
  // backend/는 회원가입 응답에 이메일 인증 단계 없이 바로 accessToken을 돌려준다(signedIn: true).
  // signupType("admin")은 이 백엔드의 가입 흐름에 아직 없어서 전달하지 않는다.
  async function signIn(email: string, password: string) { try { writeSession(await serverRequest<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })); announce("login"); return { error: null }; } catch (error) { return { error: error instanceof Error ? error.message : "로그인하지 못했습니다." }; } }
  async function signUp(email: string, password: string, displayName: string, _signupType?: "admin") { try { writeSession(await serverRequest<AuthSession>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name: displayName }) })); announce("login"); return { error: null, signedIn: true }; } catch (error) { return { error: error instanceof Error ? error.message : "가입하지 못했습니다.", signedIn: false }; } }
  // 무상태 JWT라 서버에 알릴 것이 없다 — 로컬 세션만 지우면 끝.
  async function signOut() { await disablePush().catch(() => {}); /* 로그아웃한 뒤에도 이 기기로 내 알림이 오지 않게 구독을 먼저 지운다(아직 로그인 상태일 때) */ writeSession(null); announce("logout"); }
  async function updatePassword(currentPassword: string, newPassword: string) { try { const token = await accessToken(); const current = readSession(); if (!token || !current) throw new Error("로그인이 필요합니다."); writeSession(await serverRequest<AuthSession>("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }, token)); return { error: null }; } catch (error) { return { error: error instanceof Error ? error.message : "비밀번호를 변경하지 못했습니다." }; } }
  return <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signIn, signUp, signOut, updatePassword }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error("useAuth must be used within an AuthProvider"); return ctx; }
