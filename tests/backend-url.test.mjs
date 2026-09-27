import assert from 'node:assert/strict';
import { test } from 'node:test';

const { backendOrigin, realtimeUrl } = await import('../src/api/rest/backendUrl.ts');
const { ngrokHeaders } = await import('../src/api/rest/ngrok.ts');

test('절대 API 주소면 그 출처로 실시간·파일 주소를 만든다', () => {
  assert.equal(backendOrigin('http://localhost:3000/api', ''), 'http://localhost:3000');
  assert.equal(realtimeUrl('https://team.ngrok-free.dev/api/', ''), 'wss://team.ngrok-free.dev/realtime');
});

test('Vercel 전달(/api)이면 VITE_BACKEND_URL로 직접 연결한다', () => {
  assert.equal(backendOrigin('/api', 'https://team.ngrok-free.dev/'), 'https://team.ngrok-free.dev');
  assert.equal(realtimeUrl('/api', 'https://team.ngrok-free.dev'), 'wss://team.ngrok-free.dev/realtime');
});

test('ngrok 경고 페이지 건너뛰기 헤더는 ngrok 주소와 Vercel 전달 주소에만 붙는다', () => {
  assert.deepEqual(ngrokHeaders('/api'), { 'ngrok-skip-browser-warning': '1' });
  assert.deepEqual(ngrokHeaders('https://team.ngrok-free.dev/api'), { 'ngrok-skip-browser-warning': '1' });
  assert.deepEqual(ngrokHeaders('http://localhost:3000/api'), {});
});
