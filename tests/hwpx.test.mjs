import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canQuickEditHwpx,
  decodeXmlEntities,
  extractHwpxSectionText,
  extractHwpxText,
  inspectHwpx,
  isHwpxName,
  newHwpxBytes,
  parseHwpxSectionXml,
  readZipEntries,
  updateHwpxBytes,
  writeZipEntries,
} from '../src/lib/hwpx.ts';
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

  // OWPML 표준 네임스페이스 및 규격 확인
  const sectionXml = new TextDecoder().decode(entries.get('Contents/section0.xml'));
  assert.ok(sectionXml.includes('http://www.hancom.co.kr/hwpml/2011/section'));
  assert.ok(sectionXml.includes('http://www.hancom.co.kr/hwpml/2011/paragraph'));

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
  assert.ok(sectionXml.includes('<hp:secPr'), '구역 설정 태그가 보존되어야 함');
  assert.ok(sectionXml.includes('&lt;특수문자 &amp; 기호&gt;'), 'XML 특수문자가 안전하게 이스케이프되어야 함');
});

test('extractWorkspaceText: .hwpx 파일에서 텍스트를 검색용으로 정상 추출한다', async () => {
  const bytes = await newHwpxBytes('프로젝트 협업 워크스페이스 한글 문서');
  const file = new File([bytes], '과제.hwpx', { type: 'application/hnc+zip' });
  const result = await extractWorkspaceText(file);
  assert.equal(result.status, 'ready');
  assert.equal(result.text, '프로젝트 협업 워크스페이스 한글 문서');
});

// ── [필수 1-1] 표·이미지·서식 손상 방지 테스트 ──
test('1-1: 표·그림·수식 등 복합 서식이 있는 문서는 빠른 편집을 안전하게 차단한다', async () => {
  const initial = await newHwpxBytes('기본 텍스트');
  const entries = await readZipEntries(initial);

  // 표(<hp:tbl>) 및 그림(<hp:pic>)이 포함된 복합 XML 생성
  const complexXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="0"><hp:run><hp:t>표 앞의 문단</hp:t></hp:run></hp:p>
  <hp:p id="1">
    <hp:run>
      <hp:tbl id="100">
        <hp:tr><hp:tc><hp:p><hp:run><hp:t>표 1행 1열 셀</hp:t></hp:run></hp:p></hp:tc></hp:tr>
      </hp:tbl>
      <hp:pic id="101" />
    </hp:run>
  </hp:p>
</hs:sec>`;

  entries.set('Contents/section0.xml', new TextEncoder().encode(complexXml));
  const complexHwpx = await writeZipEntries(entries);

  // 1. inspectHwpx 및 canQuickEditHwpx로 복합 서식 감지 및 편집 차단 확인
  const inspection = await inspectHwpx(complexHwpx);
  assert.equal(inspection.hasComplexElements, true);
  assert.equal(inspection.canQuickEdit, false);
  assert.ok(inspection.reason?.includes('표, 그림, 도형 또는 수식'));

  const check = await canQuickEditHwpx(complexHwpx);
  assert.equal(check.allowed, false);

  // 2. updateHwpxBytes 호출 시 에러가 발생하여 원본 서식이 덮어씌워지지 않음을 보장
  await assert.rejects(
    async () => {
      await updateHwpxBytes(complexHwpx, '덮어쓰려는 단순 텍스트');
    },
    { message: /표, 그림, 도형 또는 수식/ }
  );

  // 3. 텍스트 추출 자체는 표 안팎 내용을 모두 정상 추출함을 검증
  const extracted = await extractHwpxText(complexHwpx);
  assert.ok(extracted.includes('표 앞의 문단'));
  assert.ok(extracted.includes('표 1행 1열 셀'));

  // 4. 한컴오피스 한글 프로그램이 자동 생성하는 linesegarray(줄나눔 레이아웃 캐시)가 있는 순수 텍스트 문서는 차단되지 않고 편집 허용됨을 검증
  const hancomTextXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="0">
    <hp:run charPrIDRef="0"><hp:t>한글 프로그램에서 작성한 일반 텍스트입니다.</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="12000" flags="393216"/></hp:linesegarray>
  </hp:p>
</hs:sec>`;
  entries.set('Contents/section0.xml', new TextEncoder().encode(hancomTextXml));
  const hancomHwpx = await writeZipEntries(entries);
  const hancomInspection = await inspectHwpx(hancomHwpx);
  assert.equal(hancomInspection.hasComplexElements, false, 'linesegarray는 복합 서식으로 취급되지 않아야 함');
  assert.equal(hancomInspection.canQuickEdit, true, '일반 텍스트 문서는 빠른 편집이 허용되어야 함');
});

// ── [필수 1-2] 다중 섹션 중복 방지 테스트 ──
test('1-2: 섹션이 2개 이상인 문서는 빠른 편집을 차단하여 내용 중복 복제를 방지한다', async () => {
  const initial = await newHwpxBytes('섹션 0 내용');
  const entries = await readZipEntries(initial);

  // section1.xml 추가
  const sec1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="0"><hp:run><hp:t>섹션 1 내용</hp:t></hp:run></hp:p>
</hs:sec>`;
  entries.set('Contents/section1.xml', new TextEncoder().encode(sec1Xml));
  const multiSecHwpx = await writeZipEntries(entries);

  // 1. 다중 섹션 감지 및 빠른 편집 차단 확인
  const inspection = await inspectHwpx(multiSecHwpx);
  assert.equal(inspection.sectionCount, 2);
  assert.equal(inspection.canQuickEdit, false);
  assert.ok(inspection.reason?.includes('다중 구역(섹션)'));

  // 2. 텍스트 추출 시 섹션 순서대로 추출
  const extracted = await extractHwpxText(multiSecHwpx);
  assert.equal(extracted, '섹션 0 내용\n\n섹션 1 내용');

  // 3. 저장 시도 시 차단되어 section0에 전체가 덮어써져 내용이 기하급수적으로 중복 복제되는 현상을 원천 방지
  await assert.rejects(
    async () => {
      await updateHwpxBytes(multiSecHwpx, extracted);
    },
    { message: /다중 구역/ }
  );
});

// ── [필수 1-4] 정규식 파싱 버그 4대 엣지 케이스 해결 테스트 ──
test('1-4: XML 파싱 4가지 엣지 케이스 (표 안 문단, self-closing, 자식 태그, 숫자 엔티티) 완벽 지원', () => {
  // Case 1: 표 안의 문단이 있을 때 표 뒤의 글자가 유실되지 않음
  const case1Xml = `<hs:sec>
    <hp:p><hp:run><hp:t>바깥 문단 앞</hp:t></hp:run></hp:p>
    <hp:p>
      <hp:run>
        <hp:tbl>
          <hp:tr><hp:tc><hp:p><hp:run><hp:t>표 내부 글자</hp:t></hp:run></hp:p></hp:tc></hp:tr>
        </hp:tbl>
        <hp:t>표 뒤에 이어지는 바깥 글자</hp:t>
      </hp:run>
    </hp:p>
    <hp:p><hp:run><hp:t>바깥 문단 뒤</hp:t></hp:run></hp:p>
  </hs:sec>`;
  const res1 = parseHwpxSectionXml(case1Xml);
  assert.ok(res1.text.includes('바깥 문단 앞'));
  assert.ok(res1.text.includes('표 내부 글자'));
  assert.ok(res1.text.includes('표 뒤에 이어지는 바깥 글자'), '표 뒤의 글자가 유실되지 않아야 함');
  assert.ok(res1.text.includes('바깥 문단 뒤'));

  // Case 2: <hp:t/> 셀프클로징 태그
  const case2Xml = `<hs:sec>
    <hp:p><hp:run><hp:t/>첫번째</hp:run><hp:run><hp:t>두번째</hp:t></hp:run></hp:p>
  </hs:sec>`;
  const res2 = parseHwpxSectionXml(case2Xml);
  assert.equal(res2.text, '두번째');
  assert.ok(!res2.text.includes('hp:run'), '태그가 텍스트에 오염되지 않아야 함');

  // Case 3: <hp:t>a<hp:tab/>b</hp:t> 내부 자식 태그
  const case3Xml = `<hs:sec>
    <hp:p><hp:run><hp:t>왼쪽<hp:tab/>오른쪽<hp:lineBreak/>다음줄</hp:t></hp:run></hp:p>
  </hs:sec>`;
  const res3 = parseHwpxSectionXml(case3Xml);
  assert.equal(res3.text, '왼쪽\t오른쪽\n다음줄');

  // Case 4: &#10; 숫자 엔티티 및 16진수 엔티티 변환
  const case4Xml = `<hs:sec>
    <hp:p><hp:run><hp:t>첫 줄&#10;둘째 줄 &amp; &#x41;&#x42;&#x43;</hp:t></hp:run></hp:p>
  </hs:sec>`;
  const res4 = parseHwpxSectionXml(case4Xml);
  assert.equal(res4.text, '첫 줄\n둘째 줄 & ABC');
});

test('대용량 HWPX 파일(1MB 이상)도 데드락 없이 안정적으로 압축 해제 및 텍스트 추출이 가능하다', async () => {
  const bigText = '협업 워크스페이스 대용량 한글 문서 테스트 본문입니다.\n'.repeat(25000); // 약 800KB~1MB
  const bytes = await newHwpxBytes(bigText);
  assert.ok(bytes.length > 0);

  const start = Date.now();
  const extracted = await extractHwpxText(bytes);
  const elapsed = Date.now() - start;
  assert.equal(extracted.length, bigText.length);
  assert.ok(elapsed < 3000, `압축 해제가 3초 이내에 완료되어야 함 (소요 시간: ${elapsed}ms)`);
});
