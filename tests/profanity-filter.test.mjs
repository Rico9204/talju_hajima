import test from "node:test";
import assert from "node:assert/strict";
import { containsProfanity, validateBoardProfanity } from "../src/lib/profanityFilter.ts";
import { ENGLISH_PROFANITY_LIST, KOREAN_ALLOWED_PATTERNS, KOREAN_PROFANITY_LIST } from "../src/lib/profanityWords.ts";
import {
  containsProfanity as serverContainsProfanity,
  validateBoardProfanity as serverValidateBoardProfanity,
  ENGLISH_PROFANITY_LIST as SERVER_ENGLISH_LIST,
  KOREAN_ALLOWED_PATTERNS as SERVER_ALLOWED_PATTERNS,
  KOREAN_PROFANITY_LIST as SERVER_KOREAN_LIST,
} from "../server/src/profanity.ts";

test("화면과 서버의 비속어 목록·예외 목록이 같다(한쪽만 고치면 판단이 달라진다)", () => {
  assert.deepEqual([...SERVER_KOREAN_LIST], [...KOREAN_PROFANITY_LIST]);
  assert.deepEqual([...SERVER_ENGLISH_LIST], [...ENGLISH_PROFANITY_LIST]);
  assert.deepEqual(SERVER_ALLOWED_PATTERNS.map(String), KOREAN_ALLOWED_PATTERNS.map(String));
});

test("오탐 방지: 띄어쓰기를 넘는 짧은 비속어와 일상 표현은 막지 않는다", () => {
  const allowed = [
    // 띄어쓰기를 넘어서만 비속어처럼 보이는 문장
    "다시 발송합니다", "회의 시 발표 순서", "데이터 분석 시 발생하는 오류", "씨 발아 실험",
    "그게 이상해요", "이게 이상한데요", "우리 애 미술 숙제", "니 미션은 뭐야", "버스 수 셔틀",
    // 비속어가 들어 있지만 일상적으로 쓰는 표현
    "시발점부터 다시 정리했습니다", "새끼 고양이 사진", "새끼손가락을 다쳤어요", "병신년 역사 발표",
    "API 게이트웨이 설정", "게이지 바 구현", "게이밍 노트북", "프로게이머", "빌 게이츠",
    "불이 꺼져 있어요", "화면이 꺼져요", "컴퓨터가 꺼져서 날아갔어요",
    "허리띠를 졸라매고", "졸라맨 그림", "껌을 씹는 소리", "곱씹어 보니",
    "성교육 자료", "유방암 통계", "호로록 마시기", "호모 사피엔스", "5개년 계획", "이년차 개발자",
    "에비던스 정리", "마감이 닥쳐오고 있다", "가방에 쑤셔 넣었다", "3조까지 발표합니다", "내일 조 또 바뀌나요",
  ];
  for (const text of allowed) {
    assert.equal(containsProfanity(text), false, `Expected allowed: ${text}`);
    assert.equal(serverContainsProfanity(text), false, `Expected server allowed: ${text}`);
  }
});

test("오탐 방지를 넣어도 우회 입력은 계속 막는다", () => {
  const blocked = [
    "시 발 진짜", "ㅅ ㅂ", "개 새 끼", "개새 끼", "개 새끼야", "병신아", "시발 점심", "꺼져", "이 새끼",
    "다시발 놈", "좆까", "조까 진짜", "씹새끼", "<p>병<i>신</i></p>", "시\\발", "시/발",
  ];
  for (const text of blocked) {
    assert.equal(containsProfanity(text), true, `Expected blocked: ${text}`);
    assert.equal(serverContainsProfanity(text), true, `Expected server blocked: ${text}`);
  }
});

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
