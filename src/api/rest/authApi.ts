const baseUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

// 로그인 전 화면(인증·재설정)용. 로그인 쿠키를 주고받지 않는다.
async function request<T>(path: string, body: Record<string, string>) {
  if (!baseUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다.");
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "요청을 처리하지 못했습니다.");
  return data as T;
}

export const confirmEmail = (token: string) => request<void>("/auth/confirm", { token });
export const resetPassword = (token: string, password: string) => request<void>("/auth/password-reset/confirm", { token, password });
// 계정이 있든 없든 같은 응답(가입 여부를 알려 주지 않는다).
export const requestPasswordReset = (email: string) => request<unknown>("/auth/password-reset/request", { email });
export const resendConfirmation = (email: string) => request<unknown>("/auth/resend-confirmation", { email });

// 탈퇴 신청된 계정의 복구 신청(로그인할 수 없으므로 아이디·비밀번호로 확인). 운영자가 승인하면 다시 로그인할 수 있다.
export const requestAccountRecovery = (email: string, password: string) =>
  request<{ withdrawal: import("../types").AccountWithdrawalState }>("/auth/recover-request", { email, password });
