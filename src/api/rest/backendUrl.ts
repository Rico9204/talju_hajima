// API 서버의 출처(경로 없는 주소). WebSocket(/realtime)과 공개 파일(/storage/...)은 이 주소로 직접 간다.
// VITE_API_URL이 상대 주소(/api, Vercel이 ngrok으로 전달)면 Vercel은 WebSocket을 전달하지 못하므로 VITE_BACKEND_URL(ngrok 주소)이 필요하다.
export function backendOrigin(apiUrl: string = String(import.meta.env?.VITE_API_URL ?? ""), backendUrl: string = String(import.meta.env?.VITE_BACKEND_URL ?? "")): string {
  const explicit = backendUrl.replace(/\/+$/, "");
  if (explicit) return explicit;
  return apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
}

export function realtimeUrl(apiUrl?: string, backendUrl?: string): string {
  return backendOrigin(apiUrl, backendUrl).replace(/^http/, "ws") + "/realtime";
}
