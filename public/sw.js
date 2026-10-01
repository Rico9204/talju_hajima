// 웹 푸시 수신용 서비스 워커. 사이트 탭을 모두 닫아도 브라우저가 이 스크립트를 깨워 알림을 띄운다.
// 그리고 ngrok 무료 도메인의 파일(/storage/...) 요청에 경고 페이지 건너뛰기 헤더를 붙인다. 캐시·오프라인 기능은 없다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// ngrok 무료 도메인은 브라우저의 <img>·<video> 요청에 파일 대신 경고 페이지(HTML)를 돌려줘 이미지가 깨진다.
// <img>는 헤더를 붙일 수 없으므로 여기서 같은 주소를 헤더를 붙여 다시 받는다(서버가 CORS로 허용).
const NGROK_HOST = /\.(ngrok-free\.dev|ngrok-free\.app|ngrok\.app|ngrok\.io)$/;
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "navigate" || request.headers.has("ngrok-skip-browser-warning")) return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!NGROK_HOST.test(url.hostname) || !url.pathname.startsWith("/storage/")) return;
  const headers = { "ngrok-skip-browser-warning": "1" };
  const range = request.headers.get("range"); // 동영상 이어 받기
  if (range) headers.range = range;
  event.respondWith(fetch(url.href, { headers, mode: "cors", credentials: "omit" }).catch(() => fetch(request)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil((async () => {
    // 지금 보고 있는 탭이 있으면 화면 안 알림(종 모양)이 대신한다.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((client) => client.visibilityState === "visible" && client.focused)) return;
    await self.registration.showNotification(data.title || "Slackerspace", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: "/slackerspace_icon.png",
      badge: "/slackerspace_icon.png",
      data: { url: data.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  if (url.origin !== self.location.origin) return; // 우리 사이트 안만 연다
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === url.origin);
    if (open) {
      await open.focus();
      return open.navigate(url.href);
    }
    return self.clients.openWindow(url.href);
  })());
});
