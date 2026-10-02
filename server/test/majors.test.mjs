import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, startApp } from "./helpers.mjs";

let pg, app, api, calls = 0;

before(async () => {
  const prepared = await createTestDb();
  pg = prepared.pg;
  ({ app, api } = await startApp(prepared.db, {
    odcloudApiKey: "test-key",
    majorsFetch: async (url) => {
      calls++;
      const school = new URL(url).searchParams.get("cond[학교명::LIKE]");
      // 공공데이터는 2020년 자료: 개명·통합 전 이름으로만 나온다
      if (school === "한국공학대학교" || school === "경상국립대학교" || school === "국립한밭대학교") return new Response(JSON.stringify({ totalCount: 0, data: [] }));
      if (school === "한국산업기술대학교") return new Response(JSON.stringify({ totalCount: 1, data: [{ "학과상태": "운영", "학부·과(전공)명": "게임공학부" }] }));
      if (school === "경상대학교") return new Response(JSON.stringify({ totalCount: 1, data: [{ "학과상태": "운영", "학부·과(전공)명": "농학과" }] }));
      if (school === "경남과학기술대학교") return new Response(JSON.stringify({ totalCount: 1, data: [{ "학과상태": "운영", "학부·과(전공)명": "건축학과" }] }));
      if (school === "한밭대학교") return new Response(JSON.stringify({ totalCount: 1, data: [{ "학과상태": "운영", "학부·과(전공)명": "전자공학과" }] }));
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

test("이름을 바꾼 학교는 옛 이름으로 다시 찾고, 통합 학교는 옛 학교들을 합친다", async () => {
  const get = (school) => api(null, "GET", `/majors?school=${encodeURIComponent(school)}`);
  assert.deepEqual((await get("한국공학대학교")).body.majors, ["게임공학부"]);
  assert.deepEqual((await get("경상국립대학교")).body.majors, ["건축학과", "농학과"]);
  assert.deepEqual((await get("국립한밭대학교")).body.majors, ["전자공학과"]); // "국립"을 떼고
  assert.deepEqual((await get("없는대학교")).body.majors.length, 2); // 기본 응답(옛 이름 없음) — 그대로
});
