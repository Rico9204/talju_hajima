import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  parseHwpxXmlToBlocks,
  initHwpxYDoc,
  extractBlocksFromYDoc,
  serializeBlocksToHwpxPackage,
  hwpxFaceForCssFont,
  HWPX_SERIF_CSS,
  HWPX_SANS_CSS,
} from "../src/lib/hwpxCollab.ts";

const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
const charPrById = (headerXml, id) => headerXml.match(new RegExp(`<hh:charPr id="${id}"[\\s\\S]*?</hh:charPr>`))?.[0] ?? "";
const runCharPr = (sectionXml, text) => sectionXml.match(new RegExp(`<hp:run charPrIDRef="(\\d+)"><hp:t>${text}</hp:t>`))?.[1];
const fontGroup = (headerXml, lang) => headerXml.match(new RegExp(`<hh:fontface lang="${lang}"[^>]*>[\\s\\S]*?</hh:fontface>`))?.[0] ?? "";

test("hwpx 글꼴: 편집기 글꼴 값을 한컴 글꼴 이름으로 바꾼다", () => {
  assert.equal(hwpxFaceForCssFont("'GmarketSansMedium', sans-serif"), "GmarketSansMedium");
  assert.equal(hwpxFaceForCssFont(HWPX_SERIF_CSS), "함초롬바탕");
  assert.equal(hwpxFaceForCssFont(HWPX_SANS_CSS), "함초롬돋움");
  assert.equal(hwpxFaceForCssFont("'Gungsuh', 'GungsuhChe', serif"), "궁서");
  assert.equal(hwpxFaceForCssFont("Arial, sans-serif"), "Arial");
  assert.equal(hwpxFaceForCssFont(undefined), undefined);
  assert.equal(hwpxFaceForCssFont("sans-serif"), undefined);
});

test("hwpx 글꼴: 새 문서에서 문단 글꼴이 글꼴 목록과 글자 모양에 저장되고 다시 읽힌다", () => {
  const blocks = [
    { type: "paragraph", id: "p0", text: "지마켓 글꼴 문단", fontFamily: "'GmarketSansMedium', sans-serif" },
    { type: "paragraph", id: "p1", text: "기본 문단" },
    { type: "paragraph", id: "p2", text: "바탕 문단", fontFamily: HWPX_SERIF_CSS },
  ];
  const { sectionXml, headerXml } = serializeBlocksToHwpxPackage(blocks, "", "");

  // 모든 언어 목록에 0번 함초롬바탕 + 1번 새 글꼴
  assert.ok(headerXml.includes('<hh:fontfaces itemCnt="7">'));
  for (const lang of LANGS) {
    const group = fontGroup(headerXml, lang);
    assert.ok(group.includes('fontCnt="2"'), lang);
    assert.ok(group.includes('<hh:font id="0" face="함초롬바탕"'), lang);
    assert.ok(group.includes('<hh:font id="1" face="GmarketSansMedium"'), lang);
  }
  const gmarketId = runCharPr(sectionXml, "지마켓 글꼴 문단");
  assert.ok(gmarketId && gmarketId !== "0");
  assert.ok(charPrById(headerXml, gmarketId).includes('<hh:fontRef hangul="1" latin="1" hanja="1" japanese="1" other="1" symbol="1" user="1"/>'));
  assert.equal(runCharPr(sectionXml, "기본 문단"), "0");
  assert.equal(runCharPr(sectionXml, "바탕 문단"), "0", "함초롬바탕은 기본 글자 모양(0번)을 그대로 쓴다");

  const reparsed = parseHwpxXmlToBlocks(sectionXml, headerXml);
  assert.equal(reparsed.find((b) => b.text === "지마켓 글꼴 문단")?.fontFamily, "'GmarketSansMedium', sans-serif");
});

test("hwpx 글꼴: 선택 영역에 준 글꼴(span font-family)은 그 글자만 다른 글자 모양으로 저장된다", () => {
  const blocks = [{ type: "paragraph", id: "p0", text: 'A<span style="font-family: &quot;S-CoreDream&quot;, sans-serif;">B</span>C' }];
  const { sectionXml, headerXml } = serializeBlocksToHwpxPackage(blocks, "", "");
  assert.equal(runCharPr(sectionXml, "A"), "0");
  assert.equal(runCharPr(sectionXml, "C"), "0");
  const id = runCharPr(sectionXml, "B");
  assert.ok(id && id !== "0");
  assert.ok(fontGroup(headerXml, "HANGUL").includes('face="S-CoreDream"'));
  assert.ok(charPrById(headerXml, id).includes('hangul="1"'));
});

const ORIGINAL_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.0"><hh:refList>
<hh:fontfaces itemCnt="2">
<hh:fontface lang="HANGUL" fontCnt="2"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/><hh:font id="1" face="함초롬돋움" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="LATIN" fontCnt="2"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/><hh:font id="1" face="함초롬돋움" type="TTF" isEmbedded="0"/></hh:fontface>
</hh:fontfaces>
<hh:charProperties itemCnt="1">
<hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="1" latin="1" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:underline type="NONE" shape="SOLID" color="#000000"/></hh:charPr>
</hh:charProperties>
<hh:paraProperties itemCnt="1"><hh:paraPr id="0"><hh:align horizontal="LEFT" vertical="BASELINE"/></hh:paraPr></hh:paraProperties>
</hh:refList></hh:head>`;
const ORIGINAL_SECTION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
<hp:p id="0" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>원본 문단</hp:t></hp:run></hp:p>
<hp:p id="1" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>둘째 문단</hp:t></hp:run></hp:p>
</hs:sec>`;

test("hwpx 글꼴: 원본 문서의 글꼴은 그대로 두고, 새 글꼴만 언어별 목록 끝에 추가한다", () => {
  const blocks = parseHwpxXmlToBlocks(ORIGINAL_SECTION, ORIGINAL_HEADER);
  const second = blocks.find((b) => b.text === "둘째 문단");
  assert.equal(second.fontFamily, HWPX_SANS_CSS, "함초롬돋움(한글 1번)은 고딕 계열로 읽는다");

  const doc = new Y.Doc();
  initHwpxYDoc(doc, blocks);
  const yBlocks = doc.getArray("hwpx_blocks");
  // 첫 문단: 글자를 고쳤지만 글꼴은 그대로 -> 원본 글자 모양 0번 유지
  yBlocks.get(0).get("text").insert(5, " 수정");
  // 둘째 문단: 글자는 그대로, 문단 글꼴만 바꿈(편집기의 updateParagraphStyle과 같게)
  yBlocks.get(1).set("fontFamily", "Pretendard, -apple-system, sans-serif");
  yBlocks.get(1).set("fontEdited", true);

  const { sectionXml, headerXml } = serializeBlocksToHwpxPackage(extractBlocksFromYDoc(doc), ORIGINAL_SECTION, ORIGINAL_HEADER);
  assert.equal(runCharPr(sectionXml, "원본 문단 수정"), "0");
  const newId = runCharPr(sectionXml, "둘째 문단");
  assert.ok(newId && newId !== "0", "글꼴만 바꾼 문단도 새 글자 모양을 가리켜야 한다");
  assert.ok(sectionXml.includes('<hp:p id="1" paraPrIDRef="0" styleIDRef="0">'), "글꼴만 바꾼 문단은 원본 문단 XML을 그대로 쓴다");

  for (const lang of ["HANGUL", "LATIN"]) {
    const group = fontGroup(headerXml, lang);
    assert.ok(group.includes('fontCnt="3"'), lang);
    assert.ok(group.includes('<hh:font id="1" face="함초롬돋움"'), lang);
    assert.ok(group.includes('<hh:font id="2" face="Pretendard"'), lang);
  }
  assert.ok(charPrById(headerXml, newId).includes('<hh:fontRef hangul="2" latin="2"'));
  assert.ok(headerXml.includes('<hh:charProperties itemCnt="2">'));
});
