import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiClient, clearAccessToken, getAccessToken, setAccessToken } from "../api/backend/client";

// Supabase의 User/Session을 그대로 흉내내는 대신, 이 앱이 실제로 쓰는 필드(id/email/name,
// accessToken)만 담은 최소 형태. 나머지 컴포넌트는 `session.user.id`/`session.user.email`만
// 참조하므로 이 형태로도 100% 호환된다.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<{ id: string; email: string; name: string }>("/users/me");
  return { id: data.id, email: data.email, name: data.name };
}

function errorMessage(err: unknown): string {
  const anyErr = err as { response?: { data?: { message?: string | string[] } } };
  const msg = anyErr.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  return "요청을 처리하지 못했습니다.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  // 새로고침 후에도 로그인 유지 — 저장된 토큰이 있으면 /users/me로 유효성 확인
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((user) => setSession({ user, accessToken: token }))
      .catch(() => clearAccessToken())
      .finally(() => setLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    try {
      const { data } = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password });
      setAccessToken(data.accessToken);
      const user = await fetchMe();
      setSession({ user, accessToken: data.accessToken });
      return { error: null };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }

  async function signUp(email: string, password: string, displayName: string) {
    try {
      const { data } = await apiClient.post<{ accessToken: string }>("/auth/register", {
        email,
        password,
        name: displayName,
      });
      setAccessToken(data.accessToken);
      const user = await fetchMe();
      setSession({ user, accessToken: data.accessToken });
      return { error: null };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }

  async function signOut() {
    clearAccessToken();
    setSession(null);
  }

  // 백엔드에 비밀번호 변경 엔드포인트가 아직 없음 — 정직하게 실패로 알림 (조용히 성공한 척하지 않음)
  async function updatePassword(_newPassword: string) {
    return { error: "이 서버 백엔드는 아직 비밀번호 변경을 지원하지 않습니다." };
  }

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signIn, signUp, signOut, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
