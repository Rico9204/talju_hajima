import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PgDb } from "./db.js";
import { ConsoleMailer, SmtpMailer } from "./mail.js";
import { DiskFileStore } from "./storage.js";

const config = loadConfig();
const db = new PgDb(config.databaseUrl);
const app = await createApp({
  db, jwtSecret: config.jwtSecret, corsOrigins: config.corsOrigins, trustProxy: config.trustProxy, trustVercelIp: config.trustVercelIp,
  store: new DiskFileStore(config.storageDir), publicBaseUrl: config.publicBaseUrl,
  mailer: config.mail.transport === "smtp" ? new SmtpMailer(config.mail.smtpUrl, config.mail.from) : new ConsoleMailer(),
  appUrl: config.appUrl, odcloudApiKey: config.odcloudApiKey,
  cookieSameSite: config.cookieSameSite, cookieSecure: config.cookieSecure, vapid: config.vapid, onlyoffice: config.onlyoffice,
});
app.enableShutdownHooks();
await app.listen(config.port, process.env.HOST || "0.0.0.0");
console.log(`API 서버 실행 중: http://localhost:${config.port}/api/health`);

process.once("SIGTERM", () => { void db.close(); });
