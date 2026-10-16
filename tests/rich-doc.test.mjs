import test from "node:test"
import assert from "node:assert/strict"
import * as Y from "yjs"
import { newRichDocBytes, richDocText, richDocKey, isRichDocName, RICH_DOC_FIELD } from "../src/lib/richDoc.ts"

const exchange = (a, b) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), "remote")
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), "remote")
}
const paragraph = (text) => {
  const p = new Y.XmlElement("paragraph")
  p.insert(0, [new Y.XmlText(text)])
  return p
}

test("새 문서를 두 명이 동시에 열어도 빈 문단은 하나", () => {
  const bytes = newRichDocBytes()
  const a = new Y.Doc(); const b = new Y.Doc()
  Y.applyUpdate(a, bytes, "seed"); Y.applyUpdate(b, bytes, "seed")
  exchange(a, b)
  assert.equal(a.getXmlFragment(RICH_DOC_FIELD).length, 1)
  assert.equal(richDocKey(a), richDocKey(b))
})

test("저장된 문서를 각자 불러와 동시에 고쳐도 수렴하고, 검색용 글자는 문단마다 줄바꿈", () => {
  const origin = new Y.Doc()
  const heading = new Y.XmlElement("heading"); heading.setAttribute("level", "1"); heading.insert(0, [new Y.XmlText("회의록")])
  origin.getXmlFragment(RICH_DOC_FIELD).insert(0, [heading, paragraph("첫 줄")])
  const saved = Y.encodeStateAsUpdate(origin)

  const a = new Y.Doc(); const b = new Y.Doc()
  Y.applyUpdate(a, saved, "seed"); Y.applyUpdate(b, saved, "seed")
  a.getXmlFragment(RICH_DOC_FIELD).push([paragraph("A가 쓴 줄")])
  b.getXmlFragment(RICH_DOC_FIELD).push([paragraph("B가 쓴 줄")])
  exchange(a, b)

  assert.equal(richDocText(a), richDocText(b))
  assert.equal(richDocKey(a), richDocKey(b))
  const lines = richDocText(a).split("\n")
  assert.deepEqual(lines.slice(0, 2), ["회의록", "첫 줄"])
  assert.deepEqual(lines.slice(2).sort(), ["A가 쓴 줄", "B가 쓴 줄"])
})

test("서식이 바뀌면 저장 비교값도 바뀌고, 파일 이름으로 문서를 구분", () => {
  const d = new Y.Doc()
  Y.applyUpdate(d, newRichDocBytes(), "seed")
  const before = richDocKey(d)
  const text = new Y.XmlText("굵게")
  d.getXmlFragment(RICH_DOC_FIELD).get(0).insert(0, [text])
  assert.notEqual(richDocKey(d), before)
  const k = richDocKey(d); text.format(0, 2, { bold: {} })
  assert.notEqual(richDocKey(d), k)
  assert.equal(isRichDocName("회의록.rtdoc"), true)
  assert.equal(isRichDocName("회의록.docx"), false)
})
