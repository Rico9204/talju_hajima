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
  assert.ok(pkg.sectionXml.includes('pageBreak="false" columnBreak="false" merged="false"'));

  // 2. header.xml has fontRef child element and paraPr with align/lineSpacing
  assert.ok(pkg.headerXml.includes('<hh:fontRef hangul="0" latin="0"'));
  assert.ok(pkg.headerXml.includes('<hh:align horizontal="CENTER" vertical="BASELINE"/>'));
  assert.ok(pkg.headerXml.includes('<hh:lineSpacing type="PERCENT" value="160"/>'));

  // 3. Package to ZIP and check mimetype is first entry at offset 0
  const entries = new Map();
  entries.set('Contents/section0.xml', new TextEncoder().encode(pkg.sectionXml));
  entries.set('Contents/header.xml', new TextEncoder().encode(pkg.headerXml));
  entries.set('mimetype', new TextEncoder().encode('application/hnc+zip'));

  const zipBytes = await writeZipEntries(entries);
  // In ZIP format: Local file header starts at offset 0: 50 4B 03 04
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const nameLen = view.getUint16(26, true);
  const fileName = new TextDecoder().decode(zipBytes.subarray(30, 30 + nameLen));
  assert.equal(fileName, 'mimetype');
});
