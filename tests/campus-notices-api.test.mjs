// Vercel이 실제로 실행하는 번들(api/campus-notices.js)을 그대로 불러 검사한다. 외부 사이트 요청은 가짜 fetch로 센다.
import test from 'node:test';
import assert from 'node:assert/strict';

let outbound = 0;
globalThis.fetch = async () => { outbound++; return new Response('<html></html>', { status: 200 }); };
const { default: handler } = await import('../api/campus-notices.js');

async function call(query) {
  const res = { status: 0, body: '', writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  await handler({ url: `/api/campus-notices?${query}` }, res);
  return { status: res.status, body: JSON.parse(res.body) };
}

test('모르는 학교 이름·분류는 전국 피드 하나로 묶여, 글자만 바꿔서는 외부 수집을 반복시킬 수 없다', async () => {
  const first = await call('school=%EC%95%84%EB%AC%B4%EA%B8%80%EC%9E%901&category=contest');
  assert.equal(first.status, 200);
  const afterFirst = outbound;
  assert.ok(afterFirst > 0);
  for (let i = 2; i <= 20; i++) await call(`school=random-${i}-${Math.random()}&category=contest`);
  assert.equal(outbound, afterFirst); // 모두 같은 캐시 키 → 추가 요청 없음
  await call('school=x&category=not-a-category');
  await call('school=y&category=%3Cscript%3E');
  const afterAll = outbound;
  await call('school=z&category=all');
  assert.equal(outbound, afterAll); // 이상한 분류는 all로 정리됨
});

test('실패해도 내부 오류 내용을 응답에 담지 않는다', async () => {
  globalThis.fetch = async () => { throw new Error('secret-internal-detail'); };
  const res = await call('school=%EC%84%9C%EC%9A%B8%EB%8C%80&category=job');
  assert.doesNotMatch(JSON.stringify(res.body), /secret-internal-detail/);
});
