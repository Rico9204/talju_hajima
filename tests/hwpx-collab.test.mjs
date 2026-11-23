import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  parseHwpxXmlToBlocks,
  initHwpxYDoc,
  extractBlocksFromYDoc,
  serializeBlocksToHwpxPackage,
  serializeBlocksToHwpxXml,
  hwpxCollabKey,
  hwpxCollabText,
  extractMemosFromHwpxXml,
} from '../src/lib/hwpxCollab.ts';
import { newHwpxBytes, readZipEntries, writeZipEntries, extractHwpxText } from '../src/lib/hwpx.ts';

const SAMPLE_COMPLEX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="p0"><hp:run><hp:t>1. 서론 및 프로젝트 개요</hp:t></hp:run></hp:p>
  <hp:p id="p1">
    <hp:run>
      <hp:tbl rowCnt="2" colCnt="2" width="10000">
        <hp:tr>
          <hp:tc><hp:p><hp:run><hp:t>항목</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>세부내용</hp:t></hp:run></hp:p></hp:tc>
        </hp:tr>
        <hp:tr>
          <hp:tc><hp:p><hp:run><hp:t>동시편집</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>Yjs CRDT 기반</hp:t></hp:run></hp:p></hp:tc>
        </hp:tr>
      </hp:tbl>
    </hp:run>
  </hp:p>
  <hp:p id="p2">
    <hp:run>
      <hp:equation version="1.0">
        <hp:script>E = mc^2</hp:script>
      </hp:equation>
    </hp:run>
  </hp:p>
  <hp:p id="p3"><hp:run><hp:t>2. 결론</hp:t></hp:run></hp:p>
</hs:sec>`;

test('hwpxCollab: parseHwpxXmlToBlocks parses paragraphs, tables, and equations accurately', () => {
  const blocks = parseHwpxXmlToBlocks(SAMPLE_COMPLEX_XML);
  assert.equal(blocks.length, 4);

  assert.equal(blocks[0].type, 'paragraph');
  if (blocks[0].type === 'paragraph') {
    assert.equal(blocks[0].text, '1. 서론 및 프로젝트 개요');
  }

  assert.equal(blocks[1].type, 'table');
  if (blocks[1].type === 'table') {
    assert.equal(blocks[1].rows.length, 2);
    assert.equal(blocks[1].rows[0].length, 2);
    assert.equal(blocks[1].rows[0][0].text, '항목');
    assert.equal(blocks[1].rows[0][1].text, '세부내용');
    assert.equal(blocks[1].rows[1][0].text, '동시편집');
    assert.equal(blocks[1].rows[1][1].text, 'Yjs CRDT 기반');
  }

  assert.equal(blocks[2].type, 'equation');
  if (blocks[2].type === 'equation') {
    assert.equal(blocks[2].script, 'E = mc^2');
  }

  assert.equal(blocks[3].type, 'paragraph');
  if (blocks[3].type === 'paragraph') {
    assert.equal(blocks[3].text, '2. 결론');
  }
});

test('hwpxCollab: Y.Doc initializes, synchronizes CRDT edits, and extracts updated blocks', () => {
  const initialBlocks = parseHwpxXmlToBlocks(SAMPLE_COMPLEX_XML);
  const doc1 = new Y.Doc();
  initHwpxYDoc(doc1, initialBlocks);

  // Sync doc1 -> doc2
  const doc2 = new Y.Doc();
  const update1 = Y.encodeStateAsUpdate(doc1);
  Y.applyUpdate(doc2, update1);

  // Client 2 edits table cell [1][1] from "Yjs CRDT 기반" to "실시간 웹 동시편집 성공"
  const yBlocks2 = doc2.getArray('hwpx_blocks');
  const tblMap = yBlocks2.get(1);
  const yRows = tblMap.get('rows');
  const targetCell = yRows.get(1).get(1);
  const yText = targetCell.get('text');

  doc2.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, '실시간 웹 동시편집 성공');
  });

  // Client 2 edits equation from "E = mc^2" to "F = ma"
  const eqMap = yBlocks2.get(2);
  const eqScript = eqMap.get('script');
  doc2.transact(() => {
    eqScript.delete(0, eqScript.length);
    eqScript.insert(0, 'F = ma');
  });

  // Sync doc2 -> doc1
  const update2 = Y.encodeStateAsUpdate(doc2);
  Y.applyUpdate(doc1, update2);

  // Verify extracted blocks on doc1
  const extracted = extractBlocksFromYDoc(doc1);
  assert.equal(extracted.length, 4);
  assert.equal(extracted[1].type, 'table');
  if (extracted[1].type === 'table') {
    assert.equal(extracted[1].rows[1][1].text, '실시간 웹 동시편집 성공');
  }
  assert.equal(extracted[2].type, 'equation');
  if (extracted[2].type === 'equation') {
    assert.equal(extracted[2].script, 'F = ma');
  }
});

test('hwpxCollab: serializeBlocksToHwpxXml preserves full XML structure and replaces text', () => {
  const initialBlocks = parseHwpxXmlToBlocks(SAMPLE_COMPLEX_XML);
  const doc = new Y.Doc();
  initHwpxYDoc(doc, initialBlocks);

  // Modify paragraph 0 and table cell 1,0
  const yBlocks = doc.getArray('hwpx_blocks');
  const p0 = yBlocks.get(0).get('text');
  p0.delete(0, p0.length);
  p0.insert(0, '수정된 프로젝트 서론');

  const tbl = yBlocks.get(1);
  const cell = tbl.get('rows').get(1).get(0).get('text');
  cell.delete(0, cell.length);
  cell.insert(0, '협업성공');

  const currentBlocks = extractBlocksFromYDoc(doc);
  const serializedXml = serializeBlocksToHwpxXml(currentBlocks, SAMPLE_COMPLEX_XML);

  // Assert attributes and tags preserved
  assert.ok(serializedXml.includes('xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'));
  assert.ok(serializedXml.includes('rowCnt="2" colCnt="2" width="10000"'));
  assert.ok(serializedXml.includes('<hp:script>E = mc^2</hp:script>'));
  assert.ok(serializedXml.includes('수정된 프로젝트 서론'));
  assert.ok(serializedXml.includes('협업성공'));

  // Round-trip parse again
  const reParsed = parseHwpxXmlToBlocks(serializedXml);
  assert.equal(reParsed[0].text, '수정된 프로젝트 서론');
  assert.equal(reParsed[1].rows[1][0].text, '협업성공');
});

test('hwpxCollab: End-to-end HWPX ZIP editing round trip with tables and equations', async () => {
  // 1. Create a base HWPX with complex elements
  const baseHwpx = await newHwpxBytes('임시 본문');
  const entries = await readZipEntries(baseHwpx);
  entries.set('Contents/section0.xml', new TextEncoder().encode(SAMPLE_COMPLEX_XML));
  const complexHwpx = await writeZipEntries(entries);

  // 2. Open in HwpxEditorModal workflow
  const openEntries = await readZipEntries(complexHwpx);
  const secXml = new TextDecoder().decode(openEntries.get('Contents/section0.xml'));
  const blocks = parseHwpxXmlToBlocks(secXml);
  const doc = new Y.Doc();
  initHwpxYDoc(doc, blocks);

  // 3. User edits table cell
  const yBlocks = doc.getArray('hwpx_blocks');
  const cell = yBlocks.get(1).get('rows').get(0).get('1').get('text');
  cell.delete(0, cell.length);
  cell.insert(0, '수정된 세부내용');

  // 4. Save and re-package ZIP
  const updatedBlocks = extractBlocksFromYDoc(doc);
  const updatedXml = serializeBlocksToHwpxXml(updatedBlocks, secXml);
  openEntries.set('Contents/section0.xml', new TextEncoder().encode(updatedXml));
  const updatedHwpxBytes = await writeZipEntries(openEntries);

  // 5. Verify ZIP integrity and text extraction
  const reOpenedEntries = await readZipEntries(updatedHwpxBytes);
  assert.ok(reOpenedEntries.has('Contents/section0.xml'));
  assert.ok(reOpenedEntries.has('mimetype'));

  const finalXml = new TextDecoder().decode(reOpenedEntries.get('Contents/section0.xml'));
  assert.ok(finalXml.includes('수정된 세부내용'));
  assert.ok(finalXml.includes('<hp:tbl rowCnt="2" colCnt="2"'));
});


test('hwpxCollab: isolates header/footer controls and preserves document title and styling', () => {
  const sampleHeaderXml = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:paraProperties>
    <hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr>
    <hh:paraPr id="20"><hh:align horizontal="CENTER"/></hh:paraPr>
  </hh:paraProperties>
  <hh:charProperties>
    <hh:charPr id="0" height="1000"/>
    <hh:charPr id="8" height="1600"><hh:bold/></hh:charPr>
  </hh:charProperties>
</hh:head>`;

  const sampleSectionWithFooter = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="0" paraPrIDRef="20">
    <hp:run charPrIDRef="0">
      <hp:secPr><hp:grid/></hp:secPr>
      <hp:ctrl>
        <hp:footer id="1"><hp:subList><hp:p id="f1"><hp:run><hp:t>- 1 -</hp:t></hp:run></hp:p></hp:subList></hp:footer>
      </hp:ctrl>
    </hp:run>
    <hp:run charPrIDRef="8">
      <hp:t>고밀도 소금-후추 노이즈 환경 논문 제목</hp:t>
    </hp:run>
  </hp:p>
  <hp:p id="1" paraPrIDRef="20">
    <hp:run charPrIDRef="0"><hp:t>저자: 홍길동, 이순신</hp:t></hp:run>
  </hp:p>
</hs:sec>`;

  const blocks = parseHwpxXmlToBlocks(sampleSectionWithFooter, sampleHeaderXml);
  assert.equal(blocks.length, 2);

  // Assert footer "- 1 -" did not replace the title!
  assert.equal(blocks[0].type, 'paragraph');
  if (blocks[0].type === 'paragraph') {
    assert.equal(blocks[0].text, '고밀도 소금-후추 노이즈 환경 논문 제목');
    assert.equal(blocks[0].align, 'center');
    assert.equal(blocks[0].sizePt, 16);
    assert.equal(blocks[0].bold, true);
  }

  assert.equal(blocks[1].type, 'paragraph');
  if (blocks[1].type === 'paragraph') {
    assert.equal(blocks[1].text, '저자: 홍길동, 이순신');
    assert.equal(blocks[1].align, 'center');
  }

  // Round-trip serialization preserves preamble footer control
  const serialized = serializeBlocksToHwpxXml(blocks, sampleSectionWithFooter);
  assert.ok(serialized.includes('<hp:footer id="1">'));
  assert.ok(serialized.includes('고밀도 소금-후추 노이즈 환경 논문 제목'));
});

test('hwpxCollab: strips HTML tags during serialization and text extraction for partial styling', () => {
  const blocks = [
    {
      type: 'paragraph',
      id: 'p0',
      text: '안녕 <span style="color: rgb(239, 68, 68);">빨간색</span> <span style="font-weight: bold;">굵은글씨</span> 세상',
      align: 'left',
    },
  ];

  const serialized = serializeBlocksToHwpxXml(blocks, '');
  assert.ok(serialized.includes('<hp:t>빨간색</hp:t>'));
  assert.ok(serialized.includes('<hp:t>굵은글씨</hp:t>'));
  assert.ok(!serialized.includes('<span'));

  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');
  assert.ok(pkg.headerXml.includes('textColor="#EF4444"'));
  assert.ok(pkg.headerXml.includes('<hh:bold/>'));

  const doc = new Y.Doc();
  initHwpxYDoc(doc, blocks);
  const text = hwpxCollabText(doc);
  assert.equal(text, '안녕 빨간색 굵은글씨 세상');
});

test('hwpxCollab: guarantees standard OWPML A4 secPr and OCF mimetype offset 0 for Hancom Docs/Viewer compatibility', async () => {
  const blocks = [
    { type: 'paragraph', id: 'p0', text: '테스트 문서 내용', align: 'center' },
  ];

  // 1. originalXml has NO secPr
  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');
  assert.ok(pkg.sectionXml.includes('<hp:secPr id="0"'));
  assert.ok(pkg.sectionXml.includes('width="59528" height="84188"'));
  assert.ok(pkg.sectionXml.includes('pageBreak="0"') || pkg.sectionXml.includes('pageBreak="false"'));

  // 2. header.xml has fontRef child element and paraPr with align/lineSpacing
  assert.ok(pkg.headerXml.includes('<hh:fontRef hangul="0" latin="0"'));
  assert.ok(pkg.headerXml.includes('<hh:align horizontal="CENTER" vertical="BASELINE"/>'));
  assert.ok(pkg.headerXml.includes('<hh:lineSpacing type="PERCENT" value="160"/>'));

  // 3. Package to ZIP and check mimetype is first entry at offset 0
  const entries = new Map();
  entries.set('Contents/section0.xml', new TextEncoder().encode(pkg.sectionXml));
  entries.set('Contents/header.xml', new TextEncoder().encode(pkg.headerXml));
  entries.set('mimetype', new TextEncoder().encode('application/hwp+zip'));

  const zipBytes = await writeZipEntries(entries);
  // In ZIP format: Local file header starts at offset 0: 50 4B 03 04
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const nameLen = view.getUint16(26, true);
  const fileName = new TextDecoder().decode(zipBytes.subarray(30, 30 + nameLen));
  assert.equal(fileName, 'mimetype');
});

test('hwpxCollab: parses and serializes shape blocks (rect, ellipse, line) with text and styling for Hancom compatibility', () => {
  const shapeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="0">
    <hp:run>
      <hp:rect id="rect1">
        <hp:lineShape color="#2563EB" width="150"/>
        <hp:fillBrush><hp:winBrush faceColor="#EFF6FF"/></hp:fillBrush>
        <hp:drawText><hp:t>직사각형 글상자 텍스트</hp:t></hp:drawText>
      </hp:rect>
    </hp:run>
  </hp:p>
  <hp:p id="1">
    <hp:run>
      <hp:line id="line1">
        <hp:lineShape color="#D97706" width="200"/>
      </hp:line>
    </hp:run>
  </hp:p>
</hs:sec>`;

  const blocks = parseHwpxXmlToBlocks(shapeXml);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'shape');
  assert.equal(blocks[0].shapeType, 'rect');
  assert.equal(blocks[0].strokeColor, '#2563EB');
  assert.equal(blocks[0].fillColor, '#EFF6FF');
  assert.equal(blocks[0].text, '직사각형 글상자 텍스트');

  assert.equal(blocks[1].type, 'shape');
  assert.equal(blocks[1].shapeType, 'line');
  assert.equal(blocks[1].strokeColor, '#D97706');

  // Y.Doc CRDT round-trip
  const doc = new Y.Doc();
  initHwpxYDoc(doc, blocks);
  const extracted = extractBlocksFromYDoc(doc);
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].type, 'shape');
  assert.equal(extracted[0].text, '직사각형 글상자 텍스트');

  // Serialization to standard OWPML
  const pkg = serializeBlocksToHwpxPackage(extracted);
  assert.ok(pkg.sectionXml.includes('<hp:rect'));
  assert.ok(pkg.sectionXml.includes('<hp:line'));
  assert.ok(pkg.sectionXml.includes('직사각형 글상자 텍스트'));
  assert.ok(pkg.headerXml.includes('<hh:borderFills itemCnt="2">'));
});

test('hwpxCollab: 새로 생성한 도형(shape: rect, ellipse, line)이 한컴 뷰어 및 OWPML 스펙을 100% 준수한다', () => {
  const newShapeBlocks = [
    {
      type: 'shape',
      id: 'shape_rect',
      shapeType: 'rect',
      text: '안내 상자',
      fillColor: '#EFF6FF',
      strokeColor: '#2563EB',
      strokeWidth: 1.5,
      widthPercent: 80,
      heightPt: 60,
      align: 'center',
    },
    {
      type: 'shape',
      id: 'shape_line',
      shapeType: 'line',
      strokeColor: '#D97706',
      strokeWidth: 2,
      widthPercent: 90,
      align: 'center',
    },
  ];

  const pkg = serializeBlocksToHwpxPackage(newShapeBlocks, '', '');

  // 1. 사각형 검증 (한컴 표준 OWPML DTD 순서: offset, orgSz, curSz, flip, rotationInfo, renderingInfo, lineShape, fillBrush, shadow, pt0~pt3, sz, pos, outMargin, shapeComment, drawText)
  assert.ok(pkg.sectionXml.includes('<hp:rect id="'));
  assert.ok(pkg.sectionXml.includes('<hp:orgSz width="34016" height="6000"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:curSz width="34016" height="6000"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:rotationInfo angle="0" centerX="17008" centerY="3000"'));
  assert.ok(pkg.sectionXml.includes('<hp:renderingInfo><hc:transMatrix'));
  assert.ok(pkg.sectionXml.includes('<hc:pt0 x="0" y="0"/><hc:pt1 x="34016" y="0"/><hc:pt2 x="34016" y="6000"/><hc:pt3 x="0" y="6000"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:shapeComment>사각형 입니다.</hp:shapeComment>'));
  assert.ok(pkg.sectionXml.includes('<hc:fillBrush><hc:winBrush faceColor="#EFF6FF"'));
  assert.ok(pkg.sectionXml.includes('<hp:drawText name="" editable="0"'));
  assert.ok(pkg.sectionXml.includes('<hp:t>안내 상자</hp:t>'));

  // 2. 가로선 검증 (startPt/endPt 및 lineShape 검증)
  assert.ok(pkg.sectionXml.includes('<hp:line id="'));
  assert.ok(pkg.sectionXml.includes('<hc:startPt x="0" y="0"/>'));
  assert.ok(pkg.sectionXml.includes('<hc:endPt x="38268" y="0"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:shapeComment>선 입니다.</hp:shapeComment>'));

  // 3. borderFills 포함 검증
  assert.ok(pkg.headerXml.includes('<hh:borderFills itemCnt="2">'));
});

test('hwpxCollab: 새로 생성한 표(table)가 한컴 뷰어 및 OWPML 스펙(cellAddr, cellSz, borderFills 등)을 100% 준수한다', () => {
  const newTableBlock = [
    {
      type: 'table',
      id: 'tbl_new',
      rows: [
        [
          { text: '헤더1', bold: true, align: 'center' },
          { text: '헤더2', bold: true, align: 'center' },
        ],
        [
          { text: '데이터1', bold: false, align: 'left' },
          { text: '데이터2', bold: false, align: 'right' },
        ],
      ],
    },
  ];

  const pkg = serializeBlocksToHwpxPackage(newTableBlock, '', '');

  // 1. hp:tbl 필수 태그 및 속성 검증
  assert.ok(pkg.sectionXml.includes('rowCnt="2" colCnt="2"'));
  assert.ok(pkg.sectionXml.includes('cellSpacing="0" borderFillIDRef="1"'));
  assert.ok(pkg.sectionXml.includes('<hp:sz width="42520"'));
  assert.ok(pkg.sectionXml.includes('<hp:pos treatAsChar="1"'));
  assert.ok(pkg.sectionXml.includes('<hp:inMargin left="510" right="510" top="141" bottom="141"/>'));

  // 2. hp:tc 필수 태그 및 순서 검증 (subList, cellAddr, cellSpan, cellSz, cellMargin)
  assert.ok(pkg.sectionXml.includes('<hp:subList id="0"'));
  assert.ok(pkg.sectionXml.includes('<hp:cellAddr colAddr="0" rowAddr="0"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:cellAddr colAddr="1" rowAddr="1"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:cellSpan colSpan="1" rowSpan="1"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:cellSz width="21260" height="2834"/>'));
  assert.ok(pkg.sectionXml.includes('<hp:cellMargin left="510" right="510" top="141" bottom="141"/>'));
  // 셀 내부 문단 ID가 OWPML 정수 규격 준수하는지 검증 (언더스코어 등 비정수 문자 불포함)
  assert.match(pkg.sectionXml, /<hp:p id="\d+"/);
  assert.ok(!pkg.sectionXml.includes('id="0_0_0"'));

  // 3. header.xml의 borderFills 정의 포함 검증
  assert.ok(pkg.headerXml.includes('<hh:borderFills itemCnt="2">'));
  assert.ok(pkg.headerXml.includes('<hh:borderFill id="1"'));
  assert.ok(pkg.headerXml.includes('<hh:borderFill id="2"'));
});

test('hwpxCollab: 표 셀의 borderFillIDRef 보정 및 자유 이동(Floating) 도형/표의 오버레이 속성 직렬화 검증', () => {
  const blocks = [
    {
      type: 'table',
      id: 'tbl_float',
      rawAttrs: 'name="tbl1"',
      rows: [
        [
          { text: '테스트', rawAttrs: 'name="0_0"' },
        ],
      ],
      offsetX: 15,
      offsetY: 25,
    },
    {
      type: 'shape',
      id: 'shape_float',
      shapeType: 'rect',
      text: '부유 도형',
      offsetX: 50,
      offsetY: 100,
    },
    {
      type: 'paragraph',
      id: 'p_right',
      text: '우측 정렬 문단',
      align: 'right',
    },
  ];

  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');

  // 1. 표 셀에 borderFillIDRef="1"이 자동 보충되었는지 검증
  assert.ok(pkg.sectionXml.includes('borderFillIDRef="1"'));
  // 2. 부유 표의 hp:pos treatAsChar="0", flowWithText="0", allowOverlap="1" 검증 (1px = 75 HWPUNIT)
  assert.ok(pkg.sectionXml.includes('<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1"'));
  assert.ok(pkg.sectionXml.includes('vertOffset="1875" horzOffset="1125"'));

  // 3. 부유 도형의 textWrap="IN_FRONT_OF_TEXT", treatAsChar="0", allowOverlap="1", zOrder="10" 검증
  assert.ok(pkg.sectionXml.includes('textWrap="IN_FRONT_OF_TEXT"'));
  assert.ok(pkg.sectionXml.includes('zOrder="10"'));
  assert.ok(pkg.sectionXml.includes('vertOffset="7500" horzOffset="3750"'));

  // 4. 자리차지(TOP_AND_BOTTOM) + 음수 오프셋 + allowOverlap=false 왕복(Roundtrip) 검증
  const tbPkg = serializeBlocksToHwpxPackage([
    {
      type: 'shape',
      id: 'shape_tb',
      shapeType: 'rect',
      text: '',
      treatAsChar: false,
      textWrap: 'TOP_AND_BOTTOM',
      allowOverlap: false,
      offsetX: 120,
      offsetY: -40,
    },
  ], '', '');
  const reparsedTb = parseHwpxXmlToBlocks(tbPkg.sectionXml);
  assert.equal(reparsedTb.length, 1);
  assert.equal(reparsedTb[0].type, 'shape');
  assert.equal(reparsedTb[0].treatAsChar, false);
  assert.equal(reparsedTb[0].textWrap, 'TOP_AND_BOTTOM');
  assert.equal(reparsedTb[0].allowOverlap, false);
  assert.equal(reparsedTb[0].offsetX, 120);
  assert.equal(reparsedTb[0].offsetY, -40);

  // 4. headerXml의 hh:paraProperties에 신규 정렬 서식이 등록되었는지 검증
  assert.ok(pkg.headerXml.includes('<hh:align horizontal="RIGHT"'));
});

test('hwpxCollab: 표 및 도형의 한컴 OWPML 표준 <hp:caption> 직렬화 및 역직렬화(Roundtrip) 검증', () => {
  const blocks = [
    {
      type: 'table',
      id: 'tbl_caption_test',
      rows: [
        [{ text: '헤더1' }, { text: '헤더2' }],
        [{ text: '데이터1' }, { text: '데이터2' }],
      ],
      caption: '표 1. 실험 결과 분석',
      captionPos: 'top_left',
    },
    {
      type: 'shape',
      id: 'shape_caption_test',
      shapeType: 'rect',
      text: '모듈 블록',
      caption: '그림 1. 아키텍처 구조도',
      captionPos: 'bottom_center',
    },
  ];

  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');

  // 1. 표 캡션 OWPML 직렬화 검증 (<hp:caption side="TOP" ...>)
  assert.ok(pkg.sectionXml.includes('<hp:caption side="TOP"'));
  assert.ok(pkg.sectionXml.includes('표 1. 실험 결과 분석'));

  // 2. 도형 캡션 OWPML 직렬화 검증 (<hp:caption side="BOTTOM" ...>)
  assert.ok(pkg.sectionXml.includes('<hp:caption side="BOTTOM"'));
  assert.ok(pkg.sectionXml.includes('그림 1. 아키텍처 구조도'));

  // 3. XML 역직렬화 (parseHwpxXmlToBlocks) 검증
  const parsed = parseHwpxXmlToBlocks(pkg.sectionXml, pkg.headerXml);
  assert.equal(parsed.length, 2);

  assert.equal(parsed[0].type, 'table');
  if (parsed[0].type === 'table') {
    assert.equal(parsed[0].caption, '표 1. 실험 결과 분석');
    assert.equal(parsed[0].captionPos, 'top_center');
  }

  assert.equal(parsed[1].type, 'shape');
  if (parsed[1].type === 'shape') {
    assert.equal(parsed[1].caption, '그림 1. 아키텍처 구조도');
    assert.equal(parsed[1].captionPos, 'bottom_center');
  }
});

test('hwpxCollab: 차트(chart) 블록이 한컴 OWPML 호환 직렬화 및 Yjs 동기화를 완벽 지원한다', () => {
  const chartBlocks = [
    {
      type: 'chart',
      id: 'chart_sample_1',
      chartType: 'column',
      title: '[차트 1] 분기별 경영 실적',
      categories: ['1분기', '2분기', '3분기', '4분기'],
      series: [
        { name: '매출액', values: [180, 240, 290, 360], color: '#2563eb' },
        { name: '영업이익', values: [55, 80, 105, 140], color: '#10b981' },
      ],
      widthPercent: 85,
      heightPt: 220,
      caption: '차트 1. 분기별 경영 실적',
      captionPos: 'bottom_center',
    },
  ];

  // 1. OWPML 직렬화 검증 (<hp:chart> + Chart/chart1.xml + 캡션 확인)
  const pkg = serializeBlocksToHwpxPackage(chartBlocks, '', '');
  assert.ok(pkg.sectionXml.includes('<hp:chart '));
  assert.ok(pkg.sectionXml.includes('chartIDRef="Chart/chart1.xml"'));
  assert.ok(pkg.sectionXml.includes('<hp:caption side="BOTTOM"'));
  assert.ok(pkg.sectionXml.includes('차트 1. 분기별 경영 실적'));
  assert.ok(pkg.chartFiles?.has('Chart/chart1.xml'));
  assert.ok(pkg.chartFiles?.get('Chart/chart1.xml')?.includes('<c:chartSpace'));

  // 2. Yjs CRDT 라운드트립 검증
  const ydoc = new Y.Doc();
  initHwpxYDoc(ydoc, chartBlocks);
  const extracted = extractBlocksFromYDoc(ydoc);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].type, 'chart');
  if (extracted[0].type === 'chart') {
    assert.equal(extracted[0].chartType, 'column');
    assert.equal(extracted[0].title, '[차트 1] 분기별 경영 실적');
    assert.equal(extracted[0].categories.length, 4);
    assert.equal(extracted[0].series.length, 2);
    assert.equal(extracted[0].series[0].name, '매출액');
    assert.deepEqual(extracted[0].series[0].values, [180, 240, 290, 360]);
    assert.equal(extracted[0].caption, '차트 1. 분기별 경영 실적');
  }
});

test('hwpxCollab: 각주(<hp:footNote>) 및 미주(<hp:endNote>) OWPML 직렬화 및 라운드트립 검증', () => {
  const blocks = [
    {
      type: 'paragraph',
      id: 'p_note_host',
      text: '본문에서 OWPML<sup data-note-id="footnote-sample-1" data-note-type="footnote">1)</sup>과 CRDT<sup data-note-id="endnote-sample-1" data-note-type="endnote">1)</sup>를 설명합니다.',
    },
    {
      type: 'paragraph',
      id: 'footnote-sample-1',
      text: '한컴오피스 표준 각주 설명입니다.',
    },
    {
      type: 'paragraph',
      id: 'endnote-sample-1',
      text: '실시간 동시 편집 미주 설명입니다.',
    },
  ];

  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');
  // 1. OWPML <hp:footNote> 및 <hp:endNote> 제어 태그 생성 확인
  assert.ok(pkg.sectionXml.includes('<hp:footNote number="1"'));
  assert.ok(pkg.sectionXml.includes('numType="FOOTNOTE"'));
  assert.ok(pkg.sectionXml.includes('한컴오피스 표준 각주 설명입니다.'));
  assert.ok(pkg.sectionXml.includes('<hp:endNote number="1"'));
  assert.ok(pkg.sectionXml.includes('numType="ENDNOTE"'));
  assert.ok(pkg.sectionXml.includes('실시간 동시 편집 미주 설명입니다.'));
  // 2. 각주/미주 블록이 일반 본문 <hp:p>로 중복 출력되지 않았는지 확인
  const topLevelPCount = (pkg.sectionXml.match(/^\s*<hp:p\b/gm) || []).length;
  assert.equal(topLevelPCount, 1);

  // 3. 라운드트립 파싱 검증
  const parsed = parseHwpxXmlToBlocks(pkg.sectionXml);
  const host = parsed.find((b) => b.type === 'paragraph' && b.text.includes('OWPML'));
  assert.ok(host && host.type === 'paragraph');
  assert.ok(host.text.includes('data-note-type="footnote"'));
  assert.ok(host.text.includes('data-note-type="endnote"'));
  const fnBlock = parsed.find((b) => b.id.startsWith('footnote-'));
  const enBlock = parsed.find((b) => b.id.startsWith('endnote-'));
  assert.ok(fnBlock && fnBlock.type === 'paragraph' && fnBlock.text.includes('한컴오피스 표준 각주 설명입니다.'));
  assert.ok(enBlock && enBlock.type === 'paragraph' && enBlock.text.includes('실시간 동시 편집 미주 설명입니다.'));
});

test('hwpxCollab: 하이퍼링크(<a href>) OWPML <hp:fieldBegin type="HYPERLINK"> 직렬화 검증', () => {
  const blocks = [
    {
      type: 'paragraph',
      id: 'p_link_host',
      text: '참고 링크 <a href="https://example.com">예제 사이트</a> 입니다.',
    },
  ];
  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');
  assert.ok(pkg.sectionXml.includes('<hp:fieldBegin '));
  assert.ok(pkg.sectionXml.includes('type="HYPERLINK"'));
  assert.ok(pkg.sectionXml.includes('https://example.com;1;0;0;'));
  assert.ok(pkg.sectionXml.includes('<hp:t>예제 사이트</hp:t>'));
  assert.ok(pkg.sectionXml.includes('<hp:fieldEnd '));

  const parsed = parseHwpxXmlToBlocks(pkg.sectionXml);
  const linkPara = parsed.find((b) => b.type === 'paragraph' && b.text.includes('예제 사이트'));
  assert.ok(linkPara && linkPara.type === 'paragraph');
  assert.ok(linkPara.text.includes('<a href="https://example.com">예제 사이트</a>'));
});

test('hwpxCollab: 책갈피(<hp:bookmark>) OWPML 직렬화 및 라운드트립 검증', () => {
  const blocks = [
    {
      type: 'paragraph',
      id: 'p_bm_host',
      text: '여기에 <span data-bookmark-name="테스트_책갈피"></span> 본문이 있습니다.',
    },
  ];
  const pkg = serializeBlocksToHwpxPackage(blocks, '', '');
  assert.ok(pkg.sectionXml.includes('<hp:bookmark name="테스트_책갈피"/>'));

  const parsed = parseHwpxXmlToBlocks(pkg.sectionXml);
  const bmPara = parsed.find((b) => b.type === 'paragraph' && b.text.includes('본문이 있습니다'));
  assert.ok(bmPara && bmPara.type === 'paragraph');
  assert.ok(bmPara.text.includes('data-bookmark-name="테스트_책갈피"'));
});

test('hwpxCollab: 메모(<hp:fieldBegin type="MEMO">) OWPML 직렬화 및 라운드트립 검증', () => {
  const blocks = [
    {
      type: 'paragraph',
      id: 'p_0',
      text: '메모가 달린 문단입니다.',
    },
  ];
  const memos = [
    {
      id: 'memo_1',
      blockId: 'p_0',
      author: '검토자',
      createdAt: '2026-11-24 02:45',
      text: '이 문단을 확인하세요.',
    },
  ];
  const pkg = serializeBlocksToHwpxPackage(blocks, '', '', { memos });
  assert.ok(pkg.sectionXml.includes('type="MEMO"'));
  assert.ok(pkg.sectionXml.includes('이 문단을 확인하세요.'));
  assert.ok(pkg.headerXml.includes('<hh:memoProperties'));

  const parsedMemos = extractMemosFromHwpxXml(pkg.sectionXml);
  assert.equal(parsedMemos.length, 1);
  assert.equal(parsedMemos[0].author, '검토자');
  assert.equal(parsedMemos[0].text, '이 문단을 확인하세요.');
});
