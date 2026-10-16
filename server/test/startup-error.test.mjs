import test from 'node:test';
import assert from 'node:assert/strict';
import { startupError } from '../scripts/startup-error.mjs';

test('메시지가 비어 있는 IPv4/IPv6 연결 오류도 DB 실행 안내를 표시한다', () => {
  const error = new AggregateError([
    Object.assign(new Error(), { code: 'ECONNREFUSED' }),
    Object.assign(new Error(), { code: 'ECONNREFUSED' }),
  ]);
  assert.match(startupError(error), /PostgreSQL 연결이 거부/);
  assert.match(startupError(error), /docker compose/);
});

test('초기화 오류와 코드만 있는 오류에도 비어 있지 않은 안내를 표시한다', () => {
  assert.match(startupError({ code: '42P01' }), /db:setup/);
  assert.equal(startupError({ message: '', code: 'ETIMEDOUT' }), 'ETIMEDOUT');
  assert.equal(startupError(new Error('설정 확인')), '설정 확인');
});
