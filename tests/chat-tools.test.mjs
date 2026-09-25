import test from "node:test"
import assert from "node:assert/strict"
import {
  encodeChatToolMessage,
  parseChatToolMessage,
  encodeChatToolAction,
  parseChatToolAction,
  createLuckyDrawData,
  createLadderData,
  createChatPollData,
  createRouletteData,
  applyToolAction,
  collectToolActions,
  resolveToolState,
} from "../src/lib/chatTools.ts"

test("encodeChatToolMessage and parseChatToolMessage work roundtrip", () => {
  const poll = createChatPollData({
    question: "점심 메뉴",
    creatorId: "user-1",
    creatorName: "철수",
    options: ["피자", "치킨"],
  })
  const text = encodeChatToolMessage({ type: "poll", data: poll })
  assert.match(text, /^\[TALJU_CHAT_TOOL\]:/)

  const parsed = parseChatToolMessage(text)
  assert.equal(parsed?.type, "poll")
  assert.equal(parsed?.data?.question, "점심 메뉴")
  assert.equal(parsed?.data?.options.length, 2)
})

test("createLuckyDrawData generates items with specified winners", () => {
  const draw = createLuckyDrawData({
    title: "발표자 뽑기",
    creatorId: "user-1",
    creatorName: "철수",
    totalCount: 5,
    winnerCount: 2,
  })
  assert.equal(draw.items.length, 5)
  const winners = draw.items.filter((it) => it.isWinner)
  assert.equal(winners.length, 2)
  assert.equal(draw.allRevealed, false)
})

test("createLadderData creates valid ladder and matches every participant to a unique or valid result", () => {
  const participants = [
    { id: "1", name: "철수", avatar: "A", color: "#f00" },
    { id: "2", name: "영희", avatar: "B", color: "#0f0" },
    { id: "3", name: "민수", avatar: "C", color: "#00f" },
  ]
  const results = ["발표", "자료조사", "PPT"]

  const ladder = createLadderData({
    title: "역할 분담 사다리",
    creatorId: "user-1",
    creatorName: "철수",
    participants,
    results,
    numSteps: 6,
  })

  assert.equal(ladder.participants.length, 3)
  assert.equal(ladder.results.length, 3)
  assert.equal(ladder.matches.length, 3)
  assert.equal(ladder.revealed, false)

  // 모든 참가자가 결과 중 하나에 매칭되어 있는지 검증
  for (const match of ladder.matches) {
    assert.ok(results.includes(match.resultText))
  }

  // shuffleResults: false일 때는 원래 순서 유지 확인
  const ladderNoShuffle = createLadderData({
    title: "순서 유지 사다리",
    creatorId: "user-1",
    creatorName: "철수",
    participants,
    results,
    shuffleResults: false,
  })
  assert.deepEqual(ladderNoShuffle.results, results)
})

test("applyToolAction updates poll votes correctly", () => {
  const poll = createChatPollData({
    question: "회의 시간",
    creatorId: "user-1",
    creatorName: "철수",
    options: ["18시", "20시"],
    allowMultiple: false,
  })
  let tool = { type: "poll", data: poll }

  // 사용자 1 투표
  tool = applyToolAction(tool, {
    targetMessageId: 10,
    action: "poll_vote",
    memberId: "u1",
    memberName: "철수",
    optionIds: [1],
  })
  assert.equal(tool.data.options[0].votesCount, 1)
  assert.equal(tool.data.totalVotes, 1)

  // 사용자 2 투표
  tool = applyToolAction(tool, {
    targetMessageId: 10,
    action: "poll_vote",
    memberId: "u2",
    memberName: "영희",
    optionIds: [2],
  })
  assert.equal(tool.data.options[1].votesCount, 1)
  assert.equal(tool.data.totalVotes, 2)

  // 사용자 1 투표 변경 (1번 -> 2번)
  tool = applyToolAction(tool, {
    targetMessageId: 10,
    action: "poll_vote",
    memberId: "u1",
    memberName: "철수",
    optionIds: [2],
  })
  assert.equal(tool.data.options[0].votesCount, 0)
  assert.equal(tool.data.options[1].votesCount, 2)
  assert.equal(tool.data.totalVotes, 2)
})

test("applyToolAction updates lucky draw pick and reveal all", () => {
  const draw = createLuckyDrawData({
    title: "커피 쏘기",
    creatorId: "user-1",
    creatorName: "철수",
    totalCount: 3,
    winnerCount: 1,
  })
  let tool = { type: "draw", data: draw }

  // 카드 1장 뒤집기
  tool = applyToolAction(tool, {
    targetMessageId: 20,
    action: "draw_pick",
    memberId: "u1",
    memberName: "철수",
    itemId: 1,
  })
  assert.equal(tool.data.items[0].openedByMemberName, "철수")

  // 전체 결과 공개
  const notCreator = applyToolAction(tool, {
    targetMessageId: 20,
    action: "draw_reveal_all",
    memberId: "u1",
    memberName: "철수",
  })
  assert.equal(notCreator.data.allRevealed, false) // 만든 사람이 아니면 무시

  tool = applyToolAction(tool, {
    targetMessageId: 20,
    action: "draw_reveal_all",
    memberId: "user-1",
    memberName: "철수",
  })
  assert.equal(tool.data.allRevealed, true)
})

test("applyToolAction respects poll expiration and does not count votes after deadline", () => {
  const past = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
  const poll = createChatPollData({
    question: "마감된 투표 테스트",
    creatorId: "u1",
    creatorName: "철수",
    options: ["항목 1", "항목 2"],
    expiresAt: past,
  })
  assert.equal(poll.expiresAt, past)

  let tool = { type: "poll", data: poll }

  // 마감 시간이 지난 후 투표 시도
  tool = applyToolAction(tool, {
    targetMessageId: 30,
    action: "poll_vote",
    memberId: "u2",
    memberName: "영희",
    optionIds: [1],
  })

  // 투표수가 증가하지 않아야 함
  assert.equal(tool.data.options[0].votesCount, 0)
  assert.equal(tool.data.totalVotes, 0)
})

test("createRouletteData and applyToolAction roulette_spin work correctly", () => {
  const roulette = createRouletteData(
    "간식 내기",
    ["커피", "치킨", "면제"],
    "u1",
    "철수"
  )
  assert.equal(roulette.title, "간식 내기")
  assert.equal(roulette.options.length, 3)
  assert.equal(roulette.spinned, false)
  assert.equal(roulette.winnerOptionId, null)

  let tool = { type: "roulette", data: roulette }
  tool = applyToolAction(tool, {
    targetMessageId: 50,
    action: "roulette_spin",
    memberId: "u2",
    memberName: "영희",
    winnerOptionId: "opt-2",
    targetAngle: 1845,
  })

  assert.equal(tool.data.spinned, true)
  assert.equal(tool.data.winnerOptionId, "opt-2")
  assert.equal(tool.data.spinnedByMemberName, "영희")
  assert.equal(tool.data.targetAngle, 1845)
})



const nameOf = (id) => ({ u1: "철수", u2: "영희", u9: "해커" })[id] ?? "?"
const actionMsg = (senderId, action, createdAt) => ({ text: encodeChatToolAction(action), senderId, createdAt })
const newPoll = (extra = {}) => ({
  type: "poll",
  data: createChatPollData({ question: "점심", creatorId: "x", creatorName: "x", options: ["A", "B"], ...extra }),
})

test("resolveToolState: 행동의 주체는 페이로드가 아니라 실제 발신자다(위조 불가)", () => {
  const events = collectToolActions([
    actionMsg("u2", { targetMessageId: 5, action: "poll_vote", memberId: "u9", memberName: "해커", optionIds: [1] }, "2026-09-24T10:00:00Z"),
  ]).get(5)
  const tool = resolveToolState(newPoll(), "u1", events, nameOf)
  const opt = tool.data.options.find((o) => o.id === 1)
  assert.deepEqual(opt.voterMemberIds, ["u2"])
  assert.deepEqual(opt.voterNames, ["영희"])
  assert.equal(tool.data.creatorId, "u1") // 만든 사람도 메시지 발신자 기준
})

test("투표 마감은 만든 사람만 할 수 있다", () => {
  const close = (sender) => collectToolActions([
    actionMsg(sender, { targetMessageId: 5, action: "poll_close", memberId: "u1", memberName: "철수" }, "2026-09-24T10:00:00Z"),
  ]).get(5)
  assert.equal(resolveToolState(newPoll(), "u1", close("u2"), nameOf).data.closed, false)
  assert.equal(resolveToolState(newPoll(), "u1", close("u1"), nameOf).data.closed, true)
})

test("마감 시각 이후에 열어도 마감 전 투표는 유지되고 마감 후 투표만 무시된다", () => {
  const expiresAt = "2026-09-24T12:00:00Z"
  const events = collectToolActions([
    actionMsg("u1", { targetMessageId: 5, action: "poll_vote", memberId: "u1", memberName: "철수", optionIds: [1] }, "2026-09-24T11:59:00Z"),
    actionMsg("u2", { targetMessageId: 5, action: "poll_vote", memberId: "u2", memberName: "영희", optionIds: [1] }, "2026-09-24T12:01:00Z"),
  ]).get(5)
  const tool = resolveToolState(newPoll({ expiresAt }), "u1", events, nameOf)
  assert.equal(tool.data.totalVotes, 1)
  assert.deepEqual(tool.data.options.find((o) => o.id === 1).voterMemberIds, ["u1"])
})

test("단일 선택 투표는 여러 옵션을 보내도 하나만, 없는 옵션은 무시", () => {
  const events = collectToolActions([
    actionMsg("u1", { targetMessageId: 5, action: "poll_vote", memberId: "u1", memberName: "철수", optionIds: [1, 2, 99] }, "2026-09-24T10:00:00Z"),
  ]).get(5)
  const tool = resolveToolState(newPoll({ allowMultiple: false }), "u1", events, nameOf)
  assert.equal(tool.data.options.filter((o) => o.votesCount > 0).length, 1)
})

test("룰렛은 첫 결과만 인정하고 없는 항목은 무시", () => {
  const roulette = { type: "roulette", data: createRouletteData("메뉴", ["a", "b"], "u1", "철수") }
  const optId = roulette.data.options[0].id
  const other = roulette.data.options[1].id
  const spin = (id, sender, at) => actionMsg(sender, { targetMessageId: 7, action: "roulette_spin", memberId: sender, memberName: "", winnerOptionId: id, targetAngle: 100 }, at)
  const events = collectToolActions([
    spin("nope", "u2", "2026-09-24T10:00:00Z"),
    spin(optId, "u1", "2026-09-24T10:00:01Z"),
    spin(other, "u2", "2026-09-24T10:00:02Z"),
  ]).get(7)
  const tool = resolveToolState(roulette, "u1", events, nameOf)
  assert.equal(tool.data.winnerOptionId, optId)
  assert.equal(tool.data.spinnedAt, "2026-09-24T10:00:01Z")
})
