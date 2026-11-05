import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHwpxText, isHwpxName, newHwpxBytes, readZipEntries, updateHwpxBytes, updateHwpxSectionXml } from '../src/lib/hwpx.ts';
import { extractWorkspaceText } from '../src/lib/extractWorkspaceText.ts';

test('isHwpxName: .hwpx 확장자를 정확히 판별한다', () => {
  assert.equal(isHwpxName('문서.hwpx'), true);
  assert.equal(isHwpxName('문서.HWPX'), true);
  assert.equal(isHwpxName('과제_최종.hwpx'), true);
  assert.equal(isHwpxName('문서.hwp'), false);
  assert.equal(isHwpxName('문서.docx'), false);
  assert.equal(isHwpxName('hwpx'), false);
});

test('newHwpxBytes: 표준 OWPML HWPX ZIP 컨테이너를 올바르게 생성한다', async () => {
  const bytes = await newHwpxBytes('테스트 한글 본문입니다.');
  assert.ok(bytes.length > 0);

  const entries = await readZipEntries(bytes);
  assert.ok(entries.has('mimetype'), 'mimetype이 있어야 함');
  assert.equal(new TextDecoder().decode(entries.get('mimetype')), 'application/hnc+zip');
  assert.ok(entries.has('version.xml'), 'version.xml이 있어야 함');
  assert.ok(entries.has('META-INF/container.xml'), 'container.xml이 있어야 함');
  assert.ok(entries.has('Contents/content.hpf'), 'content.hpf가 있어야 함');
  assert.ok(entries.has('Contents/header.xml'), 'header.xml이 있어야 함');
  assert.ok(entries.has('Contents/section0.xml'), 'section0.xml이 있어야 함');

  const text = await extractHwpxText(bytes);
  assert.equal(text, '테스트 한글 본문입니다.');
});

test('updateHwpxBytes: 기존 HWPX의 용지 설정 등을 유지하며 본문 텍스트를 정상 수정한다', async () => {
  const initial = await newHwpxBytes('원래 본문 1\n원래 본문 2');
  const modified = await updateHwpxBytes(initial, '수정된 첫 줄\n수정된 둘째 줄 <특수문자 & 기호>\n셋째 줄');

  const text = await extractHwpxText(modified);
  assert.equal(text, '수정된 첫 줄\n수정된 둘째 줄 <특수문자 & 기호>\n셋째 줄');

  // section0.xml 내부 검증
  const entries = await readZipEntries(modified);
  const sectionXml = new TextDecoder().decode(entries.get('Contents/section0.xml'));
  assert.ok(sectionXml.includes('<hp:secPr/>'), '구역 설정 태그가 보존되어야 함');
  assert.ok(sectionXml.includes('&lt;특수문자 &amp; 기호&gt;'), 'XML 특수문자가 안전하게 이스케이프되어야 함');
});

test('extractWorkspaceText: .hwpx 파일에서 텍스트를 검색용으로 정상 추출한다', async () => {
  const bytes = await newHwpxBytes('프로젝트 협업 워크스페이스 한글 문서');
  const file = new File([bytes], '과제.hwpx', { type: 'application/hnc+zip' });
  const result = await extractWorkspaceText(file);
  assert.equal(result.status, 'ready');
  assert.equal(result.text, '프로젝트 협업 워크스페이스 한글 문서');
});

