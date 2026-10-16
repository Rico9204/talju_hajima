// 게시판 글 태그 정리: 화면(src/lib/boardTags.ts)과 서버(server/src/mappers.ts)가 같은 규칙이어야
// 저장 전 화면에 보인 태그와 저장 뒤 태그가 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoardTags, splitTagInput } from '../src/lib/boardTags.ts';
import { normalizeBoardTags as serverNormalize } from '../server/src/mappers.ts';

const cases = [
  ['#공모전', '  공모전 ', 'AI', 'ai', '', '##해커톤', '팀원   모집', 'hide_image_preview', 'NO_PREVIEW'],
  Array.from({ length: 15 }, (_, i) => `태그${i}`),
  ['가'.repeat(40)],
];

test('태그 정리: #·공백·중복·내부 표시 제거, 최대 10개·각 30자', () => {
  assert.deepEqual(normalizeBoardTags(cases[0]), ['공모전', 'AI', '해커톤', '팀원 모집']);
  assert.equal(normalizeBoardTags(cases[1]).length, 10);
  assert.equal(normalizeBoardTags(cases[2])[0].length, 30);
  assert.deepEqual(splitTagInput('공모전, #AI，해커톤'), ['공모전', ' #AI', '해커톤']);
});

test('태그 정리: 화면과 서버 규칙이 같다', () => {
  for (const input of cases) assert.deepEqual(normalizeBoardTags(input), serverNormalize(input));
});
