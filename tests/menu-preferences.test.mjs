import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MENU_ORDER,
  MENU_ITEMS_META,
  sanitizeMenuOrder,
  reorderMenuItem,
  moveMenuItem,
  isDefaultMenuOrder,
  DEFAULT_HOME_MENU_ORDER,
  HOME_MENU_ITEMS_META,
  sanitizeHomeMenuOrder,
  reorderHomeMenuItem,
  moveHomeMenuItem,
  isDefaultHomeMenuOrder,
} from '../src/lib/menuPreferences.ts';

test('DEFAULT_MENU_ORDER includes all 7 standard pages', () => {
  assert.equal(DEFAULT_MENU_ORDER.length, 7);
  assert.deepEqual(DEFAULT_MENU_ORDER, [
    'dashboard',
    'team',
    'chat',
    'tasks',
    'schedule',
    'workspace',
    'evaluation',
  ]);

  for (const page of DEFAULT_MENU_ORDER) {
    assert.ok(MENU_ITEMS_META[page]);
    assert.ok(MENU_ITEMS_META[page].label);
    assert.ok(MENU_ITEMS_META[page].icon);
    assert.ok(MENU_ITEMS_META[page].description);
  }
});

test('sanitizeMenuOrder preserves valid custom order and appends missing items', () => {
  const custom = ['chat', 'tasks', 'dashboard'];
  const sanitized = sanitizeMenuOrder(custom);
  assert.deepEqual(sanitized, [
    'chat',
    'tasks',
    'dashboard',
    'team',
    'schedule',
    'workspace',
    'evaluation',
  ]);
});

test('sanitizeMenuOrder removes invalid entries and duplicates', () => {
  const messy = ['workspace', 'unknown-page', 'workspace', 'chat', null, 123];
  const sanitized = sanitizeMenuOrder(messy);
  assert.equal(sanitized[0], 'workspace');
  assert.equal(sanitized[1], 'chat');
  assert.equal(sanitized.length, 7);
  const set = new Set(sanitized);
  assert.equal(set.size, 7);
});

test('sanitizeMenuOrder handles non-array input by returning default order', () => {
  assert.deepEqual(sanitizeMenuOrder(null), [...DEFAULT_MENU_ORDER]);
  assert.deepEqual(sanitizeMenuOrder(undefined), [...DEFAULT_MENU_ORDER]);
  assert.deepEqual(sanitizeMenuOrder('string'), [...DEFAULT_MENU_ORDER]);
  assert.deepEqual(sanitizeMenuOrder({}), [...DEFAULT_MENU_ORDER]);
});

test('reorderMenuItem reorders items by removing and inserting', () => {
  const original = ['dashboard', 'team', 'chat', 'tasks'];
  // Move 'dashboard' (0) to index 2
  const reordered1 = reorderMenuItem(original, 0, 2);
  assert.deepEqual(reordered1, ['team', 'chat', 'dashboard', 'tasks']);

  // Move 'tasks' (3) to index 0
  const reordered2 = reorderMenuItem(original, 3, 0);
  assert.deepEqual(reordered2, ['tasks', 'dashboard', 'team', 'chat']);

  // Out of bounds or same index returns original array unchanged
  assert.deepEqual(reorderMenuItem(original, 0, 0), original);
  assert.deepEqual(reorderMenuItem(original, -1, 2), original);
  assert.deepEqual(reorderMenuItem(original, 0, 10), original);
});

test('moveMenuItem moves an item up and down with bounds checking', () => {
  const original = ['dashboard', 'team', 'chat', 'tasks'];

  // Move index 1 (team) up -> index 0
  const movedUp = moveMenuItem(original, 1, 'up');
  assert.deepEqual(movedUp, ['team', 'dashboard', 'chat', 'tasks']);

  // Move index 0 up -> cannot move up, stays same
  const moveFirstUp = moveMenuItem(original, 0, 'up');
  assert.deepEqual(moveFirstUp, original);

  // Move index 1 (team) down -> index 2
  const movedDown = moveMenuItem(original, 1, 'down');
  assert.deepEqual(movedDown, ['dashboard', 'chat', 'team', 'tasks']);

  // Move index 3 (last) down -> cannot move down, stays same
  const moveLastDown = moveMenuItem(original, 3, 'down');
  assert.deepEqual(moveLastDown, original);
});

test('isDefaultMenuOrder identifies matching vs non-matching orders', () => {
  assert.equal(isDefaultMenuOrder([...DEFAULT_MENU_ORDER]), true);
  assert.equal(isDefaultMenuOrder(['chat', ...DEFAULT_MENU_ORDER.slice(1)]), false);
  assert.equal(isDefaultMenuOrder(DEFAULT_MENU_ORDER.slice(0, 5)), false);
});

test('DEFAULT_HOME_MENU_ORDER includes all 5 standard tabs', () => {
  assert.equal(DEFAULT_HOME_MENU_ORDER.length, 5);
  assert.deepEqual(DEFAULT_HOME_MENU_ORDER, [
    'projects',
    'campus',
    'board',
    'achievements',
    'settings',
  ]);

  for (const tab of DEFAULT_HOME_MENU_ORDER) {
    assert.ok(HOME_MENU_ITEMS_META[tab]);
    assert.ok(HOME_MENU_ITEMS_META[tab].label);
    assert.ok(HOME_MENU_ITEMS_META[tab].icon);
    assert.ok(HOME_MENU_ITEMS_META[tab].description);
  }
});

test('sanitizeHomeMenuOrder preserves valid custom order, deduplicates, and appends missing tabs', () => {
  const custom = ['settings', 'board'];
  const sanitized = sanitizeHomeMenuOrder(custom);
  assert.deepEqual(sanitized, [
    'settings',
    'board',
    'projects',
    'campus',
    'achievements',
  ]);

  const messy = ['achievements', 'invalid', 'achievements', 'settings', 999];
  const sanitizedMessy = sanitizeHomeMenuOrder(messy);
  assert.deepEqual(sanitizedMessy, [
    'achievements',
    'settings',
    'projects',
    'campus',
    'board',
  ]);
});

test('reorderHomeMenuItem and moveHomeMenuItem correctly adjust Home tabs', () => {
  const original = ['projects', 'board', 'achievements', 'settings'];

  // Move 'projects' (0) to index 3
  const reordered = reorderHomeMenuItem(original, 0, 3);
  assert.deepEqual(reordered, ['board', 'achievements', 'settings', 'projects']);

  // Move 'board' up -> cannot move up
  assert.deepEqual(moveHomeMenuItem(reordered, 0, 'up'), reordered);

  // Move 'board' down -> index 1
  const movedDown = moveHomeMenuItem(reordered, 0, 'down');
  assert.deepEqual(movedDown, ['achievements', 'board', 'settings', 'projects']);

  assert.equal(isDefaultHomeMenuOrder([...DEFAULT_HOME_MENU_ORDER]), true);
  assert.equal(isDefaultHomeMenuOrder(movedDown), false);
});
