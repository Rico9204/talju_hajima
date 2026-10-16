// DB·업로드 파일 백업: pnpm run backup (또는 node --env-file-if-exists=.env scripts/backup.mjs)
//  - DB: docker compose의 db 컨테이너 안에서 pg_dump(사용자 PC에 PostgreSQL 설치 불필요) → talju_<시각>.dump
//        받은 파일을 pg_restore --list로 다시 읽어 표 데이터가 들어 있는지 확인한다.
//  - 업로드 파일(STORAGE_DIR) → storage_<시각>.tar.gz (BACKUP_STORAGE=false면 건너뜀)
//  - 최근 BACKUP_KEEP(기본 14)번만 남기고 오래된 백업은 지운다. 결과는 backup.log에도 남긴다.
// 설정: BACKUP_DIR(기본 server/backups), BACKUP_KEEP, BACKUP_STORAGE. 복구 방법은 server/README.md "백업과 복구".
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backupStamp, dbTarget, expiredBackups } from "./backup-lib.mjs";

const serverDir = fileURLToPath(new URL("..", import.meta.url));
const composeFile = path.join(serverDir, "docker-compose.yml");
const backupDir = path.resolve(serverDir, process.env.BACKUP_DIR || "backups");
const storageDir = path.resolve(serverDir, process.env.STORAGE_DIR || "storage-data");
const keep = Number(process.env.BACKUP_KEEP || 14);
const includeStorage = process.env.BACKUP_STORAGE !== "false";

// 명령 실행. stdout은 파일로 보내거나(to) 글자로 모으고, stdin은 파일에서(from) 넣을 수 있다.
function run(command, args, { to, from, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: [from ? "pipe" : "ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    if (to) child.stdout.pipe(to); else child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    if (from) createReadStream(from).pipe(child.stdin);
    child.on("error", (error) => reject(new Error(`${command}을(를) 실행하지 못했습니다: ${error.message}`)));
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${command} ${args[0]} 실패(코드 ${code}): ${stderr.trim().split("\n").slice(-3).join(" ")}`))));
  });
}

const compose = (...args) => ["compose", "-f", composeFile, ...args];

async function log(line) {
  const entry = `[${new Date().toLocaleString("ko-KR")}] ${line}`;
  console.log(entry);
  await appendFile(path.join(backupDir, "backup.log"), entry + "\n").catch(() => {});
}

async function main() {
  await mkdir(backupDir, { recursive: true });
  const stamp = backupStamp();
  const { user, database } = dbTarget(process.env.DATABASE_URL ?? "");

  // 1) DB
  const dumpName = `talju_${stamp}.dump`;
  const dumpPath = path.join(backupDir, dumpName);
  try {
    const out = createWriteStream(dumpPath);
    await run("docker", compose("exec", "-T", "db", "pg_dump", "-U", user, "-d", database, "-Fc"), { to: out });
    await new Promise((resolve) => out.end(resolve));
    const listing = await run("docker", compose("exec", "-T", "db", "pg_restore", "--list"), { from: dumpPath });
    const tables = listing.split("\n").filter((l) => l.includes("TABLE DATA")).length;
    if (tables === 0) throw new Error("백업 파일에 표 데이터가 없습니다.");
    const { size } = await stat(dumpPath);
    await log(`DB 백업 완료: ${dumpName} (${(size / 1024).toFixed(0)}KB, 표 데이터 ${tables}개)`);
  } catch (error) {
    await rm(dumpPath, { force: true });
    throw new Error(`DB 백업 실패 — Docker Desktop과 DB 컨테이너가 켜져 있는지 확인하세요. ${error.message}`);
  }

  // 2) 업로드 파일
  if (includeStorage && existsSync(storageDir)) {
    const archiveName = `storage_${stamp}.tar.gz`;
    try {
      // 압축 파일 이름은 상대 경로로 — Git Bash의 tar는 "C:\..." 를 원격 주소로 읽는다.
      await run("tar", ["-czf", archiveName, "-C", storageDir, "."], { cwd: backupDir });
      const { size } = await stat(path.join(backupDir, archiveName));
      await log(`파일 백업 완료: ${archiveName} (${(size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (error) {
      await rm(path.join(backupDir, archiveName), { force: true });
      throw new Error(`파일 백업 실패: ${error.message}`);
    }
  }

  // 3) 오래된 백업 정리
  const expired = expiredBackups(await readdir(backupDir), keep);
  for (const name of expired) await rm(path.join(backupDir, name), { force: true });
  if (expired.length) await log(`오래된 백업 ${expired.length}개 삭제(최근 ${keep}번만 보관)`);
  await log(`백업 위치: ${backupDir}`);
}

main().catch(async (error) => {
  await log(`실패: ${error.message}`);
  process.exitCode = 1;
});
