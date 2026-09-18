import test from 'node:test';
import assert from 'node:assert/strict';
import { startsNewChatDay, belongsToMessageGroup, formatChatDate, formatChatTime } from '../src/lib/chatDate.ts';

const message = (createdAt, senderId = 'a') => ({ createdAt, senderId });

test('date separators appear on first message and calendar changes only', () => {
  const first = message('2026-09-16T23:59:00');
  assert.equal(startsNewChatDay(undefined, first), true);
  assert.equal(startsNewChatDay(first, message('2026-09-16T23:59:30', 'b')), false);
  assert.equal(startsNewChatDay(first, message('2026-09-17T00:00:00')), true);
  assert.equal(startsNewChatDay(first, message('2026-09-20T10:00:00')), true);
  assert.equal(startsNewChatDay(message('2026-12-31T23:59:00'), message('2027-01-01T00:00:00')), true);
});

test('message groups stop at midnight even within five minutes', () => {
  assert.equal(belongsToMessageGroup(message('2026-09-16T23:59:00'), message('2026-09-17T00:00:00')), false);
  assert.equal(belongsToMessageGroup(message('2026-09-17T10:00:00'), message('2026-09-17T10:04:00')), true);
  assert.equal(belongsToMessageGroup(message('2026-09-17T10:00:00'), message('2026-09-17T10:06:00')), false);
  assert.equal(belongsToMessageGroup(message('2026-09-17T10:00:00'), message('2026-09-17T10:01:00', 'b')), false);
});

test('old messages use hour and minute; date labels include weekday', () => {
  assert.equal(formatChatTime('2020-01-01T09:05:00'), '09:05');
  assert.equal(formatChatTime('2026-09-17T00:00:00'), '00:00');
  assert.equal(formatChatTime('2026-09-17T23:59:00'), '23:59');
  assert.equal(formatChatDate('2026-09-17T10:00:00'), '2026년 9월 17일 목요일');
});
