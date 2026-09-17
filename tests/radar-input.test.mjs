import test from 'node:test';
import assert from 'node:assert/strict';
import { radarAxisAt, radarScoreAt } from '../src/lib/radarInput.ts';

test('vertices and points between spokes follow polygon score contours', () => {
  for (let axis = 0; axis < 5; axis++) {
    for (const score of [1, 5, 7, 10]) {
      for (const offset of [-0.49, -0.25, 0, 0.25, 0.49]) {
        const delta = offset * 2 * Math.PI / 5;
        const angle = axis * 2 * Math.PI / 5 + delta;
        const distance = 94 * score / 10 / (Math.cos(delta) + Math.abs(Math.sin(delta)) * Math.tan(Math.PI / 5));
        const x = distance * Math.sin(angle), y = -distance * Math.cos(angle);
        assert.equal(radarAxisAt(x, y, 5), axis);
        assert.equal(radarScoreAt(x, y, axis, 5, 94), score);
      }
    }
  }
});

test('side midpoints use their contour score and scores stay within bounds', () => {
  for (let axis = 0; axis < 5; axis++) {
    for (const score of [5, 10]) {
      const angle = (axis + 0.5) * 2 * Math.PI / 5;
      const distance = 94 * score / 10 * Math.cos(Math.PI / 5);
      const x = distance * Math.sin(angle), y = -distance * Math.cos(angle);
      assert.equal(radarScoreAt(x, y, radarAxisAt(x, y, 5), 5, 94), score);
    }
  }
  for (let axis = 0; axis < 5; axis++) {
    assert.equal(radarScoreAt(0, 0, axis, 5, 94), 0);
  }
  assert.equal(radarScoreAt(0, -200, 0, 5, 94), 10);
  assert.equal(radarScoreAt(0, 200, 0, 5, 94), 0);
});
