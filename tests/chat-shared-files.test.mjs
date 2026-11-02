import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSharedFiles } from '../src/lib/chatSharedFiles.ts';

// 2026-11-04(수) 15:00 기준. 이번 주 월요일은 11-02.
const now = new Date(2026, 10, 4, 15, 0);
const msg = (id, fileId, y, m, d, h = 12) => ({ id, fileId, senderId: 'u', createdAt: new Date(y, m, d, h, 0).toISOString() });

test('오늘·어제·이번 주·이전으로 묶는다', () => {
  const groups = groupSharedFiles([
    msg(1, 10, 2026, 10, 4, 9),   // 오늘
    msg(2, 11, 2026, 10, 3),      // 어제
    msg(3, 12, 2026, 10, 2),      // 이번 주(월)
    msg(4, 13, 2026, 10, 1),      // 지난주(일) → 이전
  ], now);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.fileId)]), [['오늘', [10]], ['어제', [11]], ['이번 주', [12]], ['이전', [13]]]);
});

test('파일이 없는 메시지는 건너뛰고, 비어 있는 묶음은 만들지 않는다', () => {
  const groups = groupSharedFiles([msg(1, null, 2026, 10, 4), msg(2, 5, 2026, 10, 3)], now);
  assert.deepEqual(groups.map((g) => g.label), ['어제']);
});

test('같은 파일을 여러 번 공유하면 가장 최근 한 번만 센다', () => {
  const groups = groupSharedFiles([msg(1, 7, 2026, 10, 2), msg(2, 7, 2026, 10, 4, 8)], now);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '오늘');
  assert.equal(groups[0].items[0].messageId, 2);
});

test('월요일이면 어제(일요일)는 "어제"이고 이번 주에는 들어가지 않는다', () => {
  const monday = new Date(2026, 10, 2, 10, 0);
  const groups = groupSharedFiles([msg(1, 1, 2026, 10, 1), msg(2, 2, 2026, 9, 30)], monday);
  assert.deepEqual(groups.map((g) => [g.label, g.items[0].fileId]), [['어제', 1], ['이전', 2]]);
});

test('같은 묶음 안에서는 최근 공유한 파일이 위에 온다', () => {
  const groups = groupSharedFiles([msg(1, 1, 2026, 10, 4, 8), msg(2, 2, 2026, 10, 4, 13)], now);
  assert.deepEqual(groups[0].items.map((i) => i.fileId), [2, 1]);
});
