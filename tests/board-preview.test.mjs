import test from 'node:test';
import assert from 'node:assert/strict';
import { previewOpensAbove } from '../src/lib/boardPreview.ts';

test('게시글 이미지 미리보기: 아래 자리가 모자라고 위에 자리가 있을 때만 위로 띄운다', () => {
  assert.equal(previewOpensAbove({ top: 100, bottom: 150 }, 800), false);
  assert.equal(previewOpensAbove({ top: 700, bottom: 750 }, 800), true);
  // 아래로 딱 맞으면 아래에 둔다.
  assert.equal(previewOpensAbove({ top: 510, bottom: 560 }, 800), false);
  assert.equal(previewOpensAbove({ top: 511, bottom: 561 }, 800), true);
  // 창이 낮아 양쪽 다 모자라면 아래에 둔다.
  assert.equal(previewOpensAbove({ top: 100, bottom: 150 }, 300), false);
});
