import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
// 왼쪽 아래 내 카드 메뉴 → 항목별 프로필 편집 미리보기(실제 DB 미연결).
const context = fileURLToPath(new URL("./fixtures/profile-menu-context.tsx", import.meta.url));
const server = await createServer({
  configFile: false, plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: "../context/ProjectContext", replacement: context },
    { find: "../context/AuthContext", replacement: context },
  ] },
  server: { host: "127.0.0.1", port: 5185, strictPort: true },
});
await server.listen();
console.log("UI fixture: http://127.0.0.1:5185/tests/fixtures/profile-menu.html");
