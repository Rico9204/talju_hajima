import test from "node:test";
import assert from "node:assert/strict";
import { recruitPostFromNotice } from "../src/lib/recruitFromNotice.ts";

test("포스터 이미지가 있을 때 본문 상단에 img 태그로 첨부된다", () => {
  const notice = {
    title: "2026 AI 해커톤 대회",
    link: "https://example.com/contest/123",
    schoolName: "컴퓨터공학부",
    thumbnail: "https://example.com/posters/ai-hackathon.jpg",
  };

  const state = recruitPostFromNotice(notice);

  assert.equal(state.category, "recruit");
  assert.equal(state.isCreating, true);
  assert.equal(state.title, "[팀원 모집] 2026 AI 해커톤 대회");
  assert.ok(state.content);
  assert.ok(state.content.includes('<img src="https://example.com/posters/ai-hackathon.jpg" alt="공모전 포스터" />'));
  assert.ok(state.content.includes("• 주최/소속: 컴퓨터공학부"));
  assert.ok(state.content.includes("https://example.com/contest/123"));
});

test("포스터 이미지가 없을 때 본문에 img 태그 없이 공모전 정보만 들어간다", () => {
  const notice = {
    title: "2026 캡스톤 디자인 경진대회",
    link: "https://example.com/contest/456",
    schoolName: "공과대학",
  };

  const state = recruitPostFromNotice(notice);

  assert.equal(state.category, "recruit");
  assert.equal(state.isCreating, true);
  assert.equal(state.title, "[팀원 모집] 2026 캡스톤 디자인 경진대회");
  assert.ok(state.content);
  assert.ok(!state.content.includes("<img"));
  assert.ok(state.content.includes("• 주최/소속: 공과대학"));
});
