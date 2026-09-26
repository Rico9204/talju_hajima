import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PgDb } from "./db.js";

const config = loadConfig();
const db = new PgDb(config.databaseUrl);
const app = await createApp({ db, jwtSecret: config.jwtSecret, corsOrigins: config.corsOrigins, trustProxy: config.trustProxy });
app.enableShutdownHooks();
await app.listen(config.port);
console.log(`API 서버 실행 중: http://localhost:${config.port}/api/health`);

process.once("SIGTERM", () => { void db.close(); });
