import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    opts?: { isAdmin?: boolean; org?: string }
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Account-wide, not project-scoped (unlike ProjectContext's isLeader) — see
  // profiles.is_admin in supabase/schema.sql. Re-fetched whenever the signed
  // in user changes.
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(data?.is_admin === true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, displayName: string, opts?: { isAdmin?: boolean; org?: string }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // handle_new_user() (see supabase/schema.sql) reads is_admin/org back
      // out of this on the server side to set profiles.is_admin/org.
      options: { data: { display_name: displayName, is_admin: opts?.isAdmin ?? false, org: opts?.org ?? "" } },
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
      return { error: null };
    }
    // Pad a fresh signup's response to roughly match the duplicate-email
    // branch's extra round trip above, so response timing alone can't be
    // used to tell the two cases apart.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, isAdmin, signIn, signUp, signOut, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
