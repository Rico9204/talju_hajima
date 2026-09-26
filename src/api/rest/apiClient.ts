import { ngrokHeaders } from "./ngrok";

export type AccessToken = () => string | null;

export class ApiClient {
  constructor(private readonly baseUrl: string, private readonly accessToken: AccessToken) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다.");
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(ngrokHeaders(this.baseUrl))) headers.set(name, value);
    const token = this.accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || "요청을 처리하지 못했습니다.");
    return body as T;
  }

  async download(path: string): Promise<Blob> {
    if (!this.baseUrl) throw new Error("자체 서버 주소가 설정되지 않았습니다.");
    const headers = new Headers();
    for (const [name, value] of Object.entries(ngrokHeaders(this.baseUrl))) headers.set(name, value);
    const token = this.accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || "파일을 내려받지 못했습니다.");
    }
    return response.blob();
  }
}
