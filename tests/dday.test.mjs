// 메인 화면 프로젝트 카드의 D-day 표시(한국 시간 날짜 기준).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dDayLabel, todayKst } from '../src/lib/dday.ts';

test('D-day: 앞으로 남은 날, 오늘, 기간 일정 진행 중, 지난 날', () => {
  assert.equal(dDayLabel('2026-10-05', null, '2026-10-01'), 'D-4');
  assert.equal(dDayLabel('2026-10-01', null, '2026-10-01'), 'D-DAY');
  assert.equal(dDayLabel('2026-09-28', '2026-10-03', '2026-10-01'), '진행 중');
  assert.equal(dDayLabel('2026-09-28', null, '2026-10-01'), 'D+3');
  assert.equal(dDayLabel('2027-01-01', null, '2026-12-31'), 'D-1'); // 해 넘김
});

test('오늘 날짜는 한국 시간: UTC 15시(한국 자정)부터 다음 날', () => {
  assert.equal(todayKst(new Date('2026-10-01T14:59:00Z')), '2026-10-01');
  assert.equal(todayKst(new Date('2026-10-01T15:00:00Z')), '2026-10-02');
});
