import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import * as fflate from "fflate";
import * as Y from "yjs";
import { initHwpxYDoc, extractBlocksFromYDoc, serializeBlocksToHwpxPackage, parseHwpxXmlToBlocks, extractHwpxImageMap } from "../src/lib/hwpxCollab.ts";

test("hwpxCollab: 대용량 논문 문서(인라인 수식 54개, 이미지 5개) 편집 시 수식·그림 무손실 보존 및 서식 ID 유지", async () => {
  if (!fs.existsSync("f11.hwpx")) {
    return; // 파일이 없으면 스킵
  }
  const f11Bytes = fs.readFileSync("f11.hwpx");
  const unzipped = fflate.unzipSync(new Uint8Array(f11Bytes));
  const sec0Str = new TextDecoder().decode(unzipped["Contents/section0.xml"]);
  const headerStr = new TextDecoder().decode(unzipped["Contents/header.xml"]);

  // 0. 이미지 맵 추출
  const entriesMap = new Map();
  for (const [k, v] of Object.entries(unzipped)) {
    entriesMap.set(k, v);
  }
  const imageMap = extractHwpxImageMap(entriesMap);

  // 1. 파싱 (인라인 수식이 문단을 찢지 않고 자연스럽게 139개 문단으로 통합됨)
  const blocks = parseHwpxXmlToBlocks(sec0Str, headerStr, imageMap);
  assert.equal(blocks.length, 139, "인라인 수식이 문단을 찢지 않고 정상적으로 139개 문단으로 유지되어야 합니다");
  assert.equal(blocks[0].charPrId, "8", "논문 제목의 charPrId는 원본 8이어야 합니다");
  assert.equal(blocks[1].charPrId, "9", "저자 문단의 charPrId는 원본 9여야 합니다");

  const imageBlocks = blocks.filter(b => b.type === "image");
  assert.equal(imageBlocks.length, 5, "논문 내 5개 이미지가 모두 image 블록으로 추출되어야 합니다");
  for (const img of imageBlocks) {
    assert.ok(img.src.startsWith("data:image/"), "추출된 이미지에 유효한 base64 Data URL이 설정되어야 합니다");
    assert.ok(img.rawXml, "이미지 블록에 원본 rawXml이 유지되어야 합니다");
  }

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

  // 5. 수식(54개) 및 이미지(5개) 개수 100% 무손실 검증
  const origEqCount = (sec0Str.match(/<hp:equation\b/g) || []).length;
  const newEqCount = (newSec0.match(/<hp:equation\b/g) || []).length;
  assert.equal(newEqCount, origEqCount, "수식 54개가 1개도 유실 없이 모두 보존되어야 합니다");

  const origPicCount = (sec0Str.match(/<hp:pic\b/g) || []).length;
  const newPicCount = (newSec0.match(/<hp:pic\b/g) || []).length;
  assert.equal(newPicCount, origPicCount, "이미지 5개가 1개도 유실 없이 모두 보존되어야 합니다");
});

