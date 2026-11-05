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
  pageBreak?: boolean;
  rawAttrs?: string;
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

export type HwpxCollabBlock = HwpxParagraphBlock | HwpxTableBlock | HwpxEquationBlock;

// ── OWPML XML을 구조화된 협업 블록 목록으로 파싱 ──
export function parseHwpxXmlToBlocks(xmlStr: string, headerXml = ""): HwpxCollabBlock[] {
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
          hasObjectInP = true;
          currentEquationScript = "";
          currentEquationAttrs = attrs.trim();
        } else if (isClosing) {
          inEquation = false;
          blocks.push({ type: "equation", id: `eq_${blockIndex++}`, script: currentEquationScript, rawAttrs: currentEquationAttrs });
        }
      } else if (localName === "script" && inEquation) {
        inScript = !isClosing && !isSelfClosing;
      }
      // 본문 문단 (p)
      else if (localName === "p" && !inTable) {
        if (!isClosing && !isSelfClosing) {
          inP = true;
          hasObjectInP = false;
          currentPText = [];
          currentPAttrs = attrs.trim();
          const paraMatch = attrs.match(/paraPrIDRef="(\d+)"/);
          currentParaPrId = paraMatch ? paraMatch[1] : "0";
          const pageBreakMatch = attrs.match(/pageBreak="(\d+)"/);
          currentPageBreak = pageBreakMatch ? pageBreakMatch[1] === "1" : false;
          currentCharPrId = "0";
        } else if (isClosing) {
          inP = false;
          if (!hasObjectInP) {
            const pStyle = paraStyles.get(currentParaPrId);
            const cStyle = charStyles.get(currentCharPrId);
            blocks.push({
              type: "paragraph",
              id: `p_${blockIndex++}`,
              text: currentPText.join(""),
              align: pStyle?.align ?? "left",
              sizePt: cStyle?.sizePt,
              bold: cStyle?.bold,
              pageBreak: currentPageBreak,
              rawAttrs: currentPAttrs,
            });
          }
          currentPText = [];
          currentPAttrs = "";
          currentPageBreak = false;
        }
      }
      // 글자 런 (run) 스타일 추적
      else if (localName === "run" && inP) {
        const charMatch = attrs.match(/charPrIDRef="(\d+)"/);
        if (charMatch && charMatch[1] !== "0") {
          currentCharPrId = charMatch[1];
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
        }
      }
    }
  }

  return blocks;
}

// ── 블록 배열을 OWPML XML로 복원 직렬화 (표·수식 구조 100% 보존) ──
export function serializeBlocksToHwpxXml(blocks: HwpxCollabBlock[], originalXml = ""): string {
  // paragraph 0의 설정 런(secPr, ctrl, footer 등) 보존
  let preambleRuns = "";
  const firstPMatch = originalXml.match(/<hp:p\b[^>]*>([\s\S]*?)<\/hp:p>/);
  if (firstPMatch) {
    const inner = firstPMatch[1];
    const firstTRunIdx = inner.indexOf("<hp:t");
    if (firstTRunIdx !== -1) {
      const runOpenIdx = inner.lastIndexOf("<hp:run", firstTRunIdx);
      preambleRuns = runOpenIdx > 0 ? inner.slice(0, runOpenIdx) : "";
    } else {
      preambleRuns = inner;
    }
  }
  if (!preambleRuns) {
    const secPrMatch = originalXml.match(/<hp:secPr\b(?:[^>]*\/>|[\s\S]*?<\/hp:secPr>)/);
    if (secPrMatch) {
      preambleRuns = `<hp:run charPrIDRef="0">${secPrMatch[0]}</hp:run>`;
    }
  }

  const rootOpen = '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">';

  const paragraphsXml = blocks.map((block, idx) => {
    const lead = (idx === 0 && preambleRuns) ? preambleRuns : "";

    if (block.type === "table") {
      const rowsXml = block.rows.map((row, rIdx) => {
        const cellsXml = row.map((cell, cIdx) => {
          const tcAttrs = cell.rawAttrs ? ` ${cell.rawAttrs}` : ` name="${rIdx}_${cIdx}"`;
          return `        <hp:tc${tcAttrs}><hp:subList><hp:p id="${rIdx}_${cIdx}_0" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${escapeXml(cell.text)}</hp:t></hp:run></hp:p></hp:subList></hp:tc>`;
        }).join("\n");
        return `      <hp:tr>\n${cellsXml}\n      </hp:tr>`;
      }).join("\n");

      const tblAttrs = block.rawAttrs ? ` ${block.rawAttrs}` : ` id="${idx}" pageBreak="cell" repeatHeader="true"`;
      return `    <hp:p id="${idx}" paraPrIDRef="0" styleIDRef="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:tbl${tblAttrs}>\n${rowsXml}\n      </hp:tbl></hp:run>\n    </hp:p>`;
    }

    if (block.type === "equation") {
      const eqAttrs = block.rawAttrs ? ` ${block.rawAttrs}` : ` version="1.0" baseLine="0" textColor="#000000" baseUnit="1000"`;
      return `    <hp:p id="${idx}" paraPrIDRef="0" styleIDRef="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:equation${eqAttrs}><hp:script>${escapeXml(block.script)}</hp:script></hp:equation></hp:run>\n    </hp:p>`;
    }

    // 일반 문단
    const pAttrs = block.rawAttrs ? ` ${block.rawAttrs}` : ` id="${idx}" paraPrIDRef="0" styleIDRef="0"`;
    return `    <hp:p${pAttrs}>\n      ${lead}<hp:run charPrIDRef="0"><hp:t>${escapeXml(block.text)}</hp:t></hp:run>\n    </hp:p>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${rootOpen}\n${paragraphsXml}\n</hs:sec>`;
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
        if (block.pageBreak !== undefined) yBlock.set("pageBreak", block.pageBreak);
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
    const type = yBlock.get("type") as "paragraph" | "table" | "equation";
    const id = (yBlock.get("id") as string) || `block_${i}`;
    const rawAttrs = yBlock.get("rawAttrs") as string | undefined;

    if (type === "paragraph") {
      const yText = yBlock.get("text") as Y.Text | undefined;
      const align = yBlock.get("align") as "left" | "center" | "right" | "justify" | undefined;
      const sizePt = yBlock.get("sizePt") as number | undefined;
      const bold = yBlock.get("bold") as boolean | undefined;
      const pageBreak = yBlock.get("pageBreak") as boolean | undefined;
      blocks.push({
        type: "paragraph",
        id,
        text: yText ? yText.toString() : "",
        align,
        sizePt,
        bold,
        pageBreak,
        rawAttrs,
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
      if (block.text) lines.push(block.text);
    } else if (block.type === "table") {
      for (const row of block.rows) {
        const rowText = row.map((c) => c.text).filter(Boolean).join(" | ");
        if (rowText) lines.push(`[표] ${rowText}`);
      }
    } else if (block.type === "equation") {
      if (block.script) lines.push(`[수식] ${block.script}`);
    }
  }

  return lines.join("\n\n");
}

// 저장 비교값 (변경 여부 판단 해시)
export function hwpxCollabKey(doc: Y.Doc): string {
  return textHash(hwpxCollabText(doc));
}
