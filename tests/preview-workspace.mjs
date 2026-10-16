import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const server = await createServer({
  configFile: false, plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: "../context/ProjectContext", replacement: fileURLToPath(new URL("./fixtures/workspace-context.tsx", import.meta.url)) }] },
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
});
await server.listen();
console.log("UI fixture: http://127.0.0.1:5183/tests/fixtures/workspace.html");
