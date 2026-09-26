import test from "node:test"
import assert from "node:assert/strict"
import * as Y from "yjs"
import { newSlidesBytes, slidesText, slidesKey, isSlidesName, createSlide, createTextElement, slideElements, SLIDES_FIELD } from "../src/lib/slidesDoc.ts"
import { applyTextEdit } from "../src/lib/collabCore.ts"

const exchange = (a, b) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), "remote")
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), "remote")
}

test("새 슬라이드 파일을 두 명이 동시에 열어도 슬라이드는 한 장(제목 글상자 1개)", () => {
  const bytes = newSlidesBytes()
  const a = new Y.Doc(); const b = new Y.Doc()
  Y.applyUpdate(a, bytes, "seed"); Y.applyUpdate(b, bytes, "seed")
  exchange(a, b)
  assert.equal(a.getArray(SLIDES_FIELD).length, 1)
  assert.equal(slideElements(a.getArray(SLIDES_FIELD).get(0)).length, 1)
  assert.equal(slidesKey(a), slidesKey(b))
})

test("동시에 슬라이드 추가·글상자 이동·글자 수정을 해도 수렴하고, 검색용 글자는 슬라이드별로 나뉜다", () => {
  const bytes = newSlidesBytes()
  const a = new Y.Doc(); const b = new Y.Doc()
  Y.applyUpdate(a, bytes, "seed"); Y.applyUpdate(b, bytes, "seed")
  a.getArray(SLIDES_FIELD).push([createSlide()])
  const titleB = slideElements(b.getArray(SLIDES_FIELD).get(0)).get(0)
  titleB.set("x", 20)
  const ytext = titleB.get("text")
  applyTextEdit(b, ytext.toString(), "중간발표", [], ytext)
  exchange(a, b)
  const secondA = a.getArray(SLIDES_FIELD).get(1)
  slideElements(secondA).push([createTextElement("A가 쓴 글")])
  exchange(a, b)
  assert.equal(slidesKey(a), slidesKey(b))
  assert.equal(slidesText(a), "[1]\n중간발표\n[2]\nA가 쓴 글")
  assert.equal(slideElements(a.getArray(SLIDES_FIELD).get(0)).get(0).get("x"), 20)
})

test("위치만 바꿔도 저장 비교값이 바뀌고, 파일 이름으로 슬라이드를 구분", () => {
  const d = new Y.Doc(); Y.applyUpdate(d, newSlidesBytes(), "seed")
  const before = slidesKey(d)
  slideElements(d.getArray(SLIDES_FIELD).get(0)).get(0).set("y", 50)
  assert.notEqual(slidesKey(d), before)
  assert.equal(isSlidesName("발표.slides"), true)
  assert.equal(isSlidesName("발표.pptx"), false)
})
