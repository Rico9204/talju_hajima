import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { loadConfig } from '../dist/config.js';
import { tunnelConfig, vercelApiTarget } from './tunnel-config.mjs';
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
function start(command, args, env, stdio = 'inherit') {
  const child = spawn(command, args, { env, stdio, windowsHide: true });
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
  const config = tunnelConfig(process.env);
  loadConfig(config.env);
  const token = process.env.CLOUDFLARE_TUNNEL_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_TUNNEL_TOKEN을 server/.env에 설정하세요(Cloudflare Zero Trust > Networks > Tunnels).');
  // winget 설치 직후에는 PATH가 갱신되지 않은 터미널이 있어 기본 설치 위치도 함께 찾는다.
  const candidates = process.platform === 'win32' ? ['cloudflared.exe', 'C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'] : ['cloudflared'];
  const executable = candidates.find((candidate) => { const result = spawnSync(candidate, ['--version'], { windowsHide: true, stdio: 'ignore', timeout: 5000 }); return !result.error && result.status === 0; });
  if (!executable) throw new Error('cloudflared를 설치하세요(winget install Cloudflare.cloudflared). 설치 직후에는 터미널을 새로 열어야 PATH에 잡힙니다.');
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
    console.log(`프론트(로그인 허용): ${config.frontends.join(', ')}`);
    console.log('Vercel 환경변수(각각 따로 등록):');
    console.log('  VITE_API_URL     = /api');
    console.log(`  VITE_BACKEND_URL = ${config.publicUrl}`);
    console.log('최초 한 번 등록하고 Redeploy하세요. Ctrl+C로 서버와 터널을 함께 종료합니다.');
    const target = await readFile(new URL('../../vercel.json', import.meta.url), 'utf8').then((text) => vercelApiTarget(JSON.parse(text))).catch(() => null);
    if (target !== config.publicUrl) console.warn(`경고: vercel.json의 /api 전달 주소(${target ?? '없음'})가 TUNNEL_URL과 다릅니다. 고친 뒤 커밋·재배포해야 로그인이 됩니다.`);
    // 토큰은 인자가 아니라 환경변수(TUNNEL_TOKEN)로 넘겨 프로세스 목록에 보이지 않게 한다. 공개 호스트 이름 → localhost:PORT 연결은 Cloudflare 대시보드에서 설정한다.
    const child = start(executable, ['tunnel', '--no-autoupdate', 'run'], { ...config.env, TUNNEL_TOKEN: token }, ['ignore', 'pipe', 'pipe']);
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        if (/Registered tunnel connection|ERR|WRN/.test(line)) console.log(`[cloudflared] ${line.replace(/^\S+\s+/, '').trim()}`);
      });
    }
  }
} catch (error) {
  console.error(startupError(error));
  stop(1);
}
