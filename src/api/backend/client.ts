import axios from "axios";

// 실제 NestJS 백엔드(제품개발/backend)를 가리키는 axios 클라이언트.
// VITE_API_BASE_URL이 있으면 그 주소(예: ngrok/실서버 URL + /api)를, 없으면 '/api'(같은 오리진
// 프록시)를 씀 — frontend/src/api/client.ts와 동일한 패턴.
const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

const baseURL = envBaseUrl && envBaseUrl.length > 0 ? envBaseUrl : "/api";

// ngrok 무료 도메인에서만 필요한 헤더. 모든 요청에 무조건 붙이면 CORS preflight(OPTIONS)가
// 매번 한 번 더 오가서(느리고 끊기기 쉬움), 경고 페이지가 없는 다른 터널(Cloudflare 등)에서는
// 쓸데없는 비용이라 ngrok 주소일 때만 붙인다.
export function isNgrokUrl(url: string): boolean {
  try {
    return /\.(ngrok-free\.dev|ngrok-free\.app|ngrok\.app|ngrok\.io)$/.test(new URL(url, window.location.origin).hostname);
  } catch {
    return false;
  }
}

export const apiClient = axios.create({
  baseURL,
  headers: isNgrokUrl(baseURL) ? { "ngrok-skip-browser-warning": "true" } : {},
});

const TOKEN_KEY = "talju_access_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
