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
  strikethrough?: boolean;
  color?: string;
  shadingColor?: string;
  fontFamily?: string;
  relativeSizePct?: number;
  charWidthPct?: number;
  charPosPct?: number;
  letterSpacingPct?: number;
  marginLeftPt?: number;
  marginRightPt?: number;
  firstLineType?: "none" | "indent" | "outdent";
  firstLinePt?: number;
  lineSpacingPct?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  paraBorderType?: string;
  paraBorderWidth?: string;
  paraBorderColor?: string;
  paraBgColor?: string;
  pageBreak?: boolean;
  rawAttrs?: string;
  charPrId?: string;
  rawXml?: string;
  origText?: string;
  fontEdited?: boolean; // 글자는 그대로 두고 문단 글꼴만 바꿈(원본 XML을 쓰되 글자 모양만 새 글꼴로)
}

export interface HwpxTableCell {
  text: string;
  align?: "left" | "center" | "right" | "justify";
  bold?: boolean;
  colSpan?: number;
  rowSpan?: number;
  mergedHidden?: boolean;
  widthPercent?: number;
  heightPx?: number;
  bgColor?: string;
  color?: string;
  rawAttrs?: string;
}

export interface HwpxTableBlock {
  type: "table";
  id: string;
  rows: HwpxTableCell[][];
  rawAttrs?: string;
  offsetX?: number;
  offsetY?: number;
  widthPercent?: number;
  heightPt?: number;
  colWidths?: number[];
  rowHeights?: number[];
  caption?: string;
  captionPos?: string;
  borderColor?: string;
  borderThickness?: string;
  borderType?: string;
  cellSpacingMm?: number;
  cellSpacingEnabled?: boolean;
  fillColor?: string;
  fillMode?: "none" | "color";
  cellPaddingLeftMm?: number;
  cellPaddingRightMm?: number;
  cellPaddingTopMm?: number;
  cellPaddingBottomMm?: number;
  pageBreak?: "divide" | "cell_divide" | "no_divide";
  repeatHeader?: boolean;
  treatAsChar?: boolean;
  limitToPage?: boolean;
  allowOverlap?: boolean;
  textWrap?: "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT";
  textFlow?: "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY";
  marginLeftMm?: number;
  marginRightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
}

export interface HwpxEquationBlock {
  type: "equation";
  id: string;
  script: string;
  rawAttrs?: string;
  offsetX?: number;
  offsetY?: number;
}

export interface HwpxImageBlock {
  type: "image";
  id: string;
  src: string;
  widthPercent?: number;
  heightPt?: number;
  align?: "left" | "center" | "right";
  caption?: string;
  captionPos?: string;
  rawAttrs?: string;
  rawXml?: string;
  offsetX?: number;
  offsetY?: number;
  treatAsChar?: boolean;
  limitToPage?: boolean;
  allowOverlap?: boolean;
  textWrap?: "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT";
  textFlow?: "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY";
  marginLeftMm?: number;
  marginRightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  borderColor?: string;
  borderThickness?: string;
  borderType?: string;
  hyperlink?: string;
}

export interface HwpxShapeBlock {
  type: "shape";
  id: string;
  shapeType: "rect" | "roundRect" | "ellipse" | "line" | "arc";
  widthPercent?: number;
  heightPt?: number;
  fillColor?: string;
  fillMode?: "none" | "color";
  strokeColor?: string;
  strokeWidth?: number;
  strokeType?: string;
  text?: string;
  align?: "left" | "center" | "right";
  caption?: string;
  captionPos?: string;
  rawAttrs?: string;
  rawXml?: string;
  offsetX?: number;
  offsetY?: number;
  treatAsChar?: boolean;
  limitToPage?: boolean;
  allowOverlap?: boolean;
  textWrap?: "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT";
  textFlow?: "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY";
  marginLeftMm?: number;
  marginRightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  hyperlink?: string;
  lineDir?: "tl-br" | "bl-tr";
  isTextBox?: boolean;
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

export interface HwpxChartBlock {
  type: "chart";
  id: string;
  chartType: "column" | "bar" | "line" | "pie";
  title: string;
  categories: string[];
  series: { name: string; values: number[]; color?: string }[];
  widthPercent?: number;
  heightPt?: number;
  align?: "left" | "center" | "right";
  caption?: string;
  captionPos?: string;
  rawAttrs?: string;
  rawXml?: string;
  offsetX?: number;
  offsetY?: number;
  treatAsChar?: boolean;
  limitToPage?: boolean;
  allowOverlap?: boolean;
  textWrap?: "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT";
  textFlow?: "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY";
  marginLeftMm?: number;
  marginRightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  hyperlink?: string;
  lineDir?: "tl-br" | "bl-tr";
  isTextBox?: boolean;
}

export type HwpxCollabBlock = HwpxParagraphBlock | HwpxTableBlock | HwpxEquationBlock | HwpxImageBlock | HwpxShapeBlock | HwpxChartBlock;

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
  fontFamily?: string; // CSS font-family 값
}

// ── 글꼴: 편집기의 CSS font-family 값 <-> HWPX 글꼴 이름(face) ──
// 원본 문서의 명조·고딕 계열 글꼴은 화면에서 아래 두 값으로 보여 주고, 저장할 때는 원본 글자 모양을 그대로 다시 쓴다.
export const HWPX_SERIF_CSS = "'HCR Batang', '함초롬바탕', 'Batang', 'Nanum Myeongjo', 'Noto Serif KR', serif";
export const HWPX_SANS_CSS = "Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const FONT_LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"] as const;
const FACE_ALIASES: Record<string, string> = {
  batang: "바탕",
  batangche: "바탕체",
  dotum: "돋움",
  dotumche: "돋움체",
  gulim: "굴림",
  gulimche: "굴림체",
  gungsuh: "궁서",
  gungsuhche: "궁서체",
  "malgun gothic": "맑은 고딕",
  malgungothic: "맑은 고딕",
  "nanum myeongjo": "나눔명조",
  nanummyeongjo: "나눔명조",
  "nanum gothic": "나눔고딕",
  nanumgothic: "나눔고딕",
  "courier new": "Courier New",
  couriernew: "Courier New",
  "times new roman": "Times New Roman",
  timesnewroman: "Times New Roman",
  arial: "Arial",
};

const normalizeFontCss = (css?: string) => (css ?? "").toLowerCase().replace(/["'\s]/g, "");

export function cssFontForHwpxFace(face: string): string | undefined {
  if (!face) return undefined;
  if (/굴림|gulim/i.test(face)) return "'GulimChe', 'Gulim', sans-serif";
  if (/궁서|gungsuh/i.test(face)) return "'GungsuhChe', 'Gungsuh', serif";
  // 한컴 기본 명조·고딕 계열만 묶는다("GmarketSans"처럼 이름에 sans가 든 글꼴은 그 이름 그대로).
  if (/명조|바탕|batang|myeongjo/i.test(face)) return HWPX_SERIF_CSS;
  if (/돋움|고딕|gothic|dotum/i.test(face)) return HWPX_SANS_CSS;
  return `'${face}', sans-serif`;
}

export function hwpxFaceForCssFont(css?: string): string | undefined {
  const norm = normalizeFontCss(css);
  if (!norm) return undefined;
  if (norm === normalizeFontCss(HWPX_SERIF_CSS)) return "함초롬바탕";
  if (norm === normalizeFontCss(HWPX_SANS_CSS)) return "함초롬돋움";
  const primary = (css ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "").trim();
  if (!primary || /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(primary)) return undefined;
  return FACE_ALIASES[primary.toLowerCase()] ?? primary;
}

interface HwpxFontGroup { lang: string; faceById: Map<string, string>; idByFace: Map<string, number>; next: number; added: { id: number; face: string }[] }

// header.xml의 언어별 글꼴 목록(<hh:fontface lang="HANGUL"> ...). 글자 모양의 fontRef는 언어마다 이 목록의 id를 가리킨다.
function parseFontGroups(headerXml: string): HwpxFontGroup[] {
  const groups: HwpxFontGroup[] = [];
  const groupRe = /<hh:fontface\b([^>]*)>([\s\S]*?)<\/hh:fontface>/g;
  let gm: RegExpExecArray | null;
  while ((gm = groupRe.exec(headerXml)) !== null) {
    const lang = gm[1].match(/\blang="([^"]+)"/)?.[1];
    if (!lang) continue;
    const group: HwpxFontGroup = { lang: lang.toUpperCase(), faceById: new Map(), idByFace: new Map(), next: 0, added: [] };
    const fontRe = /<hh:font\b[^>]*\bid="(\d+)"[^>]*\bface="([^"]*)"/g;
    let fm: RegExpExecArray | null;
    while ((fm = fontRe.exec(gm[2])) !== null) {
      const id = parseInt(fm[1], 10);
      const face = decodeXmlEntities(fm[2]);
      group.faceById.set(fm[1], face);
      if (!group.idByFace.has(face)) group.idByFace.set(face, id);
      group.next = Math.max(group.next, id + 1);
    }
    groups.push(group);
  }
  return groups;
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
      fontFamily: baseStyle.fontFamily,
    }];
  }

  const runs: ParsedTextRun[] = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;

  const styleStack: Array<{ color?: string; sizePt?: number; bold?: boolean; italic?: boolean; underline?: boolean; fontFamily?: string }> = [{
    color: baseStyle.color,
    sizePt: baseStyle.sizePt,
    bold: baseStyle.bold,
    italic: baseStyle.italic,
    underline: baseStyle.underline,
    fontFamily: baseStyle.fontFamily,
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
        fontFamily: cur.fontFamily,
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

        // 선택 영역 글꼴: <span style="font-family: ..."> 또는 <font face="...">
        // style 값 안의 글꼴 이름은 &quot;로 감싸져 있어(innerHTML) style 값을 먼저 풀고 찾는다.
        const styleAttr = attrs.match(/\bstyle=(?:"([^"]*)"|'([^']*)')/i);
        const styleText = styleAttr ? decodeXmlEntities(styleAttr[1] ?? styleAttr[2] ?? "") : "";
        const faceAttr = attrs.match(/\bface=(?:"([^"]*)"|'([^']*)')/i);
        const fontValue = (styleText.match(/font-family:\s*([^;]+)/i)?.[1] ?? (faceAttr ? decodeXmlEntities(faceAttr[1] ?? faceAttr[2] ?? "") : "")).trim();
        if (fontValue) nextStyle.fontFamily = fontValue;

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
  // 1. header.xml 스타일 정보(정렬, 글자 크기, 볼드, 글꼴) 사전 추출
  const paraStyles = new Map<string, { align: "left" | "center" | "right" | "justify"; marginLeftPt?: number }>();
  const charStyles = new Map<string, { sizePt: number; bold: boolean; fontFamily?: string }>();

  if (headerXml) {
    const fontFaces = parseFontGroups(headerXml).find((g) => g.lang === "HANGUL")?.faceById ?? new Map<string, string>();

    const paraPrRegex = /<hh:paraPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/hh:paraPr>)/g;
    let pm: RegExpExecArray | null;
    while ((pm = paraPrRegex.exec(headerXml)) !== null) {
      const idMatch = pm[0].match(/\bid="(\d+)"/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const alignMatch = pm[0].match(/horizontal="([^"]+)"/i);
      const alignVal = alignMatch ? alignMatch[1].toLowerCase() : "left";
      const leftMarginMatch = pm[0].match(/<hc:left\b[^>]*\bvalue="(\d+)"/i);
      const leftMarginPt = leftMarginMatch ? Math.round(parseInt(leftMarginMatch[1], 10) / 100) : 0;
      paraStyles.set(id, {
        align: alignVal === "center" || alignVal === "right" || alignVal === "justify" ? alignVal : "left",
        marginLeftPt: leftMarginPt > 0 ? leftMarginPt : undefined,
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

      let fontFamily: string | undefined;
      const fontRefMatch = cm[0].match(/<hh:fontRef\b[^>]*\bhangul="(\d+)"/i);
      if (fontRefMatch) {
        fontFamily = cssFontForHwpxFace(fontFaces.get(fontRefMatch[1]) || "");
      }

      charStyles.set(id, {
        sizePt: sizeMatch ? parseInt(sizeMatch[1], 10) / 100 : 10,
        bold: boldMatch,
        fontFamily,
      });
    }
  }

  const blocks: HwpxCollabBlock[] = [];
  const tokenRegex = /<(\/)?([a-zA-Z0-9_:]+)((?:\s+[^>]*)?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  let ctrlDepth = 0; // 머리말, 꼬리말 등 제어 태그 깊이 (본문 문단과 분리)
  let inNoteKind: "footnote" | "endnote" | null = null;
  let inNoteText: string[] = [];
  let inNoteT = false;
  let parsedFootnoteNum = 0;
  let parsedEndnoteNum = 0;
  const parsedNoteBlocks: HwpxParagraphBlock[] = [];
  let inHyperlinkField = false;
  let inHyperlinkCommand = false;
  let currentHyperlinkUrl = "";
  let hyperlinkTextParts: string[] = [];
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
  let pShapeCount = 0;
  let pHasNormalText = false;
  let lastEquationScript = "";
  let lastEquationAttrs = "";
  let lastPicBinId = "";
  let lastPicAttrs = "";
  let lastShapeType: "rect" | "roundRect" | "ellipse" | "line" | "arc" = "rect";
  let lastShapeAttrs = "";
  let lastShapeFill = "#EFF6FF";
  let lastShapeStroke = "#2563EB";
  let lastShapeStrokeWidth = 1.5;
  let lastShapeText = "";
  let inCaption = false;
  let captionSide = "BOTTOM";
  let currentCaptionText = "";
  let lastPicCaption = "";
  let lastPicCaptionPos = "bottom_center";
  let lastShapeCaption = "";
  let lastShapeCaptionPos = "bottom_center";
  let currentParaPrId = "0";
  let currentCharPrId = "0";
  let currentPageBreak = false;
  let inT = false;
  let subListDepth = 0;

  let blockIndex = 0;

  while ((match = tokenRegex.exec(xmlStr)) !== null) {
    const isClosing = !!match[1];
    const tagName = match[2]?.toLowerCase();
    const attrs = match[3] || "";
    const isSelfClosing = !!match[4] || attrs.trim().endsWith("/");
    const textContent = match[5];

    if (tagName) {
      const localName = tagName.split(":").pop()!;

      // 머리말 / 꼬리말 분리 격리
      if (localName === "header" || localName === "footer") {
        if (!isClosing && !isSelfClosing) {
          ctrlDepth++;
        } else if (isClosing) {
          ctrlDepth = Math.max(0, ctrlDepth - 1);
        }
        continue;
      }

      // 책갈피 (<hp:bookmark name="..."/>)
      if (localName === "bookmark") {
        if (!isClosing) {
          const bmNameMatch = attrs.match(/\bname="([^"]+)"/i);
          if (bmNameMatch && inP) {
            currentPText.push(`<span data-bookmark-name="${escapeXml(decodeXmlEntities(bmNameMatch[1]))}"></span>`);
            pHasNormalText = true;
          }
        }
        continue;
      }

      // 하이퍼링크 필드 (<hp:fieldBegin type="HYPERLINK"> ... <hp:fieldEnd/>)
      if (localName === "fieldbegin") {
        if (!isClosing && !isSelfClosing && /\btype="HYPERLINK"/i.test(attrs)) {
          inHyperlinkField = true;
          inHyperlinkCommand = false;
          currentHyperlinkUrl = "";
          hyperlinkTextParts = [];
        }
        continue;
      }
      if (inHyperlinkField && localName === "stringparam") {
        if (!isClosing && !isSelfClosing && /\bname="Command"/i.test(attrs)) {
          inHyperlinkCommand = true;
        } else if (isClosing) {
          inHyperlinkCommand = false;
        }
        continue;
      }
      if (inHyperlinkField && localName === "fieldend") {
        if (!isClosing) {
          const href = currentHyperlinkUrl.split(";")[0].trim();
          const label = hyperlinkTextParts.join("") || href;
          if (inP && href) {
            currentPText.push(`<a href="${escapeXml(href)}">${label}</a>`);
            pHasNormalText = true;
          } else if (inP && label) {
            currentPText.push(label);
            pHasNormalText = true;
          }
          inHyperlinkField = false;
          inHyperlinkCommand = false;
          currentHyperlinkUrl = "";
          hyperlinkTextParts = [];
        }
        continue;
      }

      // 각주 / 미주 파싱 (<hp:footNote>, <hp:endNote>) -> 본문 <sup> 토큰 + 별도 note 블록
      if (localName === "footnote" || localName === "endnote") {
        if (!isClosing && !isSelfClosing) {
          inNoteKind = localName === "endnote" ? "endnote" : "footnote";
          inNoteText = [];
          inNoteT = false;
        } else if (isClosing && inNoteKind) {
          const num = inNoteKind === "endnote" ? ++parsedEndnoteNum : ++parsedFootnoteNum;
          const noteId = `${inNoteKind}-parsed-${num}`;
          if (inP) {
            currentPText.push(`<sup data-note-id="${noteId}" data-note-type="${inNoteKind}">${num})</sup>`);
            pHasNormalText = true;
          }
          const noteBody = inNoteText.join("").trim();
          parsedNoteBlocks.push({
            type: "paragraph",
            id: noteId,
            text: noteBody,
            origText: noteBody,
          });
          inNoteKind = null;
          inNoteText = [];
          inNoteT = false;
        }
        continue;
      }

      if (inNoteKind) {
        if (localName === "t") {
          inNoteT = !isClosing && !isSelfClosing;
        }
        continue;
      }

      // 제어 요소 내부 내용이면 무시 (본문 오염 방지)
      if (ctrlDepth > 0) {
        continue;
      }

      // 서브리스트 (subList) 계층 추적: 표 셀(tc), 캡션(caption), 도형 글상자(drawText) 내부 문단 격리
      if (localName === "sublist") {
        if (!isClosing && !isSelfClosing) {
          subListDepth++;
        } else if (isClosing) {
          subListDepth = Math.max(0, subListDepth - 1);
        }
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
      // 캡션 (caption)
      else if (localName === "caption") {
        if (!isClosing && !isSelfClosing) {
          inCaption = true;
          const sMatch = attrs.match(/side="([^"]+)"/i);
          captionSide = sMatch ? sMatch[1].toUpperCase() : "BOTTOM";
          currentCaptionText = "";
        } else if (isClosing) {
          inCaption = false;
          const cText = currentCaptionText.trim();
          const cPos = captionSide === "TOP"
            ? "top_center"
            : captionSide === "LEFT"
              ? "left_center"
              : captionSide === "RIGHT"
                ? "right_center"
                : "bottom_center";
          if (inTable && currentTable) {
            currentTable.caption = cText;
            currentTable.captionPos = cPos;
          }
          if (pPicCount > 0) {
            lastPicCaption = cText;
            lastPicCaptionPos = cPos;
          }
          if (pShapeCount > 0) {
            lastShapeCaption = cText;
            lastShapeCaptionPos = cPos;
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
      // 도형 (rect, ellipse, line, arc)
      else if ((localName === "rect" || localName === "ellipse" || localName === "line" || localName === "arc") && inP) {
        if (!isClosing && !isSelfClosing) {
          pShapeCount++;
          lastShapeType = localName === "ellipse"
            ? "ellipse"
            : localName === "line"
              ? "line"
              : localName === "arc"
                ? "arc"
                : (attrs.includes("ROUND") ? "roundRect" : "rect");
          lastShapeAttrs = attrs.trim();
        }
      }
      // 웹 동영상 (video)
      else if (localName === "video" && inP) {
        if (!isClosing) {
          const tagMatch = attrs.match(/\btag="([^"]+)"/i);
          const vTypeMatch = attrs.match(/\bvideotype="([^"]+)"/i);
          if (tagMatch && (!vTypeMatch || vTypeMatch[1].toLowerCase() === "web")) {
            pShapeCount++;
            lastShapeType = "rect";
            lastShapeAttrs = attrs.trim();
            lastShapeFill = "#000000";
            lastShapeText = `__WEB_VIDEO__:${decodeXmlEntities(tagMatch[1])}`;
          }
        }
      }
      // 도형 채우기 (winBrush)
      else if ((localName === "winbrush" || localName === "winBrush") && inP && pShapeCount > 0) {
        const faceMatch = attrs.match(/faceColor="([^"]+)"/i);
        if (faceMatch && faceMatch[1].toLowerCase() !== "none") {
          lastShapeFill = colorToHex(faceMatch[1]);
        } else if (faceMatch && faceMatch[1].toLowerCase() === "none") {
          lastShapeFill = "transparent";
        }
      }
      // 도형 선 (lineShape)
      else if ((localName === "lineshape" || localName === "lineShape") && inP && pShapeCount > 0) {
        const colMatch = attrs.match(/color="([^"]+)"/i);
        if (colMatch) lastShapeStroke = colorToHex(colMatch[1]);
        const wMatch = attrs.match(/width="(\d+)"/i);
        if (wMatch) lastShapeStrokeWidth = Math.max(1, parseInt(wMatch[1], 10) / 100);
      }
      // 본문 문단 (p)
      else if (localName === "p" && !inTable && subListDepth === 0) {
        if (!isClosing && !isSelfClosing) {
          inP = true;
          hasObjectInP = false;
          currentPStartIndex = match.index;
          lastPicCaption = "";
          lastPicCaptionPos = "bottom_center";
          lastShapeCaption = "";
          lastShapeCaptionPos = "bottom_center";
          currentPText = [];
          currentPAttrs = attrs.trim();
          pEquationCount = 0;
          pPicCount = 0;
          pShapeCount = 0;
          pHasNormalText = false;
          lastEquationScript = "";
          lastEquationAttrs = "";
          lastPicBinId = "";
          lastPicAttrs = "";
          lastShapeType = "rect";
          lastShapeAttrs = "";
          lastShapeFill = "#EFF6FF";
          lastShapeStroke = "#2563EB";
          lastShapeStrokeWidth = 1.5;
          lastShapeText = "";
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
              const secContentW = extractSectionContentWidthHw(xmlStr);
              const picSzTag = rawXml?.match(/<hp:sz\b([^>]*)>/i)?.[1] || "";
              const picWMatch = picSzTag.match(/\bwidth="(\d+)"/i);
              const picHMatch = picSzTag.match(/\bheight="(\d+)"/i);
              const picWidthPct = picWMatch
                ? Math.max(5, Math.min(100, Number(((parseInt(picWMatch[1], 10) / secContentW) * 100).toFixed(2))))
                : 75;
              const picHeightPt = picHMatch ? Math.max(5, Number((parseInt(picHMatch[1], 10) / 100).toFixed(2))) : undefined;
              const picPosTag = rawXml?.match(/<hp:pos\b([^>]*)>/i)?.[1] || "";
              const picTreatAsChar = /\btreatAsChar="0"/i.test(picPosTag) ? false : /\btreatAsChar="1"/i.test(picPosTag) ? true : undefined;
              const picHorzMatch = picPosTag.match(/\bhorzOffset="(-?\d+)"/i);
              const picVertMatch = picPosTag.match(/\bvertOffset="(-?\d+)"/i);
              const picOffX = picHorzMatch ? Math.round(parseInt(picHorzMatch[1], 10) / 75) : undefined;
              const picOffY = picVertMatch ? Math.round(parseInt(picVertMatch[1], 10) / 75) : undefined;
              const picAllowOverlap = /\ballowOverlap="1"/i.test(picPosTag) ? true : /\ballowOverlap="0"/i.test(picPosTag) ? false : undefined;
              const picWrapMatch = lastPicAttrs.match(/\btextWrap="(TOP_AND_BOTTOM|SQUARE|IN_FRONT_OF_TEXT|BEHIND_TEXT)"/i);
              const picTextWrap = picWrapMatch ? (picWrapMatch[1].toUpperCase() as HwpxImageBlock["textWrap"]) : undefined;
              const picFlowMatch = lastPicAttrs.match(/\btextFlow="(BOTH_SIDES|LEFT_ONLY|RIGHT_ONLY)"/i);
              const picTextFlow = picFlowMatch ? (picFlowMatch[1].toUpperCase() as HwpxImageBlock["textFlow"]) : undefined;
              blocks.push({
                type: "image",
                id: `img_${blockIndex++}`,
                src: imgSrc,
                widthPercent: picWidthPct,
                heightPt: picHeightPt,
                align: "left",
                treatAsChar: picTreatAsChar,
                offsetX: picOffX,
                offsetY: picOffY,
                allowOverlap: picAllowOverlap,
                textWrap: picTextWrap,
                textFlow: picTextFlow,
                caption: lastPicCaption || undefined,
                captionPos: lastPicCaption ? lastPicCaptionPos : undefined,
                rawAttrs: lastPicAttrs,
                rawXml,
              });
            } else if (pShapeCount === 1 && !pHasNormalText) {
              const secContentW = extractSectionContentWidthHw(xmlStr);
              const szTag = rawXml?.match(/<hp:sz\b([^>]*)>/i)?.[1] || "";
              const szWMatch = szTag.match(/\bwidth="(\d+)"/i);
              const szHMatch = szTag.match(/\bheight="(\d+)"/i);
              const szWidthHw = szWMatch ? parseInt(szWMatch[1], 10) : undefined;
              const szHeightHw = szHMatch ? parseInt(szHMatch[1], 10) : undefined;
              const parsedWidthPct = szWidthHw !== undefined
                ? Math.max(0.5, Math.min(100, Number(((szWidthHw / secContentW) * 100).toFixed(2))))
                : 75;
              const parsedHeightPt = szHeightHw !== undefined
                ? (lastShapeType === "line" && szHeightHw <= 600 ? 2 : Math.max(2, Number((szHeightHw / 100).toFixed(2))))
                : (lastShapeType === "line" ? 2 : 60);
              const posTag = rawXml?.match(/<hp:pos\b([^>]*)>/i)?.[1] || "";
              const parsedTreatAsChar = /\btreatAsChar="0"/i.test(posTag) ? false : /\btreatAsChar="1"/i.test(posTag) ? true : undefined;
              const horzOffMatch = posTag.match(/\bhorzOffset="(-?\d+)"/i);
              const vertOffMatch = posTag.match(/\bvertOffset="(-?\d+)"/i);
              const parsedOffX = horzOffMatch ? Math.round(parseInt(horzOffMatch[1], 10) / 75) : undefined;
              const parsedOffY = vertOffMatch ? Math.round(parseInt(vertOffMatch[1], 10) / 75) : undefined;
              const parsedAllowOverlap = /\ballowOverlap="1"/i.test(posTag) ? true : /\ballowOverlap="0"/i.test(posTag) ? false : undefined;
              const shapeWrapMatch = lastShapeAttrs.match(/\btextWrap="(TOP_AND_BOTTOM|SQUARE|IN_FRONT_OF_TEXT|BEHIND_TEXT)"/i);
              const parsedTextWrap = shapeWrapMatch ? (shapeWrapMatch[1].toUpperCase() as HwpxShapeBlock["textWrap"]) : undefined;
              const shapeFlowMatch = lastShapeAttrs.match(/\btextFlow="(BOTH_SIDES|LEFT_ONLY|RIGHT_ONLY)"/i);
              const parsedTextFlow = shapeFlowMatch ? (shapeFlowMatch[1].toUpperCase() as HwpxShapeBlock["textFlow"]) : undefined;
              let parsedLineDir: "tl-br" | "bl-tr" | undefined;
              if (lastShapeType === "line" && (szHeightHw ?? 0) > 600 && rawXml) {
                const spY = rawXml.match(/<hc:startPt\b[^>]*\by="(\d+)"/i)?.[1];
                const epY = rawXml.match(/<hc:endPt\b[^>]*\by="(\d+)"/i)?.[1];
                if (spY !== undefined && epY !== undefined) {
                  parsedLineDir = parseInt(spY, 10) > parseInt(epY, 10) ? "bl-tr" : "tl-br";
                }
              }
              blocks.push({
                type: "shape",
                id: `shape_${blockIndex++}`,
                shapeType: lastShapeType,
                widthPercent: parsedWidthPct,
                heightPt: parsedHeightPt,
                fillColor: lastShapeFill,
                strokeColor: lastShapeStroke,
                strokeWidth: lastShapeStrokeWidth,
                text: lastShapeText.trim(),
                align: "left",
                treatAsChar: parsedTreatAsChar,
                offsetX: parsedOffX,
                offsetY: parsedOffY,
                allowOverlap: parsedAllowOverlap,
                textWrap: parsedTextWrap,
                textFlow: parsedTextFlow,
                lineDir: parsedLineDir,
                isTextBox: /<hp:drawText\b/i.test(rawXml || "") ? true : undefined,
                caption: lastShapeCaption || undefined,
                captionPos: lastShapeCaption ? lastShapeCaptionPos : undefined,
                rawAttrs: lastShapeAttrs,
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
                marginLeftPt: pStyle?.marginLeftPt,
                sizePt: cStyle?.sizePt,
                bold: cStyle?.bold,
                fontFamily: cStyle?.fontFamily,
                pageBreak: currentPageBreak,
                rawAttrs: currentPAttrs,
                charPrId: currentCharPrId,
                rawXml,
                origText: fullText,
              });
            }
          }
          lastPicCaption = "";
          lastPicCaptionPos = "bottom_center";
          lastShapeCaption = "";
          lastShapeCaptionPos = "bottom_center";
          currentPText = [];
          currentPAttrs = "";
          currentPageBreak = false;
          currentPStartIndex = -1;
          pEquationCount = 0;
          pPicCount = 0;
          pShapeCount = 0;
          pHasNormalText = false;
          lastEquationScript = "";
          lastEquationAttrs = "";
          lastPicBinId = "";
          lastPicAttrs = "";
          lastShapeType = "rect";
          lastShapeAttrs = "";
          lastShapeFill = "#EFF6FF";
          lastShapeStroke = "#2563EB";
          lastShapeStrokeWidth = 1.5;
          lastShapeText = "";
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
    } else if (textContent && inNoteKind) {
      if (inNoteT) {
        inNoteText.push(decodeXmlEntities(textContent));
      }
      continue;
    } else if (textContent && inHyperlinkCommand) {
      currentHyperlinkUrl += decodeXmlEntities(textContent);
      continue;
    } else if (textContent && ctrlDepth === 0) {
      if (inScript) {
        currentEquationScript += decodeXmlEntities(textContent);
      } else if (inT) {
        const decoded = decodeXmlEntities(textContent);
        if (inCaption) {
          currentCaptionText += decoded;
        } else if (inTable && currentCell) {
          currentCell.push(decoded);
        } else if (inP) {
          if (inHyperlinkField) {
            hyperlinkTextParts.push(decoded);
          } else if (pShapeCount > 0) {
            lastShapeText += decoded;
          } else {
            currentPText.push(decoded);
            if (decoded.trim()) pHasNormalText = true;
          }
        }
      }
    }
  }

  if (parsedNoteBlocks.length > 0) {
    blocks.push(...parsedNoteBlocks);
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

function extractSectionContentWidthHw(xml: string, fallback = 42520): number {
  if (!xml) return fallback;
  const pagePrTag = xml.match(/<hp:pagePr\b([^>]*)>/i)?.[1];
  const marginTag = xml.match(/<hp:margin\b([^>]*)>/i)?.[1];
  const pageW = pagePrTag?.match(/\bwidth="(\d+)"/i)?.[1];
  const mLeft = marginTag?.match(/\bleft="(\d+)"/i)?.[1];
  const mRight = marginTag?.match(/\bright="(\d+)"/i)?.[1];
  if (pageW && mLeft && mRight) {
    return Math.max(10000, parseInt(pageW, 10) - parseInt(mLeft, 10) - parseInt(mRight, 10));
  }
  return fallback;
}

// ── 블록 배열을 OWPML XML 및 Header XML로 복원 직렬화 (글자색·서식·표·수식 구조 100% 보존) ──
export function buildOoxmlChartXml(block: HwpxChartBlock): string {
  const title = escapeXml(block.title || "차트");
  const categories = block.categories?.length ? block.categories : ["항목 1", "항목 2"];
  const series = block.series?.length ? block.series : [{ name: "계열 1", values: [10, 20] }];

  const catPts = categories
    .map((c, i) => `<c:pt idx="${i}"><c:v>${escapeXml(c)}</c:v></c:pt>`)
    .join("");

  const serXml = series
    .map((s, sIdx) => {
      const valPts = categories
        .map((_, i) => `<c:pt idx="${i}"><c:v>${Number(s.values?.[i] ?? 0)}</c:v></c:pt>`)
        .join("");
      return `<c:ser><c:idx val="${sIdx}"/><c:order val="${sIdx}"/><c:tx><c:v>${escapeXml(s.name || `계열 ${sIdx + 1}`)}</c:v></c:tx><c:cat><c:strLit><c:ptCount val="${categories.length}"/>${catPts}</c:strLit></c:cat><c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${categories.length}"/>${valPts}</c:numLit></c:val></c:ser>`;
    })
    .join("");

  const chartType = block.chartType || "column";
  let plotBody = "";
  if (chartType === "pie") {
    plotBody = `<c:pieChart><c:varyColors val="1"/>${serXml}</c:pieChart>`;
  } else if (chartType === "line") {
    plotBody = `<c:lineChart><c:grouping val="standard"/>${serXml}<c:axId val="1"/><c:axId val="2"/></c:lineChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>`;
  } else {
    const barDir = chartType === "bar" ? "bar" : "col";
    plotBody = `<c:barChart><c:barDir val="${barDir}"/><c:grouping val="clustered"/>${serXml}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:layout/>${plotBody}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
}

export interface HwpxMemoItem {
  id: string;
  blockId: string;
  author: string;
  createdAt: string;
  text: string;
  anchorText?: string;
}

export function extractMemosFromHwpxXml(xmlStr: string): HwpxMemoItem[] {
  const memos: HwpxMemoItem[] = [];
  if (!xmlStr || !xmlStr.includes("MEMO")) return memos;
  const blocks = parseHwpxXmlToBlocks(xmlStr);
  const pIds = blocks.filter((b) => b.type === "paragraph" && !b.id.startsWith("footnote-") && !b.id.startsWith("endnote-")).map((b) => b.id);
  const pRe = /<hp:p\b[^>]*>([\s\S]*?)<\/hp:p>/gi;
  // Match top-level <hp:p> indices roughly by scanning fieldBegin type="MEMO"
  const memoRe = /<hp:fieldBegin\b[^>]*type="MEMO"[^>]*>([\s\S]*?)<\/hp:fieldBegin>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = memoRe.exec(xmlStr)) !== null) {
    const inner = m[1] || "";
    const author = decodeXmlEntities(inner.match(/<hp:stringParam\b[^>]*name="Author"[^>]*>([\s\S]*?)<\/hp:stringParam>/i)?.[1] || "작성자");
    const createdAt = decodeXmlEntities(inner.match(/<hp:stringParam\b[^>]*name="CreateDateTime"[^>]*>([\s\S]*?)<\/hp:stringParam>/i)?.[1] || "");
    const tMatches = Array.from(inner.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/gi)).map((tm) => decodeXmlEntities(tm[1] || ""));
    const text = tMatches.join("");
    // Find preceding top-level paragraph index
    const before = xmlStr.slice(0, m.index);
    const pCount = (before.match(/^\s*<hp:p\b/gm) || []).length;
    const blockId = pIds[Math.max(0, pCount - 1)] || pIds[0] || "p_0";
    memos.push({
      id: `memo_parsed_${++idx}`,
      blockId,
      author,
      createdAt,
      text,
    });
  }
  void pRe;
  return memos;
}

export function serializeBlocksToHwpxPackage(
  blocks: HwpxCollabBlock[],
  originalSectionXml = "",
  originalHeaderXml = "",
  options?: { pageWidthMm?: number; marginLeftMm?: number; marginRightMm?: number; memos?: HwpxMemoItem[] }
): { sectionXml: string; headerXml: string; chartFiles?: Map<string, string>; binDataFiles?: Map<string, Uint8Array> } {
  // 1. 기존 header.xml의 스타일 사전 분석 및 보존
  const paraStyles = new Map<string, { align: "left" | "center" | "right" | "justify"; marginLeftPt?: number }>();
  const existingCharIds: number[] = [];
  const existingParaIds: number[] = [];
  let chartCounter = 0;
  const chartFiles = new Map<string, string>();
  let imageCounter = 0;
  const binDataFiles = new Map<string, Uint8Array>();

  interface ExistingCharStyle {
    colorHex: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    fontCss?: string;
  }
  const existingCharStyleMap = new Map<string, ExistingCharStyle>();
  const fontGroups = parseFontGroups(originalHeaderXml);
  const hangulFaces = fontGroups.find((g) => g.lang === "HANGUL")?.faceById;

  interface NewParaDef {
    id: string;
    align: "left" | "center" | "right" | "justify";
    marginLeftPt?: number;
  }
  const newParaDefs: NewParaDef[] = [];

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
      const leftMarginMatch = pm[0].match(/<hc:left\b[^>]*\bvalue="(\d+)"/i);
      const leftMarginPt = leftMarginMatch ? Math.round(parseInt(leftMarginMatch[1], 10) / 100) : 0;
      paraStyles.set(String(id), {
        align: alignVal === "center" || alignVal === "right" || alignVal === "justify" ? alignVal : "left",
        marginLeftPt: leftMarginPt > 0 ? leftMarginPt : undefined,
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
      const hangulRef = cm[0].match(/<hh:fontRef\b[^>]*\bhangul="(\d+)"/i)?.[1];
      const face = hangulRef !== undefined ? hangulFaces?.get(hangulRef) : undefined;

      existingCharStyleMap.set(String(id), {
        sizePt: heightMatch ? Math.round(parseInt(heightMatch[1], 10) / 100) : 10,
        colorHex: colorMatch ? colorToHex(colorMatch[1]) : "#000000",
        bold: boldMatch,
        italic: italicMatch,
        underline: hasUnderline,
        fontCss: face ? cssFontForHwpxFace(face) : undefined,
      });
    }
  }
  // 원본 헤더가 없으면 기본 헤더의 글꼴 목록(언어마다 0번 = 함초롬바탕)을 만든다.
  const hasOriginalHeader = !!originalHeaderXml && originalHeaderXml.includes("<hh:charProperties");
  if (!hasOriginalHeader) {
    fontGroups.length = 0;
    for (const lang of FONT_LANGS) fontGroups.push({ lang, faceById: new Map([["0", "함초롬바탕"]]), idByFace: new Map([["함초롬바탕", 0]]), next: 1, added: [] });
  }
  // 글꼴 이름 -> 언어별 글꼴 id. 목록에 없으면 언어마다 끝에 추가한다.
  const fontIdsFor = (face: string): Record<string, number> => {
    const ids: Record<string, number> = {};
    for (const g of fontGroups) {
      let id = g.idByFace.get(face);
      if (id === undefined) {
        id = g.next++;
        g.idByFace.set(face, id);
        g.faceById.set(String(id), face);
        g.added.push({ id, face });
      }
      ids[g.lang] = id;
    }
    return ids;
  };

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
    fontIds?: Record<string, number>; // 언어별 글꼴 id (없으면 모두 0)
  }

  const newCharDefs: CharPrDef[] = [];
  const charPrKeyToId = new Map<string, number>([
    ["#000000_10_0_0_0", 0],
  ]);
  // 글꼴까지 같은 글자 모양: "<서식 키>|<글꼴>"
  const charPrFontKeyToId = new Map<string, number>();
  if (!hasOriginalHeader) charPrFontKeyToId.set(`#000000_10_0_0_0|${normalizeFontCss(cssFontForHwpxFace("함초롬바탕"))}`, 0);

  // 원본 문서에 이미 정의된 charPr들을 key에 등록하여 중복 생성 방지 및 원본 서식 100% 재사용
  for (const [idStr, style] of existingCharStyleMap.entries()) {
    const k = `${style.colorHex}_${style.sizePt}_${style.bold ? 1 : 0}_${style.italic ? 1 : 0}_${style.underline ? 1 : 0}`;
    if (!charPrKeyToId.has(k)) {
      charPrKeyToId.set(k, parseInt(idStr, 10));
    }
    if (style.fontCss) {
      const fk = `${k}|${normalizeFontCss(style.fontCss)}`;
      if (!charPrFontKeyToId.has(fk)) charPrFontKeyToId.set(fk, parseInt(idStr, 10));
    }
  }

  const getOrCreateCharPr = (style: { color?: string; sizePt?: number; bold?: boolean; italic?: boolean; underline?: boolean; fontFamily?: string }): number => {
    const colorHex = colorToHex(style.color);
    const sizePt = style.sizePt ? Math.round(style.sizePt) : 10;
    const bold = !!style.bold;
    const italic = !!style.italic;
    const underline = !!style.underline;
    const key = `${colorHex}_${sizePt}_${bold ? 1 : 0}_${italic ? 1 : 0}_${underline ? 1 : 0}`;

    // 글꼴을 고른 글자: 같은 서식·같은 글꼴의 글자 모양을 쓰고, 없으면 그 글꼴을 가리키는 글자 모양을 새로 만든다.
    const face = hwpxFaceForCssFont(style.fontFamily);
    if (face && fontGroups.length > 0) {
      const fontKey = `${key}|${normalizeFontCss(style.fontFamily)}`;
      const found = charPrFontKeyToId.get(fontKey);
      if (found !== undefined) return found;
      const newId = ++maxCharId;
      newCharDefs.push({ id: newId, colorHex, sizePt, bold, italic, underline, fontIds: fontIdsFor(face) });
      charPrFontKeyToId.set(fontKey, newId);
      return newId;
    }

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
    const f = (lang: string) => def.fontIds?.[lang] ?? 0;
    const children: string[] = [
      `<hh:fontRef hangul="${f("HANGUL")}" latin="${f("LATIN")}" hanja="${f("HANJA")}" japanese="${f("JAPANESE")}" other="${f("OTHER")}" symbol="${f("SYMBOL")}" user="${f("USER")}"/>`,
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

  // 한컴 OWPML 표준 규격의 paraPr XML 생성 (신규 발급 정렬 서식 등록)
  const renderParaPrXml = (def: NewParaDef): string => {
    const alignVal = def.align === "center" ? "CENTER" : def.align === "right" ? "RIGHT" : def.align === "justify" ? "JUSTIFY" : "LEFT";
    const leftMarginHw = Math.round((def.marginLeftPt || 0) * 100);
    return `      <hh:paraPr id="${def.id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">\n` +
      `        <hh:align horizontal="${alignVal}" vertical="BASELINE"/>\n` +
      `        <hh:heading type="NONE" idRef="0" level="0"/>\n` +
      `        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>\n` +
      `        <hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="${leftMarginHw}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>\n` +
      `        <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>\n` +
      `        <hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>\n` +
      `      </hh:paraPr>`;
  };

  // 문단 정렬(paraPr) 매핑: 원본의 paraPrIDRef를 최대한 유지하여 문서 고유 여백/줄간격 손실 방지
  const getParaPrForAlign = (targetAlign: "left" | "center" | "right" | "justify", rawAttrs?: string, marginLeftPt = 0): string => {
    const targetLeft = marginLeftPt > 0 ? Math.round(marginLeftPt) : 0;
    if (rawAttrs) {
      const match = rawAttrs.match(/paraPrIDRef="(\d+)"/);
      if (match) {
        const origId = match[1];
        const origStyle = paraStyles.get(origId);
        if (origStyle && origStyle.align === targetAlign && (origStyle.marginLeftPt || 0) === targetLeft) {
          return origId;
        }
      }
    }
    for (const [id, s] of paraStyles.entries()) {
      if (s.align === targetAlign && (s.marginLeftPt || 0) === targetLeft) return id;
    }
    const newId = String(++maxParaId);
    paraStyles.set(newId, { align: targetAlign, marginLeftPt: targetLeft > 0 ? targetLeft : undefined });
    newParaDefs.push({ id: newId, align: targetAlign, marginLeftPt: targetLeft > 0 ? targetLeft : undefined });
    return newId;
  };

  // ── 표준 A4 용지 규격 (210mm x 297mm = 59528 x 84188 HWPUNIT, 여백 포함) ──
  const optPageWidthHw = options?.pageWidthMm ? Math.round(options.pageWidthMm * 283.465) : 59528;
  const optMarginLeftHw = options?.marginLeftMm !== undefined ? Math.round(options.marginLeftMm * 283.465) : 8504;
  const optMarginRightHw = options?.marginRightMm !== undefined ? Math.round(options.marginRightMm * 283.465) : 8504;
  const secContentWidthHw = originalSectionXml
    ? extractSectionContentWidthHw(originalSectionXml, Math.max(10000, optPageWidthHw - optMarginLeftHw - optMarginRightHw))
    : Math.max(10000, optPageWidthHw - optMarginLeftHw - optMarginRightHw);
  const DEFAULT_SECPR = `<hp:run charPrIDRef="0"><hp:secPr id="0" textDirection="0" spaceBetweenColumns="0" tabStop="8000" outlineShapeIdRef="0" memoShapeIdRef="0" textVerticalWidthHead="0"><hp:grid lineGrid="0" charGrid="0"/><hp:startNum pageStartsOn="both" page="1" pic="1" tbl="1" equation="1"/><hp:visibility hideHeader="0" hideFooter="0" hideMasterPage="0" border="0" fill="0" hidePageNum="0" hideEmptyLine="0"/><hp:pagePr width="${optPageWidthHw}" height="84188" autoMargin="0"><hp:margin left="${optMarginLeftHw}" right="${optMarginRightHw}" top="5668" bottom="4252" header="4252" footer="4252" gutter="0"/></hp:pagePr></hp:secPr></hp:run>`;

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

  const buildCaptionXml = (caption?: string, captionPos?: string, widthHw = 42520, capParaId = 9999): string => {
    const capTrim = (caption || "").trim();
    if (!capTrim || captionPos === "none") return "";
    const pos = captionPos || "bottom_center";
    const capSide = pos.startsWith("top")
      ? "TOP"
      : pos.startsWith("left")
        ? "LEFT"
        : pos.startsWith("right")
          ? "RIGHT"
          : "BOTTOM";
    const capAlign = pos.includes("left")
      ? "left"
      : pos.includes("right")
        ? "right"
        : "center";
    const capParaPr = getParaPrForAlign(capAlign);
    return `        <hp:caption side="${capSide}" fullSz="0" width="${widthHw}" gap="850">\n` +
      `          <hp:subList id="0" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="${widthHw}" textHeight="2834" hasTextRef="0" hasNumRef="0">\n` +
      `            <hp:p id="${capParaId}" paraPrIDRef="${capParaPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n` +
      `              <hp:run charPrIDRef="0"><hp:t>${escapeXml(capTrim)}</hp:t></hp:run>\n` +
      `            </hp:p>\n` +
      `          </hp:subList>\n` +
      `        </hp:caption>`;
  };

  const noteBlockMap = new Map<string, HwpxParagraphBlock>();
  const bodyBlocks: HwpxCollabBlock[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph" && (b.id.startsWith("footnote-") || b.id.startsWith("endnote-"))) {
      noteBlockMap.set(b.id, b);
    } else {
      bodyBlocks.push(b);
    }
  }
  const memosByBlockId = new Map<string, HwpxMemoItem[]>();
  if (options?.memos) {
    for (const memo of options.memos) {
      if (!memo.blockId) continue;
      const arr = memosByBlockId.get(memo.blockId) || [];
      arr.push(memo);
      memosByBlockId.set(memo.blockId, arr);
    }
  }

  let footnoteCounter = 0;
  let endnoteCounter = 0;
  let noteInstCounter = 0;

  const paragraphsXml = bodyBlocks.map((block, idx) => {
    const lead = (idx === 0 && preambleRuns) ? preambleRuns : "";
    const align = block.type === "paragraph" ? (block.align || "left") : "left";
    const marginLeftPt = block.type === "paragraph" ? (block.marginLeftPt || 0) : 0;
    const paraPr = getParaPrForAlign(align, block.rawAttrs, marginLeftPt);

    if (block.type === "table") {
      const rowCount = block.rows.length;
      const colCount = block.rows[0]?.length || 1;
      const totalWidthHw = 42520;
      const hasCustomColWidths = Array.isArray(block.colWidths) && block.colWidths.length === colCount;
      const colWeightSum = hasCustomColWidths
        ? block.colWidths!.reduce((acc, w) => acc + Math.max(1, w || 0), 0)
        : colCount;
      const colWidthsHw = Array.from({ length: colCount }, (_, ci) => {
        if (!hasCustomColWidths) return Math.floor(totalWidthHw / Math.max(1, colCount));
        return Math.max(1000, Math.round((totalWidthHw * Math.max(1, block.colWidths![ci] || 0)) / Math.max(1, colWeightSum)));
      });
      const defaultRowHeightHw = 2834;
      const rowHeightsHw = Array.from({ length: rowCount }, (_, ri) => {
        const px = block.rowHeights?.[ri];
        return px && px > 0 ? Math.max(1200, Math.round(px * 75)) : defaultRowHeightHw;
      });
      const totalHeightHw = rowHeightsHw.reduce((acc, h) => acc + h, 0);
      const tblId = Math.floor(Math.random() * 1000000000) + 1000000000;

      const rowsXml = block.rows.map((row, rIdx) => {
        const cellsXml = row.map((cell, cIdx) => {
          if (cell.mergedHidden) return "";
          const cSpan = Math.max(1, cell.colSpan || 1);
          const rSpan = Math.max(1, cell.rowSpan || 1);
          let cellW = 0;
          if (cell.widthPercent && cell.widthPercent > 0) {
            cellW = Math.max(1000, Math.round((totalWidthHw * cell.widthPercent) / 100));
          } else {
            for (let k = 0; k < cSpan; k++) {
              cellW += colWidthsHw[cIdx + k] ?? Math.floor(totalWidthHw / Math.max(1, colCount));
            }
          }
          let cellH = 0;
          if (cell.heightPx && cell.heightPx > 0) {
            cellH = Math.max(1200, Math.round(cell.heightPx * 75));
          } else {
            for (let k = 0; k < rSpan; k++) {
              cellH += rowHeightsHw[rIdx + k] ?? defaultRowHeightHw;
            }
          }
          const cellCharPr = getOrCreateCharPr({ bold: cell.bold });
          const cellParaPr = getParaPrForAlign(cell.align || "center", cell.rawAttrs);
          let tcAttrs = cell.rawAttrs ? ` ${cell.rawAttrs}` : ` name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="1"`;
          if (!tcAttrs.includes("borderFillIDRef")) {
            tcAttrs += ' borderFillIDRef="1"';
          }
          const cellParaId = (idx + 1) * 10000 + (rIdx + 1) * 100 + (cIdx + 1);
          return `        <hp:tc${tcAttrs}>\n          <hp:cellAddr colAddr="${cIdx}" rowAddr="${rIdx}"/>\n          <hp:cellSpan colSpan="${cSpan}" rowSpan="${rSpan}"/>\n          <hp:cellSz width="${cellW}" height="${cellH}"/>\n          <hp:cellMargin left="510" right="510" top="141" bottom="141"/>\n          <hp:subList id="0" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="${cellW}" textHeight="${cellH}" hasTextRef="0" hasNumRef="0">\n            <hp:p id="${cellParaId}" paraPrIDRef="${cellParaPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n              <hp:run charPrIDRef="${cellCharPr}"><hp:t>${escapeXml(cell.text)}</hp:t></hp:run>\n            </hp:p>\n          </hp:subList>\n        </hp:tc>`;
        }).filter(Boolean).join("\n");
        return `      <hp:tr>\n${cellsXml}\n      </hp:tr>`;
      }).join("\n");

      let tblAttrs = block.rawAttrs ? ` ${block.rawAttrs}` : "";
      if (tblAttrs) {
        tblAttrs = tblAttrs.replace(/\bpageBreak="([^"]*)"/gi, (_m, val: string) => `pageBreak="${val.toUpperCase()}"`);
        tblAttrs = tblAttrs.replace(/\brepeatHeader="true"/gi, 'repeatHeader="1"').replace(/\brepeatHeader="false"/gi, 'repeatHeader="0"');
        if (!tblAttrs.includes("borderFillIDRef")) {
          tblAttrs += ' borderFillIDRef="1"';
        }
      } else {
        tblAttrs = ` id="${tblId}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCount}" colCnt="${colCount}" cellSpacing="0" borderFillIDRef="1" noAdjust="0"`;
      }

      const isFloatingTbl = (block.offsetX !== undefined && block.offsetX !== 0) || (block.offsetY !== undefined && block.offsetY !== 0);
      const tblOffX = Math.round((block.offsetX || 0) * 75);
      const tblOffY = Math.round((block.offsetY || 0) * 75);
      const tblTreatAsChar = isFloatingTbl ? "0" : "1";
      const tblTextWrap = isFloatingTbl ? "IN_FRONT_OF_TEXT" : "TOP_AND_BOTTOM";
      const tblAllowOverlap = isFloatingTbl ? "1" : "0";
      const tblHorzRelTo = isFloatingTbl ? "PARA" : "COLUMN";

      const tblCaptionXml = buildCaptionXml(block.caption, block.captionPos, totalWidthHw, (idx + 1) * 10000 + 9999);

      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:tbl${tblAttrs}>\n        <hp:sz width="${totalWidthHw}" widthRelTo="ABSOLUTE" height="${totalHeightHw}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="${tblTreatAsChar}" affectLSpacing="0" flowWithText="${isFloatingTbl ? "0" : "1"}" allowOverlap="${tblAllowOverlap}" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="${tblHorzRelTo}" vertAlign="TOP" horzAlign="LEFT" vertOffset="${isFloatingTbl ? tblOffY : 0}" horzOffset="${isFloatingTbl ? tblOffX : 0}"/>\n        <hp:outMargin left="0" right="0" top="0" bottom="0"/>\n${tblCaptionXml ? `${tblCaptionXml}\n` : ""}        <hp:inMargin left="510" right="510" top="141" bottom="141"/>\n${rowsXml}\n      </hp:tbl></hp:run>\n    </hp:p>`;
    }

    if (block.type === "equation") {
      const eqId = 2000000000 + (idx + 1);
      const scriptText = block.script || "";
      const width = Math.max(3000, Math.min(42520, Math.round((scriptText.length || 1) * 550)));
      const height = 1400;
      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:equation id="${eqId}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="85" textColor="#000000" baseUnit="1000" lineMode="CHAR" font="HYhwpEQ">\n        <hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>\n        <hp:outMargin left="56" right="56" top="0" bottom="0"/>\n        <hp:shapeComment>수식입니다.</hp:shapeComment>\n        <hp:script>${escapeXml(scriptText)}</hp:script>\n      </hp:equation></hp:run>\n    </hp:p>`;
    }

    if (block.type === "image") {
      const hasCaption = !!(block.caption && block.caption.trim() && block.captionPos !== "none");
      const imgCaptionXml = buildCaptionXml(block.caption, block.captionPos, 42520, (idx + 1) * 10000 + 5000);
      if (block.rawXml) {
        let raw = block.rawXml;
        if (hasCaption) {
          if (raw.includes("<hp:caption")) {
            raw = raw.replace(/<hp:caption\b[\s\S]*?<\/hp:caption>/i, imgCaptionXml.trim());
          } else if (raw.includes("<hp:outMargin")) {
            raw = raw.replace(/(<hp:outMargin\b[^>]*\/>)/i, `$1\n${imgCaptionXml}`);
          } else if (raw.includes("<hp:shapeComment")) {
            raw = raw.replace(/<hp:shapeComment/i, `${imgCaptionXml}\n        <hp:shapeComment`);
          } else if (raw.includes("</hp:pic>")) {
            raw = raw.replace(/<\/hp:pic>/i, `${imgCaptionXml}\n      </hp:pic>`);
          }
          return raw;
        } else {
          raw = raw.replace(/<hp:caption\b[\s\S]*?<\/hp:caption>\s*/gi, "");
          return raw;
        }
      }
      const dataUrlMatch = block.src?.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
      if (dataUrlMatch) {
        const rawExt = dataUrlMatch[1].toLowerCase();
        const ext = rawExt === "jpeg" ? "jpg" : rawExt;
        const binStr = atob(dataUrlMatch[2]);
        const binBytes = new Uint8Array(binStr.length);
        for (let bi = 0; bi < binStr.length; bi++) binBytes[bi] = binStr.charCodeAt(bi);
        imageCounter++;
        const imgId = `image${imageCounter}`;
        binDataFiles.set(`BinData/${imgId}.${ext}`, binBytes);
        const picObjId = Math.floor(Math.random() * 1000000000) + 1000000000;
        const instId = Math.floor(Math.random() * 1000000000) + 100000000;
        const pWidthHw = Math.round((secContentWidthHw * (block.widthPercent || 50)) / 100);
        let pHeightHw = block.heightPt ? Math.round(block.heightPt * 100) : pWidthHw;
        if (!block.heightPt && ext === "png" && binBytes.length >= 24 && binBytes[12] === 0x49 && binBytes[13] === 0x48 && binBytes[14] === 0x44 && binBytes[15] === 0x52) {
          const natW = ((binBytes[16] << 24) | (binBytes[17] << 16) | (binBytes[18] << 8) | binBytes[19]) >>> 0;
          const natH = ((binBytes[20] << 24) | (binBytes[21] << 16) | (binBytes[22] << 8) | binBytes[23]) >>> 0;
          if (natW > 0 && natH > 0) {
            pHeightHw = Math.round(pWidthHw * (natH / natW));
          }
        }
        const pCenterX = Math.round(pWidthHw / 2);
        const pCenterY = Math.round(pHeightHw / 2);
        const picAlign = block.align === "center" ? "CENTER" : block.align === "right" ? "RIGHT" : "LEFT";
        const picCaptionXml = buildCaptionXml(block.caption, block.captionPos, pWidthHw, (idx + 1) * 10000 + 5000);
        return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:pic id="${picObjId}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}" reverse="0">\n        <hp:offset x="0" y="0"/>\n        <hp:orgSz width="${pWidthHw}" height="${pHeightHw}"/>\n        <hp:curSz width="${pWidthHw}" height="${pHeightHw}"/>\n        <hp:flip horizontal="0" vertical="0"/>\n        <hp:rotationInfo angle="0" centerX="${pCenterX}" centerY="${pCenterY}" rotateimage="1"/>\n        <hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>\n        <hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${pWidthHw}" y="0"/><hc:pt2 x="${pWidthHw}" y="${pHeightHw}"/><hc:pt3 x="0" y="${pHeightHw}"/></hp:imgRect>\n        <hp:imgClip left="0" right="${pWidthHw}" top="0" bottom="${pHeightHw}"/>\n        <hp:inMargin left="0" right="0" top="0" bottom="0"/>\n        <hc:img binaryItemIDRef="${imgId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>\n        <hp:sz width="${pWidthHw}" widthRelTo="ABSOLUTE" height="${pHeightHw}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${picAlign}" vertOffset="0" horzOffset="0"/>\n        <hp:outMargin left="0" right="0" top="0" bottom="0"/>\n${picCaptionXml ? `${picCaptionXml}\n` : ""}        <hp:shapeComment>그림 입니다.</hp:shapeComment>\n      </hp:pic></hp:run>\n    </hp:p>`;
      }
      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:t>[그림: ${escapeXml(block.caption || "이미지")}]</hp:t></hp:run>\n    </hp:p>`;
    }

    if (block.type === "shape") {
      const isFloating = block.treatAsChar === false || (block.offsetX !== undefined && block.offsetX !== 0) || (block.offsetY !== undefined && block.offsetY !== 0);
      const hasCaption = !!(block.caption && block.caption.trim() && block.captionPos !== "none");
      const shapeType = block.shapeType || "rect";
      const align = block.align || "center";
      const widthPct = block.widthPercent || 75;
      const widthHw = Math.round((secContentWidthHw * widthPct) / 100);
      const isDiagLine = shapeType === "line" && (block.heightPt || 0) > 4.5;
      const heightHw = shapeType === "line"
        ? (isDiagLine ? Math.round((block.heightPt || 60) * 100) : 100)
        : Math.round((block.heightPt || 60) * 100);
      const strokeColor = colorToHex(block.strokeColor || "#2563EB");
      const fillColor = block.fillColor === "transparent" ? "none" : colorToHex(block.fillColor || "#EFF6FF");
      const strokeWidthHw = Math.max(33, Math.round((block.strokeWidth || 1.5) * 33));
      const offX = Math.round((block.offsetX || 0) * 75);
      const offY = Math.round((block.offsetY || 0) * 75);
      const treatAsChar = isFloating ? "0" : "1";
      const textWrap = isFloating ? (block.textWrap || "IN_FRONT_OF_TEXT") : "TOP_AND_BOTTOM";
      const textFlow = block.textFlow || "BOTH_SIDES";
      const allowOverlap = (isFloating && (block.allowOverlap || textWrap === "IN_FRONT_OF_TEXT" || textWrap === "BEHIND_TEXT")) ? "1" : "0";
      const horzAlign = isFloating ? "LEFT" : (align === "left" ? "LEFT" : align === "right" ? "RIGHT" : "CENTER");
      const horzRelTo = isFloating ? "PARA" : "COLUMN";
      const shapeId = Math.floor(Math.random() * 1000000000) + 1000000000;
      const instId = Math.floor(Math.random() * 1000000000) + 100000000;
      const zOrder = isFloating ? 10 : 4;
      const centerX = Math.round(widthHw / 2);
      const centerY = Math.round(heightHw / 2);

      const shapeCaptionXml = buildCaptionXml(block.caption, block.captionPos, widthHw, (idx + 1) * 10000 + 5000);

      if (block.rawXml && !isFloating) {
        let raw = block.rawXml;
        if (hasCaption) {
          if (raw.includes("<hp:caption")) {
            raw = raw.replace(/<hp:caption\b[\s\S]*?<\/hp:caption>/i, shapeCaptionXml.trim());
          } else if (raw.includes("<hp:outMargin")) {
            raw = raw.replace(/(<hp:outMargin\b[^>]*\/>)/i, `$1\n${shapeCaptionXml}`);
          } else if (raw.includes("<hp:shapeComment")) {
            raw = raw.replace(/<hp:shapeComment/i, `${shapeCaptionXml}\n        <hp:shapeComment`);
          }
          return raw;
        } else {
          raw = raw.replace(/<hp:caption\b[\s\S]*?<\/hp:caption>\s*/gi, "");
          return raw;
        }
      }

      if (block.text?.startsWith("__WEB_VIDEO__:")) {
        const videoUrl = block.text.slice("__WEB_VIDEO__:".length);
        const vWidthHw = Math.round((secContentWidthHw * (block.widthPercent || 65)) / 100);
        const vHeightHw = Math.round((block.heightPt || 180) * 100);
        return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:video id="${shapeId}" zOrder="${zOrder}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="${textFlow}" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}" videotype="Web" fileIDRef="" imageIDRef="" tag="${escapeXml(videoUrl)}">\n        <hp:offset x="0" y="0"/>\n        <hp:orgSz width="${vWidthHw}" height="${vHeightHw}"/>\n        <hp:curSz width="0" height="0"/>\n        <hp:flip horizontal="0" vertical="0"/>\n        <hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/>\n        <hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>\n        <hp:sz width="${vWidthHw}" widthRelTo="ABSOLUTE" height="${vHeightHw}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="${treatAsChar}" affectLSpacing="0" flowWithText="${isFloating ? "0" : "1"}" allowOverlap="${allowOverlap}" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="${horzRelTo}" vertAlign="TOP" horzAlign="${horzAlign}" vertOffset="${isFloating ? offY : 0}" horzOffset="${isFloating ? offX : 0}"/>\n        <hp:outMargin left="0" right="0" top="0" bottom="0"/>\n        <hp:shapeComment>동영상 입니다.</hp:shapeComment>\n      </hp:video></hp:run>\n    </hp:p>`;
      }

      if (shapeType === "line") {
        const lineY1 = isDiagLine && block.lineDir === "bl-tr" ? heightHw : 0;
        const lineY2 = isDiagLine ? (block.lineDir === "bl-tr" ? 0 : heightHw) : 0;
        return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:line id="${shapeId}" zOrder="${zOrder}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="${textFlow}" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}" isReverseHV="0">\n        <hp:offset x="0" y="0"/>\n        <hp:orgSz width="${widthHw}" height="${heightHw}"/>\n        <hp:curSz width="${widthHw}" height="${heightHw}"/>\n        <hp:flip horizontal="0" vertical="0"/>\n        <hp:rotationInfo angle="0" centerX="${centerX}" centerY="${centerY}" rotateimage="1"/>\n        <hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>\n        <hp:lineShape color="${strokeColor}" width="${strokeWidthHw}" style="SOLID" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>\n        <hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#000000" alpha="0"/></hc:fillBrush>\n        <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>\n        <hc:startPt x="0" y="${lineY1}"/>\n        <hc:endPt x="${widthHw}" y="${lineY2}"/>\n        <hp:sz width="${widthHw}" widthRelTo="ABSOLUTE" height="${heightHw}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="${treatAsChar}" affectLSpacing="0" flowWithText="${isFloating ? "0" : "1"}" allowOverlap="${allowOverlap}" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="${horzRelTo}" vertAlign="TOP" horzAlign="${horzAlign}" vertOffset="${isFloating ? offY : 0}" horzOffset="${isFloating ? offX : 0}"/>\n        <hp:outMargin left="0" right="0" top="283" bottom="283"/>\n${shapeCaptionXml ? `${shapeCaptionXml}\n` : ""}        <hp:shapeComment>선 입니다.</hp:shapeComment>\n      </hp:line></hp:run>\n    </hp:p>`;
      }

      const tagName = shapeType === "ellipse" ? "hp:ellipse" : shapeType === "arc" ? "hp:arc" : "hp:rect";
      const extraShapeAttr = shapeType === "arc"
        ? ` type="NORMAL"`
        : shapeType === "ellipse"
          ? ` intervalDirty="0" hasArcPr="0" arcType="NORMAL"`
          : ` ratio="0"`;
      const shapeComment = shapeType === "ellipse" ? "타원 입니다." : shapeType === "arc" ? "호 입니다." : "사각형 입니다.";
      const fillBrushXml = fillColor === "none" || shapeType === "arc"
        ? `<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#000000" alpha="0"/></hc:fillBrush>`
        : `<hc:fillBrush><hc:winBrush faceColor="${fillColor}" hatchColor="#000000" alpha="0"/></hc:fillBrush>`;
      const drawTextXml = block.text
        ? `\n        <hp:drawText name="" editable="0" prevShapeIdRef="0" nextShapeIdRef="0"><hp:subList id="0" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="${Math.max(1000, widthHw - 1000)}" textHeight="${Math.max(1000, heightHw - 1000)}" hasTextRef="0" hasNumRef="0"><hp:p id="${(idx + 1) * 10000 + 1}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>${escapeXml(block.text)}</hp:t></hp:run></hp:p></hp:subList></hp:drawText>`
        : "";

      const shapePointsXml = shapeType === "ellipse"
        ? `<hc:center x="${centerX}" y="${centerY}"/><hc:ax1 x="${widthHw}" y="${centerY}"/><hc:ax2 x="${centerX}" y="${heightHw}"/>`
        : shapeType === "arc"
          ? `<hc:center x="0" y="${heightHw}"/><hc:ax1 x="${widthHw}" y="${heightHw}"/><hc:ax2 x="0" y="0"/>`
          : `<hc:pt0 x="0" y="0"/><hc:pt1 x="${widthHw}" y="0"/><hc:pt2 x="${widthHw}" y="${heightHw}"/><hc:pt3 x="0" y="${heightHw}"/>`;

      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><${tagName} id="${shapeId}" zOrder="${zOrder}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="${textFlow}" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}"${extraShapeAttr}>\n        <hp:offset x="0" y="0"/>\n        <hp:orgSz width="${widthHw}" height="${heightHw}"/>\n        <hp:curSz width="${widthHw}" height="${heightHw}"/>\n        <hp:flip horizontal="0" vertical="0"/>\n        <hp:rotationInfo angle="0" centerX="${centerX}" centerY="${centerY}" rotateimage="1"/>\n        <hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>\n        <hp:lineShape color="${strokeColor}" width="${strokeWidthHw}" style="SOLID" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>\n        ${fillBrushXml}\n        <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>\n        ${shapePointsXml}\n        <hp:sz width="${widthHw}" widthRelTo="ABSOLUTE" height="${heightHw}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="${treatAsChar}" affectLSpacing="0" flowWithText="${isFloating ? "0" : "1"}" allowOverlap="${allowOverlap}" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="${horzRelTo}" vertAlign="TOP" horzAlign="${horzAlign}" vertOffset="${isFloating ? offY : 0}" horzOffset="${isFloating ? offX : 0}"/>\n        <hp:outMargin left="0" right="0" top="0" bottom="0"/>\n${shapeCaptionXml ? `${shapeCaptionXml}\n` : ""}        <hp:shapeComment>${shapeComment}</hp:shapeComment>${drawTextXml}\n      </${tagName}></hp:run>\n    </hp:p>`;
    }

    if (block.type === "chart") {
      chartCounter++;
      const chartRelPath = `Chart/chart${chartCounter}.xml`;
      chartFiles.set(chartRelPath, buildOoxmlChartXml(block));
      const chartObjId = Math.floor(Math.random() * 1000000000) + 1000000000;
      const instId = Math.floor(Math.random() * 1000000000) + 100000000;
      const cWidthHw = Math.round((secContentWidthHw * (block.widthPercent || 70)) / 100);
      const cHeightHw = Math.round((block.heightPt || 180) * 100);
      const cCenterX = Math.round(cWidthHw / 2);
      const cCenterY = Math.round(cHeightHw / 2);
      const chartCaptionXml = buildCaptionXml(block.caption, block.captionPos, cWidthHw, (idx + 1) * 10000 + 5000);
      const chartAlign = block.align === "center" ? "CENTER" : block.align === "right" ? "RIGHT" : "LEFT";
      return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">\n      ${lead}<hp:run charPrIDRef="0"><hp:chart id="${chartObjId}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}" chartIDRef="${chartRelPath}" version="1.2">\n        <hp:offset x="0" y="0"/>\n        <hp:orgSz width="${cWidthHw}" height="${cHeightHw}"/>\n        <hp:curSz width="${cWidthHw}" height="${cHeightHw}"/>\n        <hp:flip horizontal="0" vertical="0"/>\n        <hp:rotationInfo angle="0" centerX="${cCenterX}" centerY="${cCenterY}" rotateimage="1"/>\n        <hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>\n        <hp:sz width="${cWidthHw}" widthRelTo="ABSOLUTE" height="${cHeightHw}" heightRelTo="ABSOLUTE" protect="0"/>\n        <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${chartAlign}" vertOffset="0" horzOffset="0"/>\n        <hp:outMargin left="0" right="0" top="0" bottom="0"/>\n${chartCaptionXml ? `${chartCaptionXml}\n` : ""}        <hp:shapeComment>차트 입니다.</hp:shapeComment>\n      </hp:chart></hp:run>\n    </hp:p>`;
    }

    // 일반 문단
    const blockMemos = memosByBlockId.get(block.id) || [];
    // 1. 사용자가 텍스트를 편집하지 않았고 rawXml이 있는 경우: 원본 XML 100% 무손실 출력! (수식, 이미지, 복합 서식 완전 보존)
    if (block.rawXml && block.origText !== undefined && block.text === block.origText && blockMemos.length === 0 && !(block.marginLeftPt && block.marginLeftPt > 0)) {
      let rawXml = block.fontEdited && block.fontFamily
        ? block.rawXml.replace(/(<hp:run\b[^>]*\bcharPrIDRef=")(\d+)(")([\s\S]*?<\/hp:run>)/g, (whole, a: string, id: string, b: string, rest: string) => {
          // secPr 또는 텍스트가 없는 순수 ctrl 런은 기본 서식 ID(charPrIDRef="0") 유지
          if (rest.includes("<hp:secPr") || (!rest.includes("<hp:t") && rest.includes("<hp:ctrl"))) {
            return whole;
          }
          const orig = existingCharStyleMap.get(id);
          const style = orig
            ? { color: orig.colorHex, sizePt: orig.sizePt, bold: orig.bold, italic: orig.italic, underline: orig.underline }
            : { color: block.color, sizePt: block.sizePt, bold: block.bold, italic: block.italic, underline: block.underline };
          return `${a}${getOrCreateCharPr({ ...style, fontFamily: block.fontFamily })}${b}${rest}`;
        })
        : block.rawXml;

      // OWPML 표준 규격 준수: pageBreak, columnBreak, merged 속성을 "0"/"1"로 정규화
      rawXml = rawXml.replace(/\bpageBreak="(?:false|0)"/g, 'pageBreak="0"').replace(/\bpageBreak="(?:true|1)"/g, 'pageBreak="1"');
      rawXml = rawXml.replace(/\bcolumnBreak="(?:false|0)"/g, 'columnBreak="0"').replace(/\bcolumnBreak="(?:true|1)"/g, 'columnBreak="1"');
      rawXml = rawXml.replace(/\bmerged="(?:false|0)"/g, 'merged="0"').replace(/\bmerged="(?:true|1)"/g, 'merged="1"');

      // 텍스트/문단 수정 시 한컴오피스의 손상 경고를 방지하기 위해 구형 줄 배치 캐시(linesegarray)를 안전하게 제거
      rawXml = rawXml.replace(/<hp:linesegarray\b(?:[^>]*\/>|[\s\S]*?<\/hp:linesegarray>)/gi, "");

      if (idx === 0) {
        if (rawXml.includes("<hp:secPr")) {
          return rawXml;
        } else {
          return rawXml.replace(/<hp:p\b[^>]*>/, `$&${lead}`);
        }
      }
      return rawXml;
    }

    // 2. 사용자가 텍스트를 편집했거나 새로 작성된 문단 (인라인 HTML 서식 및 각주/미주 <sup data-note-id>를 개별 hp:run으로 정밀 직렬화)
    const serializeHtmlTextToRuns = (htmlSegment: string): string => {
      if (!htmlSegment) return "";
      const runs = parseHtmlRuns(htmlSegment, {
        color: block.color,
        sizePt: block.sizePt,
        bold: block.bold,
        italic: block.italic,
        underline: block.underline,
        fontFamily: block.fontFamily,
      });
      return runs.map((run) => {
        let charPrId: number;
        if (runs.length === 1 && block.charPrId && existingCharStyleMap.has(block.charPrId)) {
          const orig = existingCharStyleMap.get(block.charPrId)!;
          const rColor = colorToHex(run.color);
          const rSize = run.sizePt ? Math.round(run.sizePt) : 10;
          const rBold = !!run.bold;
          const rItalic = !!run.italic;
          const rUnderline = !!run.underline;
          const sameFont = !run.fontFamily || normalizeFontCss(run.fontFamily) === normalizeFontCss(orig.fontCss);
          if (orig.colorHex === rColor && orig.sizePt === rSize && orig.bold === rBold && orig.italic === rItalic && orig.underline === rUnderline && sameFont) {
            charPrId = parseInt(block.charPrId, 10);
          } else {
            charPrId = getOrCreateCharPr(run);
          }
        } else {
          charPrId = getOrCreateCharPr(run);
        }
        return `<hp:run charPrIDRef="${charPrId}"><hp:t>${escapeXml(run.text)}</hp:t></hp:run>`;
      }).join("");
    };

    const inlineTokenRe = /<sup\b([^>]*)>([\s\S]*?)<\/sup>|<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|<span\b[^>]*data-bookmark-name=["']([^"']+)["'][^>]*>[\s\S]*?<\/span>/gi;
    let runsXml = "";
    let lastPos = 0;
    let supMatch: RegExpExecArray | null;
    while ((supMatch = inlineTokenRe.exec(block.text)) !== null) {
      if (supMatch[5]) {
        if (supMatch.index > lastPos) {
          runsXml += serializeHtmlTextToRuns(block.text.slice(lastPos, supMatch.index));
        }
        runsXml += `<hp:run charPrIDRef="0"><hp:ctrl><hp:bookmark name="${escapeXml(supMatch[5])}"/></hp:ctrl></hp:run>`;
        lastPos = supMatch.index + supMatch[0].length;
        continue;
      }
      if (supMatch[3]) {
        if (supMatch.index > lastPos) {
          runsXml += serializeHtmlTextToRuns(block.text.slice(lastPos, supMatch.index));
        }
        const href = supMatch[3];
        const linkText = supMatch[4] || href;
        const fieldId = String(3000000000 + (++noteInstCounter));
        const linkCharPrId = getOrCreateCharPr({
          color: "#0000FF",
          sizePt: block.sizePt,
          bold: block.bold,
          italic: block.italic,
          underline: true,
          fontFamily: block.fontFamily,
        });
        const linkInnerRuns = serializeHtmlTextToRuns(linkText).replace(/charPrIDRef="\d+"/g, `charPrIDRef="${linkCharPrId}"`)
          || `<hp:run charPrIDRef="${linkCharPrId}"><hp:t>${escapeXml(linkText)}</hp:t></hp:run>`;
        runsXml += `<hp:run charPrIDRef="0"><hp:ctrl><hp:fieldBegin id="${fieldId}" type="HYPERLINK" name="" editable="0" dirty="1" zorder="-1" fieldid="${fieldId}" metaTag=""><hp:parameters cnt="2" name=""><hp:integerParam name="Prop">0</hp:integerParam><hp:stringParam name="Command">${escapeXml(href)};1;0;0;</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl></hp:run>${linkInnerRuns}<hp:run charPrIDRef="0"><hp:ctrl><hp:fieldEnd beginIDRef="${fieldId}" fieldid="${fieldId}"/></hp:ctrl></hp:run>`;
        lastPos = supMatch.index + supMatch[0].length;
        continue;
      }
      const attrs = supMatch[1] || "";
      const noteIdMatch = attrs.match(/data-note-id=["']([^"']+)["']/i);
      if (!noteIdMatch) continue;
      if (supMatch.index > lastPos) {
        runsXml += serializeHtmlTextToRuns(block.text.slice(lastPos, supMatch.index));
      }
      const noteId = noteIdMatch[1];
      const isEndnote = /data-note-type=["']endnote["']/i.test(attrs) || noteId.startsWith("endnote-");
      const num = isEndnote ? ++endnoteCounter : ++footnoteCounter;
      const instId = 2000000000 + (++noteInstCounter);
      const noteBlock = noteBlockMap.get(noteId);
      const noteInnerRuns = serializeHtmlTextToRuns(noteBlock?.text || "") || '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>';
      const noteTag = isEndnote ? "hp:endNote" : "hp:footNote";
      const numType = isEndnote ? "ENDNOTE" : "FOOTNOTE";
      const noteParaId = (idx + 1) * 10000 + noteInstCounter;
      runsXml += `<hp:run charPrIDRef="0"><hp:ctrl><${noteTag} number="${num}" suffixChar=")" instId="${instId}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="${noteParaId}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:autoNum num="${num}" numType="${numType}"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/></hp:autoNum></hp:ctrl></hp:run>${noteInnerRuns}</hp:p></hp:subList></${noteTag}></hp:ctrl></hp:run>`;
      lastPos = supMatch.index + supMatch[0].length;
    }
    if (lastPos < block.text.length) {
      runsXml += serializeHtmlTextToRuns(block.text.slice(lastPos));
    }

    for (const memo of blockMemos) {
      const memoFieldId = String(4000000000 + (++noteInstCounter));
      const memoParaId = (idx + 1) * 10000 + 5000 + noteInstCounter;
      runsXml += `<hp:run charPrIDRef="0"><hp:ctrl><hp:fieldBegin id="${memoFieldId}" type="MEMO" name="" editable="1" dirty="1" zorder="-1" fieldid="${memoFieldId}" metaTag=""><hp:parameters cnt="3" name=""><hp:stringParam name="Author">${escapeXml(memo.author || "작성자")}</hp:stringParam><hp:stringParam name="CreateDateTime">${escapeXml(memo.createdAt || "")}</hp:stringParam><hp:stringParam name="MemoShapeID">0</hp:stringParam></hp:parameters><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="${memoParaId}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>${escapeXml(memo.text || "")}</hp:t></hp:run></hp:p></hp:subList></hp:fieldBegin></hp:ctrl></hp:run><hp:run charPrIDRef="0"><hp:ctrl><hp:fieldEnd beginIDRef="${memoFieldId}" fieldid="${memoFieldId}"/></hp:ctrl></hp:run>`;
    }

    const pageBreakStr = block.pageBreak ? "1" : "0";
    return `    <hp:p id="${idx}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="${pageBreakStr}" columnBreak="0" merged="0">\n      ${lead}${runsXml || '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>'}\n    </hp:p>`;
  }).join("\n");

  const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${rootOpen}\n${paragraphsXml}\n</hs:sec>`;

  // 3. Header XML 갱신: 기존 문서의 모든 서식·글꼴 정의를 온전히 보존하고 신규 스타일만 추가
  const defaultBorderFillsXml = `    <hh:borderFills itemCnt="2">\n` +
    `      <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">\n` +
    `        <hh:slash type="NONE" Crooked="0" isCounter="0"/>\n` +
    `        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>\n` +
    `        <hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/>\n` +
    `        <hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/>\n` +
    `        <hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/>\n` +
    `        <hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/>\n` +
    `        <hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>\n` +
    `        <hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#FFFFFF" alpha="0"/></hc:fillBrush>\n` +
    `      </hh:borderFill>\n` +
    `      <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">\n` +
    `        <hh:slash type="NONE" Crooked="0" isCounter="0"/>\n` +
    `        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>\n` +
    `        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>\n` +
    `        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>\n` +
    `        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>\n` +
    `        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>\n` +
    `        <hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>\n` +
    `        <hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#FFFFFF" alpha="0"/></hc:fillBrush>\n` +
    `      </hh:borderFill>\n` +
    `    </hh:borderFills>`;

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

    if (newParaDefs.length > 0) {
      const newParaXml = newParaDefs.map(renderParaPrXml).join("\n");
      if (headerXml.includes("</hh:paraProperties>")) {
        headerXml = headerXml.replace(/<\/hh:paraProperties>/, `${newParaXml}\n    </hh:paraProperties>`);
        const pCntMatch = headerXml.match(/<hh:paraProperties\s+itemCnt="(\d+)"/);
        if (pCntMatch) {
          const newCnt = parseInt(pCntMatch[1], 10) + newParaDefs.length;
          headerXml = headerXml.replace(/<hh:paraProperties\s+itemCnt="\d+"/, `<hh:paraProperties itemCnt="${newCnt}"`);
        }
      }
    }
    headerXml = headerXml.replace(/<hh:fontface\b([^>]*)>([\s\S]*?)<\/hh:fontface>/g, (whole, attrs: string, inner: string) => {
      const lang = attrs.match(/\blang="([^"]+)"/)?.[1]?.toUpperCase();
      const group = fontGroups.find((g) => g.lang === lang);
      if (!group || group.added.length === 0) return whole;
      const buildFontXml = (f: { id: number; face: string }) => {
        let typeInfo = "";
        let subst = "";
        const faceLower = f.face.toLowerCase();
        if (/명조|바탕|myeongjo|batang|serif|buri|부리/i.test(faceLower)) {
          typeInfo = `<hh:typeInfo familyType="FCAT_MYEONGJO" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>`;
          if (f.face !== "바탕") subst = `<hh:substFont face="바탕" type="TTF" isEmbedded="0" binaryItemIDRef=""/>`;
        } else if (/고딕|돋움|gothic|dotum|sans|pretendard|square|dream/i.test(faceLower)) {
          typeInfo = `<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>`;
          if (f.face !== "맑은 고딕") subst = `<hh:substFont face="맑은 고딕" type="TTF" isEmbedded="0" binaryItemIDRef=""/>`;
        } else if (/궁서|gungsuh/i.test(faceLower)) {
          typeInfo = `<hh:typeInfo familyType="FCAT_GUNGSEO" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>`;
          if (f.face !== "궁서체") subst = `<hh:substFont face="궁서체" type="TTF" isEmbedded="0" binaryItemIDRef=""/>`;
        } else if (/굴림|gulim/i.test(faceLower)) {
          typeInfo = `<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>`;
          if (f.face !== "굴림체") subst = `<hh:substFont face="굴림체" type="TTF" isEmbedded="0" binaryItemIDRef=""/>`;
        }
        if (typeInfo || subst) {
          return `<hh:font id="${f.id}" face="${escapeXml(f.face)}" type="TTF" isEmbedded="0">${typeInfo}${subst}</hh:font>`;
        }
        return `<hh:font id="${f.id}" face="${escapeXml(f.face)}" type="TTF" isEmbedded="0"/>`;
      };
      const fontsXml = group.added.map(buildFontXml).join("");
      const cnt = parseInt(attrs.match(/\bfontCnt="(\d+)"/)?.[1] ?? String(group.next - group.added.length), 10) + group.added.length;
      const newAttrs = /\bfontCnt="\d+"/.test(attrs) ? attrs.replace(/\bfontCnt="\d+"/, `fontCnt="${cnt}"`) : `${attrs} fontCnt="${cnt}"`;
      return `<hh:fontface${newAttrs}>${inner}${fontsXml}</hh:fontface>`;
    });

    // 기존 헤더에 7대 언어(FONT_LANGS) 중 누락된 언어가 있다면 자동 보충하여 한컴독스/오피스 폰트 파서 예외 차단
    const existingLangs = new Set(fontGroups.map((g) => g.lang));
    const missingLangs = FONT_LANGS.filter((l) => !existingLangs.has(l));
    if (missingLangs.length > 0) {
      const hangulGroup = fontGroups.find((g) => g.lang === "HANGUL");
      const defaultFace = hangulGroup?.faceById.get("0") || "함초롬바탕";
      const supplementXml = missingLangs.map((l) => `      <hh:fontface lang="${l}" fontCnt="1">\n        <hh:font id="0" face="${escapeXml(defaultFace)}" type="TTF" isEmbedded="0"/>\n      </hh:fontface>\n`).join("");
      headerXml = headerXml.replace(/<\/hh:fontfaces>/, `${supplementXml}    </hh:fontfaces>`);
      const ffMatch = headerXml.match(/<hh:fontfaces\s+itemCnt="(\d+)"/);
      if (ffMatch) {
        const totalFf = parseInt(ffMatch[1], 10) + missingLangs.length;
        headerXml = headerXml.replace(/<hh:fontfaces\s+itemCnt="\d+"/, `<hh:fontfaces itemCnt="${totalFf}"`);
      }
    }
    // 표 및 서식 참조(borderFillIDRef="1", "2")에 필요한 borderFills가 없으면 refList 내에 보정 추가 (DTD 순서 준수: charProperties 앞)
    if (!headerXml.includes("<hh:borderFills")) {
      if (headerXml.includes("<hh:charProperties")) {
        headerXml = headerXml.replace(/<hh:charProperties\b/, `${defaultBorderFillsXml}\n    <hh:charProperties`);
      } else {
        headerXml = headerXml.replace(/<\/hh:refList>/, `${defaultBorderFillsXml}\n  </hh:refList>`);
      }
    }
    if (options?.memos && options.memos.length > 0 && !headerXml.includes("<hh:memoProperties")) {
      const memoPropsXml = `    <hh:memoProperties itemCnt="1">\n      <hh:memoPr id="0" width="12755" lineWidth="0.12mm" lineType="SOLID" lineColor="#FFC000" fillColor="#FFF9C4" activeColor="#FFE082" memoType="NORMAL"/>\n    </hh:memoProperties>`;
      headerXml = headerXml.replace(/<\/hh:refList>/, `${memoPropsXml}\n  </hh:refList>`);
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

    const extraParaXml = newParaDefs.length > 0 ? "\n" + newParaDefs.map(renderParaPrXml).join("\n") : "";
    const paraPropertiesXml = `    <hh:paraProperties itemCnt="${4 + newParaDefs.length}">\n` +
      `      <hh:paraPr id="0">\n        <hh:align horizontal="LEFT" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `      <hh:paraPr id="1">\n        <hh:align horizontal="CENTER" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `      <hh:paraPr id="2">\n        <hh:align horizontal="RIGHT" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>\n` +
      `      <hh:paraPr id="3">\n        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>\n        <hh:lineSpacing type="PERCENT" value="160"/>\n      </hh:paraPr>` +
      extraParaXml + `\n    </hh:paraProperties>`;

    headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" version="1.31" secCnt="1">\n` +
      `  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>\n` +
      `  <hh:refList>\n` +
      `    <hh:fontfaces itemCnt="${fontGroups.length}">\n` +
      fontGroups.map((g) => `      <hh:fontface lang="${g.lang}" fontCnt="${g.next}">\n` +
        Array.from(g.faceById.entries()).map(([id, face]) => `        <hh:font id="${id}" face="${escapeXml(face)}" type="TTF" isEmbedded="0"/>\n`).join("") +
        `      </hh:fontface>\n`).join("") +
      `    </hh:fontfaces>\n` +
      `${defaultBorderFillsXml}\n` +
      `${charPropertiesXml}\n` +
      `    <hh:tabProperties itemCnt="0"/>\n` +
      `    <hh:numberings itemCnt="0"/>\n` +
      `    <hh:bullets itemCnt="0"/>\n` +
      `${paraPropertiesXml}\n` +
      `    <hh:styles itemCnt="1">\n` +
      `      <hh:style id="0" type="para" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0"/>\n` +
      `    </hh:styles>\n` +
      (options?.memos && options.memos.length > 0
        ? `    <hh:memoProperties itemCnt="1">\n      <hh:memoPr id="0" width="12755" lineWidth="0.12mm" lineType="SOLID" lineColor="#FFC000" fillColor="#FFF9C4" activeColor="#FFE082" memoType="NORMAL"/>\n    </hh:memoProperties>\n`
        : "") +
      `  </hh:refList>\n` +
      `  <hh:compatibleDocument targetProgram="HWP2018"><hh:layoutCompatibility/></hh:compatibleDocument>\n` +
      `</hh:head>`;
  }

  // 기존 헤더에 secCnt 속성이 없는 경우 한컴 규격에 맞춰 기본 secCnt="1" 보정
  if (!headerXml.includes('secCnt="')) {
    headerXml = headerXml.replace(/<hh:head\b([^>]*)>/, '<hh:head$1 secCnt="1">');
  }

  return {
    sectionXml,
    headerXml,
    chartFiles: chartFiles.size > 0 ? chartFiles : undefined,
    binDataFiles: binDataFiles.size > 0 ? binDataFiles : undefined,
  };
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
        if (block.strikethrough !== undefined) yBlock.set("strikethrough", block.strikethrough);
        if (block.color) yBlock.set("color", block.color);
        if (block.shadingColor !== undefined) yBlock.set("shadingColor", block.shadingColor);
        if (block.fontFamily) yBlock.set("fontFamily", block.fontFamily);
        if (block.relativeSizePct !== undefined) yBlock.set("relativeSizePct", block.relativeSizePct);
        if (block.charWidthPct !== undefined) yBlock.set("charWidthPct", block.charWidthPct);
        if (block.charPosPct !== undefined) yBlock.set("charPosPct", block.charPosPct);
        if (block.letterSpacingPct !== undefined) yBlock.set("letterSpacingPct", block.letterSpacingPct);
        if (block.marginLeftPt !== undefined) yBlock.set("marginLeftPt", block.marginLeftPt);
        if (block.marginRightPt !== undefined) yBlock.set("marginRightPt", block.marginRightPt);
        if (block.firstLineType !== undefined) yBlock.set("firstLineType", block.firstLineType);
        if (block.firstLinePt !== undefined) yBlock.set("firstLinePt", block.firstLinePt);
        if (block.lineSpacingPct !== undefined) yBlock.set("lineSpacingPct", block.lineSpacingPct);
        if (block.spaceBeforePt !== undefined) yBlock.set("spaceBeforePt", block.spaceBeforePt);
        if (block.spaceAfterPt !== undefined) yBlock.set("spaceAfterPt", block.spaceAfterPt);
        if (block.paraBorderType !== undefined) yBlock.set("paraBorderType", block.paraBorderType);
        if (block.paraBorderWidth !== undefined) yBlock.set("paraBorderWidth", block.paraBorderWidth);
        if (block.paraBorderColor !== undefined) yBlock.set("paraBorderColor", block.paraBorderColor);
        if (block.paraBgColor !== undefined) yBlock.set("paraBgColor", block.paraBgColor);
        if (block.pageBreak !== undefined) yBlock.set("pageBreak", block.pageBreak);
        if (block.charPrId) yBlock.set("charPrId", block.charPrId);
        if (block.rawXml) yBlock.set("rawXml", block.rawXml);
        if (block.origText !== undefined) yBlock.set("origText", block.origText);
        if (block.fontEdited) yBlock.set("fontEdited", true);
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
            if (cell.colSpan && cell.colSpan > 1) yCell.set("colSpan", cell.colSpan);
            if (cell.rowSpan && cell.rowSpan > 1) yCell.set("rowSpan", cell.rowSpan);
            if (cell.mergedHidden) yCell.set("mergedHidden", true);
            if (cell.widthPercent !== undefined) yCell.set("widthPercent", cell.widthPercent);
            if (cell.heightPx !== undefined) yCell.set("heightPx", cell.heightPx);
            if (cell.bgColor) yCell.set("bgColor", cell.bgColor);
            if (cell.color) yCell.set("color", cell.color);
            yRow.push([yCell]);
          }
          yRows.push([yRow]);
        }
        yBlock.set("rows", yRows);
        if (block.widthPercent !== undefined) yBlock.set("widthPercent", block.widthPercent);
        if (block.heightPt !== undefined) yBlock.set("heightPt", block.heightPt);
        if (block.colWidths !== undefined) yBlock.set("colWidths", block.colWidths);
        if (block.rowHeights !== undefined) yBlock.set("rowHeights", block.rowHeights);
        if (block.caption !== undefined) yBlock.set("caption", block.caption);
        if (block.captionPos !== undefined) yBlock.set("captionPos", block.captionPos);
        if (block.borderColor !== undefined) yBlock.set("borderColor", block.borderColor);
        if (block.borderThickness !== undefined) yBlock.set("borderThickness", block.borderThickness);
        if (block.borderType !== undefined) yBlock.set("borderType", block.borderType);
        if (block.cellSpacingMm !== undefined) yBlock.set("cellSpacingMm", block.cellSpacingMm);
        if (block.cellSpacingEnabled !== undefined) yBlock.set("cellSpacingEnabled", block.cellSpacingEnabled);
        if (block.fillColor !== undefined) yBlock.set("fillColor", block.fillColor);
        if (block.fillMode !== undefined) yBlock.set("fillMode", block.fillMode);
        if (block.cellPaddingLeftMm !== undefined) yBlock.set("cellPaddingLeftMm", block.cellPaddingLeftMm);
        if (block.cellPaddingRightMm !== undefined) yBlock.set("cellPaddingRightMm", block.cellPaddingRightMm);
        if (block.cellPaddingTopMm !== undefined) yBlock.set("cellPaddingTopMm", block.cellPaddingTopMm);
        if (block.cellPaddingBottomMm !== undefined) yBlock.set("cellPaddingBottomMm", block.cellPaddingBottomMm);
        if (block.pageBreak !== undefined) yBlock.set("pageBreak", block.pageBreak);
        if (block.repeatHeader !== undefined) yBlock.set("repeatHeader", block.repeatHeader);
        if (block.treatAsChar !== undefined) yBlock.set("treatAsChar", block.treatAsChar);
        if (block.textWrap !== undefined) yBlock.set("textWrap", block.textWrap);
        if (block.marginLeftMm !== undefined) yBlock.set("marginLeftMm", block.marginLeftMm);
        if (block.marginRightMm !== undefined) yBlock.set("marginRightMm", block.marginRightMm);
        if (block.marginTopMm !== undefined) yBlock.set("marginTopMm", block.marginTopMm);
        if (block.marginBottomMm !== undefined) yBlock.set("marginBottomMm", block.marginBottomMm);
      } else if (block.type === "equation") {
        const yScript = new Y.Text(block.script);
        yBlock.set("script", yScript);
      } else if (block.type === "image") {
        yBlock.set("src", block.src);
        if (block.widthPercent) yBlock.set("widthPercent", block.widthPercent);
        if (block.heightPt) yBlock.set("heightPt", block.heightPt);
        if (block.align) yBlock.set("align", block.align);
        if (block.caption) yBlock.set("caption", block.caption);
        if (block.captionPos) yBlock.set("captionPos", block.captionPos);
        if (block.rawXml) yBlock.set("rawXml", block.rawXml);
        if (block.rawAttrs) yBlock.set("rawAttrs", block.rawAttrs);
        if (block.treatAsChar !== undefined) yBlock.set("treatAsChar", block.treatAsChar);
        if (block.textWrap !== undefined) yBlock.set("textWrap", block.textWrap);
        if (block.marginLeftMm !== undefined) yBlock.set("marginLeftMm", block.marginLeftMm);
        if (block.marginRightMm !== undefined) yBlock.set("marginRightMm", block.marginRightMm);
        if (block.marginTopMm !== undefined) yBlock.set("marginTopMm", block.marginTopMm);
        if (block.marginBottomMm !== undefined) yBlock.set("marginBottomMm", block.marginBottomMm);
        if (block.borderColor) yBlock.set("borderColor", block.borderColor);
        if (block.borderThickness) yBlock.set("borderThickness", block.borderThickness);
        if (block.borderType) yBlock.set("borderType", block.borderType);
        if (block.hyperlink) yBlock.set("hyperlink", block.hyperlink);
      } else if (block.type === "chart") {
        yBlock.set("chartType", block.chartType || "column");
        yBlock.set("title", block.title || "차트");
        yBlock.set("categories", block.categories || ["1분기", "2분기", "3분기", "4분기"]);
        yBlock.set("series", block.series || [{ name: "실적", values: [150, 230, 224, 318] }]);
        if (block.widthPercent) yBlock.set("widthPercent", block.widthPercent);
        if (block.heightPt) yBlock.set("heightPt", block.heightPt);
        if (block.align) yBlock.set("align", block.align);
        if (block.caption) yBlock.set("caption", block.caption);
        if (block.captionPos) yBlock.set("captionPos", block.captionPos);
      } else if (block.type === "shape") {
        yBlock.set("shapeType", block.shapeType);
        if (block.widthPercent) yBlock.set("widthPercent", block.widthPercent);
        if (block.heightPt) yBlock.set("heightPt", block.heightPt);
        if (block.fillColor) yBlock.set("fillColor", block.fillColor);
        if (block.fillMode) yBlock.set("fillMode", block.fillMode);
        if (block.strokeColor) yBlock.set("strokeColor", block.strokeColor);
        if (block.strokeWidth) yBlock.set("strokeWidth", block.strokeWidth);
        if (block.strokeType) yBlock.set("strokeType", block.strokeType);
        const yText = new Y.Text(block.text || "");
        yBlock.set("text", yText);
        if (block.align) yBlock.set("align", block.align);
        if (block.caption) yBlock.set("caption", block.caption);
        if (block.captionPos) yBlock.set("captionPos", block.captionPos);
        if (block.rawXml) yBlock.set("rawXml", block.rawXml);
        if (block.rawAttrs) yBlock.set("rawAttrs", block.rawAttrs);
        if (block.treatAsChar !== undefined) yBlock.set("treatAsChar", block.treatAsChar);
        if (block.textWrap !== undefined) yBlock.set("textWrap", block.textWrap);
        if (block.marginLeftMm !== undefined) yBlock.set("marginLeftMm", block.marginLeftMm);
        if (block.marginRightMm !== undefined) yBlock.set("marginRightMm", block.marginRightMm);
        if (block.marginTopMm !== undefined) yBlock.set("marginTopMm", block.marginTopMm);
        if (block.marginBottomMm !== undefined) yBlock.set("marginBottomMm", block.marginBottomMm);
        if (block.hyperlink) yBlock.set("hyperlink", block.hyperlink);
      }
      if ("offsetX" in block && block.offsetX !== undefined) yBlock.set("offsetX", block.offsetX);
      if ("offsetY" in block && block.offsetY !== undefined) yBlock.set("offsetY", block.offsetY);
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
    const type = yBlock.get("type") as "paragraph" | "table" | "equation" | "image" | "shape";
    const id = (yBlock.get("id") as string) || `block_${i}`;
    const rawAttrs = yBlock.get("rawAttrs") as string | undefined;

    if (type === "paragraph") {
      const yText = yBlock.get("text") as Y.Text | undefined;
      const align = yBlock.get("align") as "left" | "center" | "right" | "justify" | undefined;
      const sizePt = yBlock.get("sizePt") as number | undefined;
      const bold = yBlock.get("bold") as boolean | undefined;
      const italic = yBlock.get("italic") as boolean | undefined;
      const underline = yBlock.get("underline") as boolean | undefined;
      const strikethrough = yBlock.get("strikethrough") as boolean | undefined;
      const color = yBlock.get("color") as string | undefined;
      const shadingColor = yBlock.get("shadingColor") as string | undefined;
      const fontFamily = yBlock.get("fontFamily") as string | undefined;
      const relativeSizePct = yBlock.get("relativeSizePct") as number | undefined;
      const charWidthPct = yBlock.get("charWidthPct") as number | undefined;
      const charPosPct = yBlock.get("charPosPct") as number | undefined;
      const letterSpacingPct = yBlock.get("letterSpacingPct") as number | undefined;
      const marginLeftPt = yBlock.get("marginLeftPt") as number | undefined;
      const marginRightPt = yBlock.get("marginRightPt") as number | undefined;
      const firstLineType = yBlock.get("firstLineType") as "none" | "indent" | "outdent" | undefined;
      const firstLinePt = yBlock.get("firstLinePt") as number | undefined;
      const lineSpacingPct = yBlock.get("lineSpacingPct") as number | undefined;
      const spaceBeforePt = yBlock.get("spaceBeforePt") as number | undefined;
      const spaceAfterPt = yBlock.get("spaceAfterPt") as number | undefined;
      const paraBorderType = yBlock.get("paraBorderType") as string | undefined;
      const paraBorderWidth = yBlock.get("paraBorderWidth") as string | undefined;
      const paraBorderColor = yBlock.get("paraBorderColor") as string | undefined;
      const paraBgColor = yBlock.get("paraBgColor") as string | undefined;
      const pageBreak = yBlock.get("pageBreak") as boolean | undefined;
      const charPrId = yBlock.get("charPrId") as string | undefined;
      const rawXml = yBlock.get("rawXml") as string | undefined;
      const origText = yBlock.get("origText") as string | undefined;
      const fontEdited = yBlock.get("fontEdited") === true;
      blocks.push({
        type: "paragraph",
        id,
        text: yText ? yText.toString() : "",
        align,
        sizePt,
        bold,
        italic,
        underline,
        strikethrough,
        color,
        shadingColor,
        fontFamily,
        relativeSizePct,
        charWidthPct,
        charPosPct,
        letterSpacingPct,
        marginLeftPt,
        marginRightPt,
        firstLineType,
        firstLinePt,
        lineSpacingPct,
        spaceBeforePt,
        spaceAfterPt,
        paraBorderType,
        paraBorderWidth,
        paraBorderColor,
        paraBgColor,
        pageBreak,
        rawAttrs,
        charPrId,
        rawXml,
        origText,
        fontEdited: fontEdited || undefined,
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
            const colSpan = yCell.get("colSpan") as number | undefined;
            const rowSpan = yCell.get("rowSpan") as number | undefined;
            const mergedHidden = yCell.get("mergedHidden") as boolean | undefined;
            const widthPercent = yCell.get("widthPercent") as number | undefined;
            const heightPx = yCell.get("heightPx") as number | undefined;
            const bgColor = yCell.get("bgColor") as string | undefined;
            const color = yCell.get("color") as string | undefined;
            cells.push({
              text: yText ? yText.toString() : "",
              rawAttrs: cellAttrs,
              align,
              bold,
              colSpan,
              rowSpan,
              mergedHidden,
              widthPercent,
              heightPx,
              bgColor,
              color,
            });
          }
          rows.push(cells);
        }
      }
      const offsetX = yBlock.get("offsetX") as number | undefined;
      const offsetY = yBlock.get("offsetY") as number | undefined;
      const widthPercent = yBlock.get("widthPercent") as number | undefined;
      const heightPt = yBlock.get("heightPt") as number | undefined;
      const colWidths = yBlock.get("colWidths") as number[] | undefined;
      const rowHeights = yBlock.get("rowHeights") as number[] | undefined;
      const caption = yBlock.get("caption") as string | undefined;
      const captionPos = yBlock.get("captionPos") as string | undefined;
      const borderColor = yBlock.get("borderColor") as string | undefined;
      const borderThickness = yBlock.get("borderThickness") as string | undefined;
      const borderType = yBlock.get("borderType") as string | undefined;
      const cellSpacingMm = yBlock.get("cellSpacingMm") as number | undefined;
      const cellSpacingEnabled = yBlock.get("cellSpacingEnabled") as boolean | undefined;
      const fillColor = yBlock.get("fillColor") as string | undefined;
      const fillMode = yBlock.get("fillMode") as "none" | "color" | undefined;
      const cellPaddingLeftMm = yBlock.get("cellPaddingLeftMm") as number | undefined;
      const cellPaddingRightMm = yBlock.get("cellPaddingRightMm") as number | undefined;
      const cellPaddingTopMm = yBlock.get("cellPaddingTopMm") as number | undefined;
      const cellPaddingBottomMm = yBlock.get("cellPaddingBottomMm") as number | undefined;
      const pageBreak = yBlock.get("pageBreak") as "divide" | "cell_divide" | "no_divide" | undefined;
      const repeatHeader = yBlock.get("repeatHeader") as boolean | undefined;
      const treatAsChar = yBlock.get("treatAsChar") as boolean | undefined;
      const limitToPage = yBlock.get("limitToPage") as boolean | undefined;
      const allowOverlap = yBlock.get("allowOverlap") as boolean | undefined;
      const textWrap = yBlock.get("textWrap") as "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT" | undefined;
      const textFlow = yBlock.get("textFlow") as "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY" | undefined;
      const marginLeftMm = yBlock.get("marginLeftMm") as number | undefined;
      const marginRightMm = yBlock.get("marginRightMm") as number | undefined;
      const marginTopMm = yBlock.get("marginTopMm") as number | undefined;
      const marginBottomMm = yBlock.get("marginBottomMm") as number | undefined;

      blocks.push({
        type: "table",
        id,
        rows,
        rawAttrs,
        offsetX,
        offsetY,
        widthPercent,
        heightPt,
        colWidths,
        rowHeights,
        caption,
        captionPos,
        borderColor,
        borderThickness,
        borderType,
        cellSpacingMm,
        cellSpacingEnabled,
        fillColor,
        fillMode,
        cellPaddingLeftMm,
        cellPaddingRightMm,
        cellPaddingTopMm,
        cellPaddingBottomMm,
        pageBreak,
        repeatHeader,
        treatAsChar,
        limitToPage,
        allowOverlap,
        textWrap,
        textFlow,
        marginLeftMm,
        marginRightMm,
        marginTopMm,
        marginBottomMm,
      });
    } else if (type === "equation") {
      const yScript = yBlock.get("script") as Y.Text | undefined;
      const offsetX = yBlock.get("offsetX") as number | undefined;
      const offsetY = yBlock.get("offsetY") as number | undefined;
      blocks.push({
        type: "equation",
        id,
        script: yScript ? yScript.toString() : "",
        rawAttrs,
        offsetX,
        offsetY,
      });
    } else if (type === "image") {
      const src = (yBlock.get("src") as string) || "";
      const widthPercent = (yBlock.get("widthPercent") as number) || 100;
      const heightPt = yBlock.get("heightPt") as number | undefined;
      const align = (yBlock.get("align") as "left" | "center" | "right") || "left";
      const caption = (yBlock.get("caption") as string) || "";
      const captionPos = yBlock.get("captionPos") as string | undefined;
      const rawXml = yBlock.get("rawXml") as string | undefined;
      const offsetX = yBlock.get("offsetX") as number | undefined;
      const offsetY = yBlock.get("offsetY") as number | undefined;
      const treatAsChar = yBlock.get("treatAsChar") as boolean | undefined;
      const limitToPage = yBlock.get("limitToPage") as boolean | undefined;
      const allowOverlap = yBlock.get("allowOverlap") as boolean | undefined;
      const textWrap = yBlock.get("textWrap") as "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT" | undefined;
      const textFlow = yBlock.get("textFlow") as "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY" | undefined;
      const marginLeftMm = yBlock.get("marginLeftMm") as number | undefined;
      const marginRightMm = yBlock.get("marginRightMm") as number | undefined;
      const marginTopMm = yBlock.get("marginTopMm") as number | undefined;
      const marginBottomMm = yBlock.get("marginBottomMm") as number | undefined;
      const borderColor = yBlock.get("borderColor") as string | undefined;
      const borderThickness = yBlock.get("borderThickness") as string | undefined;
      const borderType = yBlock.get("borderType") as string | undefined;
      const hyperlink = yBlock.get("hyperlink") as string | undefined;
      const lineDir = yBlock.get("lineDir") as "tl-br" | "bl-tr" | undefined;
      const isTextBox = yBlock.get("isTextBox") as boolean | undefined;
      blocks.push({
        type: "image",
        id,
        src,
        widthPercent,
        heightPt,
        align,
        caption,
        captionPos,
        rawAttrs,
        rawXml,
        offsetX,
        offsetY,
        treatAsChar,
        limitToPage,
        allowOverlap,
        textWrap,
        textFlow,
        marginLeftMm,
        marginRightMm,
        marginTopMm,
        marginBottomMm,
        borderColor,
        borderThickness,
        borderType,
        hyperlink,
      });
    } else if (type === "shape") {
      const shapeType = (yBlock.get("shapeType") as "rect" | "roundRect" | "ellipse" | "line" | "arc") || "rect";
      const widthPercent = (yBlock.get("widthPercent") as number) || 75;
      const heightPt = (yBlock.get("heightPt") as number) || (shapeType === "line" ? 2 : 60);
      const fillColor = (yBlock.get("fillColor") as string) || "#EFF6FF";
      const fillMode = (yBlock.get("fillMode") as "none" | "color") || "color";
      const strokeColor = (yBlock.get("strokeColor") as string) || "#2563EB";
      const strokeWidth = (yBlock.get("strokeWidth") as number) || 1.5;
      const strokeType = yBlock.get("strokeType") as string | undefined;
      const yText = yBlock.get("text") as Y.Text | undefined;
      const align = (yBlock.get("align") as "left" | "center" | "right") || "left";
      const caption = yBlock.get("caption") as string | undefined;
      const captionPos = yBlock.get("captionPos") as string | undefined;
      const rawXml = yBlock.get("rawXml") as string | undefined;
      const offsetX = yBlock.get("offsetX") as number | undefined;
      const offsetY = yBlock.get("offsetY") as number | undefined;
      const treatAsChar = yBlock.get("treatAsChar") as boolean | undefined;
      const limitToPage = yBlock.get("limitToPage") as boolean | undefined;
      const allowOverlap = yBlock.get("allowOverlap") as boolean | undefined;
      const textWrap = yBlock.get("textWrap") as "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT" | undefined;
      const textFlow = yBlock.get("textFlow") as "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY" | undefined;
      const marginLeftMm = yBlock.get("marginLeftMm") as number | undefined;
      const marginRightMm = yBlock.get("marginRightMm") as number | undefined;
      const marginTopMm = yBlock.get("marginTopMm") as number | undefined;
      const marginBottomMm = yBlock.get("marginBottomMm") as number | undefined;
      const hyperlink = yBlock.get("hyperlink") as string | undefined;
      const lineDir = yBlock.get("lineDir") as "tl-br" | "bl-tr" | undefined;
      const isTextBox = yBlock.get("isTextBox") as boolean | undefined;
      blocks.push({
        type: "shape",
        id,
        shapeType,
        widthPercent,
        heightPt,
        fillColor,
        fillMode,
        strokeColor,
        strokeWidth,
        strokeType,
        text: yText ? yText.toString() : "",
        align,
        caption,
        captionPos,
        rawAttrs,
        rawXml,
        offsetX,
        offsetY,
        treatAsChar,
        limitToPage,
        allowOverlap,
        textWrap,
        textFlow,
        marginLeftMm,
        marginRightMm,
        marginTopMm,
        marginBottomMm,
        hyperlink,
        lineDir,
        isTextBox,
      });
    } else if (type === "chart") {
      const chartType = (yBlock.get("chartType") as "column" | "bar" | "line" | "pie") || "column";
      const title = (yBlock.get("title") as string) || "차트 1";
      const categories = (yBlock.get("categories") as string[]) || ["1분기", "2분기", "3분기", "4분기"];
      const series = (yBlock.get("series") as { name: string; values: number[]; color?: string }[]) || [
        { name: "매출", values: [150, 230, 224, 318] },
        { name: "영업익", values: [45, 75, 82, 110] },
      ];
      const widthPercent = (yBlock.get("widthPercent") as number) || 85;
      const heightPt = (yBlock.get("heightPt") as number) || 180;
      const align = (yBlock.get("align") as "left" | "center" | "right") || "left";
      const caption = yBlock.get("caption") as string | undefined;
      const captionPos = yBlock.get("captionPos") as string | undefined;
      const offsetX = yBlock.get("offsetX") as number | undefined;
      const offsetY = yBlock.get("offsetY") as number | undefined;
      const treatAsChar = yBlock.get("treatAsChar") as boolean | undefined;
      const limitToPage = yBlock.get("limitToPage") as boolean | undefined;
      const allowOverlap = yBlock.get("allowOverlap") as boolean | undefined;
      const textWrap = yBlock.get("textWrap") as "TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT" | undefined;
      const textFlow = yBlock.get("textFlow") as "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY" | undefined;
      blocks.push({
        type: "chart",
        id,
        chartType,
        title,
        categories,
        series,
        widthPercent,
        heightPt,
        align,
        caption,
        captionPos,
        rawAttrs,
        offsetX,
        offsetY,
        treatAsChar,
        limitToPage,
        allowOverlap,
        textWrap,
        textFlow,
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
    } else if (block.type === "shape") {
      if (block.text) lines.push(`[도형] ${block.text}`);
      else lines.push(`[도형: ${block.shapeType}]`);
    } else if (block.type === "chart") {
      lines.push(`[차트: ${block.title || "차트"}] ${(block.categories || []).join(", ")}`);
    }
  }

  return lines.join("\n\n");
}

// 저장 비교값 (텍스트뿐 아니라 색상·크기·표·이미지 등 모든 블록 변경 여부를 정밀 감지)
export function hwpxCollabKey(doc: Y.Doc): string {
  const blocks = extractBlocksFromYDoc(doc);
  return textHash(JSON.stringify(blocks));
}

// ── 한컴 공식 OCF 표준 규격 준수: HWPX ZIP 패키지 엔트리 맵 생성 ──
export function prepareHwpxPackageEntries(
  baseEntries: Map<string, Uint8Array>,
  sectionXml: string,
  headerXml: string,
  chartFiles?: Map<string, string>,
  binDataFiles?: Map<string, Uint8Array>
): Map<string, Uint8Array> {
  const newEntries = new Map(baseEntries);

  const secKey = Array.from(newEntries.keys()).find((k) => /^Contents\/section0\.xml$/i.test(k)) ?? "Contents/section0.xml";
  newEntries.set(secKey, new TextEncoder().encode(sectionXml));

  const headerKey = Array.from(newEntries.keys()).find((k) => /^Contents\/header\.xml$/i.test(k)) ?? "Contents/header.xml";
  newEntries.set(headerKey, new TextEncoder().encode(headerXml));

  if (chartFiles && chartFiles.size > 0) {
    for (const [relPath, xml] of chartFiles.entries()) {
      newEntries.set(relPath, new TextEncoder().encode(xml));
    }
  }

  if (binDataFiles && binDataFiles.size > 0) {
    for (const [relPath, bytes] of binDataFiles.entries()) {
      newEntries.set(relPath, bytes);
    }
  }

  // ── 표준 OCF 및 HWPX 필수 컨테이너 엔트리 보장 ──
  // 원본 문서에 이미 해당 파일이 존재하는 경우 원본의 온전한 구조/메타데이터를 100% 보존합니다.
  // 오직 새 문서 생성 등 파일이 존재하지 않는 경우에만 표준 기본 템플릿을 보충합니다.
  if (!newEntries.has("settings.xml")) {
    newEntries.set("settings.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app">\n  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>\n</ha:HWPApplicationSetting>`));
  }

  if (!newEntries.has("version.xml")) {
    newEntries.set("version.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.31" application="Hancom Office Hangul"/>`));
  }

  if (!newEntries.has("META-INF/container.xml")) {
    newEntries.set("META-INF/container.xml", new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">\n  <ocf:rootfiles>\n    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>\n  </ocf:rootfiles>\n</ocf:container>`));
  }

  const hpfKey = Array.from(newEntries.keys()).find((k) => /^Contents\/content\.hpf$/i.test(k)) ?? "Contents/content.hpf";
  if (!newEntries.has(hpfKey)) {
    newEntries.set(hpfKey, new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" version="2.0" unique-identifier="hwpx-id">\n  <opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:title>문서</dc:title>\n    <dc:language>ko</dc:language>\n  </opf:metadata>\n  <opf:manifest>\n    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>\n    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>\n    <opf:item id="settings" href="settings.xml" media-type="application/xml"/>\n  </opf:manifest>\n  <opf:spine>\n    <opf:itemref idref="header" linear="no"/>\n    <opf:itemref idref="section0" linear="yes"/>\n  </opf:spine>\n</opf:package>`));
  } else {
    // 기존 content.hpf가 있더라도 href="header.xml"을 href="Contents/header.xml"로 정규화
    let hpfStr = new TextDecoder().decode(newEntries.get(hpfKey)!);
    let hpfChanged = false;
    if (hpfStr.includes('href="header.xml"')) {
      hpfStr = hpfStr.replace('href="header.xml"', 'href="Contents/header.xml"');
      hpfChanged = true;
    }
    if (hpfStr.includes('href="section0.xml"')) {
      hpfStr = hpfStr.replace('href="section0.xml"', 'href="Contents/section0.xml"');
      hpfChanged = true;
    }
    if (hpfChanged) {
      newEntries.set(hpfKey, new TextEncoder().encode(hpfStr));
    }
  }

  if (chartFiles && chartFiles.size > 0 && newEntries.has(hpfKey)) {
    let hpfStr = new TextDecoder().decode(newEntries.get(hpfKey)!);
    let added = false;
    let cIdx = 1;
    for (const relPath of chartFiles.keys()) {
      if (!hpfStr.includes(relPath)) {
        const itemId = `chart${cIdx}`;
        hpfStr = hpfStr.replace(
          /<\/opf:manifest>/,
          `    <opf:item id="${itemId}" href="${relPath}" media-type="application/xml"/>\n  </opf:manifest>`
        );
        added = true;
      }
      cIdx++;
    }
    if (added) {
      newEntries.set(hpfKey, new TextEncoder().encode(hpfStr));
    }
  }

  if (binDataFiles && binDataFiles.size > 0 && newEntries.has(hpfKey)) {
    let hpfStr = new TextDecoder().decode(newEntries.get(hpfKey)!);
    let added = false;
    for (const relPath of binDataFiles.keys()) {
      if (!hpfStr.includes(relPath)) {
        const base = relPath.split("/").pop() || "image1.png";
        const itemId = base.replace(/\.[^.]+$/, "");
        const ext = base.split(".").pop()?.toLowerCase() || "png";
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
        hpfStr = hpfStr.replace(
          /<\/opf:manifest>/,
          `    <opf:item id="${itemId}" href="${relPath}" media-type="${mime}" isEmbeded="1"/>\n  </opf:manifest>`
        );
        added = true;
      }
    }
    if (added) {
      newEntries.set(hpfKey, new TextEncoder().encode(hpfStr));
    }
  }

  return newEntries;
}
