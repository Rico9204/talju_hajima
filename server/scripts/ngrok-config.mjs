function httpsOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name}에 https://로 시작하는 주소를 설정하세요.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name}에는 경로 없는 HTTPS 주소만 넣으세요.`);
  }
  return url.origin;
}

// 화면은 Vercel 주소의 /api로 요청하고 Vercel이 ngrok으로 전달한다(vercel.json) → 로그인 유지 쿠키가 같은 사이트 쿠키라 SameSite=lax로 충분하다.
// 요청은 Vercel → ngrok → 루프백 순으로 오므로 TRUST_PROXY=loopback이면 요청 IP는 Vercel 주소다(직접 보낸 X-Forwarded-For로 속일 수 없게 더 믿지 않는다).
// 그래서 가입·로그인 제한의 사용자 IP는 Vercel이 넣는 X-Vercel-Forwarded-For로 정하고(TRUST_VERCEL_IP), 위조 대비로 Vercel 주소별 상한을 함께 건다.
// FRONTEND_URL은 쉼표로 여러 주소를 받는다(예: 운영 주소, 미리보기 브랜치 주소). 모두 로그인·CORS 허용 출처가 되고,
// 메일 링크(APP_URL)에는 첫 번째 주소를 쓴다.
export function ngrokConfig(env) {
  const publicUrl = httpsOrigin(env.NGROK_URL, 'NGROK_URL');
  const frontends = [...new Set(String(env.FRONTEND_URL ?? '').split(',').map((value) => value.trim()).filter(Boolean).map((value) => httpsOrigin(value, 'FRONTEND_URL')))];
  if (frontends.length === 0) httpsOrigin(undefined, 'FRONTEND_URL');
  const frontend = frontends[0];
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT가 올바르지 않습니다.');
  return {
    publicUrl, frontend, frontends, port,
    env: { ...env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_BASE_URL: publicUrl,
      APP_URL: frontend, CORS_ORIGIN: frontends.join(','), TRUST_PROXY: 'loopback', TRUST_VERCEL_IP: '1', COOKIE_SAMESITE: 'lax' },
  };
}

// vercel.json에서 /api 요청을 넘기는 곳의 출처. 없으면 null.
export function vercelApiTarget(vercelJson) {
  const rule = (vercelJson?.rewrites ?? []).find((r) => typeof r.source === 'string' && r.source.startsWith('/api'));
  if (!rule) return null;
  try { return new URL(rule.destination).origin; } catch { return null; }
}
