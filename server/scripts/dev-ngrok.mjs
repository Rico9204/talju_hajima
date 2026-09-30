import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { loadConfig } from '../dist/config.js';
import { ngrokConfig, vercelApiTarget } from './ngrok-config.mjs';
import { startupError } from './startup-error.mjs';

const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
  // Only terminate child processes launched by this command.
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 3000).unref();
}
function start(command, args, env) {
  const child = spawn(command, args, { env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.once('error', (error) => { console.error(error.message); stop(1); });
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping) { console.error(`${command} 종료 (${code ?? 'signal'})`); stop(code || 1); }
  });
  return child;
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

try {
  const config = ngrokConfig(process.env);
  loadConfig(config.env);
  const executable = process.platform === 'win32' ? 'ngrok.exe' : 'ngrok';
  const check = spawnSync(executable, ['version'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
  if (check.error || check.status !== 0) throw new Error('ngrok을 설치하고 ngrok config add-authtoken 명령으로 인증을 설정하세요.');
  // Fail before changing DB settings if another API server owns this port.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`${config.port} 포트가 사용 중입니다. 기존 백엔드를 종료하세요.`)));
    probe.listen(config.port, '127.0.0.1', () => probe.close(resolve));
  });
  const db = new pg.Client({ connectionString: config.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await db.connect();
    await db.query("insert into public.app_text_settings(key, value) values ('storage_host', $1) on conflict (key) do update set value = excluded.value", [new URL(config.publicUrl).hostname]);
  } finally { await db.end().catch(() => {}); }
  if (!stopping) start(process.execPath, ['dist/main.js'], config.env);
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* API startup can take a few seconds. */ }
    await delay(500);
  }
  if (!stopping) {
    if (!ready) throw new Error('백엔드 시작 시간 초과. 위의 서버 로그를 확인하세요.');
    console.log(`프론트: ${config.frontend}`);
    console.log('Vercel 환경변수(각각 따로 등록):');
    console.log('  VITE_API_URL     = /api');
    console.log(`  VITE_BACKEND_URL = ${config.publicUrl}`);
    console.log('최초 한 번 등록하고 Redeploy하세요. Ctrl+C로 서버와 ngrok을 함께 종료합니다.');
    const target = await readFile(new URL('../../vercel.json', import.meta.url), 'utf8').then((text) => vercelApiTarget(JSON.parse(text))).catch(() => null);
    if (target !== config.publicUrl) console.warn(`경고: vercel.json의 /api 전달 주소(${target ?? '없음'})가 NGROK_URL과 다릅니다. 고친 뒤 커밋·재배포해야 로그인이 됩니다.`);
    start(executable, ['http', `http://127.0.0.1:${config.port}`, `--url=${config.publicUrl}`], config.env);
  }
} catch (error) {
  console.error(startupError(error));
  stop(1);
}
