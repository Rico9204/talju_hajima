import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, startApp } from "./helpers.mjs";

let pg, app, api, calls = 0;

before(async () => {
  const prepared = await createTestDb();
  pg = prepared.pg;
  ({ app, api } = await startApp(prepared.db, {
    odcloudApiKey: "test-key",
    majorsFetch: async () => {
      calls++;
      return new Response(JSON.stringify({ totalCount: 3, data: [
        { "학과상태": "운영", "학부·과(전공)명": "컴퓨터공학과" },
        { "학과상태": "폐지", "학부·과(전공)명": "폐지학과" },
        { "학과상태": "운영", "학부·과(전공)명": "경영학과" },
      ] }));
    },
  }));
});
after(async () => { await app?.close(); await pg?.close(); });

test("전공 조회는 공개 API이고 폐지 학과를 빼며 같은 학교 요청은 캐시한다", async () => {
  assert.equal((await api(null, "GET", "/majors")).status, 400);
  const first = await api(null, "GET", "/majors?school=%ED%85%8C%EC%8A%A4%ED%8A%B8%EB%8C%80%ED%95%99%EA%B5%90");
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.majors, ["경영학과", "컴퓨터공학과"]);
  assert.equal((await api(null, "GET", "/majors?school=%ED%85%8C%EC%8A%A4%ED%8A%B8%EB%8C%80%ED%95%99%EA%B5%90")).status, 200);
  assert.equal(calls, 1);
});
