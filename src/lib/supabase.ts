import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const SUPABASE_SETUP_MESSAGE =
  "Supabase가 설정되지 않았습니다. .env.example을 .env.local로 복사하고 " +
  "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 Supabase 프로젝트의 " +
  "Settings > API 값으로 채운 뒤 dev 서버를 재시작하세요.";

// Fall back to placeholder values when unconfigured so `createClient` doesn't
// throw at import time — callers should check `isSupabaseConfigured` before
// issuing real requests (see ProjectContext).
export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key");
