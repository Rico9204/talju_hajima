const baseUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, body: Record<string, string>) {
  if (!baseUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다.");
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { ...ngrokHeaders(baseUrl), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "요청을 처리하지 못했습니다.");
  return data as T;
}

export const confirmEmail = (token: string) => request<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }>("/auth/confirm", { token });
export const resetPassword = (token: string, password: string) => request<void>("/auth/password-reset/confirm", { token, password });
import { ngrokHeaders } from "./ngrok";
