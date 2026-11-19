import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHwpEquation } from '../src/lib/hwpxEquation.ts';

test('parseHwpEquation: 분수(over)를 올바른 MathML mfrac으로 변환한다', () => {
  const result = parseHwpEquation('{a} over {b}');
  assert.ok(result.includes('<mfrac>'));
  assert.ok(result.includes('<mi>a</mi>'));
  assert.ok(result.includes('<mi>b</mi>'));
});

test('parseHwpEquation: 복합 분수 및 다항식을 정상 변환한다', () => {
  const result = parseHwpEquation('{x + 1} over {x - 1}');
  assert.ok(result.includes('<mfrac>'));
  assert.ok(result.includes('<mo>+</mo>'));
  assert.ok(result.includes('<mo>-</mo>'));
});

test('parseHwpEquation: 제곱근(sqrt)을 msqrt로 변환한다', () => {
  const result = parseHwpEquation('sqrt {x^2 + y^2}');
  assert.ok(result.includes('<msqrt>'));
  assert.ok(result.includes('<msup>'));
});

test('parseHwpEquation: 첨자(x_1, x^2, x_1^2)를 msub, msup, msubsup으로 변환한다', () => {
  const subResult = parseHwpEquation('x_1');
  assert.ok(subResult.includes('<msub>'));

  const supResult = parseHwpEquation('x^2');
  assert.ok(supResult.includes('<msup>'));

  const bothResult = parseHwpEquation('x_1^2');
  assert.ok(bothResult.includes('<msubsup>'));
});

test('parseHwpEquation: 그리스 문자와 연산자를 정확히 변환한다', () => {
  const result = parseHwpEquation('alpha + beta times gamma <= delta');
  assert.ok(result.includes('α'));
  assert.ok(result.includes('β'));
  assert.ok(result.includes('×'));
  assert.ok(result.includes('γ'));
  assert.ok(result.includes('≤'));
  assert.ok(result.includes('δ'));
});

test('parseHwpEquation: 시그마와 적분을 munderover로 변환한다', () => {
  const sumResult = parseHwpEquation('sum_{i=1}^{n} x_i');
  assert.ok(sumResult.includes('∑'));
  assert.ok(sumResult.includes('<munderover>'));
});

test('parseHwpEquation: LaTeX 수식 문법(\\frac, \\sqrt)도 호환 지원한다', () => {
  const latexResult = parseHwpEquation('\\frac{1}{2} + \\sqrt{x}');
  assert.ok(latexResult.includes('<mfrac>'));
  assert.ok(latexResult.includes('<msqrt>'));
});

test('parseHwpEquation: 중첩 중괄호 및 따옴표가 포함된 복합 수식을 ReDoS 지연 없이 즉시 파싱한다', () => {
  const complexScript = '{hat{I}} (x,y)=`Median"{"I _{n} (i,j)vert  (i,j) IN  C _{"neu"}^{`(r)} (x,y)"}"';
  const t0 = Date.now();
  const result = parseHwpEquation(complexScript);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 100, `Parsing should take <100ms but took ${elapsed}ms`);
  assert.ok(result.includes('math'));
});

