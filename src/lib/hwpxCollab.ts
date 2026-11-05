import * as Y from "yjs";
import { textHash } from "./collabCore.ts";
import { decodeXmlEntities, escapeXml } from "./hwpx.ts";

// HWPX 실시간 동시편집 데이터 모델 및 파서 / 직렬화 모듈.
// 문단뿐 아니라 표(Table)와 수식(Equation)을 구조화된 블록 트리로 변환하여
// Yjs의 Y.Text 노드에 매핑함으로써 여러 명이 동시에 같은 표의 각 셀과 본문을 실시간으로 협업 편집할 수 있다.

export interface HwpxParagraphBlock {
  type: "paragraph";
  id: string;
  text: string;
  align?: "left" | "center" | "right" | "justify";
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  pageBreak?: boolean;
  rawAttrs?: string;
  charPrId?: string;
  rawXml?: string;
  origText?: string;
}

export interface HwpxTableCell {
  text: string;
  align?: "left" | "center" | "right" | "justify";
  bold?: boolean;
  colSpan?: number;
  rowSpan?: number;
  rawAttrs?: string;
}

export interface HwpxTableBlock {
  type: "table";
  id: string;
  rows: HwpxTableCell[][];
  rawAttrs?: string;
}

export interface HwpxEquationBlock {
  type: "equation";
  id: string;
  script: string;
  rawAttrs?: string;
}

export interface HwpxImageBlock {
  type: "image";
  id: string;
  src: string;
  widthPercent?: number;
  align?: "left" | "center" | "right";
  caption?: string;
  rawAttrs?: string;
  rawXml?: string;
}

export function extractHwpxImageMap(entries: Map<string, Uint8Array>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, bytes] of entries.entries()) {
    if (path.startsWith("BinData/")) {
      const ext = path.split(".").pop()?.toLowerCase() || "png";
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "bmp" ? "image/bmp" : "image/png";

      let binary = "";
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      const dataUrl = `data:${mime};base64,${b64}`;
      const filename = path.replace(/^BinData\//, "");
      const idWithoutExt = filename.replace(/\.[^.]+$/, "");
      map.set(path, dataUrl);
      map.set(filename, dataUrl);
      map.set(idWithoutExt, dataUrl);
    }
  }
  return map;
}

export type HwpxCollabBlock = HwpxParagraphBlock | HwpxTableBlock | HwpxEquationBlock | HwpxImageBlock;

// ── OWPML XML을 구조화된 협업 블록 목록으로 파싱 ──
export function stripHtmlTags(str: string): string {
  if (!str) return "";
  if (!str.includes("<")) return str;
  return str.replace(/<[^>]*>/g, "");
}

export function colorToHex(colorStr?: string): string {
  if (!colorStr) return "#000000";
  colorStr = colorStr.trim();
  if (colorStr.startsWith("#")) {
    if (colorStr.length === 4) {
      return `#${colorStr[1]}${colorStr[1]}${colorStr[2]}${colorStr[2]}${colorStr[3]}${colorStr[3]}`.toUpperCase();
    }
    return colorStr.toUpperCase();
  }
  const rgb = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) {
    const r = parseInt(rgb[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(rgb[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(rgb[3], 10).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`.toUpperCase();
  }
  return "#000000";
}

export interface ParsedTextRun {
  text: string;
  color?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export function parseHtmlRuns(html: string, baseStyle: Partial<HwpxParagraphBlock>): ParsedTextRun[] {
  if (!html) return [];
  if (!html.includes("<")) {
    return [{
      text: html,
      color: baseStyle.color,
      sizePt: baseStyle.sizePt,
      bold: baseStyle.bold,
      italic: baseStyle.italic,
      underline: baseStyle.underline,
    }];
  }

  const runs: ParsedTextRun[] = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;

  const styleStack: Array<{ color?: string; sizePt?: number; bold?: boolean; italic?: boolean; underline?: boolean }> = [{
    color: baseStyle.color,
    sizePt: baseStyle.sizePt,
    bold: baseStyle.bold,
    italic: baseStyle.italic,
    underline: baseStyle.underline,
  }];

  while ((m = tagRegex.exec(html)) !== null) {
    if (m[4]) {
      const cur = styleStack[styleStack.length - 1];
      runs.push({
        text: decodeXmlEntities(m[4]),
        color: cur.color,
        sizePt: cur.sizePt,
        bold: cur.bold,
        italic: cur.italic,
        underline: cur.underline,
      });
    } else if (m[2]) {
      const isClose = !!m[1];
      const tag = m[2].toLowerCase();
      const attrs = m[3] || "";

      if (isClose) {
        if (styleStack.length > 1) styleStack.pop();
      } else {
        const parentStyle = styleStack[styleStack.length - 1];
        const nextStyle = { ...parentStyle };

        if (tag === "b" || tag === "strong" || /font-weight:\s*(?:bold|[6-9]00)/i.test(attrs)) nextStyle.bold = true;
        if (tag === "i" || tag === "em" || /font-style:\s*italic/i.test(attrs)) nextStyle.italic = true;
        if (tag === "u" || /text-decoration(?:-line)?:\s*[^;"]*underline/i.test(attrs)) nextStyle.underline = true;

        const colorMatch = attrs.match(/color:\s*([^;"]+)/i) || attrs.match(/\bcolor=["']?([^"'\s>]+)/i);
        if (colorMatch) {
          nextStyle.color = colorMatch[1].trim();
        }

        const sizeMatch = attrs.match(/font-size:\s*(\d+(?:\.\d+)?)pt/i);
        if (sizeMatch) {
          nextStyle.sizePt = parseFloat(sizeMatch[1]);
        }

        styleStack.push(nextStyle);
      }
    }
  }

  return runs.length > 0 ? runs : [{ text: stripHtmlTags(html), ...baseStyle }];
}

export function parseHwpxXmlToBlocks(xmlStr: string, headerXml = "", imageMap?: Map<string, string>): HwpxCollabBlock[] {
  // 1. header.xml 스타일 정보(정렬, 글자 크기, 볼드) 사전 추출
  const paraStyles = new Map<string, { align: "left" | "center" | "right" | "justify" }>();
  const charStyles = new Map<string, { sizePt: number; bold: boolean }>();

  if (headerXml) {
    const paraPrRegex = /<hh:paraPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/hh:paraPr>)/g;
    let pm: RegExpExecArray | null;
    while ((pm = paraPrRegex.exec(headerXml)) !== null) {
      const idMatch = pm[0].match(/\bid="(\d+)"/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const alignMatch = pm[0].match(/horizontal="([^"]+)"/);
      const alignVal = alignMatch ? alignMatch[1].toLowerCase() : "left";
      paraStyles.set(id, {
        align: alignVal === "center" || alignVal === "right" || alignVal === "justify" ? alignVal : "left",
      });
    }

    const charPrRegex = /<hh:charPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/hh:charPr>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = charPrRegex.exec(headerXml)) !== null) {
      const idMatch = cm[0].match(/\bid="(\d+)"/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const sizeMatch = cm[0].match(/height="(\d+)"/);
      const boldMatch = /<hh:bold\s*\/?>/.test(cm[0]);
      charStyles.set(id, {
        sizePt: sizeMatch ? parseInt(sizeMatch[1], 10) / 100 : 10,
        bold: boldMatch,
      });
    }
  }

  const blocks: HwpxCollabBlock[] = [];
  const tokenRegex = /<(\/)?([a-zA-Z0-9_:]+)((?:\s+[^>]*)?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  let ctrlDepth = 0; // 머리말, 꼬리말, 각주, 미주 등 제어 태그 깊이 (본문 문단과 분리)
  let inTable = false;
  let currentTable: HwpxTableBlock | null = null;
  let currentRow: HwpxTableCell[] | null = null;
  let currentCell: string[] | null = null;
  let currentCellAttrs = "";

  let inEquation = false;
  let inScript = false;
  let currentEquationScript = "";
  let currentEquationAttrs = "";

  let inP = false;
  let hasObjectInP = false;
  let currentPText: string[] = [];
  let currentPAttrs = "";
  let currentPStartIndex = -1;
  let pEquationCount = 0;
  let pPicCount = 0;
  let pHasNormalText = false;
  let lastEquationScript = "";
  let lastEquationAttrs = "";
  let lastPicBinId = "";
  let lastPicAttrs = "";
  let currentParaPrId = "0";
  let currentCharPrId = "0";
  let currentPageBreak = false;
  let inT = false;

  let blockIndex = 0;

  while ((match = tokenRegex.exec(xmlStr)) !== null) {
    const isClosing = !!match[1];
    const tagName = match[2]?.toLowerCase();
    const attrs = match[3] || "";
    const isSelfClosing = !!match[4] || attrs.trim().endsWith("/");
    const textContent = match[5];

    if (tagName) {
      const localName = tagName.split(":").pop()!;

      // 머리말 / 꼬리말 / 각주 / 미주 분리 격리
      if (localName === "header" || localName === "footer" || localName === "footnote" || localName === "endnote") {
        if (!isClosing && !isSelfClosing) {
          ctrlDepth++;
        } else if (isClosing) {
          ctrlDepth = Math.max(0, ctrlDepth - 1);
        }
        continue;
      }

      // 제어 요소 내부 내용이면 무시 (본문 오염 방지)
      if (ctrlDepth > 0) {
        continue;
      }

      // 표 (tbl)
      if (localName === "tbl") {
        if (!isClosing && !isSelfClosing) {
          inTable = true;
          hasObjectInP = true;
          currentTable = { type: "table", id: `tbl_${blockIndex++}`, rows: [], rawAttrs: attrs.trim() };
        } else if (isClosing) {
          inTable = false;
          if (currentTable) {
            blocks.push(currentTable);
            currentTable = null;
          }
        }
      } else if (localName === "tr" && inTable) {
        if (!isClosing && !isSelfClosing) {
          currentRow = [];
        } else if (isClosing) {
          if (currentTable && currentRow) {
            currentTable.rows.push(currentRow);
            currentRow = null;
          }
        }
      } else if (localName === "tc" && inTable) {
        if (!isClosing && !isSelfClosing) {
          currentCell = [];
          currentCellAttrs = attrs.trim();
        } else if (isClosing) {
          if (currentRow && currentCell) {
            currentRow.push({ text: currentCell.join(""), rawAttrs: currentCellAttrs });
            currentCell = null;
            currentCellAttrs = "";
          }
        }
      }
      // 수식 (equation)
      else if (localName === "equation") {
        if (!isClosing && !isSelfClosing) {
          inEquation = true;
          currentEquationScript = "";
          currentEquationAttrs = attrs.trim();
        } else if (isClosing) {
          inEquation = false;
          if (inP) {
            pEquationCount++;
            lastEquationScript = currentEquationScript;
            lastEquationAttrs = currentEquationAttrs;
            // 인라인 수식: 문단을 끊지 않고 본문 텍스트 사이에 자연스럽게 포함
            if (currentEquationScript.trim()) {
              currentPText.push(` ${currentEquationScript.trim()} `);
            }
          } else {
            // 독립 수식 블록
            blocks.push({ type: "equation", id: `eq_${blockIndex++}`, script: currentEquationScript, rawAttrs: currentEquationAttrs });
          }
          currentEquationScript = "";
        }
      } else if (localName === "script" && inEquation) {
        inScript = !isClosing && !isSelfClosing;
      }
      // 그림 (pic)
      else if (localName === "pic" && inP) {
        if (!isClosing && !isSelfClosing) {
          pPicCount++;
          lastPicAttrs = attrs.trim();
          currentPText.push(" [그림] ");
        }
      }
      // 이미지 바이너리 참조 (img)
      else if ((localName === "img" || localName === "hc:img") && inP) {
        const binMatch = attrs.match(/binaryItemIDRef="([^"]+)"/);
        if (binMatch) {
          lastPicBinId = binMatch[1];
        }
      }
      // 본문 문단 (p)
      else if (localName === "p" && !inTable) {
        if (!isClosing && !isSelfClosing) {
          inP = true;
          hasObjectInP = false;
          currentPStartIndex = match.index;
          currentPText = [];
          currentPAttrs = attrs.trim();
          pEquationCount = 0;
          pPicCount = 0;
          pHasNormalText = false;
          lastEquationScript = "";
          lastEquationAttrs = "";
          lastPicBinId = "";
          lastPicAttrs = "";
          const paraMatch = attrs.match(/paraPrIDRef="(\d+)"/);
          currentParaPrId = paraMatch ? paraMatch[1] : "0";
          const pageBreakMatch = attrs.match(/pageBreak="(\d+)"/);
          currentPageBreak = pageBreakMatch ? pageBreakMatch[1] === "1" : false;
          currentCharPrId = "0";
        } else if (isClosing) {
          inP = false;
          if (!hasObjectInP) {
            const rawXml = currentPStartIndex !== -1 ? xmlStr.slice(currentPStartIndex, match.index + match[0].length) : undefined;
            if (pEquationCount === 1 && !pHasNormalText && lastEquationScript.trim()) {
              blocks.push({
                type: "equation",
                id: `eq_${blockIndex++}`,
                script: lastEquationScript,
                rawAttrs: lastEquationAttrs,
              });
            } else if (pPicCount === 1 && !pHasNormalText) {
              const imgSrc = (imageMap && lastPicBinId ? imageMap.get(lastPicBinId) : "") || "";
              blocks.push({
                type: "image",
                id: `img_${blockIndex++}`,
                src: imgSrc,
                widthPercent: 75,
                align: "center",
                caption: "그림",
                rawAttrs: lastPicAttrs,
                rawXml,
              });
            } else {
              const fullText = currentPText.join("");
              const pStyle = paraStyles.get(currentParaPrId);
              const cStyle = charStyles.get(currentCharPrId);
              blocks.push({
                type: "paragraph",
                id: `p_${blockIndex++}`,
                text: fullText,
                align: pStyle?.align ?? "left",
                sizePt: cStyle?.sizePt,
                bold: cStyle?.bold,
                pageBreak: currentPageBreak,
                rawAttrs: currentPAttrs,
                charPrId: currentCharPrId,
                rawXml,
                origText: fullText,
              });
            }
          }
          currentPText = [];
          currentPAttrs = "";
          currentPageBreak = false;
          currentPStartIndex = -1;
          pEquationCount = 0;
          pPicCount = 0;
          pHasNormalText = false;
          lastEquationScript = "";
          lastEquationAttrs = "";
          lastPicBinId = "";
          lastPicAttrs = "";
        }
      }
      // 글자 런 (run) 스타일 추적
      else if (localName === "run" && inP) {
        const charMatch = attrs.match(/charPrIDRef="(\d+)"/);
        if (charMatch) {
          if (currentCharPrId === "0" || charMatch[1] !== "0") {
            currentCharPrId = charMatch[1];
          }
        }
      }
      // 텍스트런 (t)
      else if (localName === "t") {
        inT = !isClosing && !isSelfClosing;
      }
      // tab / linebreak
      else if (localName === "tab") {
        if (inTable && currentCell) currentCell.push("\t");
        else if (inP) currentPText.push("\t");
      } else if (localName === "linebreak") {
        if (inTable && currentCell) currentCell.push("\n");
        else if (inP) currentPText.push("\n");
      }
    } else if (textContent && ctrlDepth === 0) {
      if (inScript) {
        currentEquationScript += decodeXmlEntities(textContent);
      } else if (inT) {
        const decoded = decodeXmlEntities(textContent);
        if (inTable && currentCell) {
          currentCell.push(decoded);
        } else if (inP) {
          currentPText.push(decoded);
          if (decoded.trim()) pHasNormalText = true;
        }
      }
    }
  }

  return blocks;
}

// 첫 문단의 설정 런(secPr, ctrl, header, footer 등)을 완전한 XML 태그 계층을 유지하며 안전하게 추출
function extractPreambleRuns(xml: string): string {
  const tagRegex = /<(\/)?([a-zA-Z0-9_:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/)?>/g;
  let match: RegExpExecArray | null;
  let pDepth = 0;
  let p0InnerStart = -1;
  let p0End = -1;

  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = !!match[1];
    const isSelfClosing = !!match[4] || match[3].trim().endsWith("/");
    const localName = match[2].split(":").pop()?.toLowerCase();

    if (localName === "p") {
      if (!isClosing && !isSelfClosing) {
        if (pDepth === 0) p0InnerStart = match.index + match[0].length;
        pDepth++;
      } else if (isClosing) {
        pDepth--;
        if (pDepth === 0) {
          p0End = match.index;
          break;
        }
      }
    }
  }

  if (p0InnerStart === -1 || p0End === -1) return "";
  const p0Inner = xml.slice(p0InnerStart, p0End);

  const runTagRegex = /<(\/)?([a-zA-Z0-9_:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/)?>/g;
  let rMatch: RegExpExecArray | null;
  let rDepth = 0;
  let runStart = -1;
  const preambleRuns: string[] = [];

  while ((rMatch = runTagRegex.exec(p0Inner)) !== null) {
    const isClosing = !!rMatch[1];
    const isSelfClosing = !!rMatch[4] || rMatch[3].trim().endsWith("/");
    const localName = rMatch[2].split(":").pop()?.toLowerCase();

    if (localName === "run" && !isClosing && rDepth === 0) {
      runStart = rMatch.index;
      rDepth = 1;
      continue;
    }

    if (rDepth > 0) {
      if (!isClosing && !isSelfClosing) {
        rDepth++;
      } else if (isClosing) {
        rDepth--;
        if (rDepth === 0 && runStart !== -1) {
          const fullRun = p0Inner.slice(runStart, rMatch.index + rMatch[0].length);
          if (fullRun.includes("<hp:secPr") || fullRun.includes("<hp:ctrl")) {
            preambleRuns.push(fullRun);
          }
          runStart = -1;
        }
      }
    }
  }

  return preambleRuns.join("\n");
}

// ── 블록 배열을 OWPML XML 및 Header XML로 복원 직렬화 (글자색·서식·표·수식 구조 100% 보존) ──
export function serializeBlocksToHwpxPackage(
  blocks: HwpxCollabBlock[],
  originalSectionXml = "",
  originalHeaderXml = ""
): { sectionXml: string; headerXml: string } {
  // 1. 기존 header.xml의 스타일 사전 분석 및 보존
  const paraStyles = new Map<string, { align: "left" | "center" | "right" | "justify" }>();
  const existingCharIds: number[] = [];
  const existingParaIds: number[] = [];

  interface ExistingCharStyle {
    colorHex: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }
  const existingCharStyleMap = new Map<string, ExistingCharStyle>();

  if (originalHeaderXml) {
    const paraPrRegex = /<hh:paraPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/hh:paraPr>)/g;
    let pm: RegExpExecArray | null;
    while ((pm = paraPrRegex.exec(originalHeaderXml)) !== null) {
      const idMatch = pm[0].match(/\bid="(\d+)"/);
      if (!idMatch) continue;
      const id = parseInt(idMatch[1], 10);
      existingParaIds.push(id);
      const alignMatch = pm[0].match(/horizontal="([^"]+)"/i) || pm[0].match(/align="([^"]+)"/i);
      const alignVal = alignMatch ? alignMatch[1].toLowerCase() : "left";
      paraStyles.set(String(id), {
        align: alignVal === "center" || alignVal === "right" || alignVal === "justify" ? alignVal : "left",
      });
    }

    const charPrRegex = /<hh:charPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/hh:charPr>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = charPrRegex.exec(originalHeaderXml)) !== null) {
      const idMatch = cm[0].match(/\bid="(\d+)"/);
      if (!idMatch) continue;
      const id = parseInt(idMatch[1], 10);
      existingCharIds.push(id);

      const heightMatch = cm[0].match(/height="(\d+)"/);
      const colorMatch = cm[0].match(/textColor="([^"]+)"/);
      const boldMatch = /<hh:bold\s*\/?>/.test(cm[0]);
      const italicMatch = /<hh:italic\s*\/?>/.test(cm[0]);
      const underlineMatch = /<hh:underline\b[^>]*type="([^"]+)"/.exec(cm[0]);
      const hasUnderline = !!(underlineMatch && underlineMatch[1].toUpperCase() !== "NONE");

      existingCharStyleMap.set(String(id), {
        sizePt: heightMatch ? Math.round(parseInt(heightMatch[1], 10) / 100) : 10,
        colorHex: colorMatch ? colorToHex(colorMatch[1]) : "#000000",
        bold: boldMatch,
        italic: italicMatch,
        underline: hasUnderline,
      });
    }
  }

  let maxCharId = existingCharIds.length > 0 ? Math.max(...existingCharIds) : 0;
  let maxParaId = existingParaIds.length > 0 ? Math.max(...existingParaIds) : 0;

  // 2. 신규 charPr 동적 등록 (기존 원본 스타일 ID와 충돌 없이 maxCharId 이후 번호 부여)
  interface CharPrDef {
    id: number;
    colorHex: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }

  const newCharDefs: CharPrDef[] = [];
  const charPrKeyToId = new Map<string, number>([
    ["#000000_10_0_0_0", 0],
  ]);

  // 원본 문서에 이미 정의된 charPr들을 key에 등록하여 중복 생성 방지 및 원본 서식 100% 재사용
  for (const [idStr, style] of existingCharStyleMap.entries()) {
    const k = `${style.colorHex}_${style.sizePt}_${style.bold ? 1 : 0}_${style.italic ? 1 : 0}_${style.underline ? 1 : 0}`;
    if (!charPrKeyToId.has(k)) {
      charPrKeyToId.set(k, parseInt(idStr, 10));
    }
  }

  const getOrCreateCharPr = (style: { color?: string; sizePt?: number; bold?: boolean; italic?: boolean; underline?: boolean }): number => {
    const colorHex = colorToHex(style.color);
    const sizePt = style.sizePt ? Math.round(style.sizePt) : 10;
    const bold = !!style.bold;
    const italic = !!style.italic;
    const underline = !!style.underline;
    const key = `${colorHex}_${sizePt}_${bold ? 1 : 0}_${italic ? 1 : 0}_${underline ? 1 : 0}`;

    if (key === "#000000_10_0_0_0") return 0;
    const existing = charPrKeyToId.get(key);
    if (existing !== undefined) return existing;

    const newId = ++maxCharId;
    newCharDefs.push({ id: newId, colorHex, sizePt, bold, italic, underline });
    charPrKeyToId.set(key, newId);
    return newId;
  };

  // 한컴 OWPML 표준 규격의 완전한 charPr XML 생성 (누락 없는 필수 자식 노드 순서 보장)
  const renderCharPrXml = (def: CharPrDef): string => {
    const children: string[] = [
      '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>',
      '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>',
      '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>',
      '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>',
      '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>',
    ];
    if (def.bold) children.push("<hh:bold/>");
    if (def.italic) children.push("<hh:italic/>");
    if (def.underline) children.push('<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>');
    else children.push('<hh:underline type="NONE" shape="SOLID" color="#000000"/>');
    children.push('<hh:strikeout shape="NONE" color="#000000"/>');
    children.push('<hh:outline type="NONE"/>');
    children.push('<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>');
    return `      <hh:charPr id="${def.id}" height="${def.sizePt * 100}" textColor="${def.colorHex}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">\n        ${children.join("")}\n      </hh:charPr>`;
  };

  // 문단 정렬(paraPr) 매핑: 원본의 paraPrIDRef를 최대한 유지하여 문서 고유 여백/줄간격 손실 방지
  const getParaPrForAlign = (targetAlign: "left" | "center" | "right" | "justify", rawAttrs?: string): string => {
    if (rawAttrs) {
      const match = rawAttrs.match(/paraPrIDRef="(\d+)"/);
      if (match) {
        const origId = match[1];
        const origStyle = paraStyles.get(origId);
        if (origStyle && origStyle.align === targetAlign) {
          return origId;
        }
      }
    }
    for (const [id, s] of paraStyles.entries()) {
      if (s.align === targetAlign) return id;
    }
    const newId = String(++maxParaId);
    paraStyles.set(newId, { align: targetAlign });
    return newId;
  };

  // ── 표준 A4 용지 규격 (210mm x 297mm = 59528 x 84188 HWPUNIT, 여백 포함) ──
  const DEFAULT_SECPR = `<hp:run charPrIDRef="0"><hp:secPr id="0" textDirection="0" spaceBetweenColumns="0" tabStop="8000" outlineShapeIdRef="0" memoShapeIdRef="0" textVerticalWidthHead="0"><hp:grid lineGrid="0" charGrid="0"/><hp:startNum pageStartsOn="both" page="1" pic="1" tbl="1" equation="1"/><hp:visibility hideHeader="0" hideFooter="0" hideMasterPage="0" border="0" fill="0" hidePageNum="0" hideEmptyLine="0"/><hp:pagePr width="59528" height="84188" autoMargin="0"><hp:margin left="8504" right="8504" top="5668" bottom="4252" header="4252" footer="4252" gutter="0"/></hp:pagePr></hp:secPr></hp:run>`;

  // paragraph 0의 설정 런(secPr, ctrl, footer 등)을 온전하게 보존
  let preambleRuns = extractPreambleRuns(originalSectionXml);
  if (!preambleRuns.includes("<hp:secPr")) {
    const secPrMatch = originalSectionXml.match(/<hp:secPr\b(?:[^>]*\/>|[\s\S]*?<\/hp:secPr>)/);
    if (secPrMatch) {
      preambleRuns = `<hp:run charPrIDRef="0">${secPrMatch[0]}</hp:run>\n` + preambleRuns;
    } else {
      preambleRuns = DEFAULT_SECPR + (preambleRuns ? `\n${preambleRuns}` : "");
    }
  }

  const rootOpen = '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">';

  const paragraphsXml = blocks.map((block, idx) => {
    const lead = (idx === 0 && preambleRuns) ? preambleRuns : "";
    const align = block.type === "paragraph" ? (block.align || "left") : "left";
    const paraPr = getParaPrForAlign(align, block.rawAttrs);

    if (block.type === "table") {
      const rowsXml = block.rows.map((row, rIdx) => {
        const cellsXml = row.map((cell, cIdx) => {
          const tcAttrs = cell.rawAttrs ? ` ${cell.rawAttrs}` : ` name="${rIdx}_${cIdx}"`;
          const cellCharPr = getOrCreateCharPr({ bold: cell.bold });
          const cellParaPr = getParaPrForAlign(cell.align || "left", cell.rawAttrs);
          return `        <hp:tc${tcAttrs}><hp:subList><hp:p id="${rIdx}_${cIdx}_0" paraPrIDRef="${cellParaPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cellCharPr}"><hp:t>${escapeXml(cell.text)}</hp:t></hp:run></hp:p></hp:subList></hp:tc>`;
        }).join("\n");
        return `      <hp:tr>\n${cellsXml}\n      </hp:tr>`;
      }).join("\n");

      const tblAttrs = block.rawAttrs ? ` ${block.rawAttrs}` : ` id="${idx}" pageBreak="cell" repeatHeader="true"`;
      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:tbl${tblAttrs}>\n${rowsXml}\n      </hp:tbl></hp:run>\n    </hp:p>`;
    }

    if (block.type === "equation") {
      const eqAttrs = block.rawAttrs ? ` ${block.rawAttrs}` : ` version="1.0" baseLine="0" textColor="#000000" baseUnit="1000"`;
      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:equation${eqAttrs}><hp:script>${escapeXml(block.script)}</hp:script></hp:equation></hp:run>\n    </hp:p>`;
    }

    if (block.type === "image") {
      if (block.rawXml) {
        return block.rawXml;
      }
      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:t>[그림: ${escapeXml(block.caption || "이미지")}]</hp:t></hp:run>\n    </hp:p>`;
    }

    // 일반 문단
    // 1. 사용자가 텍스트를 편집하지 않았고 rawXml이 있는 경우: 원본 XML 100% 무손실 출력! (수식, 이미지, 복합 서식 완전 보존)
    if (block.rawXml && block.origText !== undefined && block.text === block.origText) {
      if (idx === 0) {
        if (block.rawXml.includes("<hp:secPr")) {
          return block.rawXml;
        } else {
          return block.rawXml.replace(/<hp:p\b[^>]*>/, `$&${lead}`);
        }
      }
      return block.rawXml;
    }

    // 2. 사용자가 텍스트를 편집했거나 새로 작성된 문단 (인라인 HTML 서식을 개별 hp:run으로 정밀 직렬화)
    const runs = parseHtmlRuns(block.text, {
      color: block.color,
      sizePt: block.sizePt,
      bold: block.bold,
      italic: block.italic,
      underline: block.underline,
    });

    const runsXml = runs.map((run) => {
      let charPrId: number;
      if (runs.length === 1 && block.charPrId && existingCharStyleMap.has(block.charPrId)) {
        const orig = existingCharStyleMap.get(block.charPrId)!;
        const rColor = colorToHex(run.color);
        const rSize = run.sizePt ? Math.round(run.sizePt) : 10;
        const rBold = !!run.bold;
        const rItalic = !!run.italic;
        const rUnderline = !!run.underline;
        if (orig.colorHex === rColor && orig.sizePt === rSize && orig.bold === rBold && orig.italic === rItalic && orig.underline === rUnderline) {
          charPrId = parseInt(block.charPrId, 10);
        } else {
          charPrId = getOrCreateCharPr(run);
        }
      } else {
        charPrId = getOrCreateCharPr(run);
      }
      return `<hp:run charPrIDRef="${charPrId}"><hp:t>${escapeXml(run.text)}</hp:t></hp:run>`;
    }).join("");

    const pageBreakStr = block.pageBreak ? "1" : "0";
    return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="${pageBreakStr}" columnBreak="0" merged="0">\n      ${lead}${runsXml || '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>'}\n    </hp:p>`;
  }).join("\n");

  const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${rootOpen}\n${paragraphsXml}\n</hs:sec>`;

  // 3. Header XML 갱신: 기존 문서의 모든 서식·글꼴 정의를 온전히 보존하고 신규 스타일만 추가
  let headerXml = originalHeaderXml;
  if (headerXml && headerXml.includes("<hh:charProperties")) {
    if (newCharDefs.length > 0) {
      const newCharXml = newCharDefs.map(renderCharPrXml).join("\n");

      headerXml = headerXml.replace(/<\/hh:charProperties>/, `${newCharXml}\n    </hh:charProperties>`);
      const cntMatch = headerXml.match(/<hh:charProperties\s+itemCnt="(\d+)"/);
      if (cntMatch) {
        const newCnt = parseInt(cntMatch[1], 10) + newCharDefs.length;
        headerXml = headerXml.replace(/<hh:charProperties\s+itemCnt="\d+"/, `<hh:charProperties itemCnt="${newCnt}"`);
      }
    }
  } else {
    // 원본 헤더가 없는 경우에만 완전한 표준 OWPML 기본 헤더 생성
    const defaultChar0 = `      <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">\n` +
      `        <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>\n` +
      `        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>\n` +
      `        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>\n` +
      `        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>\n` +
      `        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>\n` +
      `        <hh:underline type="NONE" shape="SOLID" color="#000000"/>\n` +
      `        <hh:strikeout shape="NONE" color="#000000"/>\n` +
      `        <hh:outline type="NONE"/>\n` +
      `        <hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>\n` +
      `      </hh:charPr>`;

    const charPropertiesXml = `    <hh:charProperties itemCnt="${newCharDefs.length + 1}">\n` +
      defaultChar0 + (newCharDefs.length > 0 ? "\n" + newCharDefs.map(renderCharPrXml).join("\n") : "") +
      `\n    </hh:charProperties>`;

    const paraPropertiesXml = `    <hh:paraProperties itemCnt="4">\n` +
      `      <hh:paraPr id="0">\n        <hh:align horizontal="LEFT" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `      <hh:paraPr id="1">\n        <hh:align horizontal="CENTER" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `      <hh:paraPr id="2">\n        <hh:align horizontal="RIGHT" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `      <hh:paraPr id="3">\n        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `    </hh:paraProperties>`;

    headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" version="1.0">\n` +
      `  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>\n` +
      `  <hh:refList>\n` +
      `    <hh:fontfaces itemCnt="1">\n` +
      `      <hh:fontface lang="HANGUL" fontCnt="1">\n` +
      `        <hh:font id="0" face="함초롬바탕" type="TTF"/>\n` +
      `      </hh:fontface>\n` +
      `    </hh:fontfaces>\n` +
      `${charPropertiesXml}\n` +
      `${paraPropertiesXml}\n` +
      `    <hh:styles itemCnt="1">\n` +
      `      <hh:style id="0" type="para" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0"/>\n` +
      `    </hh:styles>\n` +
      `  </hh:refList>\n` +
      `</hh:head>`;
  }

  return { sectionXml, headerXml };
}

export function serializeBlocksToHwpxXml(blocks: HwpxCollabBlock[], originalXml = ""): string {
  return serializeBlocksToHwpxPackage(blocks, originalXml, "").sectionXml;
}

// ── Yjs (CRDT) 문서 초기화 및 동기화 ──
export const HWPX_COLLAB_FIELD = "hwpx_blocks";

export function initHwpxYDoc(doc: Y.Doc, blocks: HwpxCollabBlock[]): void {
  const yBlocks = doc.getArray<Y.Map<unknown>>(HWPX_COLLAB_FIELD);
  if (yBlocks.length > 0) return; // 이미 동기화된 상태면 시드 방지

  doc.transact(() => {
    for (const block of blocks) {
      const yBlock = new Y.Map<unknown>();
      yBlock.set("id", block.id);
      yBlock.set("type", block.type);
      if (block.rawAttrs) yBlock.set("rawAttrs", block.rawAttrs);

      if (block.type === "paragraph") {
        const yText = new Y.Text(block.text);
        yBlock.set("text", yText);
        if (block.align) yBlock.set("align", block.align);
        if (block.sizePt) yBlock.set("sizePt", block.sizePt);
        if (block.bold !== undefined) yBlock.set("bold", block.bold);
        if (block.italic !== undefined) yBlock.set("italic", block.italic);
        if (block.underline !== undefined) yBlock.set("underline", block.underline);
        if (block.color) yBlock.set("color", block.color);
        if (block.fontFamily) yBlock.set("fontFamily", block.fontFamily);
        if (block.pageBreak !== undefined) yBlock.set("pageBreak", block.pageBreak);
        if (block.charPrId) yBlock.set("charPrId", block.charPrId);
        if (block.rawXml) yBlock.set("rawXml", block.rawXml);
        if (block.origText !== undefined) yBlock.set("origText", block.origText);
      } else if (block.type === "table") {
        const yRows = new Y.Array<Y.Array<Y.Map<unknown>>>();
        for (const row of block.rows) {
          const yRow = new Y.Array<Y.Map<unknown>>();
          for (const cell of row) {
            const yCell = new Y.Map<unknown>();
            yCell.set("text", new Y.Text(cell.text));
            if (cell.rawAttrs) yCell.set("rawAttrs", cell.rawAttrs);
            if (cell.align) yCell.set("align", cell.align);
            if (cell.bold !== undefined) yCell.set("bold", cell.bold);
            yRow.push([yCell]);
          }
          yRows.push([yRow]);
        }
        yBlock.set("rows", yRows);
      } else if (block.type === "equation") {
        const yScript = new Y.Text(block.script);
        yBlock.set("script", yScript);
      } else if (block.type === "image") {
        yBlock.set("src", block.src);
        if (block.widthPercent) yBlock.set("widthPercent", block.widthPercent);
        if (block.align) yBlock.set("align", block.align);
        if (block.caption) yBlock.set("caption", block.caption);
        if (block.rawXml) yBlock.set("rawXml", block.rawXml);
        if (block.rawAttrs) yBlock.set("rawAttrs", block.rawAttrs);
      }
      yBlocks.push([yBlock]);
    }
  });
}

// ── Yjs 문서에서 현재 블록 목록 추출 ──
export function extractBlocksFromYDoc(doc: Y.Doc): HwpxCollabBlock[] {
  const yBlocks = doc.getArray<Y.Map<unknown>>(HWPX_COLLAB_FIELD);
  const blocks: HwpxCollabBlock[] = [];

  for (let i = 0; i < yBlocks.length; i++) {
    const yBlock = yBlocks.get(i);
    const type = yBlock.get("type") as "paragraph" | "table" | "equation" | "image";
    const id = (yBlock.get("id") as string) || `block_${i}`;
    const rawAttrs = yBlock.get("rawAttrs") as string | undefined;

    if (type === "paragraph") {
      const yText = yBlock.get("text") as Y.Text | undefined;
      const align = yBlock.get("align") as "left" | "center" | "right" | "justify" | undefined;
      const sizePt = yBlock.get("sizePt") as number | undefined;
      const bold = yBlock.get("bold") as boolean | undefined;
      const italic = yBlock.get("italic") as boolean | undefined;
      const underline = yBlock.get("underline") as boolean | undefined;
      const color = yBlock.get("color") as string | undefined;
      const fontFamily = yBlock.get("fontFamily") as string | undefined;
      const pageBreak = yBlock.get("pageBreak") as boolean | undefined;
      const charPrId = yBlock.get("charPrId") as string | undefined;
      const rawXml = yBlock.get("rawXml") as string | undefined;
      const origText = yBlock.get("origText") as string | undefined;
      blocks.push({
        type: "paragraph",
        id,
        text: yText ? yText.toString() : "",
        align,
        sizePt,
        bold,
        italic,
        underline,
        color,
        fontFamily,
        pageBreak,
        rawAttrs,
        charPrId,
        rawXml,
        origText,
      });
    } else if (type === "table") {
      const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
      const rows: HwpxTableCell[][] = [];
      if (yRows) {
        for (let r = 0; r < yRows.length; r++) {
          const yRow = yRows.get(r);
          const cells: HwpxTableCell[] = [];
          for (let c = 0; c < yRow.length; c++) {
            const yCell = yRow.get(c);
            const yText = yCell.get("text") as Y.Text | undefined;
            const cellAttrs = yCell.get("rawAttrs") as string | undefined;
            const align = yCell.get("align") as "left" | "center" | "right" | "justify" | undefined;
            const bold = yCell.get("bold") as boolean | undefined;
            cells.push({ text: yText ? yText.toString() : "", rawAttrs: cellAttrs, align, bold });
          }
          rows.push(cells);
        }
      }
      blocks.push({ type: "table", id, rows, rawAttrs });
    } else if (type === "equation") {
      const yScript = yBlock.get("script") as Y.Text | undefined;
      blocks.push({
        type: "equation",
        id,
        script: yScript ? yScript.toString() : "",
        rawAttrs,
      });
    } else if (type === "image") {
      const src = (yBlock.get("src") as string) || "";
      const widthPercent = (yBlock.get("widthPercent") as number) || 100;
      const align = (yBlock.get("align") as "left" | "center" | "right") || "center";
      const caption = (yBlock.get("caption") as string) || "";
      const rawXml = yBlock.get("rawXml") as string | undefined;
      blocks.push({
        type: "image",
        id,
        src,
        widthPercent,
        align,
        caption,
        rawAttrs,
        rawXml,
      });
    }
  }

  return blocks;
}

// 검색 및 버전 비교용 텍스트 추출
export function hwpxCollabText(doc: Y.Doc): string {
  const blocks = extractBlocksFromYDoc(doc);
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph") {
      const clean = stripHtmlTags(block.text);
      if (clean) lines.push(clean);
    } else if (block.type === "table") {
      for (const row of block.rows) {
        const rowText = row.map((c) => c.text).filter(Boolean).join(" | ");
        if (rowText) lines.push(`[표] ${rowText}`);
      }
    } else if (block.type === "equation") {
      if (block.script) lines.push(`[수식] ${block.script}`);
    } else if (block.type === "image") {
      lines.push(`[그림] ${block.caption || "이미지"}`);
    }
  }

  return lines.join("\n\n");
}

// 저장 비교값 (텍스트뿐 아니라 색상·크기·표·이미지 등 모든 블록 변경 여부를 정밀 감지)
export function hwpxCollabKey(doc: Y.Doc): string {
  const blocks = extractBlocksFromYDoc(doc);
  return textHash(JSON.stringify(blocks));
}
