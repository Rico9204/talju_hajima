import test from "node:test"
import assert from "node:assert/strict"
import { findMentions, isMentionForMember } from "../src/lib/chatMentions.ts"

const team = ["김", "김철수", "홍 길동", "Alice"]

test("이름 일부가 같은 팀원은 불리지 않는다", () => {
  assert.equal(isMentionForMember("@김철수 확인해줘", "김", team), false)
  assert.equal(isMentionForMember("@김철수 확인해줘", "김철수", team), true)
  assert.equal(isMentionForMember("@김 확인해줘", "김", team), true)
  assert.equal(isMentionForMember("@김, 확인", "김", team), true) // 문장부호는 이름 끝
})

test("@전체·@all은 모두를 부르고, 메일 주소는 멘션이 아니다", () => {
  assert.equal(isMentionForMember("@전체 회의해요", "김철수", team), true)
  assert.equal(isMentionForMember("@ALL meeting", "Alice", team), true)
  assert.equal(isMentionForMember("메일은 me@all.com 으로", "김철수", team), false)
  assert.equal(isMentionForMember("메일 alice@Alice.com", "Alice", team), false)
  assert.equal(isMentionForMember("@allright", "김철수", team), false)
})

test("공백이 있는 이름도 통째로 찾고 강조 구간을 돌려준다", () => {
  const text = "안녕 @홍 길동 님, @Alice!"
  const found = findMentions(text, team)
  assert.deepEqual(found.map((m) => text.slice(m.start, m.end)), ["@홍 길동", "@Alice"])
  assert.equal(isMentionForMember(text, "홍 길동", team), true)
  assert.equal(isMentionForMember("", "김", team), false)
  assert.equal(isMentionForMember("@김", null, team), false)
})
