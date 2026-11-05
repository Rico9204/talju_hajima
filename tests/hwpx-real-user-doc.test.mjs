import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import * as fflate from "fflate";
import * as Y from "yjs";
import { initHwpxYDoc, extractBlocksFromYDoc, serializeBlocksToHwpxPackage, parseHwpxXmlToBlocks } from "../src/lib/hwpxCollab.ts";

test("hwpxCollab: 대용량 논문 문서(각주, 꼬리말, 170개 블록) 편집 시 원본 서식 ID(charPrIDRef) 보존 및 무손실 직렬화", async () => {
  if (!fs.existsSync("f11.hwpx")) {
    return; // 파일이 없으면 스킵
  }
  const f11Bytes = fs.readFileSync("f11.hwpx");
  const unzipped = fflate.unzipSync(new Uint8Array(f11Bytes));
  const sec0Str = new TextDecoder().decode(unzipped["Contents/section0.xml"]);
  const headerStr = new TextDecoder().decode(unzipped["Contents/header.xml"]);

  // 1. 파싱
  const blocks = parseHwpxXmlToBlocks(sec0Str, headerStr);
  assert.equal(blocks.length, 170, "원본 블록 수가 170개여야 합니다");
  assert.equal(blocks[0].charPrId, "8", "논문 제목의 charPrId는 원본 8이어야 합니다");
  assert.equal(blocks[1].charPrId, "9", "저자 문단의 charPrId는 원본 9여야 합니다");

  // 2. Y.Doc 편집
  const ydoc = new Y.Doc();
  initHwpxYDoc(ydoc, blocks);
  const yBlocks = ydoc.getArray("hwpx_blocks");
  const yBlock1 = yBlocks.get(1);
  const ytext = yBlock1.get("text");
  ytext.insert(ytext.length, " (수정본)");
  const updatedBlocks = extractBlocksFromYDoc(ydoc);

  // 3. 직렬화
  const { sectionXml: newSec0, headerXml: newHeader } = serializeBlocksToHwpxPackage(updatedBlocks, sec0Str, headerStr);

  // 4. 검증: 원본 charPrIDRef가 유지되어야 함
  assert.ok(newSec0.includes('<hp:run charPrIDRef="8"><hp:t>고밀도 소금-후추'), "제목의 charPr 8이 유지되어야 합니다");
  assert.ok(newSec0.includes('<hp:run charPrIDRef="9"><hp:t>변의겸, 김민석, 박은규, 최언숙 (수정본)</hp:t></hp:run>'), "수정된 저자의 charPr 9가 유지되어야 합니다");
  assert.ok(newSec0.includes('<hp:run charPrIDRef="7"><hp:t>1. 서론</hp:t></hp:run>'), "1. 서론의 charPr 7이 유지되어야 합니다");

  // 5. 재파싱 검증: 170개 블록 그대로 복원
  const reloadedBlocks = parseHwpxXmlToBlocks(newSec0, newHeader);
  assert.equal(reloadedBlocks.length, 170, "직렬화 후 재파싱 시에도 170개 블록이 온전히 유지되어야 합니다");
});
