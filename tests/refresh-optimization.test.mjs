import test from 'node:test';
import assert from 'node:assert/strict';
import { retainSnapshot, shareInFlight } from '../src/lib/refreshOptimization.ts';

test('unchanged nested refresh keeps its reference even if object key order differs', () => {
  const before = [{ id: 1, versions: [{ id: 2, name: '자료' }], comments: [] }];
  const next = [{ comments: [], versions: [{ name: '자료', id: 2 }], id: 1 }];
  assert.equal(retainSnapshot(before, next), before);
});

test('same-id edits, permission changes, removals and reorderings are not suppressed', () => {
  const before = [{ id: 1, visibility: 'shared', versions: [{ id: 2, name: '자료' }] }];
  for (const next of [
    [{ ...before[0], visibility: 'private' }],
    [{ ...before[0], versions: [{ id: 2, name: '수정 자료' }] }],
    [{ ...before[0], versions: [] }],
    [],
  ]) assert.equal(retainSnapshot(before, next), next);
  const reversed = [{ id: 2 }, { id: 1 }];
  assert.equal(retainSnapshot([{ id: 1 }, { id: 2 }], reversed), reversed);
});

test('missing, undefined and null fields remain distinct', () => {
  for (const next of [{ field: undefined }, { field: null }]) {
    assert.equal(retainSnapshot({}, next), next);
  }
});

test('overlapping evaluation consumers share a request; next open fetches fresh data', async () => {
  let calls = 0;
  const read = shareInFlight(async () => ({ score: ++calls }));
  const first = read();
  const second = read();
  assert.equal(first, second);
  assert.deepEqual(await first, { score: 1 });
  assert.deepEqual(await read(), { score: 2 });
  assert.equal(calls, 2);
});

test('failed requests allow a fresh retry, including synchronous loader errors', async () => {
  let calls = 0;
  const read = shareInFlight(() => {
    if (++calls === 1) throw new Error('temporary failure');
    return Promise.resolve('recovered');
  });
  await assert.rejects(read(), /temporary failure/);
  assert.equal(await read(), 'recovered');
});

test('separate account/revision readers never share their pending result', async () => {
  let resolveOld;
  const oldReader = shareInFlight(() => new Promise((resolve) => { resolveOld = resolve; }));
  const newReader = shareInFlight(async () => 'new account');
  const oldRequest = oldReader();
  assert.equal(await newReader(), 'new account');
  resolveOld('old account');
  assert.equal(await oldRequest, 'old account');
  assert.equal(await newReader(), 'new account');
});
