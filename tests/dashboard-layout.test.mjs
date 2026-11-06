import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_LAYOUT,
  DASHBOARD_WIDGETS_META,
  sanitizeDashboardLayout,
  isDefaultDashboardLayout,
  moveWidget,
  moveWidgetStep,
} from "../src/lib/dashboardLayout.ts";

test("ALL_DASHBOARD_WIDGETS contains 8 core dashboard cards", () => {
  assert.equal(ALL_DASHBOARD_WIDGETS.length, 8);
  for (const id of ALL_DASHBOARD_WIDGETS) {
    assert.ok(DASHBOARD_WIDGETS_META[id]);
    assert.ok(DASHBOARD_WIDGETS_META[id].label);
  }
});

test("sanitizeDashboardLayout preserves valid layout and fixes duplicates/missing", () => {
  const result = sanitizeDashboardLayout(null);
  assert.deepEqual(result, DEFAULT_DASHBOARD_LAYOUT);

  const custom = {
    main: ["board", "profile", "deadlines"],
    side: ["mytasks", "pace", "achievements", "evaluation", "activity"],
  };
  const sanitized = sanitizeDashboardLayout(custom);
  assert.deepEqual(sanitized, custom);

  // Missing widgets are backfilled
  const partial = { main: ["board"], side: ["deadlines"] };
  const backfilled = sanitizeDashboardLayout(partial);
  assert.equal(backfilled.main.length + backfilled.side.length, 8);
  assert.ok(backfilled.main.includes("board"));
  assert.ok(backfilled.side.includes("deadlines"));
});

test("isDefaultDashboardLayout accurately tests default status", () => {
  assert.equal(isDefaultDashboardLayout(DEFAULT_DASHBOARD_LAYOUT), true);
  assert.equal(
    isDefaultDashboardLayout({
      main: ["board", "profile", "pace", "achievements"],
      side: ["mytasks", "deadlines", "evaluation", "activity"],
    }),
    false
  );
});

test("moveWidget moves a widget across columns and at specific index", () => {
  // Move 'mytasks' from side to main at index 0
  const moved = moveWidget(DEFAULT_DASHBOARD_LAYOUT, "mytasks", "main", 0);
  assert.equal(moved.main[0], "mytasks");
  assert.ok(!moved.side.includes("mytasks"));
  assert.equal(moved.main.length, 5);
  assert.equal(moved.side.length, 3);
});

test("moveWidgetStep moves up, down, and cross columns", () => {
  // Move 'board' up (was index 1 in main)
  const up = moveWidgetStep(DEFAULT_DASHBOARD_LAYOUT, "board", "up");
  assert.equal(up.main[0], "board");
  assert.equal(up.main[1], "profile");

  // Move 'board' cross (from main to side)
  const cross = moveWidgetStep(DEFAULT_DASHBOARD_LAYOUT, "board", "cross");
  assert.ok(!cross.main.includes("board"));
  assert.ok(cross.side.includes("board"));
});
