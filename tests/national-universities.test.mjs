import test from "node:test";
import assert from "node:assert/strict";
import { KOREAN_UNIVERSITIES, getUniversityOfficialUrl, findUniversity, searchUniversities, isContestPlatform } from "../src/lib/constants/koreanUniversities.ts";
import { findSchoolEntry, getBoardsForSchool } from "../src/lib/crawler/schoolsRegistry.ts";
import { crawlNotices } from "../src/lib/crawler/crawlerService.ts";

test("전국 127개 모든 대학교 공식 URL 및 엔트리 매핑 검증", () => {
  for (const univ of KOREAN_UNIVERSITIES) {
    // 1. 공식 URL 유효성 검증
    const url = getUniversityOfficialUrl(univ.name);
    assert.ok(url && url.startsWith("https://"), `${univ.name} officialUrl is invalid: ${url}`);
    assert.ok(!url.includes("academyinfo.go.kr"), `${univ.name} has no official URL: ${url}`);

    // 2. findSchoolEntry 검증 (이름 일치 여부)
    const entry = findSchoolEntry(univ.name);
    assert.ok(entry, `${univ.name} findSchoolEntry returned undefined`);
    assert.equal(entry.name, univ.name, `${univ.name} matched wrong school: ${entry.name}`);

    // 3. getBoardsForSchool 검증
    const boards = getBoardsForSchool(univ.name);
    assert.ok(boards.length > 0, `${univ.name} has no boards`);
    for (const b of boards) {
      assert.equal(b.schoolName, univ.name, `${univ.name} board has wrong schoolName: ${b.schoolName}`);
    }
  }
});

test("별칭 및 유사어 검색 오매칭 차단 정밀 검증 (남서울대 vs 서울대, 가야대, 과기대)", () => {
  const namseoul = findSchoolEntry("남서울대학교");
  assert.equal(namseoul?.name, "남서울대학교");
  assert.equal(namseoul?.code, "namseoul");

  const namseoulShort = findSchoolEntry("남서울대");
  assert.equal(namseoulShort?.name, "남서울대학교");

  const snu = findSchoolEntry("서울대학교");
  assert.equal(snu?.name, "서울대학교");
  assert.equal(snu?.code, "snu");

  const kaya = findSchoolEntry("가야대학교");
  assert.equal(kaya?.name, "가야대학교");
  assert.equal(kaya?.code, "kaya");

  const seoultech = findSchoolEntry("서울과학기술대학교");
  assert.equal(seoultech?.name, "서울과학기술대학교");

  const seoultechShort = findSchoolEntry("서울과기대");
  assert.equal(seoultechShort?.name, "서울과학기술대학교");
});

test("주요 대학 및 미등록 대학 실시간 크롤링 및 폴백 무오류 검증", async () => {
  const testSample = [
    "동명대학교",
    "부산대학교",
    "가야대학교",
    "남서울대학교",
    "연세대학교",
    "건국대학교",
    "경북대학교",
    "충남대학교",
    "한양대학교",
    "제주대학교",
    "전국",
  ];

  for (const school of testSample) {
    const res = await crawlNotices(school, "all");
    assert.ok(res.notices.length > 0, `${school} returned 0 notices`);
    assert.ok(res.sourceUrl && res.sourceUrl.startsWith("http"), `${school} sourceUrl is invalid`);

    // 모든 공지 항목 검증
    for (const item of res.notices) {
      assert.ok(item.title && item.title.trim().length > 0, `${school} empty title`);
      assert.ok(item.link && item.link.startsWith("http"), `${school} invalid link: ${item.link}`);
      assert.ok(!item.link.includes("google.com/search"), `${school} contains google search link`);

      if (school !== "전국") {
        assert.equal(item.schoolName, school, `${school} notice has wrong schoolName: ${item.schoolName}`);
      }
    }
  }
});

test("검색창 공모전 사이트 우선 노출 및 대학교 검색 시 노출 검증", () => {
  // 1. 미입력 상태: 공모전/대외활동 사이트만 우선 노출
  const initialResults = searchUniversities("");
  assert.ok(initialResults.length > 0, "initialResults is empty");
  for (const item of initialResults) {
    assert.ok(isContestPlatform(item), `${item.name} is not a contest platform`);
  }
  assert.ok(initialResults.some((i) => i.name.includes("위비티")));
  assert.ok(initialResults.some((i) => i.name.includes("링커리어")));

  // 2. 대학교 검색: 대학교 이름 검색 시 해당 대학교 정상 노출
  const snuResults = searchUniversities("서울대");
  assert.ok(snuResults.length > 0, "서울대 검색 결과 없음");
  assert.equal(snuResults[0].name, "서울대학교");

  const busanResults = searchUniversities("부산대");
  assert.ok(busanResults.length > 0, "부산대 검색 결과 없음");
  assert.equal(busanResults[0].name, "부산대학교");

  // 3. 공통 키워드 검색 시 공모전 사이트가 대학교보다 우선 정렬
  const contestResults = searchUniversities("공모전");
  assert.ok(contestResults.length > 0);
  assert.ok(isContestPlatform(contestResults[0]), "공모전 검색 시 첫 번째 결과가 공모전 플랫폼이 아님");
});

