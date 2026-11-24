import test from "node:test";
import assert from "node:assert/strict";
import { containsProfanity, validateBoardProfanity } from "../src/lib/profanityFilter.ts";
import {
  containsProfanity as serverContainsProfanity,
  validateBoardProfanity as serverValidateBoardProfanity,
} from "../server/src/profanity.ts";

test("한국어·영어 비속어 및 HTML/공백/특수문자 우회 입력을 탐지한다", () => {
  const blocked = [
    "이거 시발 뭐야",
    "ㅅㅂ 진짜",
    "시 발",
    "시.발!",
    "<p>시<b>발</b></p>",
    "개새끼야",
    "시부랄",
    "18놈",
    "what the fuck",
    "f.u.c.k",
    "bullshit",
    "asshole",
  ];
  for (const text of blocked) {
    assert.equal(containsProfanity(text), true, `Expected blocked: ${text}`);
    assert.equal(serverContainsProfanity(text), true, `Expected server blocked: ${text}`);
  }
});

test("정상적인 한국어·영어 문장은 오탐하지 않는다", () => {
  const allowed = [
    "팀 프로젝트 회의 일정 공유합니다",
    "공지사항 필독 부탁드립니다.",
    "classic design system",
    "hello world",
    "1분기 매출 및 영업이익 현황",
    "2026년 1학기 중간고사 대비 스터디원 모집합니다",
    "프론트엔드 개발자 1명 구합니다",
    "PM 디자이너 팀원 모집",
    "버그 수정 및 리팩토링 완료",
    "좁은 강의실이라 일찍 오셔야 합니다",
    "<p>게시판 <strong>테스트</strong> 글입니다.</p>",
    "",
    null,
    undefined,
  ];
  for (const text of allowed) {
    assert.equal(containsProfanity(text), false, `Expected allowed: ${String(text)}`);
    assert.equal(serverContainsProfanity(text), false, `Expected server allowed: ${String(text)}`);
  }
});

test("validateBoardProfanity: 제목·본문·태그·투표·댓글별 오류 메시지를 반환한다", () => {
  assert.match(validateBoardProfanity({ title: "시발 제목" }) ?? "", /제목/);
  assert.match(validateBoardProfanity({ title: "정상 제목", content: "<p>병신 본문</p>" }) ?? "", /본문/);
  assert.match(validateBoardProfanity({ title: "정상", content: "정상", tags: ["ㅅㅂ"] }) ?? "", /태그/);
  assert.match(validateBoardProfanity({ title: "정상", content: "정상", pollQuestion: "지랄?" }) ?? "", /투표/);
  assert.match(validateBoardProfanity({ comment: "개새끼" }) ?? "", /댓글/);

  assert.equal(
    validateBoardProfanity({
      title: "정상 제목",
      content: "<p>정상 본문</p>",
      tags: ["공모전", "팀원모집"],
      pollQuestion: "좋아하는 요일은?",
      pollOptions: ["월요일", "금요일"],
      comment: "좋은 글 감사합니다!",
    }),
    null
  );
  assert.equal(serverValidateBoardProfanity({ comment: "좋은 글 감사합니다!" }), null);
});
