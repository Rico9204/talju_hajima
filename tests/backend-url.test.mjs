import assert from 'node:assert/strict';
import { test } from 'node:test';

const { backendOrigin, realtimeUrl } = await import('../src/api/rest/backendUrl.ts');

test('절대 API 주소면 그 출처로 실시간·파일 주소를 만든다', () => {
  assert.equal(backendOrigin('http://localhost:3000/api', ''), 'http://localhost:3000');
  assert.equal(realtimeUrl('https://api.team.example/api/', ''), 'wss://api.team.example/realtime');
});

test('Vercel 전달(/api)이면 VITE_BACKEND_URL로 직접 연결한다', () => {
  assert.equal(backendOrigin('/api', 'https://api.team.example/'), 'https://api.team.example');
  assert.equal(realtimeUrl('/api', 'https://api.team.example'), 'wss://api.team.example/realtime');
});
