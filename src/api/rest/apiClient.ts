import { ngrokHeaders } from "./ngrok.ts";

// forceRefresh: 서버가 401을 돌려준 토큰 대신 새 토큰을 받는다.
export type AccessToken = (forceRefresh?: boolean) => Promise<string | null>;

export class ApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: AccessToken;
  constructor(baseUrl: string, accessToken: AccessToken) { this.baseUrl = baseUrl; this.accessToken = accessToken; }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(path, init);
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || `요청을 처리하지 못했습니다(HTTP ${response.status}).`);
    return body as T;
  }

  async download(path: string): Promise<Blob> {
    const response = await this.send(path, {});
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || "파일을 내려받지 못했습니다.");
    }
    return response.blob();
  }

  // 토큰이 만료돼 401이 오면 한 번 갱신해서 다시 보낸다.
  private async send(path: string, init: RequestInit, retried = false): Promise<Response> {
    if (!this.baseUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다.");
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(ngrokHeaders(this.baseUrl))) headers.set(name, value);
    const token = await this.accessToken(retried);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (response.status === 401 && token && !retried) return this.send(path, init, true);
    return response;
  }
}
