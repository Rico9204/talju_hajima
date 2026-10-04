import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
// 동시 편집 커서(QA 20)·문서·슬라이드 이미지(QA 21) 미리보기: 실시간 서버 대신 BroadcastChannel로 탭끼리 연결하고,
// 이미지는 localStorage에 둔다.
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const server = await createServer({
  configFile: false, plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("/fixture-api") },
  resolve: { alias: [
    { find: "../api/rest/realtimeClient", replacement: fixture("realtime-bus.ts") },
    { find: "../context/ProjectContext", replacement: fixture("collab-cursors-context.tsx") },
  ] },
  server: { host: "127.0.0.1", port: 5184, strictPort: true },
});
await server.listen();
console.log("두 사람 나란히(칸을 눌러 커서를 옮겨 보세요): http://127.0.0.1:5184/tests/fixtures/collab-cursors-pair.html");
console.log("한 사람씩(탭 두 개): http://127.0.0.1:5184/tests/fixtures/collab-cursors.html?user=a&kind=quick (user=b, kind=doc·slides, 이미지 불러오기 실패는 &imagefail=1)");
