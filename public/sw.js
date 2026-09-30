// 웹 푸시 수신용 서비스 워커. 사이트 탭을 모두 닫아도 브라우저가 이 스크립트를 깨워 알림을 띄운다.
// 캐시·오프라인 기능은 없다(알림만).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
