import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEvaluations } from '../src/lib/evaluationSummary.ts';
const member = (score, evalCount) => ({ score, evalCount, criteriaScores: { role: score, deadline: score, communication: score, collaboration: score, quality: score } });
test('weights received evaluations and includes unevaluated projects only in participation', () => {
 const result = summarizeEvaluations([member(8, 1), member(4, 3), member(0, 0)], 3);
 assert.equal(result.score, 5);
 assert.equal(result.criteria.role, 5);
 assert.equal(result.count, 4);
 assert.equal(result.projectCount, 3);
});
test('no evaluations does not present zero as a rating', () => {
 assert.equal(summarizeEvaluations([member(0, 0)], 1).score, null);
 assert.equal(summarizeEvaluations([], 0).projectCount, 0);
});
