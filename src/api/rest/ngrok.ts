// ngrok 무료 도메인은 브라우저 요청에 경고 페이지를 먼저 보여 준다. 이 헤더가 있으면 건너뛴다.
// 상대 주소(/api)는 Vercel이 ngrok으로 전달하므로(vercel.json) 같은 헤더를 붙인다. 브라우저가 보낸 헤더는 그대로 전달된다.
export function ngrokHeaders(url: string): Record<string, string> {
  if (url.startsWith("/")) return { "ngrok-skip-browser-warning": "1" };
  try { return /\.(ngrok-free\.dev|ngrok-free\.app|ngrok\.app|ngrok\.io)$/.test(new URL(url).hostname) ? { "ngrok-skip-browser-warning": "1" } : {}; } catch { return {}; }
}
