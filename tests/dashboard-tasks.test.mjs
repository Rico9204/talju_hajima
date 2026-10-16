import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDashboardTasks } from '../src/lib/dashboardTasks.ts';
const now = new Date(2026, 8, 16, 23, 59);
const task = (id, status, due) => ({ id, title: '같은 제목', status, due });
test('counts actual completed tasks and excludes completed or undated tasks from deadlines', () => {
 const result = summarizeDashboardTasks([task(1,'done','2026-09-10'), task(2,'todo',''), task(3,'review','2026-09-17'), task(4,'inprogress','2026-09-15'), task(5,'todo','2026-09-16')],now);
 assert.equal(result.completed,1); assert.equal(result.total,5); assert.equal(result.remaining,3); assert.equal(result.overdue,1);
 assert.deepEqual(result.deadlines.map(d=>d.id),[4,5,3]);
 assert.deepEqual(result.deadlines.map(d=>d.badge),['1일 지남','D-Day','D-1']);
});
test('rejects invalid dates and handles leap days', () => {
 const result=summarizeDashboardTasks([task(1,'todo','2026-02-30'),task(2,'todo','2026-02-29'),task(3,'todo','invalid'),task(4,'todo','2028-02-29')],new Date(2028,1,28));
 assert.equal(result.remaining,1); assert.equal(result.deadlines[0].days,1);
});
test('completion, reopening, deadline editing and removal recalculate the summary', () => {
 assert.equal(summarizeDashboardTasks([task(1,'done','2026-09-17')],now).remaining,0);
 assert.equal(summarizeDashboardTasks([task(1,'review','2026-09-17')],now).remaining,1);
 assert.equal(summarizeDashboardTasks([task(1,'review','2026-09-18')],now).deadlines[0].days,2);
 assert.equal(summarizeDashboardTasks([],now).total,0);
 assert.equal(summarizeDashboardTasks([task(1,'todo','2026-09-17')],new Date(2026,8,17)).deadlines[0].badge,'D-Day');
});
