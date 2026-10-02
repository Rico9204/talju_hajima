import test from 'node:test';
import assert from 'node:assert/strict';
import { ngrokConfig, vercelApiTarget } from '../scripts/ngrok-config.mjs';

test('Vercel과 고정 터널 주소를 서버 설정에 일관되게 반영한다', () => {
  const input = { FRONTEND_URL: 'https://team.vercel.app/', NGROK_URL: 'https://team.ngrok-free.app/', PORT: '3100', JWT_SECRET: 'unchanged', CORS_ORIGIN: '*' };
  const result = ngrokConfig(input);
  assert.equal(result.env.CORS_ORIGIN, 'https://team.vercel.app');
  assert.equal(result.env.APP_URL, result.env.CORS_ORIGIN);
  assert.equal(result.env.PUBLIC_BASE_URL, 'https://team.ngrok-free.app');
  assert.equal(result.env.HOST, '127.0.0.1');
  assert.equal(result.env.TRUST_PROXY, 'loopback');
  assert.equal(result.env.JWT_SECRET, 'unchanged');
  assert.equal(input.CORS_ORIGIN, '*');
});

test('FRONTEND_URL에 쉼표로 여러 주소(운영·미리보기)를 넣으면 모두 허용하고, 메일 링크는 첫 주소', () => {
  const result = ngrokConfig({ FRONTEND_URL: 'https://team.vercel.app/, https://team-git-dev-me.vercel.app,https://team.vercel.app', NGROK_URL: 'https://team.ngrok-free.dev' });
  assert.equal(result.env.CORS_ORIGIN, 'https://team.vercel.app,https://team-git-dev-me.vercel.app');
  assert.equal(result.env.APP_URL, 'https://team.vercel.app');
  assert.throws(() => ngrokConfig({ FRONTEND_URL: 'https://team.vercel.app, http://bad.example', NGROK_URL: 'https://team.ngrok-free.dev' }));
  assert.throws(() => ngrokConfig({ FRONTEND_URL: ' , ', NGROK_URL: 'https://team.ngrok-free.dev' }));
});

test('누락된 주소, HTTP, 자격증명, 경로 및 잘못된 포트를 거부한다', () => {
  const valid = { FRONTEND_URL: 'https://team.vercel.app', NGROK_URL: 'https://team.ngrok-free.dev' };
  for (const value of [undefined, '', 'http://team.vercel.app', 'https://user:pass@example.com', 'https://example.com/api', 'https://example.com?x=1']) {
    assert.throws(() => ngrokConfig({ ...valid, FRONTEND_URL: value }));
    assert.throws(() => ngrokConfig({ ...valid, NGROK_URL: value }));
  }
  assert.throws(() => ngrokConfig({ ...valid, PORT: 'not-a-port' }));
});

test('로그인 유지 쿠키는 Vercel 전달(같은 사이트) 기준으로 lax를 쓴다', () => {
  const result = ngrokConfig({ FRONTEND_URL: 'https://team.vercel.app', NGROK_URL: 'https://team.ngrok-free.dev', COOKIE_SAMESITE: 'none' });
  assert.equal(result.env.COOKIE_SAMESITE, 'lax');
});

test('vercel.json의 /api 전달 주소를 읽는다', () => {
  const rewrites = [{ source: '/api/:path*', destination: 'https://team.ngrok-free.dev/api/:path*' }, { source: '/(.*)', destination: '/' }];
  assert.equal(vercelApiTarget({ rewrites }), 'https://team.ngrok-free.dev');
  assert.equal(vercelApiTarget({ rewrites: [{ source: '/(.*)', destination: '/' }] }), null);
  assert.equal(vercelApiTarget({}), null);
});
