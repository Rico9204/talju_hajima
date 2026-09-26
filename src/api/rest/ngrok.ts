export function ngrokHeaders(url: string): Record<string, string> {
  try { return new URL(url).hostname.endsWith(".ngrok-free.dev") ? { "ngrok-skip-browser-warning": "1" } : {}; } catch { return {}; }
}
