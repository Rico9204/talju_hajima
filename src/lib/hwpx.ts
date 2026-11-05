// HWPX(한글 표준 문서, KS X 6101 OWPML) 읽기·수정·생성 모듈.
// HWPX 파일은 ZIP 컨테이너 구조로, 본문은 Contents/section*.xml에 저장된다.
// 웹 표준 CompressionStream / DecompressionStream을 사용하여 별도 무거운 외부 의존성 없이
// HWPX 본문 텍스트 추출, 복합 서식 보호, 수정 후 ZIP 재패키징, 빈 HWPX 템플릿 생성을 지원한다.

export const HWPX_EXT = "hwpx";
export const HWPX_MIME = "application/hnc+zip";

export function isHwpxName(name: string): boolean {
  return name.toLowerCase().endsWith(`.${HWPX_EXT}`);
}

// ── CRC32 계산 ──
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Raw Deflate / Inflate ──
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as unknown as BodyInit).body!.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as unknown as BodyInit).body!.pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── ZIP 읽기 ──
export async function readZipEntries(buffer: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer instanceof Uint8Array ? buffer.buffer : buffer, buffer instanceof Uint8Array ? buffer.byteOffset : 0, buffer.byteLength);
  const bytes = new Uint8Array(buffer instanceof Uint8Array ? buffer.buffer : buffer, buffer instanceof Uint8Array ? buffer.byteOffset : 0, buffer.byteLength);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("올바른 ZIP(HWPX) 파일이 아닙니다.");

  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, Uint8Array>();
  let p = cdOffset;

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);

    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes).replace(/\\/g, "/");

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = bytes.subarray(dataStart, dataStart + compSize);

    let fileData: Uint8Array;
    if (method === 0) {
      fileData = rawData.slice();
    } else if (method === 8) {
      fileData = await inflateRaw(rawData);
    } else {
      fileData = rawData.slice();
    }
    entries.set(name, fileData);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ── ZIP 생성 ──
export async function writeZipEntries(entries: Map<string, Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const isMimetype = name === "mimetype";
    let compData = content;
    let method = 0; // Stored

    if (!isMimetype && content.length > 0) {
      const deflated = await deflateRaw(content);
      if (deflated.length < content.length) {
        compData = deflated;
        method = 8; // Deflated
      }
    }

    const crc = crc32(content);

    // Local Header (30 + nameBytes.length)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(lh.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, method, true);
    lhView.setUint16(10, 0, true);
    lhView.setUint16(12, 0, true);
    lhView.setUint32(14, crc, true);
    lhView.setUint32(18, compData.length, true);
    lhView.setUint32(22, content.length, true);
    lhView.setUint16(26, nameBytes.length, true);
    lhView.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    parts.push(lh);
    parts.push(compData);

    // Central Directory Header (46 + nameBytes.length)
    const cdh = new Uint8Array(46 + nameBytes.length);
    const cdhView = new DataView(cdh.buffer);
    cdhView.setUint32(0, 0x02014b50, true);
    cdhView.setUint16(4, 20, true);
    cdhView.setUint16(6, 20, true);
    cdhView.setUint16(8, 0, true);
    cdhView.setUint16(10, method, true);
    cdhView.setUint16(12, 0, true);
    cdhView.setUint16(14, 0, true);
    cdhView.setUint32(16, crc, true);
    cdhView.setUint32(20, compData.length, true);
    cdhView.setUint32(24, content.length, true);
    cdhView.setUint16(28, nameBytes.length, true);
    cdhView.setUint16(30, 0, true);
    cdhView.setUint16(32, 0, true);
    cdhView.setUint16(34, 0, true);
    cdhView.setUint16(36, 0, true);
    cdhView.setUint32(38, 0, true);
    cdhView.setUint32(42, offset, true);
    cdh.set(nameBytes, 46);

    cdParts.push(cdh);
    offset += lh.length + compData.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const c of cdParts) cdSize += c.length;

  // EOCD (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.size, true);
  eocdView.setUint16(10, entries.size, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of parts) { result.set(part, pos); pos += part.length; }
  for (const part of cdParts) { result.set(part, pos); pos += part.length; }
  result.set(eocd, pos);
  return result;
}

// ── XML 문자열 엔티티 인코딩 / 디코딩 ──
export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

export function decodeXmlEntities(str: string): string {
  return str.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g, (_, hex, dec, named) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    switch (named) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      default: return _;
    }
  });
}

// ── HWPX XML 본문 파싱 (표·셀프클로징·엔티티·자식태그 완벽 지원) ──
export interface HwpxSectionParseResult {
  text: string;
  hasComplexElements: boolean;
}

export function parseHwpxSectionXml(xmlStr: string): HwpxSectionParseResult {
  const paragraphStack: string[][] = [];
  const finishedParagraphs: string[] = [];
  let insideTextRun = false;
  let hasComplexElements = false;

  // 태그 매칭: <tag ...>, </tag>, <tag ... />, 또는 텍스트 노드
  const tokenRegex = /<(\/)?([a-zA-Z0-9_:]+)((?:\s+[^>]*)?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(xmlStr)) !== null) {
    const isClosing = !!match[1];
    const tagName = match[2]?.toLowerCase();
    const attrs = match[3] || "";
    const isSelfClosing = !!match[4] || attrs.trim().endsWith("/");
    const textContent = match[5];

    if (tagName) {
      const localName = tagName.split(":").pop()!;

      // 표, 그림, 도형, 수식, 차트, 비디오 등 실제 복합 서식 개체 감지
      // (단순 줄바꿈 레이아웃 캐시인 linesegarray 등은 제외)
      if ([
        "tbl", "pic", "drawobj", "equation", "ole", "chart",
        "rect", "ellipse", "line", "curve", "polygon", "arc",
        "video", "media", "audio", "formobject"
      ].includes(localName)) {
        hasComplexElements = true;
      }

      if (localName === "p") {
        if (!isClosing && !isSelfClosing) {
          paragraphStack.push([]);
        } else if (isClosing) {
          const cur = paragraphStack.pop();
          if (cur) finishedParagraphs.push(cur.join(""));
        }
      } else if (localName === "t") {
        if (!isClosing && !isSelfClosing) {
          insideTextRun = true;
        } else if (isClosing || isSelfClosing) {
          insideTextRun = false;
        }
      } else if (localName === "tab" && insideTextRun && paragraphStack.length > 0) {
        paragraphStack[paragraphStack.length - 1].push("\t");
      } else if (localName === "linebreak" && insideTextRun && paragraphStack.length > 0) {
        paragraphStack[paragraphStack.length - 1].push("\n");
      }
    } else if (textContent && insideTextRun && paragraphStack.length > 0) {
      paragraphStack[paragraphStack.length - 1].push(decodeXmlEntities(textContent));
    }
  }

  // 닫히지 않은 문단 스택 정리
  while (paragraphStack.length > 0) {
    const cur = paragraphStack.pop();
    if (cur) finishedParagraphs.push(cur.join(""));
  }

  return {
    text: finishedParagraphs.join("\n"),
    hasComplexElements,
  };
}

export function extractHwpxSectionText(xmlStr: string): string {
  return parseHwpxSectionXml(xmlStr).text;
}

// ── HWPX 파일 전체 텍스트 추출 ──
export async function extractHwpxText(input: Blob | Uint8Array | ArrayBuffer): Promise<string> {
  const buf = input instanceof Blob ? await input.arrayBuffer() : input;
  const entries = await readZipEntries(buf);
  const sections: string[] = [];

  // section0.xml, section1.xml 등 순서대로 자연 정렬
  const sectionKeys = Array.from(entries.keys())
    .filter((k) => /^Contents\/section\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (sectionKeys.length === 0) {
    for (const [k, v] of entries) {
      if (/section.*\.xml$/i.test(k)) {
        const text = extractHwpxSectionText(new TextDecoder().decode(v));
        if (text) sections.push(text);
      }
    }
  } else {
    for (const k of sectionKeys) {
      const v = entries.get(k);
      if (v) sections.push(extractHwpxSectionText(new TextDecoder().decode(v)));
    }
  }

  return sections.join("\n\n");
}

// ── HWPX 구조 검사 및 빠른 편집 가능 여부 진단 ──
export interface HwpxInspection {
  isHwpx: boolean;
  sectionCount: number;
  hasComplexElements: boolean;
  canQuickEdit: boolean;
  reason?: string;
  text: string;
}

export async function inspectHwpx(input: Blob | Uint8Array | ArrayBuffer): Promise<HwpxInspection> {
  const buf = input instanceof Blob ? await input.arrayBuffer() : input;
  const entries = await readZipEntries(buf);

  const sectionKeys = Array.from(entries.keys())
    .filter((k) => /^Contents\/section\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (sectionKeys.length === 0) {
    for (const [k] of entries) {
      if (/section.*\.xml$/i.test(k)) sectionKeys.push(k);
    }
    sectionKeys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const sections: string[] = [];
  let hasComplexElements = false;

  for (const k of sectionKeys) {
    const v = entries.get(k);
    if (!v) continue;
    const xml = new TextDecoder().decode(v);
    const parsed = parseHwpxSectionXml(xml);
    if (parsed.hasComplexElements) {
      hasComplexElements = true;
    }
    sections.push(parsed.text);
  }

  const sectionCount = sectionKeys.length;
  let canQuickEdit = true;
  let reason: string | undefined;

  if (sectionCount > 1) {
    canQuickEdit = false;
    reason = "다중 구역(섹션)으로 구성된 한글 문서는 서식 손상을 방지하기 위해 바로 수정이 제한됩니다.";
  } else if (hasComplexElements) {
    canQuickEdit = false;
    reason = "표, 그림, 도형 또는 수식이 포함된 한글 문서는 서식 손상을 방지하기 위해 바로 수정이 제한됩니다.";
  }

  return {
    isHwpx: true,
    sectionCount,
    hasComplexElements,
    canQuickEdit,
    reason,
    text: sections.join("\n\n"),
  };
}

export async function canQuickEditHwpx(input: Blob | Uint8Array | ArrayBuffer): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const inspection = await inspectHwpx(input);
    return {
      allowed: inspection.canQuickEdit,
      reason: inspection.reason,
    };
  } catch {
    return {
      allowed: false,
      reason: "한글 문서 구조를 읽을 수 없습니다.",
    };
  }
}

// ── HWPX 단일 섹션 XML 본문 업데이트 (단순 텍스트 문서 전용) ──
export function updateHwpxSectionXml(originalXml: string, newText: string): string {
  // 용지 여백, 페이지 설정(<hp:secPr>) 보존
  const secPrMatch = originalXml.match(/<hp:secPr\b(?:[^>]*\/>|[\s\S]*?<\/hp:secPr>)/);
  const secPr = secPrMatch ? secPrMatch[0] : "";

  // 루트 태그 네임스페이스 보존 (표준 OWPML 네임스페이스 사용)
  const rootOpenMatch = originalXml.match(/<hs:sec\b[^>]*>/);
  const rootOpen = rootOpenMatch ? rootOpenMatch[0] : '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">';

  const lines = newText.split(/\r?\n/);
  const newParagraphs = lines.map((line, idx) => {
    const secPrBlock = (idx === 0 && secPr) ? `<hp:run charPrIDRef="0">${secPr}</hp:run>` : "";
    const textBlock = `<hp:run charPrIDRef="0"><hp:t>${escapeXml(line)}</hp:t></hp:run>`;
    return `    <hp:p id="${idx}" paraPrIDRef="0" styleIDRef="0" pageBreak="false" columnBreak="false" merged="false">\n      ${secPrBlock}${textBlock}\n    </hp:p>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${rootOpen}\n${newParagraphs}\n</hs:sec>`;
}

// ── 기존 HWPX 파일의 본문 수정 후 ZIP 재패키징 ──
export async function updateHwpxBytes(originalHwpx: ArrayBuffer | Uint8Array, newText: string, force = false): Promise<Uint8Array> {
  const inspection = await inspectHwpx(originalHwpx);
  if (!inspection.canQuickEdit && !force) {
    throw new Error(inspection.reason ?? "복합 서식 또는 다중 섹션이 포함된 HWPX 문서는 빠른 편집을 지원하지 않습니다.");
  }

  const entries = await readZipEntries(originalHwpx);
  const sectionKey = Array.from(entries.keys()).find((k) => /^Contents\/section0\.xml$/i.test(k)) ?? "Contents/section0.xml";
  const existingSection = entries.get(sectionKey);
  const originalXml = existingSection ? new TextDecoder().decode(existingSection) : "";

  // 다중 섹션 강제 덮어쓰기 시 섹션 간 내용 중복 증식 방지
  if (force && inspection.sectionCount > 1) {
    for (const k of Array.from(entries.keys())) {
      if (/^Contents\/section\d+\.xml$/i.test(k) && !k.toLowerCase().endsWith("section0.xml")) {
        entries.delete(k);
      }
    }
  }

  const updatedXml = updateHwpxSectionXml(originalXml, newText);
  entries.set(sectionKey, new TextEncoder().encode(updatedXml));

  return writeZipEntries(entries);
}

// ── 새 빈 HWPX 템플릿 생성 (표준 OWPML 및 A4 용지 규격 준수) ──
export async function newHwpxBytes(initialText = ""): Promise<Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  entries.set("mimetype", new TextEncoder().encode("application/hnc+zip"));
  entries.set("version.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hcf/2011/version" major="1" minor="0" micro="0" buildNumber="0" os="1" application="1"/>`));
  entries.set("META-INF/container.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">\n  <ocf:rootfiles>\n    <ocf:rootfile ocf:full-path="Contents/content.hpf" ocf:media-type="application/hnc+zip"/>\n  </ocf:rootfiles>\n</ocf:container>`));
  entries.set("Contents/content.hpf", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="hwpx-id">\n  <opf:metadata>\n    <opf:title>문서</opf:title>\n    <opf:language>ko</opf:language>\n  </opf:metadata>\n  <opf:manifest>\n    <opf:item id="header" href="header.xml" media-type="application/xml"/>\n    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>\n  </opf:manifest>\n  <opf:spine>\n    <opf:itemref idref="section0"/>\n  </opf:spine>\n</opf:package>`));
  entries.set("Contents/header.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" version="1.0">\n  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>\n  <hh:refList>\n    <hh:fontfaces itemCnt="1">\n      <hh:fontface lang="hangul" fontCnt="1">\n        <hh:font id="0" face="함초롬바탕" type="ttf"/>\n      </hh:fontface>\n    </hh:fontfaces>\n    <hh:charProperties itemCnt="1">\n      <hh:charPr id="0" height="1000" textColor="#000000" fontRef="0"/>\n    </hh:charProperties>\n    <hh:paraProperties itemCnt="1">\n      <hh:paraPr id="0" align="left"/>\n    </hh:paraProperties>\n    <hh:styles itemCnt="1">\n      <hh:style id="0" type="para" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0"/>\n    </hh:styles>\n  </hh:refList>\n</hh:head>`));

  // 표준 A4 용지 규격 (210mm x 297mm = 59528 x 84188 HWPUNIT, 여백 포함)
  const defaultSecPr = `<hp:secPr id="0" textDirection="0" spaceBetweenColumns="0" tabStop="8000" outlineShapeIdRef="0" memoShapeIdRef="0" textVerticalWidthHead="0"><hp:grid lineGrid="0" charGrid="0"/><hp:startNum pageStartsOn="both" page="1" pic="1" tbl="1" equation="1"/><hp:visibility hideHeader="0" hideFooter="0" hideMasterPage="0" border="0" fill="0" hidePageNum="0" hideEmptyLine="0"/><hp:pagePr width="59528" height="84188" autoMargin="0"><hp:margin left="8504" right="8504" top="5668" bottom="4252" header="4252" footer="4252" gutter="0"/></hp:pagePr></hp:secPr>`;

  const lines = (initialText || "").split(/\r?\n/);
  const pList = lines.map((line, idx) => {
    const secPr = idx === 0 ? `<hp:run charPrIDRef="0">${defaultSecPr}</hp:run>` : "";
    return `    <hp:p id="${idx}" paraPrIDRef="0" styleIDRef="0" pageBreak="false" columnBreak="false" merged="false">\n      ${secPr}<hp:run charPrIDRef="0"><hp:t>${escapeXml(line)}</hp:t></hp:run>\n    </hp:p>`;
  }).join("\n");

  entries.set("Contents/section0.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">\n${pList}\n</hs:sec>`));

  return writeZipEntries(entries);
}
