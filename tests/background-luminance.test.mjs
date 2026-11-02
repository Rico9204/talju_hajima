import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundIsDark, luminanceOfCss } from '../src/lib/backgroundLuminance.ts';

test('색 문자열의 평균 휘도: 흰색은 1에 가깝고 검정은 0, 색이 없으면 null', () => {
  assert.ok(luminanceOfCss('#ffffff') > 0.99);
  assert.equal(luminanceOfCss('#000'), 0);
  assert.ok(luminanceOfCss('linear-gradient(135deg, #000000, #ffffff)') > 0.45);
  assert.ok(luminanceOfCss('rgb(255, 255, 255)') > 0.99);
  assert.equal(luminanceOfCss('none'), null);
});

test('적응형: 배경이 어두우면 다크, 밝으면 라이트', () => {
  assert.equal(backgroundIsDark(0.02), true);
  assert.equal(backgroundIsDark(0.9), false);
  assert.equal(backgroundIsDark(luminanceOfCss('#0f172a')), true);
  assert.equal(backgroundIsDark(luminanceOfCss('linear-gradient(135deg, #f8fafc, #e2e8f0)')), false);
});
