import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string, signupType?: "admin") => Promise<{ error: string | null; signedIn: boolean }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, displayName: string, signupType?: "admin") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // signup_type은 가입 후 어느 화면으로 안내할지 정하는 표시일 뿐이다. 관리자 권한은 이 값과 무관하게 운영자 승인으로만 생긴다.
      options: { data: { display_name: displayName, ...(signupType === "admin" ? { signup_type: "admin" } : {}) } },
    });
    const alreadyRegistered =
      (error && /already registered|already exists/i.test(error.message)) ||
      // With email confirmation on, Supabase doesn't error on a duplicate
      // email — it returns a user with no identities instead. That's the
      // only signal available to catch this case.
      (!error && !!data.user && data.user.identities?.length === 0);
    if (alreadyRegistered) {
      // Don't tell the caller this email already has an account (that's an
      // enumeration vector) — instead notify whoever actually owns it via a
      // password-reset email, which Supabase also won't confirm/deny the
      // existence of. The UI shows the same "check your email" screen either
      // way. Awaited (and its error logged, not surfaced) so real send
      // failures — e.g. hitting Supabase's email rate limit — are still
      // visible somewhere instead of silently vanishing.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) console.error("resetPasswordForEmail failed for duplicate signup:", resetError.message);
      return { error: null, signedIn: false };
    }
    // Pad a fresh signup's response to roughly match the duplicate-email
    // branch's extra round trip above, so response timing alone can't be
    // used to tell the two cases apart.
    await new Promise((resolve) => setTimeout(resolve, 400));
    // 이메일 인증을 켜 두면 세션이 없고, 꺼 두면 가입과 동시에 로그인된다.
    return { error: error?.message ?? null, signedIn: !error && !!data.session };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
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
