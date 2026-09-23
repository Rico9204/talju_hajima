import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePollPercentage,
  getLeadingOptionIds,
  isPollClosed,
  validateNewPollInput,
} from "../src/lib/boardPoll.ts";

test("calculatePollPercentage handles regular, zero, and boundary cases", () => {
  assert.equal(calculatePollPercentage(0, 10), 0);
  assert.equal(calculatePollPercentage(5, 10), 50);
  assert.equal(calculatePollPercentage(1, 3), 33);
  assert.equal(calculatePollPercentage(2, 3), 67);
  assert.equal(calculatePollPercentage(10, 10), 100);
  assert.equal(calculatePollPercentage(0, 0), 0);
  assert.equal(calculatePollPercentage(5, 0), 0);
});

test("getLeadingOptionIds finds highest vote options and handles ties", () => {
  assert.deepEqual(getLeadingOptionIds([]), []);
  assert.deepEqual(
    getLeadingOptionIds([
      { id: 1, votesCount: 0 },
      { id: 2, votesCount: 0 },
    ]),
    []
  );
  assert.deepEqual(
    getLeadingOptionIds([
      { id: 1, votesCount: 3 },
      { id: 2, votesCount: 7 },
      { id: 3, votesCount: 5 },
    ]),
    [2]
  );
  // 동점인 경우
  assert.deepEqual(
    getLeadingOptionIds([
      { id: 1, votesCount: 5 },
      { id: 2, votesCount: 5 },
      { id: 3, votesCount: 2 },
    ]),
    [1, 2]
  );
});

test("isPollClosed correctly evaluates closed flag and deadlines", () => {
  const baseTime = new Date("2026-09-24T12:00:00Z");

  // 명시적 마감 플래그
  assert.equal(isPollClosed({ closed: true, closesAt: null }, baseTime), true);
  assert.equal(isPollClosed({ closed: false, closesAt: null }, baseTime), false);

  // 마감 기한 초과
  assert.equal(
    isPollClosed({ closed: false, closesAt: "2026-09-24T11:59:00Z" }, baseTime),
    true
  );
  // 마감 기한 미만 (진행 중)
  assert.equal(
    isPollClosed({ closed: false, closesAt: "2026-09-24T12:01:00Z" }, baseTime),
    false
  );
});

test("validateNewPollInput validates required fields, lengths, and dates", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  assert.equal(validateNewPollInput({ question: "", options: ["A", "B"] }, now), "투표 질문을 입력해주세요.");
  assert.equal(validateNewPollInput({ question: "질문", options: ["A"] }, now), "투표 항목을 최소 2개 이상 입력해주세요.");
  assert.equal(
    validateNewPollInput({ question: "질문", options: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] }, now),
    "투표 항목은 최대 10개까지 등록 가능합니다."
  );
  assert.equal(
    validateNewPollInput({ question: "질문", options: ["A", "B"], closesAt: "2026-09-24T11:00:00Z" }, now),
    "마감일은 현재 시간 이후여야 합니다."
  );
  assert.equal(
    validateNewPollInput({ question: "정상 질문", options: ["항목 1", "항목 2"], closesAt: "2026-09-24T13:00:00Z" }, now),
    null
  );
});

test("localStorage poll fallback allows voting and closing without database", async () => {
  const { saveLocalStoredPoll, getLocalStoredPoll, voteLocalStoredPoll, closeLocalStoredPoll } = await import(
    "../src/lib/boardPoll.ts"
  );

  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };

  const initialPoll = {
    id: 101,
    postId: 101,
    question: "좋아하는 언어는?",
    allowMultiple: false,
    isAnonymous: false,
    closed: false,
    closesAt: null,
    createdAt: new Date().toISOString(),
    options: [
      { id: 1, pollId: 101, text: "TypeScript", votesCount: 0, sortOrder: 0, voters: [] },
      { id: 2, pollId: 101, text: "Python", votesCount: 0, sortOrder: 1, voters: [] },
    ],
    totalVotes: 0,
    hasVoted: false,
    myOptionIds: [],
  };

  saveLocalStoredPoll(initialPoll);
  const loaded = getLocalStoredPoll(101, "user-1");
  assert.equal(loaded?.question, "좋아하는 언어는?");
  assert.equal(loaded?.hasVoted, false);

  // 투표 참여
  const voted = voteLocalStoredPoll(101, "user-1", "홍길동", null, [1]);
  assert.equal(voted.hasVoted, true);
  assert.deepEqual(voted.myOptionIds, [1]);
  assert.equal(voted.options[0].votesCount, 1);
  assert.equal(voted.totalVotes, 1);

  // 투표 마감
  closeLocalStoredPoll(101);
  const afterClose = getLocalStoredPoll(101, "user-1");
  assert.equal(afterClose?.closed, true);
});
