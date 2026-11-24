import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import * as Y from "yjs";

// React 19와 브라우저 ContentEditable 간의 DOM 불일치로 인한 removeChild / insertBefore NotFoundError 방어 가드
if (typeof window !== "undefined") {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
import type { WorkspaceFile } from "../api/types";
import EditorAvatars from "./EditorAvatars";
import type { CollabEditor, CollabMode, CollabPresence } from "../lib/collab";
import { useCollabFile } from "../lib/useCollabFile";
import {
  extractBlocksFromYDoc,
  extractHwpxImageMap,
  HwpxCollabBlock,
  HwpxTableCell,
  HwpxImageBlock,
  HwpxChartBlock,
  HwpxChartType,
  HwpxParagraphBlock,
  HwpxShapeBlock,
  HwpxTableBlock,
  hwpxCollabKey,
  hwpxCollabText,
  initHwpxYDoc,
  parseHwpxXmlToBlocks,
  serializeBlocksToHwpxPackage,
  extractMemosFromHwpxXml,
  serializeBlocksToHwpxXml,
  prepareHwpxPackageEntries,
} from "../lib/hwpxCollab";
import { readZipEntries, writeZipEntries, HWPX_MIME } from "../lib/hwpx";
import {
  parseHwpEquation,
  HWPX_EQUATION_TEMPLATES,
  HWPX_OPERATOR_SYMBOLS,
  HWPX_GREEK_SYMBOLS,
} from "../lib/hwpxEquation";
import { HwpxSelectionHandles, HwpxFloatingToolbar, HwpxRemoteSizeControls, HwpxRemoteColorPicker, type ResizeDirection } from "./HwpxObjectHandles";
import {
  SaveIcon,
  CutIcon,
  CopyIcon,
  PasteIcon,
  FormatPainterIcon,
  SearchIcon,
  ShapesIcon,
  ImageIcon,
  TableIcon,
  EquationIcon,
  SymbolIcon,
  CharShapeIcon,
  ParaShapeIcon,
  HeaderIcon,
  FooterIcon,
  ParaMarkIcon,
  GridIcon,
  UndoIcon,
  RedoIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  HighlighterIcon,
  LineSpacingIcon,
  IndentDecIcon,
  IndentIncIcon,
  TrashIcon,
  PrintIcon,
  DocInfoIcon,
  ReplaceIcon,
  PageBreakIcon,
  PageSetupIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ShortcutsIcon,
  SpellCheckIcon,
  AddRowIcon,
  AddColIcon,
  DeleteRowColIcon,
  SelectAllIcon,
  BulletListIcon,
  NumberListIcon,
  FootnoteIcon,
  TextBoxIcon,
  CaptionIcon,
  HyperlinkIcon,
  ColumnsIcon,
  PageNumberIcon,
  WatermarkIcon,
  TemplateIcon,
  CommentIcon,
  ChartIcon,
  TocIcon,
  MergeCellIcon,
  SplitCellIcon,
  CalcIcon,
  TextConvertIcon,
  SuperscriptIcon,
  SubscriptIcon,
  HancomDocsAppLogo,
  SaveAsIcon,
  ShareIcon,
  RenameIcon,
  DownloadTrayIcon,
  PdfDownloadIcon,
  GotoIcon,
  EraserIcon,
  ClearControlMarksIcon,
  WebVideoIcon,
  EndnoteIcon,
  SafeFontIcon,
  AlignDistributeIcon,
} from "./HwpxIcons";
import AddFontModal from "./AddFontModal";
import {
  FormatCopyModal,
  TextConvertModal,
  HyperlinkModal,
  BookmarkModal,
  BulletAndNumberModal,
  StyleModal,
  SplitCellModal,
  DeleteTableCellsModal,
  InsertDateModal,
  AutoTextModal,
  PageNumberModal,
  WatermarkModal,
  TemplateModal,
  TableCalcModal,
  SpellCheckModal,
  CharShapeModal,
  ParaShapeModal,
} from "./HwpxEditorModals";
import { getAllEditorFonts, injectAllWebFonts, type EditorFontItem } from "../lib/editorFonts";

const FONT_FAMILIES = [
  { label: "바탕체 / 명조", value: "'HCR Batang', '함초롬바탕', 'Batang', 'Nanum Myeongjo', 'Noto Serif KR', serif" },
  { label: "고딕 / 돋움", value: "Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif" },
  { label: "궁서체", value: "'GungsuhChe', 'Gungsuh', serif" },
  { label: "굴림체", value: "'GulimChe', 'Gulim', sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "코딩체 (고정폭)", value: "'Courier New', Courier, monospace" },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32];

const FONT_COLORS = [
  { label: "검정", value: "#111827" },
  { label: "회색", value: "#6b7280" },
  { label: "빨강", value: "#ef4444" },
  { label: "파랑", value: "#3b82f6" },
  { label: "초록", value: "#10b981" },
  { label: "주황", value: "#f97316" },
  { label: "보라", value: "#8b5cf6" },
];

function getCaretOffset(element: HTMLElement | null): number {
  if (!element) return 0;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function applyTextDiffToYText(yText: Y.Text, newText: string) {
  const oldText = yText.toString();
  if (oldText === newText) return;

  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const deleteCount = oldEnd - start;
  const insertText = newText.slice(start, newEnd);

  if (deleteCount > 0) {
    yText.delete(start, deleteCount);
  }
  if (insertText.length > 0) {
    yText.insert(start, insertText);
  }
}

function isCaretAtStart(element: HTMLElement | null): boolean {
  if (!element) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length === 0;
}

function isCaretAtEnd(element: HTMLElement | null): boolean {
  if (!element) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const postRange = range.cloneRange();
  postRange.selectNodeContents(element);
  postRange.setStart(range.endContainer, range.endOffset);
  return postRange.toString().length === 0;
}

function getSplitText(element: HTMLElement | null): { before: string; after: string } {
  if (!element) return { before: "", after: "" };
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return { before: element.innerText || "", after: "" };
  }
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  const before = preRange.toString().replace(/\r?\n$/, "");

  const postRange = range.cloneRange();
  postRange.selectNodeContents(element);
  postRange.setStart(range.endContainer, range.endOffset);
  const after = postRange.toString().replace(/^\r?\n/, "").replace(/\r?\n$/, "");

  return { before, after };
}

function setCaretOffset(element: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();

  if (!element.firstChild || offset === 0) {
    range.selectNodeContents(element);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  let charIndex = 0;
  let targetNode: Node | null = null;
  let targetOffset = 0;

  function traverse(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLen = node.nodeValue?.length || 0;
      if (charIndex + textLen >= offset) {
        targetNode = node;
        targetOffset = Math.max(0, offset - charIndex);
        return true;
      }
      charIndex += textLen;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (traverse(node.childNodes[i])) return true;
      }
    }
    return false;
  }

  traverse(element);

  if (targetNode) {
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

function getCrossParagraphSelection(): {
  startIdx: number;
  startOffset: number;
  endIdx: number;
  endOffset: number;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);

  const startBlockEl = (
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement
  )?.closest("[data-block-idx]");

  const endBlockEl = (
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer as HTMLElement)
      : range.endContainer.parentElement
  )?.closest("[data-block-idx]");

  if (!startBlockEl || !endBlockEl) return null;
  const rawStartIdx = Number(startBlockEl.getAttribute("data-block-idx"));
  const rawEndIdx = Number(endBlockEl.getAttribute("data-block-idx"));
  if (isNaN(rawStartIdx) || isNaN(rawEndIdx) || rawStartIdx === rawEndIdx) return null;

  const startP =
    startBlockEl.tagName === "P" ? (startBlockEl as HTMLParagraphElement) : startBlockEl.querySelector("p");
  const endP =
    endBlockEl.tagName === "P" ? (endBlockEl as HTMLParagraphElement) : endBlockEl.querySelector("p");
  if (!startP || !endP) return null;

  let startOffset = 0;
  let endOffset = 0;

  try {
    const preRangeA = range.cloneRange();
    preRangeA.selectNodeContents(startP);
    preRangeA.setEnd(range.startContainer, range.startOffset);
    startOffset = preRangeA.toString().length;
  } catch {
    startOffset = 0;
  }

  try {
    const preRangeB = range.cloneRange();
    preRangeB.selectNodeContents(endP);
    preRangeB.setEnd(range.endContainer, range.endOffset);
    endOffset = preRangeB.toString().length;
  } catch {
    endOffset = 0;
  }

  return {
    startIdx: Math.min(rawStartIdx, rawEndIdx),
    startOffset: rawStartIdx < rawEndIdx ? startOffset : endOffset,
    endIdx: Math.max(rawStartIdx, rawEndIdx),
    endOffset: rawStartIdx < rawEndIdx ? endOffset : startOffset,
  };
}

function getPointOffsetInParagraph(pEl: HTMLElement, clientX: number, clientY: number): number {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(clientX, clientY);
    if (r && pEl.contains(r.startContainer)) {
      try {
        const pre = document.createRange();
        pre.selectNodeContents(pEl);
        pre.setEnd(r.startContainer, r.startOffset);
        return pre.toString().length;
      } catch {
        // fallback below
      }
    }
  }
  const rect = pEl.getBoundingClientRect();
  const textLen = (pEl.innerText || "").replace(/\r?\n$/, "").length;
  if (clientY < rect.top + rect.height * 0.5 && clientX < rect.left + rect.width * 0.5) return 0;
  return textLen;
}

function resolveNodeAndOffset(pEl: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, targetOffset);
  let node = walker.nextNode();
  let lastText: Node | null = null;
  while (node) {
    lastText = node;
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      return { node, offset: remaining };
    }
    remaining -= len;
    node = walker.nextNode();
  }
  if (lastText) {
    return { node: lastText, offset: lastText.textContent?.length ?? 0 };
  }
  return { node: pEl, offset: 0 };
}

function getCaretClientPosition(): { x: number; y: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) {
    return { x: rects[0].left, y: (rects[0].top + rects[0].bottom) / 2 };
  }
  const node = range.startContainer;
  const offset = range.startOffset;
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text;
    const tempRange = range.cloneRange();
    if (offset < textNode.length) {
      tempRange.setEnd(textNode, offset + 1);
      const r = tempRange.getClientRects();
      if (r.length > 0) return { x: r[0].left, y: (r[0].top + r[0].bottom) / 2 };
    } else if (offset > 0) {
      tempRange.setStart(textNode, offset - 1);
      const r = tempRange.getClientRects();
      if (r.length > 0) return { x: r[0].right, y: (r[0].top + r[0].bottom) / 2 };
    }
  }
  const parent = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (parent) {
    const r = parent.getBoundingClientRect();
    return { x: r.left, y: (r.top + r.bottom) / 2 };
  }
  return null;
}

function isCaretOnFirstLine(element: HTMLElement | null): boolean {
  if (!element) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const startRange = document.createRange();
  startRange.selectNodeContents(element);
  startRange.collapse(true);
  const startRects = startRange.getClientRects();
  const startTop = startRects.length > 0 ? startRects[0].top : element.getBoundingClientRect().top;

  const caretPos = getCaretClientPosition();
  if (!caretPos) return isCaretAtStart(element);

  return (caretPos.y - startTop) < 24;
}

function isCaretOnLastLine(element: HTMLElement | null): boolean {
  if (!element) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const endRange = document.createRange();
  endRange.selectNodeContents(element);
  endRange.collapse(false);
  const endRects = endRange.getClientRects();
  const endBottom = endRects.length > 0 ? endRects[endRects.length - 1].bottom : element.getBoundingClientRect().bottom;

  const caretPos = getCaretClientPosition();
  if (!caretPos) return isCaretAtEnd(element);

  return (endBottom - caretPos.y) < 24;
}

function setCaretAtPointOrEdge(element: HTMLElement, targetX: number, toEnd: boolean) {
  element.focus({ preventScroll: true });
  const rect = element.getBoundingClientRect();
  const y = toEnd ? (rect.bottom - 6) : (rect.top + 6);
  const clampedX = Math.max(rect.left + 4, Math.min(targetX, rect.right - 4));

  const doc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(clampedX, y);
    if (range && element.contains(range.startContainer)) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(clampedX, y);
    if (pos && element.contains(pos.offsetNode)) {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
  }

  setCaretOffset(element, toEnd ? 999999 : 0);
}

// 한컴독스 표준 편집 용지 숫자 입력 필드 (스피너 상하 버튼 및 mm 단위 일체형)
function PageSetupNumberInput({
  value,
  onChange,
  step = 1.0,
  min = 0,
  max = 1000,
}: {
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? value.toFixed(1) : "0.0"));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(Number.isFinite(value) ? value.toFixed(1) : "0.0");
    }
  }, [value, focused]);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      const fallback = Number.isFinite(value) ? value : 0;
      setText(fallback.toFixed(1));
      return;
    }
    const clamped = Math.max(min, Math.min(max, Number(parsed.toFixed(1))));
    onChange(clamped);
    setText(clamped.toFixed(1));
  };

  return (
    <div className="h-[26px] w-[120px] border border-[#c5ceda] bg-white rounded-xs flex items-center px-1.5 justify-between focus-within:border-[#1e4fa8] focus-within:ring-1 focus-within:ring-[#1e4fa8]/30 shadow-2xs">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const raw = e.target.value;
          // 숫자, 소수점, 빈 문자열만 허용
          if (/^\d*\.?\d*$/.test(raw)) {
            setText(raw);
            const v = parseFloat(raw);
            if (!isNaN(v) && v >= min && v <= max) {
              onChange(v);
            }
          }
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(text);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.min(max, Number((value + step).toFixed(1)));
            onChange(next);
            setText(next.toFixed(1));
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = Math.max(min, Number((value - step).toFixed(1)));
            onChange(next);
            setText(next.toFixed(1));
          }
        }}
        className="w-12 text-left text-[12px] text-neutral-900 outline-none bg-transparent"
      />
      <div className="flex items-center gap-1.5 shrink-0 select-none">
        <span className="text-[11px] text-neutral-700">mm</span>
        <div className="flex flex-col h-full justify-center">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              const next = Math.min(max, Number((value + step).toFixed(1)));
              onChange(next);
              setText(next.toFixed(1));
            }}
            className="w-3.5 h-2.5 flex items-center justify-center text-[7px] text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-2xs cursor-pointer"
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              const next = Math.max(min, Number((value - step).toFixed(1)));
              onChange(next);
              setText(next.toFixed(1));
            }}
            className="w-3.5 h-2.5 flex items-center justify-center text-[7px] text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-2xs cursor-pointer"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

function HwpxSvgChart({ chart }: { chart: HwpxChartBlock }) {
  const chartType = chart.chartType || "column";
  const categories = chart.categories || ["1분기", "2분기", "3분기", "4분기"];
  const series = chart.series || [
    { name: "매출액", values: [180, 240, 290, 360], color: "#2563eb" },
    { name: "영업이익", values: [55, 80, 105, 140], color: "#10b981" },
  ];
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

  const allVals = series.flatMap((s) => s.values);
  const maxVal = Math.max(10, ...allVals) * 1.15;

  if (chartType === "pie" || chartType === "exploded-pie" || chartType === "pie-3d" || chartType === "exploded-pie-3d" || chartType === "doughnut") {
    const isExploded = chartType.includes("exploded");
    const is3D = chartType.includes("3d");
    const isDoughnut = chartType === "doughnut";
    const pieVals = categories.map((_, cIdx) => series.reduce((sum, s) => sum + (s.values[cIdx] || 0), 0));
    const total = pieVals.reduce((a, b) => a + b, 0) || 1;
    let accumAngle = 0;
    const slices = pieVals.map((val, idx) => {
      const angle = (val / total) * 360;
      const startAngle = accumAngle;
      accumAngle += angle;
      const endAngle = accumAngle;
      const r = 75;
      const cx = 180;
      const cy = 115;
      const x1 = cx + r * Math.cos((Math.PI * (startAngle - 90)) / 180);
      const y1 = cy + r * Math.sin((Math.PI * (startAngle - 90)) / 180);
      const x2 = cx + r * Math.cos((Math.PI * (endAngle - 90)) / 180);
      const y2 = cy + r * Math.sin((Math.PI * (endAngle - 90)) / 180);
      const largeArc = angle > 180 ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      const midAngle = startAngle + angle / 2;
      const offsetDist = isExploded ? 7 : 0;
      const ox = offsetDist * Math.cos((Math.PI * (midAngle - 90)) / 180);
      const oy = offsetDist * Math.sin((Math.PI * (midAngle - 90)) / 180);
      const textX = cx + ox + (r * 0.65) * Math.cos((Math.PI * (midAngle - 90)) / 180);
      const textY = cy + oy + (r * 0.65) * Math.sin((Math.PI * (midAngle - 90)) / 180);
      const pct = Math.round((val / total) * 100);
      return { d, ox, oy, color: colors[idx % colors.length], label: categories[idx], pct, textX, textY };
    });

    return (
      <svg viewBox="0 0 500 230" data-chart-type={chartType} className="w-full h-auto select-none font-sans">
        <rect width="500" height="230" fill="#fafafa" rx="8" />
        {is3D && slices.map((s, i) => (
          <path key={`3d-${i}`} d={s.d} transform={`translate(${s.ox}, ${s.oy + 9})`} fill={s.color} opacity="0.55" />
        ))}
        {slices.map((s, i) => (
          <g key={i}>
            <path d={s.d} transform={`translate(${s.ox}, ${s.oy})`} fill={s.color} stroke="#ffffff" strokeWidth="2" />
            {s.pct >= 8 && !isDoughnut && (
              <text x={s.textX} y={s.textY} fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                {s.pct}%
              </text>
            )}
          </g>
        ))}
        {isDoughnut && <circle cx="180" cy="115" r="36" fill="#fafafa" />}
        <g transform="translate(300, 35)">
          {categories.map((cat, i) => (
            <g key={i} transform={`translate(0, ${i * 26})`}>
              <rect width="14" height="14" rx="3" fill={colors[i % colors.length]} />
              <text x="22" y="11" fontSize="11" fill="#334155" fontWeight="500">
                {cat} ({Math.round(((pieVals[i] || 0) / total) * 100)}%)
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (chartType === "scatter") {
    const leftPad = 50, rightPad = 30, topPad = 35, bottomPad = 50;
    const chartW = 500 - leftPad - rightPad, chartH = 230 - topPad - bottomPad;
    const stepX = categories.length > 1 ? chartW / (categories.length - 1) : chartW / 2;
    return (
      <svg viewBox="0 0 500 230" data-chart-type={chartType} className="w-full h-auto select-none font-sans">
        <rect width="500" height="230" fill="#fafafa" rx="8" />
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = topPad + chartH * (1 - p);
          return (
            <g key={i}>
              <line x1={leftPad} y1={y} x2={500 - rightPad} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={leftPad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxVal * p)}</text>
            </g>
          );
        })}
        {categories.map((cat, i) => (
          <text key={i} x={leftPad + (categories.length > 1 ? i * stepX : chartW / 2)} y={230 - bottomPad + 18} textAnchor="middle" fontSize="11" fill="#475569">{cat}</text>
        ))}
        {series.map((s, sIdx) => {
          const sColor = s.color || colors[sIdx % colors.length];
          return s.values.map((v, cIdx) => {
            const cx = leftPad + (categories.length > 1 ? cIdx * stepX : chartW / 2) + (sIdx - (series.length - 1) / 2) * 8;
            const cy = topPad + chartH * (1 - Math.min(1, v / maxVal));
            return <circle key={`${sIdx}-${cIdx}`} cx={cx} cy={cy} r="5.5" fill={sColor} stroke="#ffffff" strokeWidth="1.5" />;
          });
        })}
      </svg>
    );
  }

  if (chartType === "radar") {
    const cx = 190, cy = 115, rMax = 80;
    const n = Math.max(3, categories.length);
    const getPt = (idx: number, ratio: number) => {
      const ang = (Math.PI * 2 * idx) / n - Math.PI / 2;
      return { x: cx + rMax * ratio * Math.cos(ang), y: cy + rMax * ratio * Math.sin(ang) };
    };
    return (
      <svg viewBox="0 0 500 230" data-chart-type={chartType} className="w-full h-auto select-none font-sans">
        <rect width="500" height="230" fill="#fafafa" rx="8" />
        {[0.25, 0.5, 0.75, 1].map((ratio, ri) => (
          <polygon key={ri} points={Array.from({ length: n }, (_, i) => { const p = getPt(i, ratio); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#cbd5e1" strokeWidth="1" />
        ))}
        {categories.map((cat, i) => {
          const p = getPt(i, 1);
          const lp = getPt(i, 1.18);
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#cbd5e1" strokeWidth="1" />
              <text x={lp.x} y={lp.y + 3} textAnchor="middle" fontSize="10" fill="#475569">{cat}</text>
            </g>
          );
        })}
        {series.map((s, sIdx) => {
          const sColor = s.color || colors[sIdx % colors.length];
          const pts = Array.from({ length: n }, (_, i) => getPt(i, Math.min(1, (s.values[i] || 0) / maxVal)));
          return (
            <polygon key={sIdx} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill={sColor} fillOpacity="0.22" stroke={sColor} strokeWidth="2" />
          );
        })}
        <g transform="translate(330, 50)">
          {series.map((s, sIdx) => (
            <g key={sIdx} transform={`translate(0, ${sIdx * 24})`}>
              <rect width="12" height="12" rx="2" fill={s.color || colors[sIdx % colors.length]} />
              <text x="18" y="10" fontSize="11" fill="#334155">{s.name}</text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (chartType === "area" || chartType === "stacked-area" || chartType === "area-3d" || chartType === "stacked-area-3d") {
    const isStackedArea = chartType.includes("stacked");
    const is3DArea = chartType.includes("3d");
    const leftPad = 50, rightPad = 30, topPad = 35, bottomPad = 50;
    const chartW = 500 - leftPad - rightPad, chartH = 230 - topPad - bottomPad;
    const baseY = topPad + chartH;
    const stepX = categories.length > 1 ? chartW / (categories.length - 1) : chartW / 2;
    const areaMax = isStackedArea
      ? Math.max(10, ...categories.map((_, cIdx) => series.reduce((sum, s) => sum + (s.values[cIdx] || 0), 0))) * 1.15
      : maxVal;
    return (
      <svg viewBox="0 0 500 230" data-chart-type={chartType} className="w-full h-auto select-none font-sans">
        <rect width="500" height="230" fill="#fafafa" rx="8" />
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = topPad + chartH * (1 - p);
          return (
            <g key={i}>
              <line x1={leftPad} y1={y} x2={500 - rightPad} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={leftPad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(areaMax * p)}</text>
            </g>
          );
        })}
        {categories.map((cat, i) => (
          <text key={i} x={leftPad + (categories.length > 1 ? i * stepX : chartW / 2)} y={baseY + 18} textAnchor="middle" fontSize="11" fill="#475569">{cat}</text>
        ))}
        {series.map((s, sIdx) => {
          const sColor = s.color || colors[sIdx % colors.length];
          const topPts = categories.map((_, cIdx) => {
            const x = leftPad + (categories.length > 1 ? cIdx * stepX : chartW / 2);
            const acc = isStackedArea
              ? series.slice(0, sIdx + 1).reduce((sum, ss) => sum + (ss.values[cIdx] || 0), 0)
              : (s.values[cIdx] || 0);
            const y = topPad + chartH * (1 - Math.min(1, acc / areaMax));
            return `${x},${y}`;
          });
          const botPts = categories.map((_, cIdx) => {
            const rev = categories.length - 1 - cIdx;
            const x = leftPad + (categories.length > 1 ? rev * stepX : chartW / 2);
            const accPrev = isStackedArea
              ? series.slice(0, sIdx).reduce((sum, ss) => sum + (ss.values[rev] || 0), 0)
              : 0;
            const y = topPad + chartH * (1 - Math.min(1, accPrev / areaMax));
            return `${x},${y}`;
          });
          return (
            <g key={sIdx} transform={is3DArea ? `translate(${sIdx * 4}, ${-sIdx * 3})` : undefined}>
              <polygon points={[...topPts, ...botPts].join(" ")} fill={sColor} fillOpacity={isStackedArea ? 0.78 : 0.45} stroke={sColor} strokeWidth="2" />
            </g>
          );
        })}
      </svg>
    );
  }

  if (chartType === "bar" || chartType === "stacked-bar" || chartType === "bar-3d" || chartType === "stacked-bar-3d") {
    const svgH = 182;
    const leftPad = 68;
    const rightPad = 24;
    const topPad = 10;
    const bottomPad = 42;
    const chartW = 500 - leftPad - rightPad;
    const chartH = svgH - topPad - bottomPad;
    const axisBottomY = svgH - bottomPad;
    const niceMax = Math.max(10, Math.ceil(Math.max(10, ...allVals) / 2) * 2 + 2);
    const tickCount = 7;
    const catHeight = chartH / Math.max(1, categories.length);
    const barH = Math.max(10, Math.min(20, (catHeight * 0.56) / Math.max(1, series.length)));
    const legendWidth = series.length * 100;
    const legendStartX = Math.max(leftPad, Math.round((500 - legendWidth) / 2));

    return (
      <svg viewBox={`0 0 500 ${svgH}`} className="w-full h-auto select-none font-sans">
        <rect width="500" height={svgH} fill="#ffffff" />
        {/* Y축 및 X축 실선 */}
        <line x1={leftPad} y1={topPad} x2={leftPad} y2={axisBottomY} stroke="#9ca3af" strokeWidth="1" />
        <line x1={leftPad} y1={axisBottomY} x2={leftPad + chartW} y2={axisBottomY} stroke="#9ca3af" strokeWidth="1" />
        {/* X축 눈금 */}
        {Array.from({ length: tickCount + 1 }, (_, i) => {
          const p = i / tickCount;
          const x = leftPad + chartW * p;
          const valLabel = Math.round(niceMax * p);
          return (
            <g key={i}>
              <line x1={x} y1={axisBottomY} x2={x} y2={axisBottomY + 4} stroke="#9ca3af" strokeWidth="1" />
              <text x={x} y={axisBottomY + 16} textAnchor="middle" fontSize="10" fill="#4b5563">
                {valLabel}
              </text>
            </g>
          );
        })}
        {/* 한컴 차트 표준: 아래에서 위로(0번 항목이 맨 아래) */}
        {categories.map((cat, cIdx) => {
          const revIdx = categories.length - 1 - cIdx;
          const catCenterY = topPad + revIdx * catHeight + catHeight / 2;
          const totalBarsH = series.length * barH + (series.length - 1) * 3;
          const startY = catCenterY - totalBarsH / 2;
          return (
            <g key={cIdx}>
              <line x1={leftPad - 4} y1={topPad + revIdx * catHeight} x2={leftPad} y2={topPad + revIdx * catHeight} stroke="#9ca3af" strokeWidth="1" />
              <text x={leftPad - 10} y={catCenterY + 4} textAnchor="end" fontSize="11" fill="#374151">
                {cat}
              </text>
              {series.map((ser, sIdx) => {
                const v = ser.values[cIdx] || 0;
                const barW = chartW * Math.min(1, v / niceMax);
                const by = startY + sIdx * (barH + 3);
                const sColor = ser.color || "#4472c4";
                return (
                  <rect key={sIdx} x={leftPad} y={by} width={Math.max(2, barW)} height={barH} fill={sColor} />
                );
              })}
            </g>
          );
        })}
        {/* 하단 중앙 범례 */}
        <g transform={`translate(${legendStartX}, ${axisBottomY + 28})`}>
          {series.map((ser, sIdx) => (
            <g key={sIdx} transform={`translate(${sIdx * 100}, 0)`}>
              <rect width="9" height="9" y="1" fill={ser.color || "#4472c4"} />
              <text x="14" y="9.5" fontSize="11" fill="#374151">
                {ser.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (chartType === "line") {
    const leftPad = 50;
    const rightPad = 40;
    const topPad = 35;
    const bottomPad = 50;
    const chartW = 500 - leftPad - rightPad;
    const chartH = 230 - topPad - bottomPad;
    const stepX = categories.length > 1 ? chartW / (categories.length - 1) : chartW / 2;

    return (
      <svg viewBox="0 0 500 230" className="w-full h-auto select-none font-sans">
        <rect width="500" height="230" fill="#fafafa" rx="8" />
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = topPad + chartH * (1 - p);
          const valLabel = Math.round(maxVal * p);
          return (
            <g key={i}>
              <line x1={leftPad} y1={y} x2={500 - rightPad} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={leftPad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {valLabel}
              </text>
            </g>
          );
        })}
        {categories.map((cat, i) => {
          const x = leftPad + (categories.length > 1 ? i * stepX : chartW / 2);
          return (
            <text key={i} x={x} y={230 - bottomPad + 18} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="500">
              {cat}
            </text>
          );
        })}
        {series.map((s, sIdx) => {
          const sColor = s.color || colors[sIdx % colors.length];
          const points = s.values.map((v, cIdx) => {
            const x = leftPad + (categories.length > 1 ? cIdx * stepX : chartW / 2);
            const y = topPad + chartH * (1 - Math.min(1, v / maxVal));
            return { x, y, v };
          });
          const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={sIdx}>
              <polyline fill="none" stroke={sColor} strokeWidth="2.5" points={polyPoints} />
              {points.map((p, pIdx) => (
                <g key={pIdx}>
                  <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke={sColor} strokeWidth="2.5" />
                  <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill={sColor}>
                    {p.v}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
        <g transform="translate(50, 16)">
          {series.map((s, sIdx) => (
            <g key={sIdx} transform={`translate(${sIdx * 100}, 0)`}>
              <circle cx="6" cy="6" r="5" fill={s.color || colors[sIdx % colors.length]} />
              <text x="16" y="10" fontSize="10" fill="#334155" fontWeight="600">
                {s.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  const leftPad = 50;
  const rightPad = 30;
  const topPad = 35;
  const bottomPad = 50;
  const chartW = 500 - leftPad - rightPad;
  const chartH = 230 - topPad - bottomPad;
  const catWidth = chartW / categories.length;
  const barW = Math.max(12, Math.min(32, (catWidth * 0.7) / series.length));

  return (
    <svg viewBox="0 0 500 230" className="w-full h-auto select-none font-sans">
      <rect width="500" height="230" fill="#fafafa" rx="8" />
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        const y = topPad + chartH * (1 - p);
        const valLabel = Math.round(maxVal * p);
        return (
          <g key={i}>
            <line x1={leftPad} y1={y} x2={500 - rightPad} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={leftPad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
              {valLabel}
            </text>
          </g>
        );
      })}
      {categories.map((cat, cIdx) => {
        const catCenterX = leftPad + cIdx * catWidth + catWidth / 2;
        const totalBarsW = series.length * barW + (series.length - 1) * 3;
        const startX = catCenterX - totalBarsW / 2;
        return (
          <g key={cIdx}>
            <text x={catCenterX} y={230 - bottomPad + 18} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="500">
              {cat}
            </text>
            {series.map((s, sIdx) => {
              const v = s.values[cIdx] || 0;
              const barH = chartH * Math.min(1, v / maxVal);
              const bx = startX + sIdx * (barW + 3);
              const by = topPad + chartH - barH;
              const sColor = s.color || colors[sIdx % colors.length];
              return (
                <g key={sIdx}>
                  <rect x={bx} y={by} width={barW} height={Math.max(2, barH)} rx="3" fill={sColor} />
                  <text x={bx + barW / 2} y={by - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#334155">
                    {v}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      <g transform="translate(50, 16)">
        {series.map((s, sIdx) => (
          <g key={sIdx} transform={`translate(${sIdx * 100}, 0)`}>
            <rect width="10" height="10" rx="2" fill={s.color || colors[sIdx % colors.length]} />
            <text x="16" y="9" fontSize="10" fill="#334155" fontWeight="600">
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ContentEditableParagraph({
  block,
  idx,
  sliceStart,
  sliceEnd,
  alignClass,
  fontSize,
  showParaMarks,
  inlineFlow,
  isCrossSelecting,
  onSelect,
  onChangeText,
  onSplit,
  onMergePrevious,
  onNavigatePrev,
  onNavigateNext,
  onIndent,
  onDragStart,
  onDragEnd,
}: {
  block: HwpxParagraphBlock;
  idx: number;
  sliceStart?: number;
  sliceEnd?: number;
  alignClass: string;
  fontSize: string;
  showParaMarks: boolean;
  inlineFlow?: boolean;
  isCrossSelecting?: boolean;
  onSelect: () => void;
  onChangeText: (text: string) => void;
  onSplit: (before: string, after: string) => void;
  onMergePrevious: () => void;
  onNavigatePrev: (clientX: number) => void;
  onNavigateNext: (clientX: number) => void;
  onIndent: (increase: boolean) => void;
  onDragStart?: (idx: number) => void;
  onDragEnd?: () => void;
}) {
  const pRef = useRef<HTMLParagraphElement>(null);
  const isComposingRef = useRef(false);
  const isSliced = sliceStart !== undefined || sliceEnd !== undefined;
  const displayText = isSliced
    ? (block.text || "").slice(sliceStart ?? 0, sliceEnd ?? (block.text || "").length)
    : (block.text || "");

  const serializeNoteParagraphDom = (el: HTMLElement): string => {
    if (!el.querySelector("sup[data-note-id], a[href], span[data-bookmark-name], b, strong, i, em, u, s, strike, span[style], font")) {
      return (el.innerText || "").replace(/\r?\n$/, "");
    }
    const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escTxt = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return escTxt(node.textContent || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const elem = node as HTMLElement;
      const tag = elem.tagName;
      if (tag === "BR") return "\n";
      if (tag === "SUP" && elem.dataset.noteId) {
        const nid = elem.dataset.noteId;
        const ntype = elem.dataset.noteType || "footnote";
        return `<sup data-note-id="${escAttr(nid)}" data-note-type="${escAttr(ntype)}">${escTxt(elem.textContent || "")}</sup>`;
      }
      if (tag === "A") {
        const href = elem.getAttribute("href") || "";
        if (href) {
          return `<a href="${escAttr(href)}">${escTxt(elem.textContent || "")}</a>`;
        }
      }
      if (tag === "SPAN" && elem.dataset.bookmarkName) {
        return `<span data-bookmark-name="${escAttr(elem.dataset.bookmarkName)}"></span>`;
      }
      const inner = Array.from(elem.childNodes).map(walk).join("");
      if (tag === "B" || tag === "STRONG") return inner ? `<b>${inner}</b>` : "";
      if (tag === "I" || tag === "EM") return inner ? `<i>${inner}</i>` : "";
      if (tag === "U") return inner ? `<u>${inner}</u>` : "";
      if (tag === "S" || tag === "STRIKE") return inner ? `<s>${inner}</s>` : "";
      if (tag === "FONT") {
        const st: string[] = [];
        const col = elem.getAttribute("color");
        const face = elem.getAttribute("face");
        if (col) st.push(`color:${col}`);
        if (face) st.push(`font-family:${face}`);
        return st.length && inner ? `<span style="${escAttr(st.join(";"))}">${inner}</span>` : inner;
      }
      if (tag === "SPAN") {
        const styleAttr = (elem.getAttribute("style") || "").trim();
        if (styleAttr && styleAttr.replace(/\s+/g, "") !== "white-space:nowrap" && styleAttr.replace(/\s+/g, "") !== "white-space:nowrap;") {
          return inner ? `<span style="${escAttr(styleAttr)}">${inner}</span>` : "";
        }
      }
      return inner;
    };
    return Array.from(el.childNodes).map(walk).join("").replace(/\r?\n$/, "");
  };

  // 외부(Yjs 동기화, 되돌리기(Undo)/다시 실행(Redo), 협업 동기화 등)에서 텍스트가 갱신되었을 때 DOM 동기화
  useLayoutEffect(() => {
    const el = pRef.current;
    if (!el) return;
    const currentDomText = serializeNoteParagraphDom(el);
    const targetText = displayText;
    // 이미 DOM 텍스트와 일치하면(예: 본인이 직접 타이핑한 직후) 커서 이동 방지를 위해 무시
    if (currentDomText === targetText) return;

    const sel = window.getSelection();
    const isFocusedHere = document.activeElement === el || Boolean(sel && sel.anchorNode && el.contains(sel.anchorNode));

    if (!targetText) {
      el.innerHTML = "<br>";
      if (isFocusedHere) {
        setCaretOffset(el, 0);
      }
    } else {
      const curOffset = isFocusedHere ? getCaretOffset(el) : 0;
      const esc = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const hasInlineStyleTags = /<(?:b|strong|i|em|u|s|strike|font|span\b[^>]*style=|sup\b[^>]*data-note-id=|a\b[^>]*href=|span\b[^>]*data-bookmark-name=)/i.test(targetText);
      const nowrapRe = /([^\s()]+\([^()\s]*|[^\s()/:]{1,12}(?:\/[^\s()/:]{1,12})+)/g;

      if (hasInlineStyleTags) {
        const parsed = new DOMParser().parseFromString(targetText.replace(/\n/g, "<br>"), "text/html").body;
        const sanitizeNode = (node: Node): string => {
          if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent || "");
          if (node.nodeType !== Node.ELEMENT_NODE) return "";
          const elem = node as HTMLElement;
          const tag = elem.tagName;
          if (tag === "BR") return "<br>";
          if (tag === "SUP" && elem.dataset.noteId) {
            return `<sup data-note-id="${esc(elem.dataset.noteId)}" data-note-type="${esc(elem.dataset.noteType || "footnote")}" title="클릭하여 각주/미주로 이동" style="font-size:0.72em;vertical-align:super;line-height:0;cursor:pointer;color:#0066cc;">${esc(elem.textContent || "")}</sup>`;
          }
          if (tag === "A" && elem.getAttribute("href")) {
            const hrefAttr = esc(elem.getAttribute("href") || "").replace(/"/g, "&quot;");
            return `<a href="${hrefAttr}" target="_blank" rel="noopener noreferrer" title="Ctrl+클릭으로 열기: ${hrefAttr}" style="color:#0066cc;text-decoration:underline;cursor:pointer;">${esc(elem.textContent || "")}</a>`;
          }
          if (tag === "SPAN" && elem.dataset.bookmarkName) {
            const bmAttr = esc(elem.dataset.bookmarkName).replace(/"/g, "&quot;");
            return `<span data-bookmark-name="${bmAttr}" title="책갈피: ${bmAttr}" style="display:inline-block;width:0;overflow:visible;vertical-align:baseline;pointer-events:none;"></span>`;
          }
          const inner = Array.from(elem.childNodes).map(sanitizeNode).join("");
          if (tag === "B" || tag === "STRONG") return `<b>${inner}</b>`;
          if (tag === "I" || tag === "EM") return `<i>${inner}</i>`;
          if (tag === "U") return `<u>${inner}</u>`;
          if (tag === "S" || tag === "STRIKE") return `<s>${inner}</s>`;
          if (tag === "SPAN") {
            const st = (elem.getAttribute("style") || "").replace(/"/g, "&quot;");
            return st ? `<span style="${st}">${inner}</span>` : inner;
          }
          return inner;
        };
        el.innerHTML = Array.from(parsed.childNodes).map(sanitizeNode).join("");
      } else {
        // 한컴 한글과 동일하게 "단어(괄호)" 및 짧은 "단어/단어" 어절이 중간에서 끊어지지 않도록 영속 텍스트는 유지한 채 해당 토큰만 nowrap 처리
        if (nowrapRe.test(targetText) && !targetText.includes("\n")) {
          nowrapRe.lastIndex = 0;
          el.innerHTML = esc(targetText).replace(nowrapRe, '<span style="white-space:nowrap">$1</span>');
        } else {
          el.innerText = targetText;
        }
      }
      if (isFocusedHere) {
        setCaretOffset(el, Math.min(curOffset, (el.innerText || "").length));
      }
    }
  }, [displayText]);

  const handleInput = () => {
    const el = pRef.current;
    if (!el) return;
    onChangeText(serializeNoteParagraphDom(el));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLParagraphElement>) => {
    if (e.key === "Process" || e.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const el = pRef.current;
      const { before, after } = getSplitText(el);
      if (el) {
        el.innerText = before || "";
      }
      onSplit(before, after);
      return;
    }

    if (e.key === "Backspace") {
      const el = pRef.current;
      if (isCaretAtStart(el)) {
        e.preventDefault();
        onMergePrevious();
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      onIndent(!e.shiftKey);
      return;
    }

    if (e.key === "ArrowUp") {
      const el = pRef.current;
      if (isCaretOnFirstLine(el)) {
        e.preventDefault();
        const pos = getCaretClientPosition();
        const x = pos ? pos.x : (el?.getBoundingClientRect().left ?? 0);
        onNavigatePrev(x);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      const el = pRef.current;
      if (isCaretOnLastLine(el)) {
        e.preventDefault();
        const pos = getCaretClientPosition();
        const x = pos ? pos.x : (el?.getBoundingClientRect().left ?? 0);
        onNavigateNext(x);
        return;
      }
    }

    if (e.key === "ArrowLeft") {
      const el = pRef.current;
      if (isCaretAtStart(el)) {
        e.preventDefault();
        onNavigatePrev(999999);
        return;
      }
    }

    if (e.key === "ArrowRight") {
      const el = pRef.current;
      if (isCaretAtEnd(el)) {
        e.preventDefault();
        onNavigateNext(0);
        return;
      }
    }
  };

  return (
    <div className={inlineFlow ? "inline relative group" : "w-full relative group"}>
      {/* 문단 좌측 드래그 핸들 (호버 시 표시, 드래그하여 문단 순서 이동) */}
      <button
        type="button"
        contentEditable={false}
        draggable={true}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData("application/x-hwpx-block", String(idx));
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.(idx);
        }}
        onDragEnd={() => onDragEnd?.()}
        className="absolute -left-6 top-1 w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-700 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity rounded-xs select-none"
        title="드래그하여 문단 순서 이동"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      <p
        ref={pRef}
        contentEditable={isCrossSelecting ? undefined : true}
        data-block-idx={idx}
        suppressContentEditableWarning={true}
        spellCheck={false}
        onFocus={onSelect}
        onClick={(e) => {
          onSelect();
          const linkEl = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
          if (linkEl) {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
              e.preventDefault();
              e.stopPropagation();
              const href = linkEl.getAttribute("href");
              if (href) {
                if (/^mailto:/i.test(href)) {
                  window.location.href = href;
                } else {
                  window.open(href, "_blank", "noopener,noreferrer");
                }
              }
              return;
            }
          }
          const supEl = (e.target as HTMLElement | null)?.closest?.("sup[data-note-id]") as HTMLElement | null;
          const noteId = supEl?.dataset?.noteId;
          if (noteId) {
            e.stopPropagation();
            const noteInput = document.querySelector<HTMLInputElement>(`[data-note-input="${noteId}"]`);
            if (noteInput) {
              noteInput.scrollIntoView({ behavior: "smooth", block: "center" });
              noteInput.focus();
              flashNoteHighlight(noteInput.closest<HTMLElement>("[data-note-row]") || noteInput);
            }
          }
        }}
        onInput={handleInput}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        className={`${inlineFlow ? "inline" : "w-full min-h-[1.5em]"} p-0 leading-relaxed outline-none whitespace-pre-wrap break-words cursor-text ${alignClass} ${showParaMarks ? "after:content-['↵'] after:text-[#0066cc] after:text-[11px] after:font-sans after:opacity-90 after:ml-0.5 after:select-none after:pointer-events-none" : ""
          }`}
        style={{
          fontSize: `${((block.sizePt || 10) * ((block.relativeSizePct ?? 100) / 100)).toFixed(2)}pt`,
          fontWeight: "normal",
          textShadow: block.bold ? "0.42px 0 0 currentColor, -0.15px 0 0 currentColor" : undefined,
          fontStyle: block.italic ? "italic" : "normal",
          textDecoration:
            [block.underline ? "underline" : "", block.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none",
          color: block.color || "#111827",
          backgroundColor: block.paraBgColor || block.shadingColor || undefined,
          fontFamily: block.fontFamily || "'HCR Batang', '함초롬바탕', 'Batang', 'Nanum Myeongjo', 'Noto Serif KR', serif",
          lineHeight: block.lineSpacingPct ? block.lineSpacingPct / 100 : 1.6,
          paddingLeft:
            (block.marginLeftPt || 0) + (block.firstLineType === "outdent" ? block.firstLinePt || 0 : 0) > 0
              ? `${(block.marginLeftPt || 0) + (block.firstLineType === "outdent" ? block.firstLinePt || 0 : 0)}pt`
              : undefined,
          paddingRight: block.marginRightPt ? `${block.marginRightPt}pt` : undefined,
          textIndent:
            block.firstLineType === "indent" && block.firstLinePt
              ? `${block.firstLinePt}pt`
              : block.firstLineType === "outdent" && block.firstLinePt
                ? `-${block.firstLinePt}pt`
                : undefined,
          marginTop: block.spaceBeforePt ? `${block.spaceBeforePt}pt` : undefined,
          marginBottom: block.spaceAfterPt ? `${block.spaceAfterPt}pt` : undefined,
          border:
            block.paraBorderType && block.paraBorderType !== "없음"
              ? `max(1px, ${block.paraBorderWidth || "0.1mm"}) ${block.paraBorderType === "점선" ? "dotted" : block.paraBorderType === "파선" ? "dashed" : "solid"
              } ${block.paraBorderColor || "#000000"}`
              : undefined,
          letterSpacing: block.letterSpacingPct
            ? `${block.letterSpacingPct * 0.01}em`
            : (!block.fontFamily || /HCR Batang|함초롬바탕/i.test(block.fontFamily)
              ? "0.02em"
              : (/Gulim|굴림/i.test(block.fontFamily) ? "-0.025em" : undefined)),
          wordSpacing: !block.fontFamily || /HCR Batang|함초롬바탕/i.test(block.fontFamily)
            ? "0.07em"
            : undefined,
          width: block.charWidthPct && block.charWidthPct !== 100 ? `${10000 / block.charWidthPct}%` : undefined,
          transform: block.charWidthPct && block.charWidthPct !== 100 ? `scaleX(${block.charWidthPct / 100})` : undefined,
          transformOrigin: block.charWidthPct && block.charWidthPct !== 100 ? "left top" : undefined,
          position: block.charPosPct ? "relative" : undefined,
          top: block.charPosPct ? `${-block.charPosPct * 0.01}em` : undefined,
          textJustify: block.align === "justify" ? "auto" : undefined,
          wordBreak: "keep-all",
          overflowWrap: "break-word",
        }}
      />
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class HwpxEditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[HwpxEditor] 에디터 렌더링 오류 감지 및 복구:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-300 p-6 max-w-md w-full flex flex-col items-center gap-3.5 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl font-bold">
              !
            </div>
            <h3 className="text-base font-bold text-neutral-800">에디터 렌더링 중 오류가 발생했습니다</h3>
            <p className="text-xs text-neutral-600 bg-neutral-100 p-2.5 rounded border border-neutral-200 font-mono text-left w-full break-all max-h-32 overflow-y-auto">
              {this.state.error?.message}
            </p>
            <div className="flex gap-2 w-full pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2 bg-[#0066cc] text-white text-xs font-semibold rounded hover:bg-[#0055aa] transition cursor-pointer"
              >
                에디터 다시 시도
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}



const CHAR_MAP_CATEGORIES: { name: string; chars: string[] }[] = [
  { name: "일반 문장 부호", chars: ["–","—","―","‘","’","‚","“","”","„","†","‡","•","‥","…","‰","′","″","‹","›","※","·","¡","¿","§","¶","〃","々","〜","‖","ː"] },
  { name: "기호1", chars: ["★","☆","○","●","◎","◇","◆","□","■","△","▲","▽","▼","♠","♤","♥","♡","♣","♧","◈","▣","◐","◑","♨","☏","☎","☜","☞","♩","♪","♫","♬","♭","♯"] },
  { name: "기호2", chars: ["♂","♀","☈","☀","☁","☂","☃","☄","☼","☽","☾","♦","✓","✔","✕","✖","✗","✘","✚","✡","✦","✧","✩","✪","✫","✬","✭","✮","✯"] },
  { name: "통화 기호", chars: ["₩","$","¢","£","¤","¥","€","฿","₡","₫","₭","₮","₱","₲","₴","₵","₸","₹","₺","₽","₿"] },
  { name: "글자 모양 기호", chars: ["©","®","™","℠","℗","℡","№","㈜","㈲","㉿","ª","º","℃","℉","Å","ℓ","Ω","℮","℧","℀","℁","℅","℆"] },
  { name: "숫자 형식", chars: ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ","Ⅸ","Ⅹ","Ⅺ","Ⅻ","ⅰ","ⅱ","ⅲ","ⅳ","ⅴ","ⅵ","ⅶ","ⅷ","ⅸ","ⅹ","ⅺ","ⅻ","½","⅓","⅔","¼","¾","⅕","⅖","⅗","⅘","⅙","⅚","⅛","⅜","⅝","⅞"] },
  { name: "화살표", chars: ["←","↑","→","↓","↔","↕","↖","↗","↘","↙","⇐","⇑","⇒","⇓","⇔","⇕","➔","➜","➝","➞","➡","➢","➣","➤","➥","➦","↩","↪","↺","↻"] },
  { name: "괄호", chars: ["(",")","[","]","{","}","〈","〉","《","》","「","」","『","』","【","】","〔","〕","〖","〗","〘","〙","〚","〛","〝","〞","＂","＇"] },
  { name: "수학 연산자", chars: ["+","-","×","÷","±","∓","=","≠","≒","≡","≢","<",">","≤","≥","≪","≫","∝","∞","√","∛","∜","∑","∏","∫","∬","∮","∂","∇","∆","∈","∉","∋","⊂","⊃","⊆","⊇","∪","∩","∅","∀","∃","∧","∨","¬","∴","∵","∠","⊥","∥","°"] },
  { name: "그리스어", chars: ["Α","Β","Γ","Δ","Ε","Ζ","Η","Θ","Ι","Κ","Λ","Μ","Ν","Ξ","Ο","Π","Ρ","Σ","Τ","Υ","Φ","Χ","Ψ","Ω","α","β","γ","δ","ε","ζ","η","θ","ι","κ","λ","μ","ν","ξ","ο","π","ρ","σ","ς","τ","υ","φ","χ","ψ","ω"] },
  { name: "단위기호", chars: ["㎜","㎝","㎞","㎟","㎠","㎡","㎢","㎥","㎎","㎏","㎖","㎗","ℓ","㏄","㎐","㎑","㎒","㎓","㎔","㎾","㎿","㎷","㎸","㎃","㏊","㏈","㏎","㏏","℃","℉","%","‰","°"] },
  { name: "원문자", chars: ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳","ⓐ","ⓑ","ⓒ","ⓓ","ⓔ","ⓕ","ⓖ","ⓗ","ⓘ","ⓙ","Ⓐ","Ⓑ","Ⓒ","Ⓓ","Ⓔ","Ⓕ","Ⓖ","Ⓗ","Ⓘ","Ⓙ","㉠","㉡","㉢","㉣","㉤","㉥","㉦","㉧","㉨","㉩","㉪","㉫","㉬","㉭","㉮","㉯","㉰","㉱","㉲","㉳","㉴","㉵","㉶","㉷","㉸","㉹","㉺","㉻"] },
  { name: "괄호문자", chars: ["⑴","⑵","⑶","⑷","⑸","⑹","⑺","⑻","⑼","⑽","⑾","⑿","⒀","⒁","⒂","⒜","⒝","⒞","⒟","⒠","⒡","⒢","⒣","⒤","⒥","㈀","㈁","㈂","㈃","㈄","㈅","㈆","㈇","㈈","㈉","㈊","㈋","㈌","㈍","㈎","㈏","㈐","㈑","㈒","㈓","㈔","㈕","㈖","㈗","㈘","㈙","㈚","㈛"] },
  { name: "상자 그리기", chars: ["─","━","│","┃","┌","┏","┐","┓","└","┗","┘","┛","├","┣","┤","┫","┬","┳","┴","┻","┼","╋","═","║","╔","╗","╚","╝","╠","╣","╦","╩","╬","╭","╮","╯","╰"] },
  { name: "도형", chars: ["■","□","▢","▣","▤","▥","▦","▧","▨","▩","▪","▫","▬","▭","▮","▯","▲","△","▶","▷","▼","▽","◀","◁","◆","◇","◈","◉","◊","○","◌","◍","◎","●","◐","◑","◒","◓"] },
];

function flashNoteHighlight(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return;
  el.animate(
    [
      { backgroundColor: "#fde047", boxShadow: "0 0 0 3px rgba(250, 204, 21, 0.55)", borderRadius: "3px" },
      { backgroundColor: "transparent", boxShadow: "0 0 0 0 rgba(250, 204, 21, 0)" },
      { backgroundColor: "#fde047", boxShadow: "0 0 0 3px rgba(250, 204, 21, 0.55)", borderRadius: "3px" },
      { backgroundColor: "transparent", boxShadow: "0 0 0 0 rgba(250, 204, 21, 0)" },
    ],
    { duration: 1100, easing: "ease-in-out" }
  );
}

function parseWebVideoSource(raw: string): { kind: "iframe" | "video"; embedUrl: string; thumbUrl?: string; originalUrl: string } | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  let url = trimmed;
  const iframeSrcMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeSrcMatch) url = iframeSrcMatch[1];
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  if (ytMatch) {
    const vid = ytMatch[1];
    return {
      kind: "iframe",
      embedUrl: `https://www.youtube.com/embed/${vid}?autoplay=1`,
      thumbUrl: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
      originalUrl: url,
    };
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch) {
    return {
      kind: "iframe",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`,
      originalUrl: url,
    };
  }
  // Direct video file
  if (/\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url)) {
    return { kind: "video", embedUrl: url, originalUrl: url };
  }
  return { kind: "iframe", embedUrl: url, originalUrl: url };
}

interface PageMemoItem {
  id: string;
  blockId: string;
  author: string;
  createdAt: string;
  text: string;
}

function PageMemoLane({
  pageIdx,
  pageMemos,
  allMemos,
  showPageOutline,
  showMemoGuides,
  activeMemoId,
  setActiveMemoId,
  updateMemoText,
  deleteMemo,
  zoomPercent,
  columnLayout,
  blocksLength,
}: {
  pageIdx: number;
  pageMemos: PageMemoItem[];
  allMemos: PageMemoItem[];
  showPageOutline: boolean;
  showMemoGuides: boolean;
  activeMemoId: string | null;
  setActiveMemoId: (id: string | null) => void;
  updateMemoText: (id: string, text: string) => void;
  deleteMemo: (id: string) => void;
  zoomPercent: number;
  columnLayout: string;
  blocksLength: number;
}) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [tops, setTops] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    if (!showPageOutline || pageMemos.length === 0) return;
    const lane = laneRef.current;
    const pageEl = lane?.closest(`[data-page-idx="${pageIdx}"]`) as HTMLElement | null;
    if (!pageEl) return;
    const pageR = pageEl.getBoundingClientRect();
    const scale = Math.max(0.1, zoomPercent / 100);

    const measured = pageMemos.map((m, i) => {
      const blkEl = pageEl.querySelector(`[data-block-id="${m.blockId}"]`) as HTMLElement | null;
      const desiredTop = blkEl ? Math.max(0, Math.round((blkEl.getBoundingClientRect().top - pageR.top) / scale)) : i * 96;
      return { id: m.id, desiredTop };
    });
    measured.sort((a, b) => a.desiredTop - b.desiredTop);

    const nextTops: Record<string, number> = {};
    let minNextTop = 0;
    for (const item of measured) {
      const cardEl = lane?.querySelector(`[data-memo-card="${item.id}"]`) as HTMLElement | null;
      const cardH = cardEl ? cardEl.offsetHeight : 84;
      const placedTop = Math.max(item.desiredTop, minNextTop);
      nextTops[item.id] = placedTop;
      minNextTop = placedTop + cardH + 8;
    }
    setTops(nextTops);
  }, [pageIdx, pageMemos, showPageOutline, zoomPercent, columnLayout, blocksLength]);

  if (pageMemos.length === 0) return null;

  if (!showPageOutline) {
    return (
      <div
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="mt-3 ml-auto flex flex-col gap-2 w-[210px] select-none"
      >
        {pageMemos.map((memo) => {
          const memoNumber = allMemos.findIndex((m) => m.id === memo.id) + 1;
          return (
            <div
              key={memo.id}
              data-memo-card={memo.id}
              className="border border-neutral-800 shadow-md rounded-[1px] overflow-hidden text-[11px] font-sans"
            >
              <div className="bg-[#a6c8e8] border-b border-neutral-800 px-1.5 py-0.5 flex items-center justify-between gap-1 text-[10px] text-neutral-900">
                <span className="font-semibold truncate">[메모:{memoNumber}] {memo.author}</span>
                <span className="flex items-center gap-1 shrink-0 text-[9px] text-neutral-800">
                  <span>{memo.createdAt}</span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => deleteMemo(memo.id)}
                    title="메모 지우기"
                    className="hover:text-red-700 font-bold leading-none px-0.5 cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <div className="bg-[#ffffa5] p-1.5">
                <textarea
                  autoFocus={activeMemoId === memo.id}
                  value={memo.text}
                  onChange={(e) => updateMemoText(memo.id, e.target.value)}
                  onFocus={() => setActiveMemoId(memo.id)}
                  placeholder="메모 내용을 입력하세요..."
                  rows={Math.max(2, memo.text.split("\n").length)}
                  className="w-full bg-transparent border-none outline-none resize-none text-[11px] leading-snug text-neutral-900 placeholder:text-neutral-500"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={laneRef}
      data-page-memo-lane={pageIdx}
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 left-[calc(100%+18px)] z-40 select-none pointer-events-auto"
      style={{ width: "210px" }}
    >
      {pageMemos.map((memo, i) => {
        const memoNumber = allMemos.findIndex((m) => m.id === memo.id) + 1;
        const topPx = tops[memo.id] ?? i * 96;
        return (
          <div
            key={memo.id}
            data-memo-card={memo.id}
            className="absolute left-0 right-0 border border-neutral-800 shadow-md rounded-[1px] text-[11px] font-sans bg-[#ffffa5]"
            style={{ top: `${topPx}px` }}
          >
            {showMemoGuides && (
              <div
                aria-hidden="true"
                className="absolute right-full top-3 h-[1px] bg-neutral-700 pointer-events-none"
                style={{ width: "18px" }}
              />
            )}
            <div className="bg-[#a6c8e8] border-b border-neutral-800 px-1.5 py-0.5 flex items-center justify-between gap-1 text-[10px] text-neutral-900">
              <span className="font-semibold truncate">
                [메모:{memoNumber}] {memo.author}
              </span>
              <span className="flex items-center gap-1 shrink-0 text-[9px] text-neutral-800">
                <span>{memo.createdAt}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => deleteMemo(memo.id)}
                  title="메모 지우기"
                  className="hover:text-red-700 font-bold leading-none px-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="bg-[#ffffa5] p-1.5">
              <textarea
                autoFocus={activeMemoId === memo.id}
                value={memo.text}
                onChange={(e) => updateMemoText(memo.id, e.target.value)}
                onFocus={() => setActiveMemoId(memo.id)}
                placeholder="메모 내용을 입력하세요..."
                rows={Math.max(2, memo.text.split("\n").length)}
                className="w-full bg-transparent border-none outline-none resize-none text-[11px] leading-snug text-neutral-900 placeholder:text-neutral-500"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HwpxEditorModal({
  projectId,
  file,
  room,
  mode,
  rawHwpxBytes,
  initialSampleNotes,
  initialSampleBlocks,
  initialSampleMemos,
  presence,
  editors,
  save,
  onClose,
}: {
  projectId: string;
  file: WorkspaceFile;
  room: number;
  mode: CollabMode;
  rawHwpxBytes: Uint8Array;
  initialSampleNotes?: Array<{
    kind: "footnote" | "endnote";
    id: string;
    anchorText: string;
    noteText: string;
  }>;
  initialSampleBlocks?: Array<{
    anchorText: string;
    block: HwpxCollabBlock;
  }>;
  initialSampleMemos?: Array<{
    anchorText: string;
    author?: string;
    text: string;
  }>;
  presence: CollabPresence;
  editors: CollabEditor[];
  save: (bytes: Uint8Array, text: string, baseVersionId: number, auto: boolean) => Promise<number>;
  onClose: () => void;
}) {
  const [zipEntries, setZipEntries] = useState<Map<string, Uint8Array> | null>(null);
  const [originalXml, setOriginalXml] = useState("");
  const [originalHeaderXml, setOriginalHeaderXml] = useState("");
  const [initialBlocks, setInitialBlocks] = useState<HwpxCollabBlock[] | null>(null);

  // 1. HWPX 원본 파싱 및 초기 블록 추출 (header.xml 스타일 동시 분석)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const entries = await readZipEntries(rawHwpxBytes);
        const secKey = Array.from(entries.keys()).find((k) => /^Contents\/section0\.xml$/i.test(k)) ?? "Contents/section0.xml";
        const secBytes = entries.get(secKey);
        const xml = secBytes ? new TextDecoder().decode(secBytes) : "";

        const headerKey = Array.from(entries.keys()).find((k) => /^Contents\/header\.xml$/i.test(k));
        const headerBytes = headerKey ? entries.get(headerKey) : undefined;
        const headerXml = headerBytes ? new TextDecoder().decode(headerBytes) : "";

        const imageMap = extractHwpxImageMap(entries);
        const blocks = parseHwpxXmlToBlocks(xml, headerXml, imageMap);
        if (initialSampleBlocks && initialSampleBlocks.length > 0) {
          for (const item of initialSampleBlocks) {
            if (blocks.some((b) => b.id === item.block.id)) continue;
            const anchorIdx = blocks.findIndex(
              (b) => b.type === "paragraph" && b.text.includes(item.anchorText)
            );
            if (anchorIdx !== -1) {
              blocks.splice(anchorIdx + 1, 0, item.block);
            } else {
              blocks.push(item.block);
            }
          }
        }
        if (
          initialSampleNotes &&
          initialSampleNotes.length > 0 &&
          !blocks.some((b) => b.id.startsWith("footnote-") || b.id.startsWith("endnote-"))
        ) {
          let fnNum = 0;
          let enNum = 0;
          for (const n of initialSampleNotes) {
            const targetBlk = blocks.find(
              (b): b is HwpxParagraphBlock => b.type === "paragraph" && b.text.includes(n.anchorText)
            );
            if (!targetBlk) continue;
            const num = n.kind === "footnote" ? ++fnNum : ++enNum;
            const sup = `<sup data-note-id="${n.id}" data-note-type="${n.kind}">${num})</sup>`;
            targetBlk.text = targetBlk.text.replace(n.anchorText, `${n.anchorText}${sup}`);
            blocks.push({
              id: n.id,
              type: "paragraph",
              text: n.noteText,
              sizePt: 9,
              align: "left",
              fontFamily: targetBlk.fontFamily,
            });
          }
        }
        if (active) {
          setZipEntries(entries);
          setOriginalXml(xml);
          setOriginalHeaderXml(headerXml);
          setInitialBlocks(blocks);
        }
      } catch (e) {
        console.error("HWPX 로딩 오류:", e);
      }
    })();
    return () => { active = false; };
  }, [rawHwpxBytes]);

  if (!initialBlocks || !zipEntries) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center text-sm" style={{ background: "rgba(15,18,53,0.6)", color: "#fff" }}>
        한글 문서를 동시편집 모드로 불러오는 중…
      </div>
    );
  }

  return (
    <HwpxEditorErrorBoundary>
      <HwpxEditorModalInner
        projectId={projectId}
        file={file}
        room={room}
        mode={mode}
        zipEntries={zipEntries}
        originalXml={originalXml}
        originalHeaderXml={originalHeaderXml}
        initialBlocks={initialBlocks}
        initialSampleMemos={initialSampleMemos}
        presence={presence}
        editors={editors}
        save={save}
        onClose={onClose}
      />
    </HwpxEditorErrorBoundary>
  );
}

/**
 * Y.Map 형태의 블록을 deep clone하여 새로운 독립적인 Y.Map 인스턴스로 반환
 * (Yjs 문서 내 블록 순서 이동 시 'already integrated' 에러 방지)
 */
function cloneYBlock(source: Y.Map<unknown>): Y.Map<unknown> {
  const target = new Y.Map<unknown>();
  source.forEach((val, key) => {
    if (val instanceof Y.Text) {
      target.set(key, new Y.Text(val.toString()));
    } else if (val instanceof Y.Array) {
      const newArray = new Y.Array<unknown>();
      val.forEach((item) => {
        if (item instanceof Y.Array) {
          const innerArray = new Y.Array<unknown>();
          item.forEach((cell) => {
            if (cell instanceof Y.Map) {
              innerArray.push([cloneYBlock(cell as Y.Map<unknown>)]);
            } else {
              innerArray.push([cell]);
            }
          });
          newArray.push([innerArray]);
        } else if (item instanceof Y.Map) {
          newArray.push([cloneYBlock(item as Y.Map<unknown>)]);
        } else {
          newArray.push([item]);
        }
      });
      target.set(key, newArray);
    } else if (val instanceof Y.Map) {
      target.set(key, cloneYBlock(val as Y.Map<unknown>));
    } else {
      target.set(key, val);
    }
  });
  return target;
}

function HwpxEditorModalInner({
  projectId,
  file,
  room,
  mode,
  zipEntries,
  originalXml,
  originalHeaderXml,
  initialBlocks,
  initialSampleMemos,
  presence,
  editors,
  save,
  onClose,
}: {
  projectId: string;
  file: WorkspaceFile;
  room: number;
  mode: CollabMode;
  zipEntries: Map<string, Uint8Array>;
  originalXml: string;
  originalHeaderXml: string;
  initialBlocks: HwpxCollabBlock[];
  initialSampleMemos?: Array<{ anchorText: string; author?: string; text: string }>;
  presence: CollabPresence;
  editors: CollabEditor[];
  save: (bytes: Uint8Array, text: string, baseVersionId: number, auto: boolean) => Promise<number>;
  onClose: () => void;
}) {
  // Yjs 상태 바이트를 생성하여 useCollabFile에 공급 (모든 참여자가 고정 clientID=1로 초기화하여 CRDT 중복 시드 방지)
  const [seedBytes] = useState(() => {
    const seed = new Y.Doc();
    seed.clientID = 1;
    initHwpxYDoc(seed, initialBlocks);
    const parsedMemos = extractMemosFromHwpxXml(originalXml);
    if (parsedMemos.length > 0) {
      const yMemos = seed.getArray<Y.Map<unknown>>("hwpx_memos");
      seed.transact(() => {
        parsedMemos.forEach((pm) => {
          const yMemo = new Y.Map<unknown>();
          yMemo.set("id", pm.id);
          yMemo.set("blockId", pm.blockId);
          yMemo.set("author", pm.author);
          yMemo.set("createdAt", pm.createdAt);
          yMemo.set("text", pm.text);
          yMemos.push([yMemo]);
        });
      });
    } else if (initialSampleMemos && initialSampleMemos.length > 0) {
      const yMemos = seed.getArray<Y.Map<unknown>>("hwpx_memos");
      seed.transact(() => {
        initialSampleMemos.forEach((sm, idx) => {
          const target = initialBlocks.find((b) => b.type === "paragraph" && (b.text || "").includes(sm.anchorText));
          if (!target) return;
          const yMemo = new Y.Map<unknown>();
          yMemo.set("id", `memo_sample_${idx + 1}`);
          yMemo.set("blockId", target.id);
          yMemo.set("author", sm.author || "작성자");
          yMemo.set("createdAt", "2026-11-24 02:36");
          yMemo.set("text", sm.text);
          yMemo.set("anchorText", sm.anchorText);
          yMemos.push([yMemo]);
        });
      });
    }
    return Y.encodeStateAsUpdate(seed);
  });

  const [editorFonts, setEditorFonts] = useState<EditorFontItem[]>(getAllEditorFonts);
  const [showAddFontModal, setShowAddFontModal] = useState(false);

  useEffect(() => {
    injectAllWebFonts();
    const onFontsChanged = () => setEditorFonts(getAllEditorFonts());
    window.addEventListener("editor-fonts-changed", onFontsChanged);
    return () => window.removeEventListener("editor-fonts-changed", onFontsChanged);
  }, []);

  const {
    doc,
    status,
    statusText,
    error,
    dirty,
    runSave,
    confirmClose,
    requestClose,
    saveAndClose,
    discardAndClose,
    keepEditing,
  } = useCollabFile({
    projectId,
    fileId: file.id,
    room,
    mode,
    initialBytes: seedBytes,
    presence,
    keyOf: hwpxCollabKey,
    textOf: hwpxCollabText,
    save: async (_bytes, text, baseVersionId, auto) => {
      // Y.Doc의 최신 블록 트리로부터 OWPML XML 및 Header XML을 재직렬화하여 HWPX ZIP 생성
      const currentBlocks = applyVisualCompOffsets(extractBlocksFromYDoc(doc));
      const { sectionXml: newSectionXml, headerXml: newHeaderXml, chartFiles: newChartFiles, binDataFiles: newBinDataFiles } = serializeBlocksToHwpxPackage(
        currentBlocks,
        originalXml,
        originalHeaderXml,
        {
          pageWidthMm,
          marginLeftMm: pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0),
          marginRightMm: pageMarginRightMm,
          memos: extractMemosFromYDoc(doc),
        }
      );

      const newEntries = prepareHwpxPackageEntries(zipEntries, newSectionXml, newHeaderXml, newChartFiles, newBinDataFiles);
      const updatedHwpxBytes = await writeZipEntries(newEntries);
      return save(updatedHwpxBytes, text, baseVersionId, auto);
    },
  });

  // 문단 줄바꿈 높이 증가로 인해 DOM에서 보정된 시각 위치(data-tb-comp-y)를 HWPX 저장/내보내기 오프셋에 반영
  const applyVisualCompOffsets = (rawBlocks: ReturnType<typeof extractBlocksFromYDoc>): ReturnType<typeof extractBlocksFromYDoc> => {
    const root = canvasRef.current;
    if (!root) return rawBlocks;
    return rawBlocks.map((b, idx) => {
      if ((b.type === "table" || b.type === "image" || b.type === "shape" || b.type === "chart") && b.treatAsChar === false) {
        const box = root.querySelector<HTMLElement>(`[data-block-idx="${idx}"] .hwpx-resizable-box`);
        const compY = Number(box?.getAttribute("data-tb-comp-y") || "0");
        if (compY !== 0) {
          return { ...b, offsetY: (b.offsetY || 0) + compY };
        }
      }
      return b;
    });
  };

  // 편집기 내에서 바로 수정된 최신 HWPX 파일 즉시 다운로드
  const handleDirectDownload = async (overrideFileName?: string) => {
    try {
      // 현재 포커스된 contenteditable이 있다면 blur시켜 마지막 입력 텍스트를 Y.Doc에 즉각 커밋
      if (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) {
        document.activeElement.blur();
      }

      const currentBlocks = applyVisualCompOffsets(extractBlocksFromYDoc(doc));
      const { sectionXml: newSectionXml, headerXml: newHeaderXml, chartFiles: newChartFiles, binDataFiles: newBinDataFiles } = serializeBlocksToHwpxPackage(
        currentBlocks,
        originalXml,
        originalHeaderXml,
        {
          pageWidthMm,
          marginLeftMm: pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0),
          marginRightMm: pageMarginRightMm,
          memos: extractMemosFromYDoc(doc),
        }
      );

      const newEntries = prepareHwpxPackageEntries(zipEntries, newSectionXml, newHeaderXml, newChartFiles, newBinDataFiles);
      const updatedHwpxBytes = await writeZipEntries(newEntries);

      const blob = new Blob([new Uint8Array(updatedHwpxBytes)], { type: HWPX_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const targetName = overrideFileName || docTitle || file.name;
      link.download = targetName.endsWith(".hwpx") ? targetName : `${targetName}.hwpx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      // 워크스페이스에도 백그라운드 저장 실행
      void runSave();
    } catch (e) {
      console.error("HWPX 다운로드 실패:", e);
    }
  };

  // 로컬 렌더링용 블록 상태 (Y.Doc의 변경에 실시간 반응)
  const [blocks, setBlocks] = useState<HwpxCollabBlock[]>(() => extractBlocksFromYDoc(doc));
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [showTableModal, setShowTableModal] = useState(false);
  const [newTableRows, setNewTableRows] = useState(5);
  const [newTableCols, setNewTableCols] = useState(5);
  const [newTableWidthMode, setNewTableWidthMode] = useState<"fit" | "custom">("fit");
  const [newTableWidthMm, setNewTableWidthMm] = useState(148.0);
  const [newTableHeightMode, setNewTableHeightMode] = useState<"auto" | "custom">("auto");
  const [newTableHeightMm, setNewTableHeightMm] = useState(22.6);
  const [newTableTreatAsChar, setNewTableTreatAsChar] = useState(false);
  const [showRibbonShapeMenu, setShowRibbonShapeMenu] = useState(false);
  const [ribbonPopup, setRibbonPopup] = useState<{ kind: "search" | "shape" | "table" | "chart" | "text-color" | "highlight"; left: number; top: number } | null>(null);
  const [hoverTableGrid, setHoverTableGrid] = useState<{ r: number; c: number } | null>(null);
  const [pendingDrawShape, setPendingDrawShape] = useState<"textbox" | "rect" | "ellipse" | "line" | "arc" | null>(null);
  const [showImageInsertModal, setShowImageInsertModal] = useState(false);
  const [imgInsertSourceType, setImgInsertSourceType] = useState<"device" | "url">("device");
  const [imgInsertFileName, setImgInsertFileName] = useState("");
  const [imgInsertDataUrl, setImgInsertDataUrl] = useState("");
  const [imgInsertUrl, setImgInsertUrl] = useState("");
  const [imgInsertTreatAsChar, setImgInsertTreatAsChar] = useState(true);
  const [imgInsertSizeByMouse, setImgInsertSizeByMouse] = useState(false);
  const [pendingDrawImage, setPendingDrawImage] = useState<{ src: string; caption?: string; treatAsChar: boolean } | null>(null);
  const drawDragStartRef = useRef<{ x: number; y: number; afterIdx: number; pageWidth: number } | null>(null);
  const pendingDrawScrollTopRef = useRef<number | null>(null);
  const [drawPreviewRect, setDrawPreviewRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);

  // 차트 모달 및 편집 상태
  const [showChartModal, setShowChartModal] = useState(false);
  const [showWebVideoModal, setShowWebVideoModal] = useState(false);
  const [webVideoInput, setWebVideoInput] = useState("");
  const [playingVideoIds, setPlayingVideoIds] = useState<Record<string, boolean>>({});
  const [selectedChartType, setSelectedChartType] = useState<"column" | "bar" | "line" | "pie">("column");
  const [chartTitleInput, setChartTitleInput] = useState("[차트 1] 분기별 경영 실적 분석");
  const [showChartDataModal, setShowChartDataModal] = useState(false);
  const [chartEditingIdx, setChartEditingIdx] = useState<number | null>(null);

  // 한컴 고급 기능 모달 상태
  const [showFormatCopyModal, setShowFormatCopyModal] = useState(false);
  const [showTextConvertModal, setShowTextConvertModal] = useState(false);
  const [showHyperlinkModal, setShowHyperlinkModal] = useState(false);
  const [hyperlinkInitialText, setHyperlinkInitialText] = useState("");
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [bulletNumberModalTab, setBulletNumberModalTab] = useState<"bullet" | "number" | null>(null);
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showAutoTextModal, setShowAutoTextModal] = useState(false);
  const [showPageNumberModal, setShowPageNumberModal] = useState(false);
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTableCalcModal, setShowTableCalcModal] = useState(false);
  const [showSpellCheckModal, setShowSpellCheckModal] = useState(false);

  // 쪽 및 조판 상태
  const [pageNumberPos, setPageNumberPos] = useState<"bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "none">("none");
  const [headerPos, setHeaderPos] = useState<"none" | "left" | "center" | "right">("none");
  const [footerPos, setFooterPos] = useState<"none" | "left" | "center" | "right">("none");
  const [watermarkText, setWatermarkText] = useState("");
  const [columnCount, setColumnCount] = useState<1 | 2 | 3>(1);
  const [columnSectionLayouts, setColumnSectionLayouts] = useState<Record<number, "1" | "2" | "3" | "left" | "right">>({});
  const [activeColIdx, setActiveColIdx] = useState<number>(0);
  const [pageNumberStartOverrides, setPageNumberStartOverrides] = useState<Record<number, number>>({});
  const [hiddenPageElements, setHiddenPageElements] = useState<Record<number, { header?: boolean; footer?: boolean; pageNumber?: boolean; border?: boolean; background?: boolean }>>({});
  const [showNewPageNumModal, setShowNewPageNumModal] = useState(false);
  const [draftNewPageNum, setDraftNewPageNum] = useState("1");
  const [showHidePageModal, setShowHidePageModal] = useState(false);
  const [draftHidePageOpts, setDraftHidePageOpts] = useState({ header: false, footer: false, pageNumber: false, border: false, background: false });
  const [columnBreakBlockIds, setColumnBreakBlockIds] = useState<Record<string, boolean>>({});
  const [columnSectionBreakBlockIds, setColumnSectionBreakBlockIds] = useState<Record<string, boolean>>({});
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  // 검토 탭 - 변경 내용 추적 상태
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(false);
  const [showTrackInsertDelete, setShowTrackInsertDelete] = useState(true);
  const [showTrackFormat, setShowTrackFormat] = useState(true);
  const [trackDisplayMode, setTrackDisplayMode] = useState<"final-markup" | "final">("final-markup");
  const [hoverReviewViewSub, setHoverReviewViewSub] = useState(false);
  const [trackedChanges, setTrackedChanges] = useState<Array<{
    id: string;
    blockId: string;
    kind: "insert" | "delete" | "format";
    prevText?: string;
    prevStyle?: Partial<HwpxParagraphBlock>;
  }>>([]);
  const [activeTrackedChangeIdx, setActiveTrackedChangeIdx] = useState<number>(-1);

  // 도구 탭 - 빠른 교정 & 접근성 설정 상태
  const [smartQuotesEnabled, setSmartQuotesEnabled] = useState(true);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");

  // ── 한컴독스 상단 메뉴바 풀다운 드롭다운 및 상단 UI 상태 ──
  const [openDropdown, setOpenDropdown] = useState<"file" | "edit" | "view" | "insert" | "format" | "page" | "table" | "review" | "tools" | null>(null);
  const [hoverSubmenu, setHoverSubmenu] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState(file.name);
  const [showControlMarks, setShowControlMarks] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [showPageOutline, setShowPageOutline] = useState(true);
  const [showTransparentLines, setShowTransparentLines] = useState(true);
  const [pageViewColumns, setPageViewColumns] = useState<1 | 2 | 3>(1);
  const [pageBreakIndices, setPageBreakIndices] = useState<number[]>([0]);
  const [pageSlices, setPageSlices] = useState<Array<Array<{ idx: number; sliceStart?: number; sliceEnd?: number }>>>([]);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [lineSpacingDraft, setLineSpacingDraft] = useState<string>("160");
  const [lineSpacingMenuPos, setLineSpacingMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [rulerGuide, setRulerGuide] = useState<{ label: string; leftPx: number; screenLeftPx: number; screenTopPx: number } | null>(null);
  const [canvasUnscaledSize, setCanvasUnscaledSize] = useState<{ w: number; h: number } | null>(null);
  const [isCrossSelecting, setIsCrossSelecting] = useState(false);
  const crossDragRef = useRef<{ startIdx: number; startOffset: number; crossed: boolean } | null>(null);
  const pendingSelectAllRef = useRef(false);
  const justFinishedCrossDragRef = useRef(false);
  const lastPointerActionAtRef = useRef(0);
  const lastKnownScrollTopRef = useRef(0);
  const explicitNavigationRef = useRef(false);
  const [tableCellSelection, setTableCellSelection] = useState<{
    blockIdx: number;
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
  const tableDragRef = useRef<{ blockIdx: number; startRow: number; startCol: number; active: boolean } | null>(null);
  const [activeTableCell, setActiveTableCell] = useState<{ blockIdx: number; row: number; col: number } | null>(null);
  const [tableCellStyles, setTableCellStyles] = useState<Record<string, {
    fontFamily?: string;
    sizePt?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
    shadingColor?: string;
    align?: "left" | "center" | "right" | "justify";
  }>>({});
  const [deleteTableCellsPrompt, setDeleteTableCellsPrompt] = useState<{
    blockIdx: number;
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
  const [tableCellResizeDraft, setTableCellResizeDraft] = useState<{
    blockIdx: number;
    colWidths?: number[];
    rowHeights?: number[];
    cellWidths?: Record<string, number>;
    cellHeights?: Record<string, number>;
  } | null>(null);
  const [splitCellModal, setSplitCellModal] = useState<{
    blockIdx: number;
    row: number;
    col: number;
    endRow: number;
    endCol: number;
    canMergeBeforeSplit: boolean;
    initialRows: number;
    initialCols: number;
  } | null>(null);
  useEffect(() => {
    const clearDrag = () => {
      if (tableDragRef.current) tableDragRef.current = null;
    };
    window.addEventListener("mouseup", clearDrag);
    return () => window.removeEventListener("mouseup", clearDrag);
  }, []);
  useEffect(() => {
    if (tableCellSelection && selectedIdx !== tableCellSelection.blockIdx) {
      setTableCellSelection(null);
    }
    if (activeTableCell && selectedIdx !== activeTableCell.blockIdx) {
      setActiveTableCell(null);
    }
  }, [selectedIdx, tableCellSelection, activeTableCell]);
  const [zoomFitMode, setZoomFitMode] = useState<"custom" | "page" | "width">("custom");
  const [showFormatToolbar, setShowFormatToolbar] = useState(true);
  const [showAllMemos, setShowAllMemos] = useState(true);
  const [showMemoGuides, setShowMemoGuides] = useState(true);
  const [showGotoModal, setShowGotoModal] = useState(false);
  const [showClearMarksModal, setShowClearMarksModal] = useState(false);
  const [selectedControlMarks, setSelectedControlMarks] = useState<string[]>([]);
  const [gotoPageInput, setGotoPageInput] = useState("1");
  const [showShareToast, setShowShareToast] = useState(false);
  const [showSafeFontModal, setShowSafeFontModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsInput, setSaveAsInput] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [generalToast, setGeneralToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setGeneralToast(msg);
    setTimeout(() => setGeneralToast((cur) => (cur === msg ? null : cur)), 2500);
  };

  // 다른 이름으로 저장하기 (Alt+V)
  const handleSaveAs = () => {
    setSaveAsInput(docTitle.replace(/\.hwpx$/i, "") + "_사본.hwpx");
    setShowSaveAsModal(true);
  };

  const confirmSaveAs = () => {
    const trimmed = saveAsInput.trim();
    if (!trimmed) return;
    const finalName = trimmed.toLowerCase().endsWith(".hwpx") ? trimmed : `${trimmed}.hwpx`;
    setDocTitle(finalName);
    setShowSaveAsModal(false);
    void handleDirectDownload(finalName);
    showToast(`다른 이름으로 저장되었습니다: ${finalName}`);
  };

  // 문서 이름 바꾸기
  const handleRename = () => {
    setRenameInput(docTitle);
    setShowRenameModal(true);
  };

  const confirmRename = () => {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    const finalName = trimmed.toLowerCase().endsWith(".hwpx") ? trimmed : `${trimmed}.hwpx`;
    setDocTitle(finalName);
    setShowRenameModal(false);
    showToast(`문서 이름이 변경되었습니다: ${finalName}`);
  };

  // 문서 공유 (링크 복사)
  const handleShare = () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).catch(() => { });
      }
    } catch {
      // ignore
    }
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2500);
  };

  // PDF로 다운로드 (실제 PDF 파일 생성 및 저장)
  const handleDownloadPdf = async () => {
    const pdfName = `${docTitle.replace(/\.hwpx$/i, "")}.pdf`;
    if (canvasRef.current) {
      try {
        showToast("PDF 파일을 생성하고 있습니다...");
        const { exportElementAsPdf } = await import("../lib/exportRichDoc");
        await exportElementAsPdf(canvasRef.current, pdfName);
        showToast(`PDF로 저장되었습니다: ${pdfName}`);
        return;
      } catch {
        // html2canvas 실패 시 브라우저 인쇄(PDF 저장)로 폴백
      }
    }
    showToast("인쇄 대화상자에서 'PDF로 저장'을 선택해 내보낼 수 있습니다.");
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // 전체 선택 (Ctrl+A)
  const selectAll = () => {
    if (canvasRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(canvasRef.current);
      }
    }
  };

  // 조판 부호 지우기 목록 (한컴독스 표준)
  const CONTROL_MARK_ITEMS = [
    "OLE 개체", "각주", "각주 번호", "감추기", "강제 줄 나눔", "강제 쪽 나눔",
    "개요 문단", "개인 정보", "개체 연결선", "계산식", "고정폭 빈 칸",
    "그림", "글상자", "글자 겹침", "머리말", "꼬리말",
    "도형", "미주", "수식", "쪽 번호", "차트", "표", "하이퍼링크",
  ];

  // 선택된 조판 부호 지우기 실행
  const applyClearControlMarks = () => {
    if (selectedControlMarks.length === 0) return;
    const targets = new Set(selectedControlMarks);
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    let removedCount = 0;

    doc.transact(() => {
      // 1. 개체 블록 역순 삭제 (표, 그림, 도형, 수식, 차트)
      for (let i = yBlocks.length - 1; i >= 0; i--) {
        const b = yBlocks.get(i);
        const type = b?.get("type");
        if (
          (type === "table" && targets.has("표")) ||
          (type === "image" && targets.has("그림")) ||
          (type === "shape" && targets.has("도형")) ||
          (type === "equation" && targets.has("수식")) ||
          (type === "chart" && targets.has("차트"))
        ) {
          yBlocks.delete(i, 1);
          removedCount++;
        }
      }

      // 2. 문단 내 조판 부호 (각주/미주/하이퍼링크 등) 정리
      for (let i = 0; i < yBlocks.length; i++) {
        const b = yBlocks.get(i);
        if (b && b.get("type") === "paragraph") {
          const yText = b.get("text") as Y.Text;
          if (yText) {
            const raw = yText.toString();
            let cleaned = raw;
            if (targets.has("각주") || targets.has("각주 번호") || targets.has("미주")) {
              cleaned = cleaned.replace(/<sup>.*?<\/sup>/g, "").replace(/\[각주.*?\]|\[미주.*?\]/g, "");
            }
            if (targets.has("하이퍼링크")) {
              cleaned = cleaned.replace(/<a [^>]*>(.*?)<\/a>/gi, "$1");
            }
            if (targets.has("계산식")) {
              cleaned = cleaned.replace(/\[계산식.*?\]/g, "");
            }
            if (cleaned !== raw) {
              yText.delete(0, yText.length);
              yText.insert(0, cleaned);
              removedCount++;
            }
          }
        }
      }
    });

    if (targets.has("쪽 번호")) {
      setPageNumberPos("none");
    }
    setShowClearMarksModal(false);
    setSelectedControlMarks([]);
    showToast(`선택한 조판 부호를 지웠습니다 (${removedCount}건 처리).`);
  };

  // 선택 영역 삭제 (Ctrl+E)
  const executeTableCellDelete = (
    sel: { blockIdx: number; startRow: number; startCol: number; endRow: number; endCol: number },
    keepShape: boolean
  ) => {
    const { blockIdx, startRow, startCol, endRow, endCol } = sel;
    const tbl = blocks[blockIdx];
    const rMin = Math.min(startRow, endRow);
    const rMax = Math.max(startRow, endRow);
    const cMin = Math.min(startCol, endCol);
    const cMax = Math.max(startCol, endCol);
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIdx);
    const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    if (!yRows) return;

    if (keepShape) {
      doc.transact(() => {
        for (let r = rMin; r <= rMax; r++) {
          const yRow = yRows.get(r);
          if (!yRow) continue;
          for (let c = cMin; c <= cMax; c++) {
            const yCell = yRow.get(c);
            const yText = yCell?.get("text") as Y.Text | undefined;
            if (yText && yText.length > 0) yText.delete(0, yText.length);
          }
        }
      });
      return;
    }

    const rowCount = yRows.length;
    const colCount = yRows.get(0)?.length || 1;
    if (rMin === 0 && rMax >= rowCount - 1 && cMin === 0 && cMax >= colCount - 1) {
      setTableCellSelection(null);
      deleteBlock(blockIdx);
      return;
    }
    if (cMin === 0 && cMax >= colCount - 1) {
      doc.transact(() => {
        yRows.delete(rMin, Math.min(rowCount - rMin, rMax - rMin + 1));
        if (tbl && tbl.type === "table" && Array.isArray(tbl.rowHeights)) {
          const nextH = [...tbl.rowHeights];
          nextH.splice(rMin, rMax - rMin + 1);
          yBlock?.set("rowHeights", nextH);
        }
      });
      setTableCellSelection(null);
      return;
    }
    if (rMin === 0 && rMax >= rowCount - 1) {
      const delCount = Math.min(colCount - cMin, cMax - cMin + 1);
      doc.transact(() => {
        for (let r = 0; r < yRows.length; r++) {
          const yRow = yRows.get(r);
          if (yRow.length > cMin) {
            yRow.delete(cMin, Math.min(yRow.length - cMin, delCount));
          }
        }
        if (tbl && tbl.type === "table" && Array.isArray(tbl.colWidths)) {
          const nextW = [...tbl.colWidths];
          nextW.splice(cMin, delCount);
          const sum = nextW.reduce((a, b) => a + b, 0) || 100;
          yBlock?.set("colWidths", nextW.map((w) => Number(((w / sum) * 100).toFixed(2))));
        }
      });
      setTableCellSelection(null);
      return;
    }
    doc.transact(() => {
      for (let r = rMax; r >= rMin; r--) {
        const yRow = yRows.get(r);
        if (!yRow) continue;
        const delCount = Math.min(yRow.length - cMin, cMax - cMin + 1);
        if (delCount > 0) yRow.delete(cMin, delCount);
        if (yRow.length === 0) yRows.delete(r, 1);
      }
    });
    setTableCellSelection(null);
  };

  const deleteSelected = () => {
    if (tableCellSelection) {
      const rMin = Math.min(tableCellSelection.startRow, tableCellSelection.endRow);
      const rMax = Math.max(tableCellSelection.startRow, tableCellSelection.endRow);
      const cMin = Math.min(tableCellSelection.startCol, tableCellSelection.endCol);
      const cMax = Math.max(tableCellSelection.startCol, tableCellSelection.endCol);
      if (rMax > rMin || cMax > cMin) {
        setDeleteTableCellsPrompt({ ...tableCellSelection });
        return;
      }
      executeTableCellDelete(tableCellSelection, true);
      return;
    }
    restoreSelection();
    document.execCommand("delete");
  };

  // 특정 쪽/문단/개체 찾아가기 (Alt+G)
  const handleGoto = (num: number) => {
    setShowGotoModal(false);
    let targetIdx = 0;
    if (gotoType === "line") {
      targetIdx = Math.min(blocks.length - 1, Math.max(0, num - 1));
    } else if (gotoType === "page") {
      targetIdx = Math.min(blocks.length - 1, Math.max(0, (num - 1) * 22));
    } else if (gotoType === "control") {
      const found = blocks.findIndex((b, idx) => idx > selectedIdx && b.type !== "paragraph");
      targetIdx = found !== -1 ? found : Math.max(0, blocks.findIndex((b) => b.type !== "paragraph"));
    } else if (gotoType === "style") {
      const found = blocks.findIndex((b, idx) => idx > selectedIdx && b.type === "paragraph" && (b.bold || (b.sizePt && b.sizePt > 11)));
      targetIdx = found !== -1 ? found : 0;
    } else {
      targetIdx = Math.min(blocks.length - 1, Math.max(0, num - 1));
    }

    explicitNavigationRef.current = true;
    setSelectedIdx(targetIdx);
    const targetEl = document.querySelector(`[data-block-idx="${targetIdx}"]`) as HTMLElement | null;
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      if (blocks[targetIdx]?.type === "paragraph") {
        const editable = (targetEl.matches('[contenteditable="true"]')
          ? targetEl
          : targetEl.querySelector('[contenteditable="true"]')) as HTMLElement | null;
        editable?.focus();
      }
    }
    const labelMap = { page: "쪽", section: "구역", line: "줄", style: "스타일", control: "조판 부호", bookmark: "책갈피" };
    showToast(`${num}번 ${labelMap[gotoType]} 위치로 이동했습니다.`);
  };
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      const step = e.deltaY < 0 ? 10 : -10;
      setZoomFitMode("custom");
      setZoomPercent((prev) => Math.max(30, Math.min(300, prev + step)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const applyZoomFit = (mode: "page" | "width") => {
    const container = canvasScrollRef.current;
    const pagePxW = Math.max(200, Math.round(pageWidthMm * 3.78));
    const pagePxH = Math.max(200, Math.round(pageHeightMm * 3.78));
    if (!container) {
      setZoomFitMode(mode);
      setZoomPercent(mode === "page" ? 75 : 100);
      return;
    }
    const availW = Math.max(240, container.clientWidth - 64);
    const availH = Math.max(240, container.clientHeight - 48);
    const ratioW = availW / pagePxW;
    const ratio = mode === "width" ? ratioW : Math.min(ratioW, availH / pagePxH);
    const pct = Math.max(30, Math.min(300, Math.round(ratio * 100)));
    setZoomFitMode(mode);
    setZoomPercent(pct);
  };
  const applyPageViewColumns = (cols: 1 | 2 | 3) => {
    setPageViewColumns(cols);
    const container = canvasScrollRef.current;
    const pagePxW = Math.max(200, Math.round(pageWidthMm * 3.78));
    if (cols === 1) {
      if (zoomPercent < 75) {
        setZoomFitMode("custom");
        setZoomPercent(100);
      }
      return;
    }
    if (container) {
      container.scrollTop = 0;
      const availW = Math.max(240, container.clientWidth - 80);
      const availH = Math.max(240, container.clientHeight - 112);
      const pagePxH = Math.max(200, Math.round(pageHeightMm * 3.78));
      const neededW = cols * pagePxW + (cols - 1) * 24;
      const fitRatio = Math.min(availW / neededW, availH / pagePxH);
      if (fitRatio < 1) {
        const fitPct = Math.max(30, Math.min(100, Math.floor(fitRatio * 100)));
        setZoomFitMode("custom");
        setZoomPercent(fitPct);
      }
    }
  };
  type PendingCaret =
    | { mode: "offset"; blockId: string; offset: number }
    | { mode: "point"; blockId: string; x: number; toEnd: boolean };
  const pendingCaretRef = useRef<PendingCaret | null>(null);
  const pendingObjectFocusRef = useRef<string | null>(null);
  const lastDeletedIdxRef = useRef<number | null>(null);

  interface HwpxMemoItem {
    id: string;
    blockId: string;
    author: string;
    createdAt: string;
    text: string;
    anchorText?: string;
  }

  const extractMemosFromYDoc = useCallback((yDoc: Y.Doc): HwpxMemoItem[] => {
    const yMemos = yDoc.getArray<Y.Map<unknown>>("hwpx_memos");
    const list: HwpxMemoItem[] = [];
    for (let i = 0; i < yMemos.length; i++) {
      const m = yMemos.get(i);
      const id = String(m.get("id") || "");
      const blockId = String(m.get("blockId") || "");
      if (!id || !blockId) continue;
      list.push({
        id,
        blockId,
        author: String(m.get("author") || "나"),
        createdAt: String(m.get("createdAt") || ""),
        text: String(m.get("text") || ""),
        anchorText: m.get("anchorText") ? String(m.get("anchorText")) : undefined,
      });
    }
    return list;
  }, []);

  const [memos, setMemos] = useState<HwpxMemoItem[]>(() => extractMemosFromYDoc(doc));
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null);

  // Yjs UndoManager로 블록 삽입/삭제/수정 내역을 추적
  const undoManager = useMemo(() => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    return new Y.UndoManager(yBlocks);
  }, [doc]);

  useEffect(() => {
    // 문서 초기 진입 시 로드된 작업은 실행 취소 스택에서 초기화
    undoManager.clear();
  }, [undoManager]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const updateStackState = () => {
      setCanUndo(undoManager.canUndo());
      setCanRedo(undoManager.canRedo());
    };
    undoManager.on("stack-item-added", updateStackState);
    undoManager.on("stack-item-popped", updateStackState);
    undoManager.on("stack-cleared", updateStackState);
    return () => {
      undoManager.off("stack-item-added", updateStackState);
      undoManager.off("stack-item-popped", updateStackState);
      undoManager.off("stack-cleared", updateStackState);
    };
  }, [undoManager]);

  // Yjs CRDT 변경 시 로컬 블록 상태 동기화
  useEffect(() => {
    const onUpdate = () => {
      const nextBlocks = extractBlocksFromYDoc(doc);
      setBlocks(nextBlocks);
      setMemos(extractMemosFromYDoc(doc));
      setSelectedIdx((cur) => (nextBlocks.length === 0 ? 0 : Math.min(cur, nextBlocks.length - 1)));
    };
    doc.on("update", onUpdate);
    return () => { doc.off("update", onUpdate); };
  }, [doc, extractMemosFromYDoc]);

  const formatMemoTimestamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const addMemoToBlock = (blockIdx: number, anchorText?: string) => {
    const targetBlock = blocks[blockIdx];
    if (!targetBlock) {
      showToast("메모를 추가할 문단을 먼저 선택하세요.");
      return;
    }
    const selStr = (anchorText ?? window.getSelection()?.toString() ?? "").trim();
    const authorName = editors[0]?.name || "작성자";
    const memoId = `memo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const yMemos = doc.getArray<Y.Map<unknown>>("hwpx_memos");
    const yMemo = new Y.Map<unknown>();
    yMemo.set("id", memoId);
    yMemo.set("blockId", targetBlock.id);
    yMemo.set("author", authorName);
    yMemo.set("createdAt", formatMemoTimestamp());
    yMemo.set("text", "");
    if (selStr) yMemo.set("anchorText", selStr.slice(0, 80));
    doc.transact(() => {
      yMemos.push([yMemo]);
    });
    setShowAllMemos(true);
    setActiveMemoId(memoId);
  };

  const updateMemoText = (memoId: string, text: string) => {
    const yMemos = doc.getArray<Y.Map<unknown>>("hwpx_memos");
    doc.transact(() => {
      for (let i = 0; i < yMemos.length; i++) {
        const m = yMemos.get(i);
        if (m.get("id") === memoId) {
          m.set("text", text);
          break;
        }
      }
    });
  };

  const focusBlockAfterMemoDelete = (blockId: string) => {
    if (!blockId) return;
    const bIdx = blocks.findIndex((b) => b.id === blockId);
    if (bIdx !== -1) setSelectedIdx(bIdx);
    requestAnimationFrame(() => {
      const pEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"] p[contenteditable="true"]`);
      if (pEl) {
        pEl.scrollIntoView({ block: "nearest", inline: "nearest" });
        pEl.focus({ preventScroll: true });
        setCaretOffset(pEl, (pEl.textContent || "").length);
      }
    });
  };

  const deleteMemo = (memoId: string) => {
    const yMemos = doc.getArray<Y.Map<unknown>>("hwpx_memos");
    let targetBlockId = "";
    doc.transact(() => {
      for (let i = yMemos.length - 1; i >= 0; i--) {
        if (yMemos.get(i).get("id") === memoId) {
          if (!targetBlockId) targetBlockId = String(yMemos.get(i).get("blockId") || "");
          yMemos.delete(i, 1);
        }
      }
    });
    if (activeMemoId === memoId) setActiveMemoId(null);
    focusBlockAfterMemoDelete(targetBlockId);
  };

  const deleteMemosForBlock = (blockIdx: number) => {
    const targetBlock = blocks[blockIdx];
    if (!targetBlock) return;
    const yMemos = doc.getArray<Y.Map<unknown>>("hwpx_memos");
    doc.transact(() => {
      for (let i = yMemos.length - 1; i >= 0; i--) {
        if (yMemos.get(i).get("blockId") === targetBlock.id) {
          yMemos.delete(i, 1);
        }
      }
    });
    focusBlockAfterMemoDelete(targetBlock.id);
  };

  // 블록 추가/삭제/분할 후 지정된 문단 및 오프셋/위치로 커서 복원
  useLayoutEffect(() => {
    const mainEl = canvasScrollRef.current;
    const shouldPreserveScroll = !explicitNavigationRef.current;
    explicitNavigationRef.current = false;
    if (pendingObjectFocusRef.current) {
      const objId = pendingObjectFocusRef.current;
      const objEl = document.querySelector<HTMLElement>(`[data-block-id="${objId}"]`);
      if (objEl) {
        pendingObjectFocusRef.current = null;
        const isDrawnShape = objEl.getAttribute("data-block-type") === "shape";
        if (pendingDrawScrollTopRef.current !== null && canvasScrollRef.current) {
          canvasScrollRef.current.scrollTop = pendingDrawScrollTopRef.current;
          pendingDrawScrollTopRef.current = null;
        } else if (!isDrawnShape) {
          objEl.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        const inputEl = objEl.querySelector<HTMLElement>("input, textarea");
        const shouldFocusInput = inputEl && (!isDrawnShape || (inputEl as HTMLTextAreaElement).value?.trim().length > 0);
        (shouldFocusInput ? inputEl : objEl).focus({ preventScroll: true });
        return;
      }
    }
    if (!pendingCaretRef.current) return;
    const target = pendingCaretRef.current;
    pendingCaretRef.current = null;
    const pEl = document.querySelector<HTMLElement>(`[data-block-id="${target.blockId}"] p`);
    if (pEl) {
      if (target.mode === "point") {
        setCaretAtPointOrEdge(pEl, target.x, target.toEnd);
      } else {
        pEl.focus({ preventScroll: true });
        setCaretOffset(pEl, target.offset);
      }
    }
    if (shouldPreserveScroll && mainEl) {
      mainEl.scrollTop = lastKnownScrollTopRef.current;
    }
  }, [blocks, pageBreakIndices]);

  // 위 문단으로 자연스러운 이동 (중간에 그림, 표, 도형, 수식 등의 개체가 있어도 건너뛰어 이전 문단으로 이동)
  const navigateToPrevParagraph = (currentIdx: number, clientX: number) => {
    let targetIdx = -1;
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (blocks[i].type === "paragraph") {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return;

    const prevBlock = blocks[targetIdx];
    setSelectedIdx(targetIdx);
    const prevEl = document.querySelector<HTMLElement>(`[data-block-id="${prevBlock.id}"] p`);
    if (prevEl) {
      setCaretAtPointOrEdge(prevEl, clientX, true);
    } else {
      pendingCaretRef.current = { mode: "point", blockId: prevBlock.id, x: clientX, toEnd: true };
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${prevBlock.id}"] p`);
        if (el) setCaretAtPointOrEdge(el, clientX, true);
      }, 0);
    }
  };

  // 아래 문단으로 자연스러운 이동 (중간에 그림, 표, 도형, 수식 등의 개체가 있어도 건너뛰어 다음 문단으로 이동)
  const navigateToNextParagraph = (currentIdx: number, clientX: number) => {
    let targetIdx = -1;
    for (let i = currentIdx + 1; i < blocks.length; i++) {
      if (blocks[i].type === "paragraph") {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return;

    const nextBlock = blocks[targetIdx];
    setSelectedIdx(targetIdx);
    const nextEl = document.querySelector<HTMLElement>(`[data-block-id="${nextBlock.id}"] p`);
    if (nextEl) {
      setCaretAtPointOrEdge(nextEl, clientX, false);
    } else {
      pendingCaretRef.current = { mode: "point", blockId: nextBlock.id, x: clientX, toEnd: false };
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${nextBlock.id}"] p`);
        if (el) setCaretAtPointOrEdge(el, clientX, false);
      }, 0);
    }
  };

  // 문단 및 블록 드래그 앤 드롭 순서 이동 상태
  const [draggedBlockIdx, setDraggedBlockIdx] = useState<number | null>(null);
  const draggedBlockIdxRef = useRef<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ idx: number; pos: "before" | "after" } | null>(null);
  const [inlineCaretIndicator, setInlineCaretIndicator] = useState<{ left: number; top: number; height: number } | null>(null);

  const setDraggedBlock = (idx: number | null) => {
    draggedBlockIdxRef.current = idx;
    setDraggedBlockIdx(idx);
  };

  // 인라인 개체 이동/삭제/부유 전환 시 이전에 분할되었던 문단을 원본 한 문단으로 자동 병합
  const mergeSplitParagraphAt = (yBlocks: Y.Array<Y.Map<unknown>>, objIdx: number): number => {
    if (objIdx <= 0 || objIdx + 1 >= yBlocks.length) return -1;
    const leftMap = yBlocks.get(objIdx - 1);
    const rightMap = yBlocks.get(objIdx + 1);
    if (
      !leftMap ||
      !rightMap ||
      leftMap.get("type") !== "paragraph" ||
      rightMap.get("type") !== "paragraph" ||
      rightMap.get("splitFromInline") !== true
    ) {
      return -1;
    }
    const leftYText = leftMap.get("text") as Y.Text | undefined;
    const rightYText = rightMap.get("text") as Y.Text | undefined;
    const leftLen = leftYText ? leftYText.length : 0;
    const rightStr = rightYText ? rightYText.toString() : "";
    if (leftYText && rightStr) {
      leftYText.insert(leftLen, rightStr);
    } else if (!leftYText && rightStr) {
      leftMap.set("text", new Y.Text(rightStr));
    }
    leftMap.delete("rawXml");
    leftMap.delete("origText");
    yBlocks.delete(objIdx + 1, 1);
    return leftLen;
  };

  // 블록 순서 이동 함수 (Y.Doc CRDT 안전 복제 및 이동)
  const moveBlock = (fromIndex: number, toIndex: number, pos: "before" | "after") => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    if (fromIndex < 0 || fromIndex >= yBlocks.length) return;
    if (toIndex < 0 || toIndex >= yBlocks.length) return;
    if (fromIndex === toIndex) return;

    const sourceMap = yBlocks.get(fromIndex);
    if (!sourceMap) return;

    let finalIdx = fromIndex;
    doc.transact(() => {
      const cloned = cloneYBlock(sourceMap);
      const mergedLeftLen = mergeSplitParagraphAt(yBlocks, fromIndex);
      let adjTo = toIndex;
      if (mergedLeftLen >= 0) {
        if (adjTo === fromIndex + 1) adjTo = fromIndex - 1;
        else if (adjTo > fromIndex + 1) adjTo--;
      }
      let targetIndex = pos === "after" ? adjTo + 1 : adjTo;
      if (fromIndex < targetIndex) {
        targetIndex--;
      }
      yBlocks.delete(fromIndex, 1);
      const clampedTarget = Math.max(0, Math.min(yBlocks.length, targetIndex));
      yBlocks.insert(clampedTarget, [cloned]);
      finalIdx = clampedTarget;
    });
    setSelectedIdx(finalIdx);
  };

  // 글자처럼 취급 개체를 문단 텍스트 중간(charOffset)으로 분할 이동 (기존 분할 문단은 먼저 복원 병합)
  const moveBlockIntoParagraphText = (fromIndex: number, targetParaIdx: number, charOffset: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    if (fromIndex < 0 || fromIndex >= yBlocks.length) return;
    if (targetParaIdx < 0 || targetParaIdx >= yBlocks.length || fromIndex === targetParaIdx) return;

    const sourceMap = yBlocks.get(fromIndex);
    if (!sourceMap) return;

    let finalSelectedIdx = fromIndex;
    doc.transact(() => {
      const clonedObj = cloneYBlock(sourceMap);
      const mergedLeftLen = mergeSplitParagraphAt(yBlocks, fromIndex);
      let adjTargetIdx = targetParaIdx;
      let adjCharOffset = charOffset;
      if (mergedLeftLen >= 0) {
        if (adjTargetIdx === fromIndex + 1) {
          adjTargetIdx = fromIndex - 1;
          adjCharOffset = mergedLeftLen + charOffset;
        } else if (adjTargetIdx > fromIndex + 1) {
          adjTargetIdx--;
        }
      }

      const targetMap = yBlocks.get(adjTargetIdx);
      if (!targetMap || targetMap.get("type") !== "paragraph") {
        yBlocks.delete(fromIndex, 1);
        const ins = Math.max(0, Math.min(yBlocks.length, fromIndex < adjTargetIdx ? adjTargetIdx : adjTargetIdx + 1));
        yBlocks.insert(ins, [clonedObj]);
        finalSelectedIdx = ins;
        return;
      }

      const yText = targetMap.get("text") as Y.Text | undefined;
      const fullText = yText ? yText.toString() : "";
      if (adjCharOffset <= 0) {
        yBlocks.delete(fromIndex, 1);
        const ins = Math.max(0, Math.min(yBlocks.length, fromIndex < adjTargetIdx ? adjTargetIdx - 1 : adjTargetIdx));
        yBlocks.insert(ins, [clonedObj]);
        finalSelectedIdx = ins;
        return;
      }
      if (adjCharOffset >= fullText.length) {
        yBlocks.delete(fromIndex, 1);
        const ins = Math.max(0, Math.min(yBlocks.length, fromIndex < adjTargetIdx ? adjTargetIdx : adjTargetIdx + 1));
        yBlocks.insert(ins, [clonedObj]);
        finalSelectedIdx = ins;
        return;
      }

      const leftText = fullText.slice(0, adjCharOffset);
      const rightText = fullText.slice(adjCharOffset);

      const rightPara = new Y.Map<unknown>();
      rightPara.set("id", `p_split_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      rightPara.set("type", "paragraph");
      rightPara.set("splitFromInline", true);
      rightPara.set("text", new Y.Text(rightText));
      for (const k of ["align", "sizePt", "bold", "italic", "underline", "color", "fontFamily", "lineSpacing"]) {
        const v = targetMap.get(k);
        if (v !== undefined) rightPara.set(k, v);
      }

      if (yText) {
        yText.delete(adjCharOffset, fullText.length - adjCharOffset);
      } else {
        targetMap.set("text", new Y.Text(leftText));
      }
      targetMap.delete("rawXml");
      targetMap.delete("origText");

      yBlocks.delete(fromIndex, 1);
      const insertBase = fromIndex < adjTargetIdx ? adjTargetIdx - 1 : adjTargetIdx;
      yBlocks.insert(insertBase + 1, [clonedObj, rightPara]);
      finalSelectedIdx = insertBase + 1;
    });
    setSelectedIdx(finalSelectedIdx);
  };

  // 테스트 및 디버그용 윈도우 노출
  useEffect(() => {
    (window as unknown as { __hwpxMoveBlock?: typeof moveBlock }).__hwpxMoveBlock = moveBlock;
  }, [doc]);

  // 개체(도형, 그림, 표, 수식) 자유 이동 실시간 드래그 오프셋 (60fps 무지연)
  const [dragOffsets, setDragOffsets] = useState<Record<number, { x: number; y: number }>>({});

  // 개체(표, 그림, 도형) 실시간 크기 조절 상태 (60fps 무지연)
  const [dragResize, setDragResize] = useState<Record<number, { widthPercent?: number; heightPt?: number }>>({});

  // 최종 위치를 Yjs CRDT에 영구 커밋
  const commitObjectOffset = (blockIndex: number, offsetX: number, offsetY: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const isBand = String(yBlock.get("id") || "").startsWith("band_");
    doc.transact(() => {
      yBlock.set("offsetX", isBand ? 0 : offsetX);
      yBlock.set("offsetY", offsetY);
    });
  };

  // 최종 크기(폭 %, 높이 pt)를 Yjs CRDT에 영구 커밋 (Undo/Redo 지원)
  const commitObjectResize = (blockIndex: number, widthPercent?: number, heightPt?: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    doc.transact(() => {
      if (widthPercent !== undefined) {
        yBlock.set("widthPercent", Math.max(0.5, Math.min(100, Number(widthPercent.toFixed(2)))));
      }
      if (heightPt !== undefined) {
        yBlock.set("heightPt", Math.max(2, Number(heightPt.toFixed(2))));
      }
    });
  };

  // 개체 8방향 모서리/변 핸들 드래그 크기 조절 시작 핸들러
  const handleObjectResizeStart = (
    e: React.PointerEvent,
    blockIdx: number,
    dir: ResizeDirection
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedIdx(blockIdx);

    const block = blocks[blockIdx];
    if (!block) return;

    const handleEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      handleEl.setPointerCapture(pointerId);
    } catch {
      // ignore
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = Math.max(0.2, zoomPercent / 100);

    const resizableBox = (handleEl.closest(".hwpx-resizable-box") as HTMLElement) || handleEl.parentElement;
    const startRect = resizableBox ? resizableBox.getBoundingClientRect() : null;

    const pageEl = handleEl.closest<HTMLElement>("[data-page-idx]");
    const refEl = pageEl || canvasRef.current;
    const refStyle = refEl ? window.getComputedStyle(refEl) : null;
    const padLeft = refStyle ? parseFloat(refStyle.paddingLeft) || 0 : 95;
    const padRight = refStyle ? parseFloat(refStyle.paddingRight) || 0 : 95;
    const contentWidth = refEl ? Math.max(200, refEl.clientWidth - padLeft - padRight) : 603;

    const blockWidthPct = "widthPercent" in block ? (block as { widthPercent?: number }).widthPercent : undefined;
    const blockHeightPt = "heightPt" in block ? (block as { heightPt?: number }).heightPt : undefined;

    const initialWidthPct = blockWidthPct ?? (block.type === "table" ? 100 : 75);
    const startWidthPx = startRect ? (startRect.width / zoom) : (contentWidth * (initialWidthPct / 100));
    const isShapeBlock = block.type === "shape";
    const isTableBlock = block.type === "table";
    const startHeightPt = blockHeightPt ?? (startRect ? ((startRect.height / zoom) * (isShapeBlock ? 0.75 : 1)) : 60);
    const startTableEl = isTableBlock ? (resizableBox?.querySelector("[data-hwpx-table]") as HTMLElement | null) : null;
    const startTableRowHeights: number[] | null = isTableBlock
      ? block.rows.map((_, ri) => {
          const existing = block.rowHeights?.[ri];
          if (existing && existing > 0) return existing;
          const cellEl =
            startTableEl?.querySelector(`[data-hwpx-cell][data-row-idx="${ri}"][data-row-span="1"]`) ||
            startTableEl?.querySelector(`[data-hwpx-cell][data-row-idx="${ri}"]`);
          return Math.max(24, Math.round((cellEl?.getBoundingClientRect().height || 34) / zoom));
        })
      : null;
    const startTableTotalH = startTableRowHeights ? startTableRowHeights.reduce((a, b) => a + b, 0) : startHeightPt;
    let latestTableRowHeights: number[] | null = startTableRowHeights ? [...startTableRowHeights] : null;

    const isFloatingObj =
      "treatAsChar" in block && block.treatAsChar !== undefined
        ? !block.treatAsChar
        : ("offsetX" in block && (((block as { offsetX?: number }).offsetX ?? 0) !== 0 || ((block as { offsetY?: number }).offsetY ?? 0) !== 0));
    const startOffX = "offsetX" in block ? ((block as { offsetX?: number }).offsetX ?? 0) : 0;
    const startOffY = "offsetY" in block ? ((block as { offsetY?: number }).offsetY ?? 0) : 0;

    const align = ("align" in block ? (block as { align?: string }).align : undefined) || (block.type === "table" || block.type === "chart" ? "left" : "center");
    const effectiveHorizMode: "left" | "center" | "right" = isFloatingObj
      ? "left"
      : align === "center"
        ? "center"
        : align === "right"
          ? "right"
          : "left";

    let currentWidthPct = initialWidthPct;
    let currentHeightPt = startHeightPt;
    let currentOffX = startOffX;
    let currentOffY = startOffY;
    const needsHorizOffsetShift =
      (effectiveHorizMode === "left" && dir.includes("w")) ||
      (effectiveHorizMode === "center" && (dir.includes("w") || dir.includes("e"))) ||
      (effectiveHorizMode === "right" && dir.includes("e"));
    const needsVertOffsetShift = isFloatingObj && dir.includes("n");
    const needsOffsetShift = needsHorizOffsetShift || needsVertOffsetShift;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startX) / zoom;
      const dy = (moveEvt.clientY - startY) / zoom;

      let deltaW = 0;
      if (dir.includes("e")) {
        deltaW = dx;
      } else if (dir.includes("w")) {
        deltaW = -dx;
      }

      let deltaH = 0;
      if (dir.includes("s")) {
        deltaH = dy;
      } else if (dir.includes("n")) {
        deltaH = -dy;
      }

      if (dir.includes("e") || dir.includes("w")) {
        const minWPct = isShapeBlock && (block as { shapeType?: string }).shapeType === "line" ? 0.5 : 2;
        const minWPx = Math.max(8, (contentWidth * minWPct) / 100);
        const clampedWidthPx = Math.max(minWPx, Math.min(contentWidth, startWidthPx + deltaW));
        currentWidthPct = Math.max(minWPct, Math.min(100, Number(((clampedWidthPx / contentWidth) * 100).toFixed(2))));
        const actualDeltaW = clampedWidthPx - startWidthPx;
        if (effectiveHorizMode === "left" && dir.includes("w")) {
          currentOffX = Math.round(startOffX - actualDeltaW);
        } else if (effectiveHorizMode === "center") {
          if (dir.includes("w")) {
            currentOffX = Math.round(startOffX - actualDeltaW / 2);
          } else if (dir.includes("e")) {
            currentOffX = Math.round(startOffX + actualDeltaW / 2);
          }
        } else if (effectiveHorizMode === "right" && dir.includes("e")) {
          currentOffX = Math.round(startOffX + actualDeltaW);
        }
      }

      if (dir.includes("n") || dir.includes("s")) {
        if (block.type === "shape" && (block as { shapeType?: string }).shapeType === "line") {
          currentHeightPt = 2;
        } else if (isTableBlock && startTableRowHeights) {
          const minTotalH = Math.max(24, startTableRowHeights.length * 24);
          const nextTotalH = Math.max(minTotalH, Math.min(2400, startTableTotalH + deltaH));
          const scale = nextTotalH / Math.max(24, startTableTotalH);
          latestTableRowHeights = startTableRowHeights.map((h) => Math.max(24, Math.min(600, Math.round(h * scale))));
          const actualTotalH = latestTableRowHeights.reduce((a, b) => a + b, 0);
          currentHeightPt = actualTotalH;
          if (isFloatingObj && dir.includes("n")) {
            currentOffY = Math.round(startOffY - (actualTotalH - startTableTotalH));
          }
          setTableCellResizeDraft({ blockIdx, rowHeights: latestTableRowHeights });
        } else {
          currentHeightPt = isShapeBlock
            ? Math.max(6, Math.min(900, Number((startHeightPt + deltaH * 0.75).toFixed(2))))
            : Math.max(15, Math.min(1200, Math.round(startHeightPt + deltaH)));
          if (isFloatingObj && dir.includes("n")) {
            const actualDeltaHPx = isShapeBlock ? (currentHeightPt - startHeightPt) / 0.75 : (currentHeightPt - startHeightPt);
            currentOffY = Math.round(startOffY - actualDeltaHPx);
          }
        }
      }

      setDragResize((prev) => ({
        ...prev,
        [blockIdx]: {
          widthPercent: currentWidthPct,
          heightPt: currentHeightPt,
        },
      }));
      if (needsOffsetShift) {
        setDragOffsets((prev) => ({
          ...prev,
          [blockIdx]: { x: currentOffX, y: currentOffY },
        }));
      }
    };

    const onPointerUp = () => {
      try {
        handleEl.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      lastPointerActionAtRef.current = Date.now();
      const savedScrollTop = canvasScrollRef.current?.scrollTop ?? null;
      const isShape = block.type === "shape";
      commitObjectResize(blockIdx, currentWidthPct, isShape ? currentHeightPt : undefined);
      if (isTableBlock && (dir.includes("n") || dir.includes("s")) && latestTableRowHeights) {
        const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
        const yBlock = yBlocks.get(blockIdx);
        if (yBlock) {
          doc.transact(() => {
            yBlock.set("rowHeights", latestTableRowHeights);
          });
        }
        setTableCellResizeDraft(null);
      }
      if (needsOffsetShift) {
        commitObjectOffset(blockIdx, currentOffX, currentOffY);
      }

      setDragResize((prev) => {
        const next = { ...prev };
        delete next[blockIdx];
        return next;
      });
      if (needsOffsetShift) {
        setDragOffsets((prev) => {
          const next = { ...prev };
          delete next[blockIdx];
          return next;
        });
      }
      requestAnimationFrame(() => {
        if (savedScrollTop !== null && canvasScrollRef.current) {
          canvasScrollRef.current.scrollTop = savedScrollTop;
        }
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 개체 자유 드래그 이동 시작 핸들러
  const resolveNonOverlappingOffset = useCallback(
    (
      movingIdx: number,
      candOffX: number,
      candOffY: number,
      boxRectAtStart: DOMRect,
      initialOffX: number,
      initialOffY: number,
      minOffX: number,
      maxOffX: number,
      minOffY: number,
      maxOffY: number,
      zoom: number,
      overrideWrap?: string,
      overrideAllowOverlap?: boolean,
      overrideTreatAsChar?: boolean,
    ): { x: number; y: number } => {
      const movingBlk = blocks[movingIdx];
      if (!movingBlk) return { x: candOffX, y: candOffY };
      const movingTreatAsChar =
        overrideTreatAsChar ??
        (("treatAsChar" in movingBlk ? (movingBlk as { treatAsChar?: boolean }).treatAsChar : undefined) ?? false);
      const movingWrap =
        overrideWrap ??
        (("textWrap" in movingBlk ? (movingBlk as { textWrap?: string }).textWrap : undefined) ?? "SQUARE");
      const movingAllowOverlap =
        overrideAllowOverlap ??
        (("allowOverlap" in movingBlk ? (movingBlk as { allowOverlap?: boolean }).allowOverlap : undefined) ?? false);

      if (movingTreatAsChar || (movingWrap !== "SQUARE" && movingWrap !== "TOP_AND_BOTTOM") || movingAllowOverlap) {
        return { x: candOffX, y: candOffY };
      }

      const movingBlockEl = document.querySelector<HTMLElement>(`[data-block-idx="${movingIdx}"]`);
      const pageEl = movingBlockEl?.closest<HTMLElement>("[data-page-idx]");
      if (!pageEl) return { x: candOffX, y: candOffY };

      const isObstacleObjType = (t: string) => t === "table" || t === "image" || t === "shape" || t === "chart";
      if (!isObstacleObjType(movingBlk.type)) return { x: candOffX, y: candOffY };

      const obstacles: Array<{ rect: DOMRect; wrap: string }> = [];
      const seenIdx = new Set<number>();
      pageEl.querySelectorAll<HTMLElement>("[data-block-idx]").forEach((el) => {
        const otherIdx = Number(el.getAttribute("data-block-idx"));
        if (!Number.isFinite(otherIdx) || otherIdx === movingIdx || seenIdx.has(otherIdx)) return;
        seenIdx.add(otherIdx);
        const otherBlk = blocks[otherIdx];
        if (!otherBlk || !isObstacleObjType(otherBlk.type)) return;
        const otherIsFloating =
          "treatAsChar" in otherBlk && otherBlk.treatAsChar !== undefined
            ? !otherBlk.treatAsChar
            : ("offsetX" in otherBlk && ((otherBlk.offsetX ?? 0) !== 0 || ((otherBlk as { offsetY?: number }).offsetY ?? 0) !== 0));
        if (!otherIsFloating) return;
        const otherWrap =
          ("textWrap" in otherBlk ? (otherBlk as { textWrap?: string }).textWrap : undefined) ?? "IN_FRONT_OF_TEXT";
        const otherAllowOverlap =
          ("allowOverlap" in otherBlk ? (otherBlk as { allowOverlap?: boolean }).allowOverlap : undefined) ?? false;
        if ((otherWrap !== "SQUARE" && otherWrap !== "TOP_AND_BOTTOM") || otherAllowOverlap) {
          return;
        }
        const otherBox = el.querySelector<HTMLElement>(".hwpx-resizable-box") || el;
        const otherRect = otherBox.getBoundingClientRect();
        if (otherRect.width > 0 && otherRect.height > 0) {
          obstacles.push({ rect: otherRect, wrap: otherWrap });
        }
      });

      if (obstacles.length === 0) return { x: candOffX, y: candOffY };

      const gapPx = 4 * zoom;
      const curW = boxRectAtStart.width;
      const curH = boxRectAtStart.height;
      let curX = candOffX;
      let curY = candOffY;

      const overlapsRect = (ox: number, oy: number, r: DOMRect) => {
        const l = boxRectAtStart.left + (ox - initialOffX) * zoom;
        const t = boxRectAtStart.top + (oy - initialOffY) * zoom;
        return l + curW > r.left + 0.5 && l < r.right - 0.5 && t + curH > r.top + 0.5 && t < r.bottom - 0.5;
      };

      for (let pass = 0; pass < 6; pass++) {
        let moved = false;
        for (const obs of obstacles) {
          if (!overlapsRect(curX, curY, obs.rect)) continue;

          const upY = Math.max(
            minOffY,
            Math.min(maxOffY, Math.floor(initialOffY + (obs.rect.top - gapPx - curH - boxRectAtStart.top) / zoom)),
          );
          const downY = Math.max(
            minOffY,
            Math.min(maxOffY, Math.ceil(initialOffY + (obs.rect.bottom + gapPx - boxRectAtStart.top) / zoom)),
          );
          const leftX = Math.max(
            minOffX,
            Math.min(maxOffX, Math.floor(initialOffX + (obs.rect.left - gapPx - curW - boxRectAtStart.left) / zoom)),
          );
          const rightX = Math.max(
            minOffX,
            Math.min(maxOffX, Math.ceil(initialOffX + (obs.rect.right + gapPx - boxRectAtStart.left) / zoom)),
          );

          const rawCandidates =
            movingWrap === "TOP_AND_BOTTOM" || obs.wrap === "TOP_AND_BOTTOM"
              ? [
                { x: curX, y: upY },
                { x: curX, y: downY },
              ]
              : [
                { x: leftX, y: curY },
                { x: rightX, y: curY },
                { x: curX, y: upY },
                { x: curX, y: downY },
              ];

          const validCandidates = rawCandidates.filter((c) => !overlapsRect(c.x, c.y, obs.rect));
          const pool = validCandidates.length > 0 ? validCandidates : rawCandidates;
          let best = pool[0];
          let bestDist = Infinity;
          for (const c of pool) {
            const dist = (c.x - candOffX) ** 2 + (c.y - candOffY) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              best = c;
            }
          }
          if (best && (best.x !== curX || best.y !== curY)) {
            curX = best.x;
            curY = best.y;
            moved = true;
            break;
          }
        }
        if (!moved) break;
      }

      return { x: curX, y: curY };
    },
    [blocks],
  );

  const handleObjectDragStart = (
    e: React.PointerEvent,
    blockIdx: number,
    initialOffsetX: number = 0,
    initialOffsetY: number = 0
  ) => {
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (
      targetEl.tagName === "INPUT" ||
      targetEl.tagName === "TEXTAREA" ||
      targetEl.tagName === "BUTTON" ||
      targetEl.closest("button") ||
      targetEl.closest(".hwpx-floating-toolbar") ||
      targetEl.closest(".hwpx-resize-handle")
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setSelectedIdx(blockIdx);

    const blk = blocks[blockIdx];
    const isFloatingObj = blk && "treatAsChar" in blk && blk.treatAsChar !== undefined
      ? !blk.treatAsChar
      : (blk && "offsetX" in blk && ((blk.offsetX ?? 0) !== 0 || ((blk as { offsetY?: number }).offsetY ?? 0) !== 0));

    // 글자처럼 취급 ON: 문단 텍스트 중간(문자 오프셋) 및 블록 사이사이로 이동
    if (!isFloatingObj) {
      const startX = e.clientX;
      const startY = e.clientY;
      let didDrag = false;
      let targetIdx: number | null = null;
      let targetPos: "before" | "after" = "after";
      let inlineTarget: { paraIdx: number; charOffset: number } | null = null;

      const onReorderMove = (moveEvt: PointerEvent) => {
        if (!didDrag && Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY) < 5) return;
        didDrag = true;
        setDraggedBlock(blockIdx);

        // 1. 포인터 아래 문단 텍스트의 정확한 문자 오프셋 탐색
        let range: Range | null = null;
        if (document.caretRangeFromPoint) {
          range = document.caretRangeFromPoint(moveEvt.clientX, moveEvt.clientY);
        } else if ((document as unknown as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint) {
          const cp = (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint(moveEvt.clientX, moveEvt.clientY);
          if (cp) {
            range = document.createRange();
            range.setStart(cp.offsetNode, cp.offset);
            range.collapse(true);
          }
        }

        const hitEl = range ? (range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as HTMLElement)) : null;
        const paraBlockEl = hitEl?.closest<HTMLElement>('[data-block-type="paragraph"]');
        const pEl = paraBlockEl?.querySelector<HTMLElement>("p");
        const hitParaIdx = paraBlockEl ? Number(paraBlockEl.getAttribute("data-block-idx")) : NaN;

        if (range && pEl && paraBlockEl && !isNaN(hitParaIdx) && hitParaIdx !== blockIdx && pEl.contains(range.startContainer)) {
          const preRange = document.createRange();
          preRange.selectNodeContents(pEl);
          preRange.setEnd(range.startContainer, range.startOffset);
          const charOffset = preRange.toString().length;
          const caretRect = range.getBoundingClientRect();
          const pRect = pEl.getBoundingClientRect();
          inlineTarget = { paraIdx: hitParaIdx, charOffset };
          targetIdx = null;
          setDropIndicator(null);
          setInlineCaretIndicator({
            left: caretRect.width === 0 && caretRect.left > 0 ? caretRect.left : Math.max(pRect.left, Math.min(pRect.right, moveEvt.clientX)),
            top: caretRect.height > 0 ? caretRect.top : pRect.top,
            height: caretRect.height > 0 ? caretRect.height : Math.min(24, Math.max(16, pRect.height)),
          });
          return;
        }

        inlineTarget = null;
        setInlineCaretIndicator(null);

        // 2. 문단 외 블록 경계 드롭 인디케이터 fallback
        const blockEls = Array.from(document.querySelectorAll<HTMLElement>("[data-block-idx]"));
        let bestIdx: number | null = null;
        let bestPos: "before" | "after" = "after";
        let bestDist = Infinity;

        for (const el of blockEls) {
          const elIdx = Number(el.getAttribute("data-block-idx"));
          if (isNaN(elIdx) || elIdx === blockIdx) continue;
          const r = el.getBoundingClientRect();
          if (moveEvt.clientY >= r.top && moveEvt.clientY <= r.bottom) {
            bestIdx = elIdx;
            bestPos = moveEvt.clientY < r.top + r.height / 2 ? "before" : "after";
            bestDist = 0;
            break;
          }
          const dist = moveEvt.clientY < r.top ? r.top - moveEvt.clientY : moveEvt.clientY - r.bottom;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = elIdx;
            bestPos = moveEvt.clientY < r.top ? "before" : "after";
          }
        }

        targetIdx = bestIdx;
        targetPos = bestPos;
        if (bestIdx !== null) {
          setDropIndicator({ idx: bestIdx, pos: bestPos });
        } else {
          setDropIndicator(null);
        }
      };

      const onReorderUp = () => {
        window.removeEventListener("pointermove", onReorderMove);
        window.removeEventListener("pointerup", onReorderUp);
        setDraggedBlock(null);
        setDropIndicator(null);
        setInlineCaretIndicator(null);
        if (didDrag) {
          lastPointerActionAtRef.current = Date.now();
          const savedScrollTop = canvasScrollRef.current?.scrollTop ?? null;
          if (inlineTarget && inlineTarget.paraIdx !== blockIdx) {
            moveBlockIntoParagraphText(blockIdx, inlineTarget.paraIdx, inlineTarget.charOffset);
          } else if (targetIdx !== null && targetIdx !== blockIdx) {
            moveBlock(blockIdx, targetIdx, targetPos);
          }
          requestAnimationFrame(() => {
            if (savedScrollTop !== null && canvasScrollRef.current) {
              canvasScrollRef.current.scrollTop = savedScrollTop;
            }
          });
        }
      };

      window.addEventListener("pointermove", onReorderMove);
      window.addEventListener("pointerup", onReorderUp);
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = Math.max(0.2, zoomPercent / 100);

    const limitToPage = ("limitToPage" in blk ? (blk as { limitToPage?: boolean }).limitToPage : undefined) ?? true;
    const targetBlockEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-block-idx]") || (e.currentTarget as HTMLElement);
    const boxEl = targetBlockEl.querySelector<HTMLElement>(".hwpx-resizable-box") || targetBlockEl;
    const pageEl = targetBlockEl.closest<HTMLElement>("[data-page-idx]");
    const boxRectAtStart = boxEl.getBoundingClientRect();

    let minOffX = -Infinity;
    let maxOffX = Infinity;
    let minOffY = -Infinity;
    let maxOffY = Infinity;

    if (limitToPage && pageEl) {
      const pageRect = pageEl.getBoundingClientRect();
      const pageCs = window.getComputedStyle(pageEl);
      const padL = parseFloat(pageCs.paddingLeft || "0") * zoom;
      const padR = parseFloat(pageCs.paddingRight || "0") * zoom;
      const padT = parseFloat(pageCs.paddingTop || "0") * zoom;
      const padB = parseFloat(pageCs.paddingBottom || "0") * zoom;

      const areaLeft = pageRect.left + padL;
      const areaRight = pageRect.right - padR;
      const areaTop = pageRect.top + padT;
      const areaBottom = pageRect.bottom - padB;

      minOffX = Math.round(initialOffsetX + (areaLeft - boxRectAtStart.left) / zoom);
      maxOffX = Math.round(initialOffsetX + (areaRight - boxRectAtStart.right) / zoom);
      minOffY = Math.round(initialOffsetY + (areaTop - boxRectAtStart.top) / zoom);
      maxOffY = Math.round(initialOffsetY + (areaBottom - boxRectAtStart.bottom) / zoom);
      if (maxOffX < minOffX) maxOffX = minOffX;
      if (maxOffY < minOffY) maxOffY = minOffY;
    }

    let currentOffX = initialOffsetX;
    let currentOffY = initialOffsetY;

    const isBandMove = Boolean(blocks[blockIdx]?.id.startsWith("band_"));
    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = isBandMove ? 0 : (moveEvt.clientX - startX) / zoom;
      const dy = (moveEvt.clientY - startY) / zoom;
      const rawOffX = isBandMove ? 0 : Math.max(minOffX, Math.min(maxOffX, Math.round(initialOffsetX + dx)));
      const rawOffY = Math.max(minOffY, Math.min(maxOffY, Math.round(initialOffsetY + dy)));
      const resolved = resolveNonOverlappingOffset(
        blockIdx,
        rawOffX,
        rawOffY,
        boxRectAtStart,
        isBandMove ? 0 : initialOffsetX,
        initialOffsetY,
        isBandMove ? 0 : minOffX,
        isBandMove ? 0 : maxOffX,
        minOffY,
        maxOffY,
        zoom,
      );
      currentOffX = isBandMove ? 0 : resolved.x;
      currentOffY = resolved.y;

      setDragOffsets((prev) => ({
        ...prev,
        [blockIdx]: { x: currentOffX, y: currentOffY },
      }));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      setDragOffsets((prev) => {
        const next = { ...prev };
        delete next[blockIdx];
        return next;
      });
      lastPointerActionAtRef.current = Date.now();
      const savedScrollTop = canvasScrollRef.current?.scrollTop ?? null;
      commitObjectOffset(blockIdx, currentOffX, currentOffY);
      requestAnimationFrame(() => {
        if (savedScrollTop !== null && canvasScrollRef.current) {
          canvasScrollRef.current.scrollTop = savedScrollTop;
        }
        const blockEl = document.querySelector<HTMLElement>(`[data-block-idx="${blockIdx}"]`);
        if (blockEl && !blockEl.contains(document.activeElement)) {
          blockEl.focus({ preventScroll: true });
        }
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 문단 분할 (Enter 키): 커서 위치를 기준으로 문단을 나누어 새 문단 생성
  const splitParagraph = (index: number, textBefore: string, textAfter: string) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const currentYBlock = yBlocks.get(index);
    if (!currentYBlock) return;

    const newBlockId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newYBlock = new Y.Map<unknown>();
    newYBlock.set("id", newBlockId);
    newYBlock.set("type", "paragraph");
    newYBlock.set("text", new Y.Text(textAfter));

    // 이전 문단의 서식(정렬, 글자 크기, 글꼴 등) 상속
    const align = currentYBlock.get("align");
    if (align) newYBlock.set("align", align);
    const sizePt = currentYBlock.get("sizePt");
    if (sizePt) newYBlock.set("sizePt", sizePt);
    const bold = currentYBlock.get("bold");
    if (bold !== undefined) newYBlock.set("bold", bold);
    const italic = currentYBlock.get("italic");
    if (italic !== undefined) newYBlock.set("italic", italic);
    const underline = currentYBlock.get("underline");
    if (underline !== undefined) newYBlock.set("underline", underline);
    const color = currentYBlock.get("color");
    if (color) newYBlock.set("color", color);
    const fontFamily = currentYBlock.get("fontFamily");
    if (fontFamily) newYBlock.set("fontFamily", fontFamily);

    doc.transact(() => {
      const yText = currentYBlock.get("text") as Y.Text | undefined;
      if (yText) {
        yText.delete(0, yText.length);
        yText.insert(0, textBefore);
      }
      currentYBlock.delete("rawXml");
      currentYBlock.delete("origText");
      yBlocks.insert(index + 1, [newYBlock]);
    });

    pendingCaretRef.current = { mode: "offset", blockId: newBlockId, offset: 0 };
    setSelectedIdx(index + 1);
  };

  // 문단 병합 (Backspace 키): 커서가 문단 맨 앞일 때 이전 문단 끝에 병합
  const mergeParagraphWithPrevious = (index: number) => {
    if (index <= 0) return;
    const prevBlock = blocks[index - 1];
    const currBlock = blocks[index];
    if (!currBlock || currBlock.type !== "paragraph") return;

    if (prevBlock.type === "paragraph") {
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const prevYBlock = yBlocks.get(index - 1);
      if (!prevYBlock) return;
      const prevYText = prevYBlock.get("text") as Y.Text | undefined;
      const prevText = prevYText ? prevYText.toString() : "";
      const prevTextLen = prevText.length;

      doc.transact(() => {
        if (prevYText && currBlock.text) {
          prevYText.insert(prevTextLen, currBlock.text);
        }
        prevYBlock.delete("rawXml");
        prevYBlock.delete("origText");
        yBlocks.delete(index, 1);
      });

      pendingCaretRef.current = { mode: "offset", blockId: prevBlock.id, offset: prevTextLen };
      setSelectedIdx(index - 1);
    } else {
      // 이전 블록이 도형/표/이미지 등인 경우
      if (!currBlock.text) {
        deleteBlock(index);
      }
      setSelectedIdx(index - 1);
    }
  };

  const roomEditors = editors.filter((e) => e.fileId === file.id && e.room === room && e.mode === mode);

  // 문단 텍스트 변경 (Yjs 실시간 diff 반영 - 되돌리기 및 협업 최적화)
  const updateParagraph = (index: number, newText: string) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(index);
    if (!yBlock) return;
    let yText = yBlock.get("text") as Y.Text | undefined;
    if (!yText || !(yText instanceof Y.Text)) {
      yText = new Y.Text(typeof yBlock.get("text") === "string" ? (yBlock.get("text") as string) : "");
      yBlock.set("text", yText);
    }
    const oldText = yText.toString();
    let finalText = newText;
    if (smartQuotesEnabled && newText.length === oldText.length + 1) {
      let diffPos = newText.length - 1;
      for (let i = 0; i < oldText.length; i++) {
        if (oldText[i] !== newText[i]) {
          diffPos = i;
          break;
        }
      }
      const ch = newText[diffPos];
      if (ch === '"' || ch === "'") {
        const before = diffPos === 0 ? "" : newText[diffPos - 1];
        const isOpen = diffPos === 0 || /[\s(\[{<「『《〈]/.test(before);
        const curly = ch === '"' ? (isOpen ? "“" : "”") : (isOpen ? "‘" : "’");
        finalText = newText.slice(0, diffPos) + curly + newText.slice(diffPos + 1);
      }
    }
    const blkId = String(yBlock.get("id") || "");
    if (trackChangesEnabled && blkId && oldText !== finalText) {
      const kind: "insert" | "delete" = finalText.length >= oldText.length ? "insert" : "delete";
      setTrackedChanges((prev) => {
        const existingIdx = prev.findIndex((c) => c.blockId === blkId && c.kind !== "format");
        if (existingIdx !== -1) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], kind };
          return next;
        }
        return [
          ...prev,
          { id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, blockId: blkId, kind, prevText: oldText },
        ];
      });
    }
    doc.transact(() => {
      applyTextDiffToYText(yText, finalText);
    });
  };

  const updateActiveTableCellsStyle = (patch: {
    fontFamily?: string;
    sizePt?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
    shadingColor?: string;
    align?: "left" | "center" | "right" | "justify";
  }) => {
    const tbl = blocks[selectedIdx];
    if (!tbl || tbl.type !== "table") return;
    const keys: string[] = [];
    if (tableCellSelection && tableCellSelection.blockIdx === selectedIdx) {
      const r1 = Math.min(tableCellSelection.startRow, tableCellSelection.endRow);
      const r2 = Math.max(tableCellSelection.startRow, tableCellSelection.endRow);
      const c1 = Math.min(tableCellSelection.startCol, tableCellSelection.endCol);
      const c2 = Math.max(tableCellSelection.startCol, tableCellSelection.endCol);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          keys.push(`${tbl.id}:${r}:${c}`);
        }
      }
    } else if (activeTableCell && activeTableCell.blockIdx === selectedIdx) {
      keys.push(`${tbl.id}:${activeTableCell.row}:${activeTableCell.col}`);
    }
    if (keys.length === 0) return;
    setTableCellStyles((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        next[k] = { ...(next[k] || {}), ...patch };
      }
      return next;
    });
  };

  // 문단 서식 변경 (폰트, 크기, 굵기, 기울임, 밑줄, 색상, 정렬) - 다중 선택 범위 일괄 지원
  const updateParagraphStyle = (index: number, patch: Partial<HwpxParagraphBlock>) => {
    if (isTableCellEditing && index === selectedIdx) {
      updateActiveTableCellsStyle({
        fontFamily: patch.fontFamily,
        sizePt: patch.sizePt,
        bold: patch.bold,
        italic: patch.italic,
        underline: patch.underline,
        strikethrough: patch.strikethrough,
        color: patch.color,
        shadingColor: patch.shadingColor,
        align: patch.align,
      });
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const indicesToUpdate: number[] = [];
    const crossSel = getCrossParagraphSelection();
    if (crossSel && index >= crossSel.startIdx && index <= crossSel.endIdx) {
      for (let i = crossSel.startIdx; i <= crossSel.endIdx; i++) {
        indicesToUpdate.push(i);
      }
    } else {
      indicesToUpdate.push(index);
    }
    if (trackChangesEnabled) {
      for (const idx of indicesToUpdate) {
        const curBlk = blocks[idx];
        if (curBlk && curBlk.type === "paragraph") {
          const prevStyle: Partial<HwpxParagraphBlock> = {};
          (Object.keys(patch) as Array<keyof HwpxParagraphBlock>).forEach((k) => {
            (prevStyle as Record<string, unknown>)[k] = curBlk[k];
          });
          setTrackedChanges((prev) => {
            if (prev.some((c) => c.blockId === curBlk.id && c.kind === "format")) return prev;
            return [
              ...prev,
              { id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, blockId: curBlk.id, kind: "format", prevStyle },
            ];
          });
        }
      }
    }
    doc.transact(() => {
      for (const idx of indicesToUpdate) {
        const yBlock = yBlocks.get(idx);
        if (!yBlock) continue;
        if (patch.bold !== undefined) yBlock.set("bold", patch.bold);
        if (patch.italic !== undefined) yBlock.set("italic", patch.italic);
        if (patch.underline !== undefined) yBlock.set("underline", patch.underline);
        if (patch.strikethrough !== undefined) yBlock.set("strikethrough", patch.strikethrough);
        if (patch.sizePt !== undefined) yBlock.set("sizePt", patch.sizePt);
        if (patch.align !== undefined) yBlock.set("align", patch.align);
        if (patch.color !== undefined) yBlock.set("color", patch.color);
        if (patch.shadingColor !== undefined) yBlock.set("shadingColor", patch.shadingColor);
        if (patch.relativeSizePct !== undefined) yBlock.set("relativeSizePct", patch.relativeSizePct);
        if (patch.charWidthPct !== undefined) yBlock.set("charWidthPct", patch.charWidthPct);
        if (patch.charPosPct !== undefined) yBlock.set("charPosPct", patch.charPosPct);
        if (patch.letterSpacingPct !== undefined) yBlock.set("letterSpacingPct", patch.letterSpacingPct);
        if (patch.marginLeftPt !== undefined) yBlock.set("marginLeftPt", patch.marginLeftPt);
        if (patch.marginRightPt !== undefined) yBlock.set("marginRightPt", patch.marginRightPt);
        if (patch.firstLineType !== undefined) yBlock.set("firstLineType", patch.firstLineType);
        if (patch.firstLinePt !== undefined) yBlock.set("firstLinePt", patch.firstLinePt);
        if (patch.lineSpacingPct !== undefined) yBlock.set("lineSpacingPct", patch.lineSpacingPct);
        if (patch.spaceBeforePt !== undefined) yBlock.set("spaceBeforePt", patch.spaceBeforePt);
        if (patch.spaceAfterPt !== undefined) yBlock.set("spaceAfterPt", patch.spaceAfterPt);
        if (patch.paraBorderType !== undefined) yBlock.set("paraBorderType", patch.paraBorderType);
        if (patch.paraBorderWidth !== undefined) yBlock.set("paraBorderWidth", patch.paraBorderWidth);
        if (patch.paraBorderColor !== undefined) yBlock.set("paraBorderColor", patch.paraBorderColor);
        if (patch.paraBgColor !== undefined) yBlock.set("paraBgColor", patch.paraBgColor);
        if (patch.fontFamily !== undefined) {
          yBlock.set("fontFamily", patch.fontFamily);
          yBlock.set("fontEdited", true); // 저장할 때 원본 문단 XML에도 새 글꼴을 반영
        }
      }
    });
  };

  // ── 한컴오피스 스타일 확장 상태 및 기능들 ──
  const [activeTab, setActiveTab] = useState<"file" | "edit" | "view" | "insert" | "format" | "page" | "table" | "review" | "tools">("insert");
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [showParaMarks, setShowParaMarks] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  // 모달 상태들
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchDirection, setSearchDirection] = useState<"down" | "up" | "all">("down");
  const [gotoType, setGotoType] = useState<"page" | "section" | "line" | "style" | "control" | "bookmark">("page");
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceKeyword, setReplaceKeyword] = useState("");
  const [replaceMsg, setReplaceMsg] = useState("");
  const [showDocStatsModal, setShowDocStatsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPageSetupModal, setShowPageSetupModal] = useState(false);

  // 한컴독스 표준 편집 용지 상태 (원본 HWPX secPr의 pagePr/margin이 있으면 자동 동기화)
  const parsedPageSetup = useMemo(() => {
    const HWP_PER_MM = 7200 / 25.4;
    const toMm = (raw: string | undefined, def: number) => raw ? Number((parseInt(raw, 10) / HWP_PER_MM).toFixed(2)) : def;
    const pagePrAttrs = originalXml?.match(/<hp:pagePr\b([^>]*)>/i)?.[1] || "";
    const marginAttrs = originalXml?.match(/<hp:margin\b([^>]*)>/i)?.[1] || "";
    const wMm = toMm(pagePrAttrs.match(/\bwidth="(\d+)"/i)?.[1], 210.0);
    const hMm = toMm(pagePrAttrs.match(/\bheight="(\d+)"/i)?.[1], 297.0);
    const mLeft = toMm(marginAttrs.match(/\bleft="(\d+)"/i)?.[1], 30.0);
    const mRight = toMm(marginAttrs.match(/\bright="(\d+)"/i)?.[1], 30.0);
    const mTop = toMm(marginAttrs.match(/\btop="(\d+)"/i)?.[1], 20.0);
    const mBottom = toMm(marginAttrs.match(/\bbottom="(\d+)"/i)?.[1], 20.0);
    const mHeader = toMm(marginAttrs.match(/\bheader="(\d+)"/i)?.[1], 15.0);
    const mFooter = toMm(marginAttrs.match(/\bfooter="(\d+)"/i)?.[1], 10.0);
    const mGutter = toMm(marginAttrs.match(/\bgutter="(\d+)"/i)?.[1], 0.0);
    return { wMm, hMm, mLeft, mRight, mTop, mBottom, mHeader, mFooter, mGutter };
  }, [originalXml]);

  const [pageSizeType, setPageSizeType] = useState<string>("A4");
  const [pageWidthMm, setPageWidthMm] = useState<number>(() => parsedPageSetup.wMm);
  const [pageHeightMm, setPageHeightMm] = useState<number>(() => parsedPageSetup.hMm);
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">(() => parsedPageSetup.wMm > parsedPageSetup.hMm ? "landscape" : "portrait");
  const [pageBindingType, setPageBindingType] = useState<"left" | "spread" | "top">("left");
  const [pageMarginTopMm, setPageMarginTopMm] = useState<number>(() => parsedPageSetup.mTop);
  const [pageMarginBottomMm, setPageMarginBottomMm] = useState<number>(() => parsedPageSetup.mBottom);
  const [pageMarginLeftMm, setPageMarginLeftMm] = useState<number>(() => parsedPageSetup.mLeft);
  const [pageMarginRightMm, setPageMarginRightMm] = useState<number>(() => parsedPageSetup.mRight);
  const [pageHeaderMm, setPageHeaderMm] = useState<number>(() => parsedPageSetup.mHeader);
  const [pageFooterMm, setPageFooterMm] = useState<number>(() => parsedPageSetup.mFooter);
  const [pageGutterMm, setPageGutterMm] = useState<number>(() => parsedPageSetup.mGutter);

  useEffect(() => {
    setPageWidthMm(parsedPageSetup.wMm);
    setPageHeightMm(parsedPageSetup.hMm);
    setPageOrientation(parsedPageSetup.wMm > parsedPageSetup.hMm ? "landscape" : "portrait");
    setPageMarginTopMm(parsedPageSetup.mTop);
    setPageMarginBottomMm(parsedPageSetup.mBottom);
    setPageMarginLeftMm(parsedPageSetup.mLeft);
    setPageMarginRightMm(parsedPageSetup.mRight);
    setPageHeaderMm(parsedPageSetup.mHeader);
    setPageFooterMm(parsedPageSetup.mFooter);
    setPageGutterMm(parsedPageSetup.mGutter);
  }, [parsedPageSetup]);
  const [pageApplyScope, setPageApplyScope] = useState<string>("문서 전체");
  const [showPageSetupToast, setShowPageSetupToast] = useState(false);
  const [pagePulse, setPagePulse] = useState(false);

  // 자동 페이지 나누기: 블록 실측 높이와 수동 쪽 나누기(pageBreak)를 기준으로 페이지별 블록/줄 분할 계산
  const recomputePagination = useCallback(() => {
    if (blocks.length === 0) {
      setPageBreakIndices((prev) => (prev.length === 1 && prev[0] === 0 ? prev : [0]));
      setPageSlices((prev) => (prev.length === 1 && prev[0].length === 0 ? prev : [[]]));
      return;
    }
    const root = canvasRef.current;
    if (!root) return;

    const nextW = root.offsetWidth;
    const nextH = root.offsetHeight;
    if (nextW > 0 && nextH > 0) {
      setCanvasUnscaledSize((prev) => (prev && prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
    }

    const pagePxH = Math.round(pageHeightMm * 3.78);
    const padTop = Math.max(16, Math.round((pageMarginTopMm + pageHeaderMm) * 3.78));
    const padBottom = Math.max(16, Math.round((pageMarginBottomMm + pageFooterMm) * 3.78));
    // 한컴 조판 엔진은 마지막 줄의 아래쪽 행간 여백(half-leading)이 여백 경계를 넘지 않으면 현재 쪽에 수용함
    const usableH = Math.max(160, pagePxH - padTop - padBottom) - 4;

    type SliceItem = { idx: number; sliceStart?: number; sliceEnd?: number };
    const breaks: number[] = [0];
    const nextPages: SliceItem[][] = [[]];
    let accH = 0;
    let prevMb = 0;

    const scale = showPageOutline ? Math.max(0.1, zoomPercent / 100) : 1;

    const findSplitOffset = (pEl: HTMLElement, fullText: string, startOff: number, maxH: number): { endOff: number; partH: number } | null => {
      const subText = fullText.slice(startOff);
      if (!subText || maxH < 16) return null;
      const clone = pEl.cloneNode(false) as HTMLElement;
      clone.style.position = "absolute";
      clone.style.visibility = "hidden";
      clone.style.pointerEvents = "none";
      clone.style.left = "-99999px";
      clone.style.top = "0";
      clone.style.width = `${pEl.getBoundingClientRect().width / scale}px`;
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (/[^\s()]+\([^()\s]*/.test(subText) && !subText.includes("\n")) {
        clone.innerHTML = esc(subText).replace(/([^\s()]+\([^()\s]*)/g, '<span style="white-space:nowrap">$1</span>');
      } else {
        clone.innerText = subText;
      }
      pEl.parentElement?.appendChild(clone);
      try {
        const cloneRect = clone.getBoundingClientRect();
        const totalH = cloneRect.height / scale;
        if (totalH <= maxH + 0.5) return null;

        // Collect all text nodes in clone
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
        const tNodes: Array<{ node: Text; start: number; end: number }> = [];
        let accLen = 0;
        let cur: Node | null;
        while ((cur = walker.nextNode())) {
          const len = (cur as Text).nodeValue?.length || 0;
          tNodes.push({ node: cur as Text, start: accLen, end: accLen + len });
          accLen += len;
        }
        if (accLen < 2) return null;

        const measurePrefix = (charCount: number): number => {
          const range = document.createRange();
          const first = tNodes[0];
          range.setStart(first.node, 0);
          let targetNode = tNodes[tNodes.length - 1];
          let targetOff = targetNode.end - targetNode.start;
          for (const tn of tNodes) {
            if (charCount <= tn.end) {
              targetNode = tn;
              targetOff = Math.max(0, charCount - tn.start);
              break;
            }
          }
          range.setEnd(targetNode.node, targetOff);
          const rects = range.getClientRects();
          if (rects.length === 0) return 0;
          let maxBottom = cloneRect.top;
          for (let r = 0; r < rects.length; r++) {
            if (rects[r].width > 0 && rects[r].bottom > maxBottom) {
              maxBottom = rects[r].bottom;
            }
          }
          return (maxBottom - cloneRect.top) / scale;
        };

        let lo = 1;
        let hi = accLen - 1;
        let best = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const h = measurePrefix(mid);
          if (h <= maxH + 0.5) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (best <= 0 || best >= accLen) return null;
        // Snap back to a whitespace/newline boundary if `best` landed mid-word or right before punctuation
        if (best < subText.length && !/\s/.test(subText[best]) && !/\s/.test(subText[best - 1])) {
          let snapped = best;
          while (snapped > 0 && !/\s/.test(subText[snapped - 1])) {
            snapped--;
          }
          if (snapped > 0) best = snapped;
        }
        const partH = measurePrefix(best);
        return { endOff: startOff + best, partH };
      } finally {
        clone.remove();
      }
    };

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const els = Array.from(root.querySelectorAll<HTMLElement>(`[data-block-idx="${i}"]`)).filter(
        (node) => node.tagName !== "P"
      );
      const el = els[0] || root.querySelector<HTMLElement>(`[data-block-idx="${i}"]`);
      const style = el ? window.getComputedStyle(el) : null;
      const mb = style ? parseFloat(style.marginBottom || "0") || 0 : 0;
      const mt = style ? parseFloat(style.marginTop || "0") || 0 : 0;
      const elH = els.length > 0
        ? els.reduce((sum, node) => sum + node.getBoundingClientRect().height / scale, 0)
        : (el ? el.getBoundingClientRect().height / scale : 28);
      const isFirstOnPage = nextPages[nextPages.length - 1].length === 0;
      const collapsedOverlap = isFirstOnPage ? 0 : Math.min(prevMb, mt);
      const h = el ? Math.max(16, elH + mt + mb - collapsedOverlap) : 28;

      if (i === 0) {
        nextPages[0].push({ idx: 0 });
        accH = el ? Math.max(16, elH + mt + mb) : 28;
        prevMb = mb;
        continue;
      }

      const forced = b.type === "paragraph" && Boolean(b.pageBreak);
      if (forced) {
        breaks.push(i);
        nextPages.push([{ idx: i }]);
        accH = el ? Math.max(16, elH + mt + mb) : 28;
        prevMb = mb;
        continue;
      }

      if (accH + h <= usableH + 0.5) {
        nextPages[nextPages.length - 1].push({ idx: i });
        accH += h;
        prevMb = mb;
        continue;
      }

      // If this is a plain paragraph and at least 1 line fits on the current page, split it line-by-line
      const pEl = el?.querySelector("p") as HTMLElement | null;
      if (b.type === "paragraph" && pEl && b.text.length > 1 && usableH - accH >= 18) {
        let curStart = 0;
        let splitWorked = false;
        while (curStart < b.text.length) {
          const remH = usableH - accH;
          const split = findSplitOffset(pEl, b.text, curStart, remH);
          if (!split || split.endOff <= curStart) {
            if (!splitWorked) break;
            // Remainder fits on a fresh page
            breaks.push(i);
            nextPages.push([{ idx: i, sliceStart: curStart, sliceEnd: b.text.length }]);
            const remMeasure = findSplitOffset(pEl, b.text, curStart, 99999);
            accH = remMeasure ? remMeasure.partH : Math.max(21, h);
            curStart = b.text.length;
            break;
          }
          splitWorked = true;
          nextPages[nextPages.length - 1].push({ idx: i, sliceStart: curStart, sliceEnd: split.endOff });
          let nextStart = split.endOff;
          while (nextStart < b.text.length && b.text[nextStart] === " ") nextStart++;
          curStart = nextStart;
          if (curStart >= b.text.length) break;
          // Start next page for the remaining text
          breaks.push(i);
          nextPages.push([]);
          accH = 0;
          // Check if remaining text fits on the new page
          const checkRest = findSplitOffset(pEl, b.text, curStart, usableH);
          if (!checkRest) {
            nextPages[nextPages.length - 1].push({ idx: i, sliceStart: curStart, sliceEnd: b.text.length });
            const lineCountEst = Math.max(1, Math.round((h - split.partH) * 10) / 10);
            accH = Math.max(21, lineCountEst);
            curStart = b.text.length;
            break;
          }
        }
        if (splitWorked) continue;
      }

      if (nextPages[nextPages.length - 1].length > 0) {
        breaks.push(i);
        nextPages.push([{ idx: i }]);
        accH = el ? Math.max(16, elH + mt + mb) : 28;
        prevMb = mb;
      } else {
        nextPages[nextPages.length - 1].push({ idx: i });
        accH += h;
        prevMb = mb;
      }
    }

    setPageSlices((prev) => {
      const same =
        prev.length === nextPages.length &&
        prev.every(
          (pg, pIdx) =>
            pg.length === nextPages[pIdx].length &&
            pg.every(
              (s, sIdx) =>
                s.idx === nextPages[pIdx][sIdx].idx &&
                s.sliceStart === nextPages[pIdx][sIdx].sliceStart &&
                s.sliceEnd === nextPages[pIdx][sIdx].sliceEnd
            )
        );
      return same ? prev : nextPages;
    });

    setPageBreakIndices((prev) => {
      if (prev.length === breaks.length && prev.every((v, idx) => v === breaks[idx])) {
        return prev;
      }
      // 블록이 다음/이전 페이지로 이동할 때 포커스 및 커서 오프셋 보존
      const activeEl = document.activeElement as HTMLElement | null;
      const activeBlockEl = activeEl?.closest("[data-block-id]") as HTMLElement | null;
      if (activeBlockEl && !pendingCaretRef.current && !pendingObjectFocusRef.current) {
        const activeBlockId = activeBlockEl.getAttribute("data-block-id");
        const pEl = activeBlockEl.querySelector("p");
        if (activeBlockId && pEl && (activeEl === pEl || pEl.contains(activeEl))) {
          pendingCaretRef.current = {
            mode: "offset",
            blockId: activeBlockId,
            offset: getCaretOffset(pEl),
          };
        }
      }
      return breaks;
    });
  }, [blocks, pageWidthMm, pageHeightMm, pageMarginTopMm, pageMarginBottomMm, pageMarginLeftMm, pageMarginRightMm, pageHeaderMm, pageFooterMm, pageGutterMm, pageBindingType, pageViewColumns, showPageOutline, zoomPercent]);

  useLayoutEffect(() => {
    recomputePagination();
  }, [recomputePagination]);


  useEffect(() => {
    const root = canvasRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => recomputePagination());
    });
    ro.observe(root);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [recomputePagination]);

  const isNoteBlock = (b?: HwpxCollabBlock) =>
    !!b && (b.id.startsWith("footnote-") || b.id.startsWith("endnote-"));

  const pages = useMemo<Array<Array<{ idx: number; sliceStart?: number; sliceEnd?: number }>>>(() => {
    if (blocks.length === 0) return [[]];
    if (pageSlices.length > 0) {
      const valid = pageSlices
        .map((pg) => pg.filter((s) => s.idx >= 0 && s.idx < blocks.length && !isNoteBlock(blocks[s.idx])))
        .filter((pg) => pg.length > 0);
      if (valid.length > 0) return valid;
    }
    const bodyOnly = blocks.map((_, idx) => ({ idx })).filter((s) => !isNoteBlock(blocks[s.idx]));
    return [bodyOnly.length > 0 ? bodyOnly : []];
  }, [blocks, pageSlices]);

  const totalPages = Math.max(1, pages.length);
  const currentPageNum = useMemo(() => {
    const found = pages.findIndex((items) => items.some((s) => s.idx === selectedIdx));
    return found >= 0 ? found + 1 : 1;
  }, [pages, selectedIdx]);

  // 편집 용지 대화상자 임시(Draft) 편집 상태
  const [draftPageSizeType, setDraftPageSizeType] = useState<string>("A4");
  const [draftPageWidthMm, setDraftPageWidthMm] = useState<number>(210.0);
  const [draftPageHeightMm, setDraftPageHeightMm] = useState<number>(297.0);
  const [draftPageOrientation, setDraftPageOrientation] = useState<"portrait" | "landscape">("portrait");
  const [draftPageBindingType, setDraftPageBindingType] = useState<"left" | "spread" | "top">("left");
  const [draftPageMarginTopMm, setDraftPageMarginTopMm] = useState<number>(20.0);
  const [draftPageMarginBottomMm, setDraftPageMarginBottomMm] = useState<number>(20.0);
  const [draftPageMarginLeftMm, setDraftPageMarginLeftMm] = useState<number>(25.0);
  const [draftPageMarginRightMm, setDraftPageMarginRightMm] = useState<number>(25.0);
  const [draftPageHeaderMm, setDraftPageHeaderMm] = useState<number>(15.0);
  const [draftPageFooterMm, setDraftPageFooterMm] = useState<number>(10.0);
  const [draftPageGutterMm, setDraftPageGutterMm] = useState<number>(0.0);
  const [draftPageApplyScope, setDraftPageApplyScope] = useState<string>("문서 전체");

  const openPageSetupModal = () => {
    setDraftPageSizeType(pageSizeType);
    setDraftPageWidthMm(pageWidthMm);
    setDraftPageHeightMm(pageHeightMm);
    setDraftPageOrientation(pageOrientation);
    setDraftPageBindingType(pageBindingType);
    setDraftPageMarginTopMm(pageMarginTopMm);
    setDraftPageMarginBottomMm(pageMarginBottomMm);
    setDraftPageMarginLeftMm(pageMarginLeftMm);
    setDraftPageMarginRightMm(pageMarginRightMm);
    setDraftPageHeaderMm(pageHeaderMm);
    setDraftPageFooterMm(pageFooterMm);
    setDraftPageGutterMm(pageGutterMm);
    setDraftPageApplyScope(pageApplyScope);
    setShowPageSetupModal(true);
  };

  const HANCOM_PAPER_SIZES: Record<string, { label: string; w: number; h: number }> = {
    Print132: { label: "프린트 132 [335.3 x 279.4 mm]", w: 335.3, h: 279.4 },
    Letter: { label: "레터 [215.9 x 279.4 mm]", w: 215.9, h: 279.4 },
    B5: { label: "B5(46배판) [182 x 257 mm]", w: 182.0, h: 257.0 },
    B4: { label: "B4(타블로이드판) [257 x 364 mm]", w: 257.0, h: 364.0 },
    A4: { label: "A4(국배판) [210 x 297 mm]", w: 210.0, h: 297.0 },
    A3: { label: "A3(국배배판) [297 x 420 mm]", w: 297.0, h: 420.0 },
    Legal: { label: "리갈 [215.9 x 355.6 mm]", w: 215.9, h: 355.6 },
    A6: { label: "A6(문고판) [105 x 148 mm]", w: 105.0, h: 148.0 },
    A5: { label: "A5(국판) [148 x 210 mm]", w: 148.0, h: 210.0 },
    ShinGuk: { label: "신국판 [148 x 225 mm]", w: 148.0, h: 225.0 },
    Crown: { label: "크라운판 [176 x 248 mm]", w: 176.0, h: 248.0 },
    Executive: { label: "Executive [184.1 x 266.7 mm]", w: 184.1, h: 266.7 },
    ExecutiveJIS: { label: "Executive(JIS) [216 x 329.9 mm]", w: 216.0, h: 329.9 },
    EnvDL: { label: "Envelope DL [110 x 220 mm]", w: 110.0, h: 220.0 },
    EnvC5: { label: "Envelope C5 [162 x 229 mm]", w: 162.0, h: 229.0 },
    EnvB5: { label: "Envelope B5 [176 x 250 mm]", w: 176.0, h: 250.0 },
    EnvMonarch: { label: "Envelope Monarch [98.4 x 190.5 mm]", w: 98.4, h: 190.5 },
    Braille: { label: "점자출력용지 [230 x 279.4 mm]", w: 230.0, h: 279.4 },
    Sextodecimo: { label: "16절지(국판) [159 x 234 mm]", w: 159.0, h: 234.0 },
  };

  const handleDraftPageSizeTypeChange = (type: string) => {
    setDraftPageSizeType(type);
    const preset = HANCOM_PAPER_SIZES[type];
    if (preset) {
      const isPortrait = draftPageOrientation === "portrait";
      setDraftPageWidthMm(isPortrait ? preset.w : preset.h);
      setDraftPageHeightMm(isPortrait ? preset.h : preset.w);
    }
  };

  const handleDraftOrientationChange = (orient: "portrait" | "landscape") => {
    if (orient === draftPageOrientation) return;
    setDraftPageOrientation(orient);
    const w = draftPageWidthMm;
    const h = draftPageHeightMm;
    setDraftPageWidthMm(h);
    setDraftPageHeightMm(w);
  };

  const handleApplyPageSetup = () => {
    setPageSizeType(draftPageSizeType);
    setPageWidthMm(draftPageWidthMm);
    setPageHeightMm(draftPageHeightMm);
    setPageOrientation(draftPageOrientation);
    setPageBindingType(draftPageBindingType);
    setPageMarginTopMm(draftPageMarginTopMm);
    setPageMarginBottomMm(draftPageMarginBottomMm);
    setPageMarginLeftMm(draftPageMarginLeftMm);
    setPageMarginRightMm(draftPageMarginRightMm);
    setPageHeaderMm(draftPageHeaderMm);
    setPageFooterMm(draftPageFooterMm);
    setPageGutterMm(draftPageGutterMm);
    setPageApplyScope(draftPageApplyScope);
    setShowPageSetupModal(false);

    setPagePulse(true);
    setTimeout(() => setPagePulse(false), 1200);

    setShowPageSetupToast(true);
    setTimeout(() => setShowPageSetupToast(false), 3500);
  };

  // 2D 어울림(SQUARE) 동적 줄바꿈: 부유 개체의 실제 위치/크기에 맞춰 겹치는 문단 줄의 좌·우·양쪽 텍스트를 실시간 감쌈
  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) return;

    // 1) 기존 스페이서 및 자리차지 앵커 보정 정리
    const oldSpacers = root.querySelectorAll('[data-square-spacer="true"]');
    const touchedPs = new Set<HTMLElement>();
    oldSpacers.forEach((sp) => {
      const p = sp.closest("p");
      if (p) touchedPs.add(p as HTMLElement);
      sp.remove();
    });
    touchedPs.forEach((p) => p.normalize());
    root.querySelectorAll<HTMLElement>('[data-tb-comp="true"]').forEach((el) => {
      el.style.transform = "";
      el.removeAttribute("data-tb-comp");
      el.removeAttribute("data-tb-comp-y");
    });

    const zoom = Math.max(0.2, zoomPercent / 100);

    // 2) SQUARE(어울림) / TOP_AND_BOTTOM(자리차지) 부유 개체 박스 수집
    const obstacles: Array<{
      idx: number;
      rect: DOMRect;
      textWrap: "SQUARE" | "TOP_AND_BOTTOM";
      textFlow: "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY";
      pageEl: HTMLElement | null;
    }> = [];

    blocks.forEach((b, idx) => {
      if (
        (b.type === "image" || b.type === "shape" || b.type === "chart" || b.type === "table") &&
        b.treatAsChar === false &&
        (b.textWrap === "SQUARE" || b.textWrap === "TOP_AND_BOTTOM")
      ) {
        const blockEl = root.querySelector<HTMLElement>(`[data-block-idx="${idx}"]`);
        const boxEl = blockEl?.querySelector<HTMLElement>(".hwpx-resizable-box") || blockEl;
        if (boxEl) {
          const rect = boxEl.getBoundingClientRect();
          if (rect.width > 4 && rect.height > 4) {
            obstacles.push({
              idx,
              rect,
              textWrap: b.textWrap,
              textFlow: ("textFlow" in b ? b.textFlow : undefined) || "BOTH_SIDES",
              pageEl: blockEl?.closest<HTMLElement>("[data-page-idx]") || null,
            });
          }
        }
      }
    });

    if (obstacles.length === 0) return;

    const compensateFloatingBelow = (paraEl: HTMLElement, paraPageEl: HTMLElement | null, deltaPx: number) => {
      if (deltaPx === 0) return;
      const pBlockEl = paraEl.closest<HTMLElement>("[data-block-idx]");
      const pIdx = pBlockEl ? Number(pBlockEl.getAttribute("data-block-idx")) : NaN;
      if (Number.isNaN(pIdx)) return;
      blocks.forEach((fb, fbIdx) => {
        if (
          (fb.type === "image" || fb.type === "shape" || fb.type === "chart" || fb.type === "table") &&
          fb.treatAsChar === false &&
          fbIdx > pIdx
        ) {
          const fbEl = root.querySelector<HTMLElement>(`[data-block-idx="${fbIdx}"]`);
          const fbPage = fbEl?.closest<HTMLElement>("[data-page-idx]");
          if (fbEl && (!paraPageEl || fbPage === paraPageEl)) {
            const boxEl = fbEl.querySelector<HTMLElement>(".hwpx-resizable-box") || fbEl;
            const prevComp = Number(boxEl.getAttribute("data-tb-comp-y") || "0");
            const nextComp = prevComp - deltaPx;
            boxEl.setAttribute("data-tb-comp", "true");
            boxEl.setAttribute("data-tb-comp-y", String(nextComp));
            boxEl.style.transform = `translateY(${nextComp}px)`;
          }
        }
      });
    };

    // 3) 각 문단에서 겹치는 줄을 찾아 인라인 스페이서 삽입
    const pEls = Array.from(root.querySelectorAll<HTMLElement>('[data-block-type="paragraph"] p'));
    for (const pEl of pEls) {
      if (document.activeElement === pEl) continue;
      const pRect = pEl.getBoundingClientRect();
      if (pRect.height <= 0 || !pEl.textContent) continue;

      const pageEl = pEl.closest<HTMLElement>("[data-page-idx]");
      const matchingObs = obstacles.filter(
        (o) => (!o.pageEl || o.pageEl === pageEl) && pRect.bottom > o.rect.top && pRect.top < o.rect.bottom
      );
      if (matchingObs.length === 0) continue;

      const pageRect = pageEl ? pageEl.getBoundingClientRect() : pRect;
      const pageCs = pageEl ? window.getComputedStyle(pageEl) : null;
      const padL = pageCs ? parseFloat(pageCs.paddingLeft || "0") * zoom : 0;
      const padR = pageCs ? parseFloat(pageCs.paddingRight || "0") * zoom : 0;
      const areaLeft = pageRect.left + padL;
      const areaRight = pageRect.right - padR;

      const obs = matchingObs[0];
      if (obs.textWrap === "TOP_AND_BOTTOM") {
        // 자리차지: 겹치는 첫 줄 앞에 개체 아래까지 밀어내는 블록 스페이서 삽입 (좌우에 글자가 오지 못함)
        const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => ((n.parentElement?.getAttribute("data-square-spacer") === "true") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        const textNodes: Array<{ node: Text; start: number; len: number }> = [];
        let total = 0;
        let tn: Node | null;
        while ((tn = walker.nextNode())) {
          const t = tn as Text;
          const len = t.textContent?.length || 0;
          if (len > 0) {
            textNodes.push({ node: t, start: total, len });
            total += len;
          }
        }
        let curLineTop = -Infinity;
        let lineStartIdx = 0;
        let pushIdx = -1;
        let pushHeightPx = 0;
        for (let i = 0; i < total; i++) {
          let cr: DOMRect | null = null;
          for (const entry of textNodes) {
            if (i >= entry.start && i < entry.start + entry.len) {
              const rng = document.createRange();
              const local = i - entry.start;
              rng.setStart(entry.node, local);
              rng.setEnd(entry.node, local + 1);
              cr = rng.getBoundingClientRect();
              break;
            }
          }
          if (!cr || cr.height === 0) continue;
          if (curLineTop === -Infinity || Math.abs(cr.top - curLineTop) > Math.max(4, cr.height * 0.45)) {
            curLineTop = cr.top;
            lineStartIdx = i;
          }
          if (cr.bottom > obs.rect.top + 1 && cr.top < obs.rect.bottom - 1) {
            pushIdx = lineStartIdx;
            pushHeightPx = Math.max(4, Math.ceil((obs.rect.bottom + 8 * zoom - curLineTop) / zoom));
            break;
          }
        }
        if (pushIdx !== -1 && pushHeightPx > 0) {
          let pt: { node: Text; offset: number } | null = null;
          for (const entry of textNodes) {
            if (pushIdx >= entry.start && pushIdx <= entry.start + entry.len) {
              pt = { node: entry.node, offset: pushIdx - entry.start };
              break;
            }
          }
          if (pt) {
            const spacer = document.createElement("span");
            spacer.setAttribute("data-square-spacer", "true");
            spacer.setAttribute("contenteditable", "false");
            spacer.style.display = "block";
            spacer.style.width = "100%";
            spacer.style.height = `${pushHeightPx}px`;
            spacer.style.pointerEvents = "none";
            spacer.style.userSelect = "none";
            const rng = document.createRange();
            rng.setStart(pt.node, pt.offset);
            rng.collapse(true);
            rng.insertNode(spacer);

            compensateFloatingBelow(pEl, pageEl, pushHeightPx);
          }
        }
        continue;
      }

      const gapLeft = obs.rect.left - areaLeft;
      const gapRight = areaRight - obs.rect.right;
      const effectiveMode: "LEFT" | "RIGHT" | "BOTH" =
        obs.textFlow === "LEFT_ONLY"
          ? "LEFT"
          : obs.textFlow === "RIGHT_ONLY"
            ? "RIGHT"
            : gapLeft < 24 * zoom
              ? "RIGHT"
              : gapRight < 24 * zoom
                ? "LEFT"
                : "BOTH";

      const oldPHeight = pEl.getBoundingClientRect().height;
      let safety = 0;
      let searchMinGlobal = 0;

      while (safety++ < 35) {
        const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => ((n.parentElement?.getAttribute("data-square-spacer") === "true") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        const textNodes: Array<{ node: Text; start: number; len: number }> = [];
        let total = 0;
        let tn: Node | null;
        while ((tn = walker.nextNode())) {
          const t = tn as Text;
          const len = t.textContent?.length || 0;
          if (len > 0) {
            textNodes.push({ node: t, start: total, len });
            total += len;
          }
        }
        if (searchMinGlobal >= total) break;

        const charRectAt = (gIdx: number): DOMRect | null => {
          for (const entry of textNodes) {
            if (gIdx >= entry.start && gIdx < entry.start + entry.len) {
              const r = document.createRange();
              const local = gIdx - entry.start;
              r.setStart(entry.node, local);
              r.setEnd(entry.node, local + 1);
              return r.getBoundingClientRect();
            }
          }
          return null;
        };

        const resolveAt = (gIdx: number): { node: Text; offset: number } | null => {
          for (const entry of textNodes) {
            if (gIdx >= entry.start && gIdx <= entry.start + entry.len) {
              return { node: entry.node, offset: gIdx - entry.start };
            }
          }
          return null;
        };

        let insertGlobalIdx = -1;
        let spacerWidthPx = 0;
        let nextLineMinIdx = total;

        // 겹치는 첫 줄 탐색
        let curLineTop = -Infinity;
        let lineStartIdx = searchMinGlobal;
        for (let i = searchMinGlobal; i < total; i++) {
          const cr = charRectAt(i);
          if (!cr || cr.height === 0) continue;
          if (curLineTop === -Infinity || Math.abs(cr.top - curLineTop) > Math.max(4, cr.height * 0.45)) {
            curLineTop = cr.top;
            lineStartIdx = i;
          }
          const overlapsY = cr.bottom > obs.rect.top + 1 && cr.top < obs.rect.bottom - 1;
          if (!overlapsY) {
            if (cr.top >= obs.rect.bottom) {
              nextLineMinIdx = total;
              break;
            }
            continue;
          }

          if (effectiveMode === "RIGHT") {
            insertGlobalIdx = lineStartIdx;
            spacerWidthPx = Math.max(0, (obs.rect.right + 8 * zoom - areaLeft) / zoom);
            // 다음 줄로 searchMinGlobal 이동
            for (let j = i + 1; j < total; j++) {
              const jr = charRectAt(j);
              if (jr && Math.abs(jr.top - curLineTop) > Math.max(4, jr.height * 0.45)) {
                nextLineMinIdx = j;
                break;
              }
            }
            break;
          } else {
            // LEFT / BOTH: 개체 왼쪽 여백(4px)을 넘는 글자에서 어절(단어) 시작 위치로 스냅
            if (cr.right > obs.rect.left - 4 * zoom) {
              const charAtGlobal = (gIdx: number): string => {
                for (const entry of textNodes) {
                  if (gIdx >= entry.start && gIdx < entry.start + entry.len) {
                    return entry.node.textContent?.[gIdx - entry.start] || "";
                  }
                }
                return "";
              };
              let splitIdx = i;
              if (i > lineStartIdx) {
                let cur = i;
                while (cur > lineStartIdx && !/\s/.test(charAtGlobal(cur - 1))) {
                  cur--;
                }
                if (cur > lineStartIdx) splitIdx = cur;
              }
              const splitRect = splitIdx !== i ? (charRectAt(splitIdx) || cr) : cr;
              insertGlobalIdx = splitIdx;
              spacerWidthPx =
                effectiveMode === "LEFT"
                  ? Math.max(0, (areaRight - splitRect.left) / zoom)
                  : Math.max(0, (obs.rect.right + 4 * zoom - splitRect.left) / zoom);
              nextLineMinIdx = splitIdx + 1;
              break;
            }
          }
        }

        if (insertGlobalIdx === -1 || spacerWidthPx <= 1) break;
        const pt = resolveAt(insertGlobalIdx);
        if (!pt) break;

        const spacer = document.createElement("span");
        spacer.setAttribute("data-square-spacer", "true");
        spacer.setAttribute("contenteditable", "false");
        spacer.style.display = "inline-block";
        spacer.style.width = `${Math.round(spacerWidthPx)}px`;
        spacer.style.height = "1px";
        spacer.style.pointerEvents = "none";
        spacer.style.userSelect = "none";
        spacer.style.verticalAlign = "middle";

        const r = document.createRange();
        r.setStart(pt.node, pt.offset);
        r.collapse(true);
        r.insertNode(spacer);

        // 스페이서 이후 같은 줄에 남은 글자들을 건너뛰고 다음 줄부터 계속 검사
        if (effectiveMode === "BOTH") {
          const spRect = spacer.getBoundingClientRect();
          const walker2 = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => ((n.parentElement?.getAttribute("data-square-spacer") === "true") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
          });
          let idx2 = 0;
          let foundNextLine = total;
          let tn2: Node | null;
          while ((tn2 = walker2.nextNode())) {
            const len = tn2.textContent?.length || 0;
            for (let k = 0; k < len; k++) {
              if (idx2 >= insertGlobalIdx) {
                const rr = document.createRange();
                rr.setStart(tn2, k);
                rr.setEnd(tn2, k + 1);
                const cr2 = rr.getBoundingClientRect();
                if (cr2.height > 0 && cr2.top > spRect.bottom + 2) {
                  foundNextLine = idx2;
                  break;
                }
              }
              idx2++;
            }
            if (foundNextLine < total) break;
          }
          searchMinGlobal = foundNextLine;
        } else {
          searchMinGlobal = nextLineMinIdx;
        }
      }
      const newPHeight = pEl.getBoundingClientRect().height;
      const deltaH = Math.round((newPHeight - oldPHeight) / zoom);
      if (deltaH !== 0) {
        compensateFloatingBelow(pEl, pageEl, deltaH);
      }
    }
  }, [blocks, dragOffsets, dragResize, zoomPercent, pageWidthMm, pageMarginLeftMm, pageMarginRightMm]);
  const [showSymbolModal, setShowSymbolModal] = useState(false);
  const [symbolCategory, setSymbolCategory] = useState("일반 문장 부호");
  const [symbolInputText, setSymbolInputText] = useState("");
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
  const [showEquationModal, setShowEquationModal] = useState(false);
  const [editingEquationIdx, setEditingEquationIdx] = useState<number | null>(null);
  const [newEquationScript, setNewEquationScript] = useState("");

  const openNewEquation = () => {
    setEditingEquationIdx(null);
    setNewEquationScript("f(x) = {x + 1} over {x - 1}");
    setShowEquationModal(true);
  };

  const openEditEquation = (idx: number) => {
    const block = blocks[idx];
    if (block && block.type === "equation") {
      setEditingEquationIdx(idx);
      setNewEquationScript(block.script || "");
      setShowEquationModal(true);
    }
  };

  const saveEquation = () => {
    if (editingEquationIdx !== null) {
      updateEquation(editingEquationIdx, newEquationScript);
    } else {
      addEquation(newEquationScript, selectedIdx);
    }
    setShowEquationModal(false);
    setEditingEquationIdx(null);
    setNewEquationScript("");
  };
  const [showCharShapeModal, setShowCharShapeModal] = useState(false);
  const [showParaShapeModal, setShowParaShapeModal] = useState(false);
  const [showHighlightPalette, setShowHighlightPalette] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);

  // ── 개체(표, 그림, 도형, 문단) 우클릭 컨텍스트 메뉴 상태 ──
  interface ObjectContextMenuState {
    x: number;
    y: number;
    blockIdx: number;
    blockType: "table" | "image" | "shape" | "paragraph";
    hasSelection?: boolean;
  }
  const [contextMenu, setContextMenu] = useState<ObjectContextMenuState | null>(null);

  // ── 개체 속성(표/셀 속성, 그림 속성, 도형 속성) 모달 (P) 상태 ──
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [propertyTargetIdx, setPropertyTargetIdx] = useState<number | null>(null);
  const propInitialSizeRef = useRef<{ wMm: number; hMm: number }>({ wMm: 0, hMm: 0 });
  const [propActiveTab, setPropActiveTab] = useState<"basic" | "margin" | "border" | "background" | "table" | "cell">("basic");
  const [propCellBorderScope, setPropCellBorderScope] = useState<"each" | "merged">("each");
  const [showCellBorderBgModal, setShowCellBorderBgModal] = useState(false);
  const [cellBorderBgTab, setCellBorderBgTab] = useState<"border" | "background" | "diagonal">("border");
  const [cellBorderApplyMode, setCellBorderApplyMode] = useState<"each" | "single">("each");
  const [cellDiagType, setCellDiagType] = useState("SOLID");
  const [cellDiagThickness, setCellDiagThickness] = useState("0.1mm");
  const [cellDiagColor, setCellDiagColor] = useState("#000000");
  const [cellDiagBackslash, setCellDiagBackslash] = useState("none");
  const [cellDiagSlash, setCellDiagSlash] = useState("none");
  const [cellDiagCenter, setCellDiagCenter] = useState("none");
  // [셀] 탭 상세 상태
  const [propCellSizeEnabled, setPropCellSizeEnabled] = useState<boolean>(false);
  const [propCellWidthMm, setPropCellWidthMm] = useState<number>(29.6);
  const [propCellHeightMm, setPropCellHeightMm] = useState<number>(10.0);
  const [propCellPadEnabled, setPropCellPadEnabled] = useState<boolean>(false);
  const [propCellPadLeftMm, setPropCellPadLeftMm] = useState<number>(1.8);
  const [propCellPadTopMm, setPropCellPadTopMm] = useState<number>(0.5);
  const [propCellPadRightMm, setPropCellPadRightMm] = useState<number>(1.8);
  const [propCellPadBottomMm, setPropCellPadBottomMm] = useState<number>(0.5);
  const [propCellProtect, setPropCellProtect] = useState<boolean>(false);
  const [propCellHeader, setPropCellHeader] = useState<boolean>(false);
  const [propCellVertAlign, setPropCellVertAlign] = useState<"top" | "middle" | "bottom">("middle");
  const [propCellFieldName, setPropCellFieldName] = useState<string>("");
  const [propCellEditableInForm, setPropCellEditableInForm] = useState<boolean>(false);

  // [기본] 탭 상세 상태
  const [propWidthType, setPropWidthType] = useState<"고정값" | "비율">("고정값");
  const [propWidthMm, setPropWidthMm] = useState<number>(150.0);
  const [propHeightType, setPropHeightType] = useState<"고정값">("고정값");
  const [propHeightMm, setPropHeightMm] = useState<number>(29.99);
  const [propLockSize, setPropLockSize] = useState<boolean>(false);
  const [propTreatAsChar, setPropTreatAsChar] = useState(true);
  const [propTextWrap, setPropTextWrap] = useState<"TOP_AND_BOTTOM" | "SQUARE" | "IN_FRONT_OF_TEXT" | "BEHIND_TEXT">("TOP_AND_BOTTOM");
  const [propTextPos, setPropTextPos] = useState<"양쪽" | "왼쪽" | "오른쪽">("양쪽");
  const [propHorzRelTo, setPropHorzRelTo] = useState<"단" | "문단" | "쪽">("단");
  const [propHorzAlign, setPropHorzAlign] = useState<"왼쪽" | "가운데" | "오른쪽">("왼쪽");
  const [propHorzOffsetMm, setPropHorzOffsetMm] = useState<number>(0.0);
  const [propVertRelTo, setPropVertRelTo] = useState<"문단" | "쪽">("문단");
  const [propVertAlign, setPropVertAlign] = useState<"위쪽" | "가운데" | "아래쪽">("위쪽");
  const [propVertOffsetMm, setPropVertOffsetMm] = useState<number>(0.0);
  const [propLimitToPage, setPropLimitToPage] = useState<boolean>(true);
  const [propAllowOverlap, setPropAllowOverlap] = useState<boolean>(false);
  const [propKeepWithAnchor, setPropKeepWithAnchor] = useState<boolean>(false);

  // [여백/캡션] 탭 상세 상태
  const [propMarginLeftMm, setPropMarginLeftMm] = useState<number>(0.0);
  const [propMarginRightMm, setPropMarginRightMm] = useState<number>(0.0);
  const [propMarginTopMm, setPropMarginTopMm] = useState<number>(0.0);
  const [propMarginBottomMm, setPropMarginBottomMm] = useState<number>(0.0);
  const [propCaptionPos, setPropCaptionPos] = useState<string>("none");
  const [propCaptionSizeMm, setPropCaptionSizeMm] = useState<number>(30.0);
  const [propCaptionGapMm, setPropCaptionGapMm] = useState<number>(3.0);
  const [propCaptionExpandWidth, setPropCaptionExpandWidth] = useState<boolean>(false);
  const [propCaptionSingleLine, setPropCaptionSingleLine] = useState<boolean>(false);
  const [propCaption, setPropCaption] = useState<string>("");

  // [테두리] 탭 상세 상태
  const [propBorderType, setPropBorderType] = useState<string>("SOLID");
  const [propBorderThickness, setPropBorderThickness] = useState<string>("0.12mm");
  const [propBorderColor, setPropBorderColor] = useState<string>("#000000");
  const [propCellSpacingEnabled, setPropCellSpacingEnabled] = useState<boolean>(false);
  const [propCellSpacingMm, setPropCellSpacingMm] = useState<number>(0.0);
  const [propBorderTarget, setPropBorderTarget] = useState<"all" | "outer" | "inner" | "none" | "custom">("all");

  // [배경] 탭 상세 상태
  const [propFillMode, setPropFillMode] = useState<"none" | "color">("color");
  const [propFillColor, setPropFillColor] = useState<string>("#FFFFFF");
  const [propPatternColor, setPropPatternColor] = useState<string>("#000000");
  const [propPatternType, setPropPatternType] = useState<string>("none");
  const [propFillImageEnabled, setPropFillImageEnabled] = useState<boolean>(false);
  const [propFillImageMode, setPropFillImageMode] = useState<string>("fit");
  const [propFillImageBrightness, setPropFillImageBrightness] = useState<number>(0);
  const [propFillImageContrast, setPropFillImageContrast] = useState<number>(0);
  const [propFillImageEffect, setPropFillImageEffect] = useState<string>("none");
  const [propFillImageWatermark, setPropFillImageWatermark] = useState<boolean>(false);

  // [표] 탭 상세 상태
  const [propTablePageBreak, setPropTablePageBreak] = useState<"divide" | "cell_divide" | "no_divide">("divide");
  const [propRepeatHeader, setPropRepeatHeader] = useState<boolean>(false);
  const [propSplitBorderEnabled, setPropSplitBorderEnabled] = useState<boolean>(false);
  const [propSplitBorderType, setPropSplitBorderType] = useState<string>("SOLID");
  const [propSplitBorderThickness, setPropSplitBorderThickness] = useState<string>("0.1mm");
  const [propSplitBorderColor, setPropSplitBorderColor] = useState<string>("#7F7F7F");
  const [propCellPaddingLeftMm, setPropCellPaddingLeftMm] = useState<number>(1.8);
  const [propCellPaddingRightMm, setPropCellPaddingRightMm] = useState<number>(1.8);
  const [propCellPaddingTopMm, setPropCellPaddingTopMm] = useState<number>(0.5);
  const [propCellPaddingBottomMm, setPropCellPaddingBottomMm] = useState<number>(0.5);

  // 복사된 개체 버퍼
  const [copiedBlockBuffer, setCopiedBlockBuffer] = useState<HwpxCollabBlock | null>(null);

  const copyBlockToBuffer = (idx: number) => {
    const blk = blocks[idx];
    if (blk) {
      setCopiedBlockBuffer(JSON.parse(JSON.stringify(blk)));
    }
  };

  const cutBlockToBuffer = (idx: number) => {
    copyBlockToBuffer(idx);
    deleteBlock(idx);
  };

  // 블록 순서 재배치 (맨 앞으로, 앞으로, 뒤로, 맨 뒤로)
  const reorderBlock = (idx: number, action: "front" | "forward" | "backward" | "back") => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    if (idx < 0 || idx >= yBlocks.length) return;
    doc.transact(() => {
      const target = yBlocks.get(idx);
      if (!target) return;
      if (action === "front") {
        yBlocks.delete(idx, 1);
        yBlocks.push([target]);
        setSelectedIdx(yBlocks.length - 1);
      } else if (action === "forward" && idx < yBlocks.length - 1) {
        yBlocks.delete(idx, 1);
        yBlocks.insert(idx + 1, [target]);
        setSelectedIdx(idx + 1);
      } else if (action === "backward" && idx > 0) {
        yBlocks.delete(idx, 1);
        yBlocks.insert(idx - 1, [target]);
        setSelectedIdx(idx - 1);
      } else if (action === "back") {
        yBlocks.delete(idx, 1);
        yBlocks.insert(0, [target]);
        setSelectedIdx(0);
      }
    });
  };

  // 자동 캡션 번호 생성기 ([표 1], [그림 1], [도형 1], [차트 1])
  const getAutoCaptionText = (blockIdx: number, type: "table" | "image" | "shape" | "chart") => {
    let count = 1;
    for (let i = 0; i < blockIdx; i++) {
      if (blocks[i]?.type === type) count++;
    }
    if (type === "table") return `표 ${count}`;
    if (type === "image") return `그림 ${count}`;
    if (type === "chart") return `차트 ${count}`;
    return `도형 ${count}`;
  };

  const openEditChartData = (idx: number) => {
    const block = blocks[idx];
    if (!block || block.type !== "chart") return;
    setChartEditingIdx(idx);
    setShowChartDataModal(true);
  };

  const openPropertyModal = (
    idx: number,
    initialTab: "basic" | "margin" | "border" | "background" | "table" | "cell" = "basic",
    borderScope: "each" | "merged" = "each"
  ) => {
    const block = blocks[idx];
    if (!block || (block.type !== "table" && block.type !== "image" && block.type !== "shape" && block.type !== "chart")) return;

    setPropertyTargetIdx(idx);
    setPropActiveTab(initialTab);
    setPropCellBorderScope(borderScope);

    const isFloating = block.treatAsChar !== undefined ? !block.treatAsChar : ((block.offsetX !== undefined && block.offsetX !== 0) || (block.offsetY !== undefined && block.offsetY !== 0));
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlk = yBlocks.get(idx);
    const getB = <T,>(k: string, def: T): T => {
      const v = yBlk?.get(k) as T | undefined;
      return v !== undefined ? v : def;
    };

    setPropTreatAsChar(!isFloating);
    setPropLimitToPage(("limitToPage" in block ? block.limitToPage : undefined) ?? true);
    setPropLockSize(getB("lockSize", false));
    setPropAllowOverlap(getB("allowOverlap", false));
    setPropKeepWithAnchor(getB("keepWithAnchor", false));
    setPropHorzRelTo(getB<"단" | "문단" | "쪽">("horzRelTo", "단"));
    setPropHorzAlign(getB<"왼쪽" | "가운데" | "오른쪽">("horzAlign", "왼쪽"));
    setPropVertRelTo(getB<"문단" | "쪽">("vertRelTo", "문단"));
    setPropVertAlign(getB<"위쪽" | "가운데" | "아래쪽">("vertAlign", "위쪽"));
    setPropCaptionSizeMm(getB("captionSizeMm", 30.0));
    setPropCaptionGapMm(getB("captionGapMm", 3.0));
    setPropCaptionExpandWidth(getB("captionExpandWidth", false));
    setPropCaptionSingleLine(getB("captionSingleLine", false));
    setPropTextWrap(block.textWrap || (isFloating ? "IN_FRONT_OF_TEXT" : "TOP_AND_BOTTOM"));
    const tf = "textFlow" in block ? block.textFlow : undefined;
    setPropTextPos(tf === "LEFT_ONLY" ? "왼쪽" : tf === "RIGHT_ONLY" ? "오른쪽" : "양쪽");

    const offX = block.offsetX || 0;
    const offY = block.offsetY || 0;
    setPropHorzOffsetMm(Number((offX / 3.78).toFixed(2)));
    setPropVertOffsetMm(Number((offY / 3.78).toFixed(2)));

    // 바깥 여백
    setPropMarginLeftMm(block.marginLeftMm ?? 0.0);
    setPropMarginRightMm(block.marginRightMm ?? 0.0);
    setPropMarginTopMm(block.marginTopMm ?? 0.0);
    setPropMarginBottomMm(block.marginBottomMm ?? 0.0);

    // 캡션 (기존 캡션이 없으면 없음("none")이 기본값)
    const hasExistingCaption = !!(block.caption && block.caption.trim() !== "" && block.captionPos !== "none");
    setPropCaption(hasExistingCaption ? (block.caption || "") : "");
    setPropCaptionPos(hasExistingCaption ? (block.captionPos || "bottom_center") : "none");

    if (block.type === "table") {
      const wPct = block.widthPercent || 100;
      setPropWidthMm(Number(((wPct / 100) * 150).toFixed(2)));
      setPropHeightMm(block.heightPt ? Number((block.heightPt * 0.3527).toFixed(2)) : 29.99);
      setPropFillMode(block.fillMode || (block.fillColor && block.fillColor !== "transparent" ? "color" : "none"));
      setPropFillColor(block.fillColor && block.fillColor !== "transparent" ? block.fillColor : "#FFFFFF");
      setPropBorderType(block.borderType || "SOLID");
      setPropBorderThickness(block.borderThickness || "0.12mm");
      setPropBorderColor(block.borderColor || "#000000");
      setPropCellSpacingEnabled(!!block.cellSpacingEnabled);
      setPropCellSpacingMm(block.cellSpacingMm ?? 0.0);
      setPropTablePageBreak(block.pageBreak || "divide");
      setPropRepeatHeader(!!block.repeatHeader);
      setPropCellPaddingLeftMm(block.cellPaddingLeftMm ?? 1.8);
      setPropCellPaddingRightMm(block.cellPaddingRightMm ?? 1.8);
      setPropCellPaddingTopMm(block.cellPaddingTopMm ?? 0.5);
      setPropCellPaddingBottomMm(block.cellPaddingBottomMm ?? 0.5);
    } else if (block.type === "image") {
      const wPct = block.widthPercent || 75;
      const contentWidthMm = Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0));
      const wMm = Number(((wPct / 100) * contentWidthMm).toFixed(2));
      let hMm = block.heightPt ? Number((block.heightPt * (25.4 / 72)).toFixed(2)) : 60.0;
      if (!block.heightPt) {
        const imgEl = document.querySelector<HTMLImageElement>(`[data-block-id="${block.id}"] img`);
        if (imgEl) {
          const r = imgEl.getBoundingClientRect();
          const zoom = Math.max(0.2, zoomPercent / 100);
          if (r.height > 0) hMm = Number((((r.height / zoom) * 25.4) / 96).toFixed(2));
        }
      }
      propInitialSizeRef.current = { wMm, hMm };
      setPropWidthMm(wMm);
      setPropHeightMm(hMm);
      setPropBorderType(block.borderType || "SOLID");
      setPropBorderThickness(block.borderThickness || "0.12mm");
      setPropBorderColor(block.borderColor || "#000000");
    } else if (block.type === "shape") {
      const wPct = block.widthPercent || 75;
      const contentWidthMm = Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0));
      setPropWidthMm(Number(((wPct / 100) * contentWidthMm).toFixed(2)));
      setPropHeightMm(Number(((block.heightPt || 60) * (25.4 / 72)).toFixed(2)));
      setPropFillMode(block.fillColor === "transparent" ? "none" : (block.fillMode || "color"));
      setPropFillColor(block.fillColor === "transparent" ? "#FFFFFF" : (block.fillColor || "#EFF6FF"));
      setPropBorderColor(block.strokeColor || "#2563EB");
      setPropBorderThickness(block.strokeWidth ? `${(block.strokeWidth * 0.1).toFixed(2)}mm` : "0.15mm");
      setPropBorderType(block.strokeType || "SOLID");
    } else if (block.type === "chart") {
      const wPct = block.widthPercent || 85;
      setPropWidthMm(Number(((wPct / 100) * 150).toFixed(2)));
      setPropHeightMm(block.heightPt ? Number((block.heightPt * 0.3527).toFixed(2)) : 65.0);
      setPropBorderType("SOLID");
      setPropBorderThickness("0.12mm");
      setPropBorderColor("#E5E7EB");
    }

    setShowPropertyModal(true);
  };

  const openCellBorderBgModal = (idx: number, initialTab: "border" | "background" | "diagonal" = "border", applyMode: "each" | "single" = "each") => {
    const block = blocks[idx];
    if (!block || block.type !== "table") return;
    setPropertyTargetIdx(idx);
    setCellBorderBgTab(initialTab);
    setPropBorderType(block.borderType || "SOLID");
    setPropBorderThickness(block.borderThickness || "0.12mm");
    setPropBorderColor(block.borderColor || "#000000");
    setCellBorderApplyMode(applyMode);
    setPropBorderTarget(applyMode === "single" ? "outer" : "all");
    setPropFillMode(block.fillColor === "transparent" ? "none" : block.fillMode || (block.fillColor ? "color" : "none"));
    setPropFillColor(block.fillColor && block.fillColor !== "transparent" ? block.fillColor : "#FFFFFF");
    setShowCellBorderBgModal(true);
  };

  const applyCellBorderBg = (closeAfter: boolean) => {
    if (propertyTargetIdx === null) return;
    const block = blocks[propertyTargetIdx];
    if (!block || block.type !== "table") return;
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(propertyTargetIdx);
    if (!yBlock) return;
    doc.transact(() => {
      yBlock.set("borderType", propBorderTarget === "none" ? "NONE" : propBorderType);
      yBlock.set("borderThickness", propBorderThickness);
      yBlock.set("borderColor", propBorderColor);
      if (tableCellSelection && tableCellSelection.blockIdx === propertyTargetIdx) {
        const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
        if (yRows) {
          const rMin = Math.min(tableCellSelection.startRow, tableCellSelection.endRow);
          const rMax = Math.max(tableCellSelection.startRow, tableCellSelection.endRow);
          const cMin = Math.min(tableCellSelection.startCol, tableCellSelection.endCol);
          const cMax = Math.max(tableCellSelection.startCol, tableCellSelection.endCol);
          const nextBg = propFillMode === "color" ? propFillColor : "";
          for (let r = rMin; r <= rMax; r++) {
            const yRow = yRows.get(r);
            if (!yRow) continue;
            for (let c = cMin; c <= cMax; c++) {
              const yCell = yRow.get(c);
              if (yCell) yCell.set("bgColor", nextBg);
            }
          }
        }
      } else {
        yBlock.set("fillMode", propFillMode === "color" ? "color" : "none");
        yBlock.set("fillColor", propFillMode === "color" ? propFillColor : "");
      }
    });
    if (closeAfter) setShowCellBorderBgModal(false);
    else showToast("셀 테두리/배경이 적용되었습니다.");
  };

  const saveProperties = () => {
    if (propertyTargetIdx === null) return;
    const block = blocks[propertyTargetIdx];
    if (!block) return;

    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(propertyTargetIdx);
    if (!yBlock) return;

    doc.transact(() => {
      const finalOffX = propTreatAsChar ? 0 : Math.round(propHorzOffsetMm * 3.78);
      const finalOffY = propTreatAsChar ? 0 : Math.round(propVertOffsetMm * 3.78);
      yBlock.set("offsetX", finalOffX);
      yBlock.set("offsetY", finalOffY);
      yBlock.set("treatAsChar", propTreatAsChar);
      yBlock.set("limitToPage", propLimitToPage);
      yBlock.set("lockSize", propLockSize);
      yBlock.set("allowOverlap", propAllowOverlap);
      yBlock.set("keepWithAnchor", propKeepWithAnchor);
      yBlock.set("horzRelTo", propHorzRelTo);
      yBlock.set("horzAlign", propHorzAlign);
      yBlock.set("vertRelTo", propVertRelTo);
      yBlock.set("vertAlign", propVertAlign);
      yBlock.set("captionSizeMm", propCaptionSizeMm);
      yBlock.set("captionGapMm", propCaptionGapMm);
      yBlock.set("captionExpandWidth", propCaptionExpandWidth);
      yBlock.set("captionSingleLine", propCaptionSingleLine);
      yBlock.set("textWrap", propTextWrap);
      yBlock.set("textFlow", propTextPos === "왼쪽" ? "LEFT_ONLY" : propTextPos === "오른쪽" ? "RIGHT_ONLY" : "BOTH_SIDES");
      if (!propTreatAsChar) {
        mergeSplitParagraphAt(yBlocks, propertyTargetIdx);
      }

      if (block.type === "shape") {
        const contentWidthMm = Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0));
        const minPct = block.shapeType === "line" ? 0.5 : 1;
        const computedWidthPct = Math.max(minPct, Math.min(100, Number(((propWidthMm / contentWidthMm) * 100).toFixed(2))));
        yBlock.set("widthPercent", computedWidthPct);
        yBlock.set("heightPt", Math.max(2, Number((propHeightMm / (25.4 / 72)).toFixed(2))));
      } else if (block.type === "image") {
        const contentWidthMm = Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0));
        const computedWidthPct = Math.max(5, Math.min(100, Number(((propWidthMm / contentWidthMm) * 100).toFixed(2))));
        yBlock.set("widthPercent", computedWidthPct);
        const heightEdited = Math.abs(propHeightMm - propInitialSizeRef.current.hMm) > 0.1;
        if (block.heightPt !== undefined || heightEdited) {
          yBlock.set("heightPt", Math.max(5, Number((propHeightMm / (25.4 / 72)).toFixed(2))));
        }
      } else {
        const computedWidthPct = Math.max(10, Math.min(100, Math.round((propWidthMm / 150) * 100)));
        yBlock.set("widthPercent", computedWidthPct);
        yBlock.set("heightPt", Math.max(5, Math.round(propHeightMm / 0.3527)));
      }

      // 여백 및 캡션
      yBlock.set("marginLeftMm", propMarginLeftMm);
      yBlock.set("marginRightMm", propMarginRightMm);
      yBlock.set("marginTopMm", propMarginTopMm);
      yBlock.set("marginBottomMm", propMarginBottomMm);
      if (propCaptionPos === "none" || !propCaption.trim()) {
        yBlock.delete("caption");
        yBlock.set("captionPos", "none");
      } else {
        yBlock.set("caption", propCaption.trim());
        yBlock.set("captionPos", propCaptionPos);
      }

      // 테두리
      yBlock.set("borderColor", propBorderColor);
      yBlock.set("borderThickness", propBorderThickness);
      yBlock.set("borderType", propBorderType);

      if (block.type === "table") {
        yBlock.set("fillMode", propFillMode);
        yBlock.set("fillColor", propFillMode === "none" ? "transparent" : propFillColor);
        yBlock.set("cellSpacingEnabled", propCellSpacingEnabled);
        yBlock.set("cellSpacingMm", propCellSpacingMm);
        yBlock.set("pageBreak", propTablePageBreak);
        yBlock.set("repeatHeader", propRepeatHeader);
        yBlock.set("cellPaddingLeftMm", propCellPaddingLeftMm);
        yBlock.set("cellPaddingRightMm", propCellPaddingRightMm);
        yBlock.set("cellPaddingTopMm", propCellPaddingTopMm);
        yBlock.set("cellPaddingBottomMm", propCellPaddingBottomMm);
      } else if (block.type === "image") {
        // 이미지 추가 속성 반영
      } else if (block.type === "shape") {
        yBlock.set("fillMode", propFillMode);
        yBlock.set("fillColor", propFillMode === "none" ? "transparent" : propFillColor);
        yBlock.set("strokeColor", propBorderColor);
        const parsedThick = parseFloat(propBorderThickness) || 0.15;
        yBlock.set("strokeWidth", Math.max(0.5, parsedThick * 10));
        yBlock.set("strokeType", propBorderType);
        yBlock.delete("rawXml");
      }
    });

    setShowPropertyModal(false);
    const savedTargetIdx = propertyTargetIdx;
    const savedFinalOffX = propTreatAsChar ? 0 : Math.round(propHorzOffsetMm * 3.78);
    const savedFinalOffY = propTreatAsChar ? 0 : Math.round(propVertOffsetMm * 3.78);
    const savedTreatAsChar = propTreatAsChar;
    const savedLimitToPage = propLimitToPage;
    const savedAllowOverlap = propAllowOverlap;
    const savedTextWrap = propTextWrap;

    setPropertyTargetIdx(null);

    if (!savedTreatAsChar && (savedTextWrap === "SQUARE" || savedTextWrap === "TOP_AND_BOTTOM") && !savedAllowOverlap) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const targetEl = document.querySelector<HTMLElement>(`[data-block-idx="${savedTargetIdx}"]`);
        const boxEl = targetEl?.querySelector<HTMLElement>(".hwpx-resizable-box") || targetEl;
        const pageEl = targetEl?.closest<HTMLElement>("[data-page-idx]");
        if (!boxEl) return;
        const zoom = Math.max(0.2, zoomPercent / 100);
        const boxRect = boxEl.getBoundingClientRect();
        let minOffX = -Infinity;
        let maxOffX = Infinity;
        let minOffY = -Infinity;
        let maxOffY = Infinity;
        if (savedLimitToPage && pageEl) {
          const pageRect = pageEl.getBoundingClientRect();
          const pageCs = window.getComputedStyle(pageEl);
          const padL = parseFloat(pageCs.paddingLeft || "0") * zoom;
          const padR = parseFloat(pageCs.paddingRight || "0") * zoom;
          const padT = parseFloat(pageCs.paddingTop || "0") * zoom;
          const padB = parseFloat(pageCs.paddingBottom || "0") * zoom;
          minOffX = Math.round(savedFinalOffX + (pageRect.left + padL - boxRect.left) / zoom);
          maxOffX = Math.round(savedFinalOffX + (pageRect.right - padR - boxRect.right) / zoom);
          minOffY = Math.round(savedFinalOffY + (pageRect.top + padT - boxRect.top) / zoom);
          maxOffY = Math.round(savedFinalOffY + (pageRect.bottom - padB - boxRect.bottom) / zoom);
          if (maxOffX < minOffX) maxOffX = minOffX;
          if (maxOffY < minOffY) maxOffY = minOffY;
        }
        const resolved = resolveNonOverlappingOffset(
          savedTargetIdx,
          savedFinalOffX,
          savedFinalOffY,
          boxRect,
          savedFinalOffX,
          savedFinalOffY,
          minOffX,
          maxOffX,
          minOffY,
          maxOffY,
          zoom,
          savedTextWrap,
          savedAllowOverlap,
          savedTreatAsChar,
        );
        if (resolved.x !== savedFinalOffX || resolved.y !== savedFinalOffY) {
          commitObjectOffset(savedTargetIdx, resolved.x, resolved.y);
        }
      }));
    }
  };

  // 문단 간 연속 마우스 드래그 선택 지원 (contentEditable 편집 호스트 경계 넘김 처리)
  useEffect(() => {
    const findParagraphAtPoint = (clientX: number, clientY: number): HTMLElement | null => {
      const root = canvasRef.current;
      if (!root) return null;
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const directP = el?.closest('[data-block-type="paragraph"] p') as HTMLElement | null;
      if (directP && root.contains(directP)) return directP;
      const allPs = Array.from(root.querySelectorAll<HTMLElement>('[data-block-type="paragraph"] p'));
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const p of allPs) {
        const r = p.getBoundingClientRect();
        const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
        const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
        const dist = dx + dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      return best;
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = crossDragRef.current;
      if (!drag) return;
      if ((e.buttons & 1) === 0) {
        crossDragRef.current = null;
        return;
      }
      const root = canvasRef.current;
      if (!root) return;
      const targetP = findParagraphAtPoint(e.clientX, e.clientY);
      if (!targetP) return;
      const targetIdx = Number(targetP.getAttribute("data-block-idx"));
      if (isNaN(targetIdx)) return;

      if (!drag.crossed && targetIdx === drag.startIdx) {
        return; // 같은 문단 내에서는 브라우저 기본 드래그 선택 유지
      }

      if (!drag.crossed) {
        drag.crossed = true;
        // DOM에서 즉시 각 문단의 개별 contentEditable 속성을 제거하고 상위 canvasRef를 단일 편집 호스트로 전환 (브라우저 미니 메뉴 억제 + 문단 경계 선택 허용)
        root.querySelectorAll<HTMLElement>('[data-block-type="paragraph"] p').forEach((p) => {
          p.removeAttribute("contenteditable");
        });
        root.setAttribute("contenteditable", "true");
        setIsCrossSelecting(true);
      }

      const startP = root.querySelector<HTMLElement>(`[data-block-type="paragraph"] p[data-block-idx="${drag.startIdx}"]`);
      if (!startP) return;
      const targetOffset = getPointOffsetInParagraph(targetP, e.clientX, e.clientY);
      const startPt = resolveNodeAndOffset(startP, drag.startOffset);
      const endPt = resolveNodeAndOffset(targetP, targetOffset);
      const sel = window.getSelection();
      if (sel) {
        try {
          sel.setBaseAndExtent(startPt.node, startPt.offset, endPt.node, endPt.offset);
        } catch {
          // ignore range errors during rapid drag
        }
      }
    };

    const onMouseUp = () => {
      const drag = crossDragRef.current;
      if (drag?.crossed) {
        justFinishedCrossDragRef.current = true;
        setTimeout(() => {
          justFinishedCrossDragRef.current = false;
        }, 50);
      }
      crossDragRef.current = null;
    };

    const onSelectionChange = () => {
      if (!isCrossSelecting || crossDragRef.current?.crossed || pendingSelectAllRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setIsCrossSelecting(false);
      }
    };

    const onCancelDrag = () => {
      crossDragRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("dragstart", onCancelDrag, true);
    window.addEventListener("dragend", onCancelDrag, true);
    window.addEventListener("drop", onCancelDrag, true);
    window.addEventListener("blur", onCancelDrag);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("dragstart", onCancelDrag, true);
      window.removeEventListener("dragend", onCancelDrag, true);
      window.removeEventListener("drop", onCancelDrag, true);
      window.removeEventListener("blur", onCancelDrag);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [isCrossSelecting]);

  // 단축키 (Ctrl+S / Cmd+S: 클라우드 저장, Ctrl+Z: 실행 취소, Ctrl+Y / Ctrl+Shift+Z: 다시 실행, P: 선택된 개체 속성 다이얼로그, Delete/Backspace: 선택된 개체 삭제)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 문단 간 연속 텍스트 드래그 선택 시 Delete/Backspace 처리
      const crossSel = getCrossParagraphSelection();
      if (crossSel && (e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
        const startBlock = blocks[crossSel.startIdx];
        const endBlock = blocks[crossSel.endIdx];
        if (startBlock && endBlock && startBlock.type === "paragraph" && endBlock.type === "paragraph") {
          const startText = startBlock.text || "";
          const endText = endBlock.text || "";
          const mergedText = startText.slice(0, crossSel.startOffset) + endText.slice(crossSel.endOffset);
          doc.transact(() => {
            const yStart = yBlocks.get(crossSel.startIdx);
            if (yStart) {
              const yText = yStart.get("text") as Y.Text;
              if (yText) {
                yText.delete(0, yText.length);
                yText.insert(0, mergedText);
              }
            }
            const deleteCount = crossSel.endIdx - crossSel.startIdx;
            yBlocks.delete(crossSel.startIdx + 1, deleteCount);
          });
          pendingCaretRef.current = { mode: "offset", blockId: startBlock.id, offset: crossSel.startOffset };
          setIsCrossSelecting(false);
          setSelectedIdx(crossSel.startIdx);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "a") {
        const activeEl = document.activeElement;
        const isFormInput =
          activeEl instanceof HTMLElement &&
          (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");
        if (!isFormInput) {
          e.preventDefault();
          handleSelectAll();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void runSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        const activeEl = document.activeElement;
        const isDialogInput =
          activeEl instanceof HTMLElement &&
          (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
          Boolean(activeEl.closest("[role='dialog']") || activeEl.closest(".modal-backdrop") || activeEl.closest(".fixed"));
        if (!isDialogInput) {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        const activeEl = document.activeElement;
        const isDialogInput =
          activeEl instanceof HTMLElement &&
          (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
          Boolean(activeEl.closest("[role='dialog']") || activeEl.closest(".modal-backdrop") || activeEl.closest(".fixed"));
        if (!isDialogInput) {
          e.preventDefault();
          handleRedo();
          return;
        }
      }
      // Alt+C: 모양 복사 모달
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setShowFormatCopyModal(true);
        return;
      }
      // Alt+L: 글자 모양 모달
      if (e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowCharShapeModal(true);
        return;
      }
      // Alt+T: 문단 모양 모달
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setShowParaShapeModal(true);
        return;
      }
      // F6: 스타일 모달
      if (e.key === "F6") {
        e.preventDefault();
        setShowStyleModal(true);
        return;
      }
      // Ctrl+Num - / +: 한 수준 증가/감소
      if ((e.ctrlKey || e.metaKey) && e.code === "NumpadSubtract") {
        e.preventDefault();
        handleLevelIndent(1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "NumpadAdd") {
        e.preventDefault();
        handleLevelIndent(-1);
        return;
      }
      // Alt+N: 쪽 번호 모달
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowPageNumberModal(true);
        return;
      }
      // Alt+V: 다른 이름으로 저장
      if (e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handleSaveAs();
        return;
      }
      // Ctrl+P: 인쇄
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
        return;
      }
      // Ctrl+Alt+F1: 스크린 리더 지원 사용 토글
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "F1" || e.keyCode === 112)) {
        e.preventDefault();
        setScreenReaderEnabled((prev) => {
          const next = !prev;
          setScreenReaderAnnouncement(next ? "스크린 리더 지원 사용이 켜졌습니다." : "");
          showToast(next ? "스크린 리더 지원 사용을 켰습니다." : "스크린 리더 지원 사용을 껐습니다.");
          return next;
        });
        return;
      }
      // F7: 편집 용지 모달
      if (e.key === "F7" || e.keyCode === 118) {
        e.preventDefault();
        openPageSetupModal();
        return;
      }
      // Ctrl+Enter: 쪽 나누기 / Ctrl+Shift+Enter: 단 나누기 / Ctrl+Alt+Enter: 다단 설정 나누기
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (e.altKey && !e.shiftKey) {
          e.preventDefault();
          handleInsertColumnSectionBreak();
          return;
        }
        if (e.shiftKey && !e.altKey) {
          e.preventDefault();
          handleInsertColumnBreak();
          return;
        }
        if (!e.shiftKey && !e.altKey) {
          e.preventDefault();
          handleInsertPageBreak();
          return;
        }
      }
      // Alt+G: 찾아가기 모달
      if (e.altKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setShowGotoModal(true);
        return;
      }
      // Ctrl+F: 찾기 모달
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowSearchModal(true);
        return;
      }
      // Ctrl+H: 찾아 바꾸기 모달
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setShowReplaceModal(true);
        return;
      }
      // Ctrl+Q: 문서 정보
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
        e.preventDefault();
        setShowDocStatsModal(true);
        return;
      }
      // Ctrl+K: 하이퍼링크 모달
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openHyperlinkModal();
        return;
      }
      // Ctrl+F3: 상용구 모달
      if ((e.ctrlKey || e.metaKey) && (e.key === "F3" || e.keyCode === 114)) {
        e.preventDefault();
        setShowAutoTextModal(true);
        return;
      }
      if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const activeEl = document.activeElement;
        const isEditing = activeEl instanceof HTMLElement && (
          activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable
        );
        if (!isEditing && selectedIdx !== null && selectedIdx >= 0) {
          const blk = blocks[selectedIdx];
          if (blk && (blk.type === "table" || blk.type === "image" || blk.type === "shape")) {
            e.preventDefault();
            openPropertyModal(selectedIdx);
            return;
          }
        }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (tableCellSelection && selectedIdx === tableCellSelection.blockIdx) {
          e.preventDefault();
          const rMin = Math.min(tableCellSelection.startRow, tableCellSelection.endRow);
          const rMax = Math.max(tableCellSelection.startRow, tableCellSelection.endRow);
          const cMin = Math.min(tableCellSelection.startCol, tableCellSelection.endCol);
          const cMax = Math.max(tableCellSelection.startCol, tableCellSelection.endCol);
          if (rMax > rMin || cMax > cMin) {
            setDeleteTableCellsPrompt({ ...tableCellSelection });
          } else {
            executeTableCellDelete(tableCellSelection, true);
          }
          return;
        }
        const activeEl = document.activeElement;
        const isEditing = activeEl instanceof HTMLElement && (
          activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable
        );
        if (!isEditing && selectedIdx !== null && selectedIdx >= 0) {
          const blk = blocks[selectedIdx];
          if (blk && (blk.type === "table" || blk.type === "image" || blk.type === "shape" || blk.type === "equation")) {
            e.preventDefault();
            deleteBlock(selectedIdx);
            return;
          }
        }
      }
      // 선택된 개체(표, 그림, 도형, 수식)에서 방향키로 앞/뒤 문단으로 이동
      if (
        (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft") &&
        !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
        const activeEl = document.activeElement;
        const isEditing = activeEl instanceof HTMLElement && (
          activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable
        );
        if (!isEditing && selectedIdx !== null && selectedIdx >= 0) {
          const blk = blocks[selectedIdx];
          if (blk && blk.type !== "paragraph") {
            e.preventDefault();
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
              navigateToNextParagraph(selectedIdx, 0);
            } else {
              navigateToPrevParagraph(selectedIdx, 999999);
            }
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runSave, blocks, selectedIdx, undoManager]);

  // 컨텍스트 메뉴 및 상단 풀다운 메뉴 닫기 핸들러
  useEffect(() => {
    const handleCloseMenus = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("[data-context-menu='true']") || target.closest(".z-60"))) {
        return;
      }
      if (target && target.closest(".relative button") && !target.closest("[data-page-idx]")) {
        return;
      }
      setContextMenu(null);
      setOpenDropdown(null);
      setHoverSubmenu(null);
    };
    const handleCloseContextOnMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-context-menu='true']")) return;
      setContextMenu(null);
    };
    window.addEventListener("click", handleCloseMenus);
    window.addEventListener("mousedown", handleCloseContextOnMouseDown, true);
    return () => {
      window.removeEventListener("click", handleCloseMenus);
      window.removeEventListener("mousedown", handleCloseContextOnMouseDown, true);
    };
  }, []);

  // 모양 복사 버퍼
  const [copiedStyle, setCopiedStyle] = useState<{
    fontFamily?: string;
    sizePt?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: "left" | "center" | "right" | "justify";
  } | null>(null);

  const copiedTextBufferRef = useRef<string>("");

  // 서식 복사 (모양 복사)
  const handleCopyFormat = () => {
    if (!currentPara) return;
    setCopiedStyle({
      fontFamily: currentPara.fontFamily,
      sizePt: currentPara.sizePt,
      color: currentPara.color,
      bold: currentPara.bold,
      italic: currentPara.italic,
      underline: currentPara.underline,
      align: currentPara.align,
    });
  };

  // 서식 붙여넣기
  const handlePasteFormat = () => {
    if (!copiedStyle) return;
    updateParagraphStyle(selectedIdx, copiedStyle);
  };

  // 한컴 표준 모양 복사 모드 적용
  const handleApplyFormatCopyMode = (mode: "char" | "para" | "both") => {
    if (!currentPara) return;
    const styleObj: {
      fontFamily?: string;
      sizePt?: number;
      color?: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      align?: "left" | "center" | "right" | "justify";
    } = {};
    if (mode === "char" || mode === "both") {
      styleObj.fontFamily = currentPara.fontFamily;
      styleObj.sizePt = currentPara.sizePt;
      styleObj.color = currentPara.color;
      styleObj.bold = currentPara.bold;
      styleObj.italic = currentPara.italic;
      styleObj.underline = currentPara.underline;
    }
    if (mode === "para" || mode === "both") {
      styleObj.align = currentPara.align;
    }
    setCopiedStyle(styleObj);
  };

  // 글자 바꾸기 (대/소문자, 전각/반각)
  const handleTextConvert = (mode: "upper" | "lower" | "title" | "fullWidth" | "halfWidth") => {
    const sel = window.getSelection();
    const selText = sel ? sel.toString() : "";
    const convert = (str: string) => {
      if (mode === "upper") return str.toUpperCase();
      if (mode === "lower") return str.toLowerCase();
      if (mode === "title") return str.replace(/\b\w/g, (c) => c.toUpperCase());
      if (mode === "halfWidth") return str.replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
      if (mode === "fullWidth") return str.replace(/[\u0021-\u007e]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
      return str;
    };
    if (selText) {
      document.execCommand("insertText", false, convert(selText));
      triggerActiveBlockInput();
    } else {
      const block = blocks[selectedIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(selectedIdx, convert(block.text));
      }
    }
  };

  // 위 첨자 / 아래 첨자
  const applySuperscript = () => {
    restoreSelection();
    document.execCommand("superscript", false);
    triggerActiveBlockInput();
  };

  const applySubscript = () => {
    restoreSelection();
    document.execCommand("subscript", false);
    triggerActiveBlockInput();
  };

  // 하이퍼링크 모달 열기 (선택된 문자열 자동 채움)
  const openHyperlinkModal = () => {
    const selText = window.getSelection()?.toString() || lastSelectionRangeRef.current?.toString() || "";
    setHyperlinkInitialText(selText);
    setShowHyperlinkModal(true);
  };

  // 하이퍼링크 삽입
  const handleInsertHyperlink = (text: string, url: string) => {
    const savedNode = lastSelectionRangeRef.current?.startContainer;
    const savedEditable = (savedNode instanceof Element ? savedNode : savedNode?.parentElement)?.closest?.('[contenteditable="true"]') as HTMLElement | null;
    if (savedEditable) {
      savedEditable.focus({ preventScroll: true });
    }
    restoreSelection();
    const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeUrl = escAttr(url);
    const safeText = escText(text);
    const linkHtml = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="Ctrl+클릭으로 열기: ${safeUrl}" style="color:#0066cc;text-decoration:underline;cursor:pointer;">${safeText}</a>`;
    if (document.activeElement && document.activeElement.getAttribute("contenteditable") === "true") {
      document.execCommand("insertHTML", false, linkHtml);
      triggerActiveBlockInput();
    } else {
      const block = blocks[selectedIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(selectedIdx, (block.text ? block.text + " " : "") + `<a href="${safeUrl}">${safeText}</a>`);
      }
    }
  };

  // 책갈피 목록 추출 & 삽입 / 이동
  const documentBookmarks = useMemo(() => {
    const list: Array<{ name: string; blockIdx: number }> = [];
    const seen = new Set<string>();
    const tagRe = /<span\b[^>]*data-bookmark-name=["']([^"']+)["'][^>]*>/gi;
    const textRe = /\[책갈피:\s*([^\]]+)\]/g;
    blocks.forEach((b, bIdx) => {
      if (b.type !== "paragraph") return;
      const txt = b.text || "";
      let m: RegExpExecArray | null;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(txt)) !== null) {
        const bmName = m[1].trim();
        if (bmName && !seen.has(bmName)) {
          seen.add(bmName);
          list.push({ name: bmName, blockIdx: bIdx });
        }
      }
      textRe.lastIndex = 0;
      while ((m = textRe.exec(txt)) !== null) {
        const bmName = m[1].trim();
        if (bmName && !seen.has(bmName)) {
          seen.add(bmName);
          list.push({ name: bmName, blockIdx: bIdx });
        }
      }
    });
    return list;
  }, [blocks]);

  const handleInsertBookmark = (name: string) => {
    const savedNode = lastSelectionRangeRef.current?.startContainer;
    const savedEditable = (savedNode instanceof Element ? savedNode : savedNode?.parentElement)?.closest?.('[contenteditable="true"]') as HTMLElement | null;
    if (savedEditable) {
      savedEditable.focus({ preventScroll: true });
    }
    restoreSelection();
    const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bmHtml = `<span data-bookmark-name="${escAttr(name)}" title="책갈피: ${escAttr(name)}" style="display:inline-block;width:0;overflow:visible;vertical-align:baseline;pointer-events:none;"></span>`;
    if (document.activeElement && document.activeElement.getAttribute("contenteditable") === "true") {
      document.execCommand("insertHTML", false, bmHtml);
      triggerActiveBlockInput();
    } else {
      const targetIdx = selectedIdx >= 0 ? selectedIdx : 0;
      const block = blocks[targetIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(targetIdx, `<span data-bookmark-name="${escAttr(name)}"></span>` + (block.text || ""));
      }
    }
  };

  const handleGotoBookmark = (name: string) => {
    const found = documentBookmarks.find((b) => b.name === name);
    if (!found) return;
    setSelectedIdx(found.blockIdx);
    const el = document.querySelector<HTMLElement>(`[data-block-idx="${found.blockIdx}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[#0066cc]", "bg-blue-50/40");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-[#0066cc]", "bg-blue-50/40");
      }, 1500);
    }
  };

  // 날짜 / 시간 삽입
  const handleInsertDate = (dateStr: string) => {
    restoreSelection();
    if (document.activeElement && document.activeElement.getAttribute("contenteditable") === "true") {
      document.execCommand("insertText", false, dateStr);
      triggerActiveBlockInput();
    } else {
      const block = blocks[selectedIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(selectedIdx, (block.text || "") + " " + dateStr);
      }
    }
  };

  // 상용구 삽입
  const handleInsertAutoText = (text: string) => {
    restoreSelection();
    if (document.activeElement && document.activeElement.getAttribute("contenteditable") === "true") {
      document.execCommand("insertText", false, text);
      triggerActiveBlockInput();
    } else {
      const block = blocks[selectedIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(selectedIdx, (block.text || "") + "\n" + text);
      }
    }
  };

  // 공통 블록 추가 유틸
  const insertBlockAfter = (afterIdx: number, block: HwpxCollabBlock) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", block.id);
    yBlock.set("type", block.type);
    if (block.type === "paragraph") {
      const yText = new Y.Text();
      yText.insert(0, block.text || "");
      yBlock.set("text", yText);
      if (block.sizePt) yBlock.set("sizePt", block.sizePt);
      if (block.bold) yBlock.set("bold", block.bold);
      if (block.align) yBlock.set("align", block.align);
      if (block.fontFamily) yBlock.set("fontFamily", block.fontFamily);
    } else if (block.type === "shape") {
      yBlock.set("shapeType", block.shapeType);
      yBlock.set("fillColor", block.fillColor || "#FFFFFF");
      yBlock.set("strokeColor", block.strokeColor || "#000000");
      yBlock.set("strokeWidth", block.strokeWidth || 1);
      yBlock.set("widthPercent", block.widthPercent || 45);
      if (block.heightPt) yBlock.set("heightPt", block.heightPt);
      if (block.offsetX) yBlock.set("offsetX", block.offsetX);
      if (block.offsetY) yBlock.set("offsetY", block.offsetY);
      yBlock.set("align", block.align || "center");
      yBlock.set("treatAsChar", block.treatAsChar ?? false);
      if (block.text !== undefined) yBlock.set("text", block.text);
      if (block.lineDir) yBlock.set("lineDir", block.lineDir);
      if (block.isTextBox) yBlock.set("isTextBox", true);
      if (block.textWrap) yBlock.set("textWrap", block.textWrap);
      if (block.limitToPage !== undefined) yBlock.set("limitToPage", block.limitToPage);
      pendingObjectFocusRef.current = block.id;
    } else if (block.type === "chart") {
      yBlock.set("chartType", block.chartType || "column");
      yBlock.set("title", block.title || "차트");
      yBlock.set("categories", block.categories || ["1분기", "2분기", "3분기", "4분기"]);
      yBlock.set("series", block.series || []);
      yBlock.set("widthPercent", block.widthPercent || 85);
      yBlock.set("heightPt", block.heightPt || 180);
      yBlock.set("align", block.align || "center");
    }
    const targetIdx = afterIdx < 0 ? yBlocks.length : Math.min(afterIdx + 1, yBlocks.length);
    doc.transact(() => {
      yBlocks.insert(targetIdx, [yBlock]);
    });
    setSelectedIdx(targetIdx);
  };

  // 한컴독스 스타일 그리기 개체 빠른 삽입 (글상자, 사각형, 타원, 직선, 호)
  const insertQuickShape = (
    kind: "textbox" | "rect" | "ellipse" | "line" | "arc",
    opts?: { widthPercent?: number; heightPt?: number; offsetX?: number; offsetY?: number; afterIdx?: number; lineDir?: "tl-br" | "bl-tr" }
  ) => {
    const newId = `shape-${Date.now()}`;
    const shapeType: HwpxShapeBlock["shapeType"] = kind === "textbox" ? "rect" : kind;
    const block: HwpxShapeBlock = {
      id: newId,
      type: "shape",
      shapeType,
      isTextBox: kind === "textbox" ? true : undefined,
      text: kind === "textbox" ? "글상자 내용을 입력하세요." : undefined,
      fillColor: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: kind === "line" || kind === "arc" ? 1.5 : 1,
      widthPercent: opts?.widthPercent ?? (kind === "line" ? 50 : 40),
      heightPt: opts?.heightPt ?? (kind === "line" ? 2 : 80),
      offsetX: opts?.offsetX ?? 0,
      offsetY: opts?.offsetY ?? 0,
      align: "left",
      treatAsChar: false,
      lineDir: opts?.lineDir,
    };
    insertBlockAfter(opts?.afterIdx ?? selectedIdx, block);
  };

  useEffect(() => {
    if (!pendingDrawShape && !pendingDrawImage) {
      drawDragStartRef.current = null;
      setDrawPreviewRect(null);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingDrawShape(null);
        setPendingDrawImage(null);
        drawDragStartRef.current = null;
        setDrawPreviewRect(null);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const mainEl = canvasScrollRef.current;
      const targetEl = e.target as HTMLElement | null;
      if (!mainEl || !targetEl || !mainEl.contains(targetEl)) return;
      e.preventDefault();
      e.stopPropagation();
      pendingDrawScrollTopRef.current = mainEl.scrollTop;
      const pageEl = targetEl.closest("[data-page-idx]") as HTMLElement | null;
      let blockEl = targetEl.closest("[data-block-idx]") as HTMLElement | null;
      if (!blockEl) {
        const searchRoot = pageEl || mainEl;
        let bestDist = Infinity;
        for (const el of Array.from(searchRoot.querySelectorAll<HTMLElement>("[data-block-idx]"))) {
          const r = el.getBoundingClientRect();
          const dist = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
          if (dist < bestDist) {
            bestDist = dist;
            blockEl = el;
          }
        }
      }
      const clickedIdx = blockEl ? Number(blockEl.getAttribute("data-block-idx")) : NaN;
      const afterIdx = !isNaN(clickedIdx) ? clickedIdx : selectedIdx;
      const refPageEl = pageEl || document.querySelector<HTMLElement>('[data-page-idx="0"]');
      const pageCs = refPageEl ? window.getComputedStyle(refPageEl) : null;
      const pageWidth = refPageEl && pageCs
        ? Math.max(200, refPageEl.clientWidth - parseFloat(pageCs.paddingLeft || "0") - parseFloat(pageCs.paddingRight || "0"))
        : 603;
      drawDragStartRef.current = { x: e.clientX, y: e.clientY, afterIdx, pageWidth };
      setDrawPreviewRect({
        left: e.clientX,
        top: e.clientY,
        width: 0,
        height: 0,
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY,
      });
    };
    const onMouseMove = (e: MouseEvent) => {
      const start = drawDragStartRef.current;
      if (!start) return;
      setDrawPreviewRect({
        left: Math.min(start.x, e.clientX),
        top: Math.min(start.y, e.clientY),
        width: Math.abs(e.clientX - start.x),
        height: Math.abs(e.clientY - start.y),
        startX: start.x,
        startY: start.y,
        curX: e.clientX,
        curY: e.clientY,
      });
    };
    const onMouseUp = (e: MouseEvent) => {
      const start = drawDragStartRef.current;
      if (!start) return;
      lastPointerActionAtRef.current = Date.now();
      drawDragStartRef.current = null;
      setDrawPreviewRect(null);
      const zoom = Math.max(0.2, zoomPercent / 100);
      const dx = Math.abs(e.clientX - start.x) / zoom;
      const dy = Math.abs(e.clientY - start.y) / zoom;
      const anchorEl = document.querySelector<HTMLElement>(`[data-block-idx="${start.afterIdx}"]`);
      const anchorRect = anchorEl?.getBoundingClientRect();
      const leftPx = Math.min(start.x, e.clientX);
      const topPx = Math.min(start.y, e.clientY);
      const offsetX = anchorRect ? Math.round((leftPx - anchorRect.left) / zoom) : 0;
      const offsetY = anchorRect ? Math.round((topPx - anchorRect.bottom) / zoom) : 0;
      const isLineDraw = pendingDrawShape === "line";
      const widthPercent = dx >= 8
        ? Math.max(isLineDraw ? 0.5 : 2, Math.min(100, Number(((dx / start.pageWidth) * 100).toFixed(2))))
        : (isLineDraw && dy >= 8 ? Math.max(0.5, Number(((Math.max(2, dx) / start.pageWidth) * 100).toFixed(2))) : undefined);
      const heightPt = dy >= 8
        ? Math.max(6, Math.min(900, Number((dy * 0.75).toFixed(2))))
        : undefined;
      const lineDir: "tl-br" | "bl-tr" | undefined = isLineDraw && dy >= 12
        ? ((e.clientX - start.x) * (e.clientY - start.y) >= 0 ? "tl-br" : "bl-tr")
        : undefined;
      if (pendingDrawImage) {
        const imgSpec = pendingDrawImage;
        setPendingDrawImage(null);
        insertImageBlock(imgSpec.src, imgSpec.caption, {
          widthPercent: widthPercent ?? 40,
          heightPt,
          treatAsChar: imgSpec.treatAsChar,
          offsetX,
          offsetY,
          afterIdx: start.afterIdx,
        });
        return;
      }
      if (pendingDrawShape) {
        const shapeKind = pendingDrawShape;
        setPendingDrawShape(null);
        insertQuickShape(shapeKind, { widthPercent, heightPt, offsetX, offsetY, afterIdx: start.afterIdx, lineDir });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pendingDrawShape, pendingDrawImage, zoomPercent]);

  // 글상자 (Text Box) 삽입
  const addTextBox = () => insertQuickShape("textbox");

  // 모달 적용 후 해당 문단 포커스 복원 공통 헬퍼
  const focusParagraphById = (blockId?: string) => {
    if (!blockId) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const pEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"] p`);
        if (pEl) {
          pEl.focus({ preventScroll: true });
          pEl.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    });
  };

  // 한컴독스 그리기 개체 5종 팔레트 공통 렌더러
  const renderDrawingShapePalette = (onPick: (kind: "textbox" | "rect" | "ellipse" | "line" | "arc") => void) => (
    <>
      <div className="text-[11px] font-semibold text-neutral-600 px-1 pb-1.5 border-b border-neutral-200 mb-1.5">
        그리기 개체
      </div>
      <div className="flex items-center gap-1">
        {(
          [
            { kind: "textbox", title: "가로 글상자", icon: <span className="text-xs font-mono border border-neutral-600 px-0.5 leading-tight">▤</span> },
            { kind: "rect", title: "직사각형", icon: <span className="w-4 h-3 border border-neutral-700 inline-block" /> },
            { kind: "ellipse", title: "타원", icon: <span className="w-4 h-4 rounded-full border border-neutral-700 inline-block" /> },
            { kind: "line", title: "직선", icon: <span className="text-sm font-bold leading-none">╲</span> },
            {
              kind: "arc",
              title: "호",
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M 3 13 A 10 10 0 0 1 13 3" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              ),
            },
          ] as const
        ).map((item) => (
          <button
            key={item.kind}
            type="button"
            title={item.title}
            onClick={() => onPick(item.kind)}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-100 border border-transparent hover:border-neutral-300 cursor-pointer text-neutral-700"
          >
            {item.icon}
          </button>
        ))}
      </div>
    </>
  );

  // 캡션 달기
  const addCaptionToSelected = () => {
    const cur = blocks[selectedIdx];
    const captionText = cur && cur.type === "table" ? "[표 1] 데이터 설명" : "[그림 1] 참고 이미지";
    const newPara: HwpxParagraphBlock = {
      id: `caption-${Date.now()}`,
      type: "paragraph",
      text: captionText,
      sizePt: 9,
      bold: true,
      align: "center",
      fontFamily: currentPara?.fontFamily || FONT_FAMILIES[0].value,
    };
    insertBlockAfter(selectedIdx, newPara);
  };

  const pendingNoteFocusRef = useRef<string | null>(null);

  useEffect(() => {
    const noteId = pendingNoteFocusRef.current;
    if (!noteId) return;
    const el = document.querySelector<HTMLInputElement>(`[data-note-input="${noteId}"]`);
    if (el) {
      pendingNoteFocusRef.current = null;
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.focus();
    }
  }, [blocks]);

  const insertNote = (kind: "footnote" | "endnote") => {
    const targetIdx = selectedIdx >= 0 && blocks[selectedIdx]?.type === "paragraph"
      ? selectedIdx
      : blocks.findIndex((b) => b.type === "paragraph" && !isNoteBlock(b));
    if (targetIdx < 0) return;
    const cur = blocks[targetIdx];
    if (!cur || cur.type !== "paragraph") return;

    const existingCount = blocks.filter((b) => b.id.startsWith(`${kind}-`)).length;
    const noteNum = existingCount + 1;
    const noteId = `${kind}-${Date.now()}`;
    const supHtml = `<sup data-note-id="${noteId}" data-note-type="${kind}" title="클릭하여 각주/미주로 이동" style="font-size:0.72em;vertical-align:super;line-height:0;cursor:pointer;color:#0066cc;">${noteNum})</sup>`;

    restoreSelection();
    const activeEl = document.activeElement;
    if (activeEl && activeEl.getAttribute("contenteditable") === "true" && activeEl.closest(`[data-block-idx="${targetIdx}"]`)) {
      document.execCommand("insertHTML", false, supHtml);
      triggerActiveBlockInput();
    } else {
      updateParagraph(targetIdx, (cur.text || "") + supHtml);
    }

    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yNote = new Y.Map<unknown>();
    yNote.set("id", noteId);
    yNote.set("type", "paragraph");
    const yText = new Y.Text();
    yNote.set("text", yText);
    yNote.set("sizePt", 9);
    yNote.set("align", "left");
    yNote.set("fontFamily", cur.fontFamily || FONT_FAMILIES[0].value);
    doc.transact(() => {
      yBlocks.insert(yBlocks.length, [yNote]);
    });
    renumberNotesInYDoc();
    pendingNoteFocusRef.current = noteId;
  };

  const renumberNotesInYDoc = () => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const fnOrder: string[] = [];
    const enOrder: string[] = [];
    const supScanRe = /<sup\b[^>]*data-note-id=["']([^"']+)["'][^>]*>/gi;
    for (let i = 0; i < yBlocks.length; i++) {
      const yb = yBlocks.get(i);
      const id = String(yb.get("id") || "");
      if (id.startsWith("footnote-") || id.startsWith("endnote-")) continue;
      if (yb.get("type") === "paragraph") {
        const yt = yb.get("text");
        const raw = yt instanceof Y.Text ? yt.toString() : String(yt || "");
        let m: RegExpExecArray | null;
        supScanRe.lastIndex = 0;
        while ((m = supScanRe.exec(raw)) !== null) {
          const nid = m[1];
          if (nid.startsWith("footnote-") && !fnOrder.includes(nid)) fnOrder.push(nid);
          else if (nid.startsWith("endnote-") && !enOrder.includes(nid)) enOrder.push(nid);
        }
      }
    }
    const supReplaceRe = /(<sup\b[^>]*data-note-id=["']([^"']+)["'][^>]*>)([\s\S]*?)(<\/sup>)/gi;
    doc.transact(() => {
      for (let i = 0; i < yBlocks.length; i++) {
        const yb = yBlocks.get(i);
        const id = String(yb.get("id") || "");
        if (id.startsWith("footnote-") || id.startsWith("endnote-")) continue;
        if (yb.get("type") === "paragraph") {
          const yt = yb.get("text");
          if (yt instanceof Y.Text) {
            const raw = yt.toString();
            const updated = raw.replace(supReplaceRe, (_full, open, nid, _inner, close) => {
              const fnIdx = fnOrder.indexOf(nid);
              if (fnIdx !== -1) return `${open}${fnIdx + 1})${close}`;
              const enIdx = enOrder.indexOf(nid);
              if (enIdx !== -1) return `${open}${enIdx + 1})${close}`;
              return _full;
            });
            if (updated !== raw) {
              applyTextDiffToYText(yt, updated);
            }
          }
        }
      }
    });
  };

  const deleteNoteBlock = (noteId: string) => {
    const noteIdx = blocks.findIndex((b) => b.id === noteId);
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const escapedId = noteId.replace(/[^a-zA-Z0-9_-]/g, "");
    const supRe = new RegExp(`<sup[^>]*data-note-id=["']${escapedId}["'][^>]*>.*?<\/sup>`, "gi");
    doc.transact(() => {
      for (let i = 0; i < yBlocks.length; i++) {
        const yb = yBlocks.get(i);
        if (yb.get("type") === "paragraph") {
          const yt = yb.get("text");
          if (yt instanceof Y.Text) {
            const raw = yt.toString();
            const cleaned = raw.replace(supRe, "");
            if (cleaned !== raw) {
              yt.delete(0, yt.length);
              yt.insert(0, cleaned);
            }
          }
        }
      }
      if (noteIdx >= 0 && noteIdx < yBlocks.length) {
        yBlocks.delete(noteIdx, 1);
      }
    });
    renumberNotesInYDoc();
  };

  // 각주 달기 (한컴독스 표준: 본문 위첨자 1) + 현재 페이지 하단 짧은 구분선 및 각주 영역)
  const addFootnote = () => insertNote("footnote");

  // 미주 달기 (한컴독스 표준: 본문 위첨자 1) + 문서 마지막 페이지 끝 미주 영역)
  const addEndnote = () => insertNote("endnote");

  // 차트 삽입 (한컴 표준)
  const insertChart = (
    chartType: "column" | "bar" | "line" | "pie" = selectedChartType,
    title: string = chartTitleInput
  ) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", `chart_${Date.now()}`);
    yBlock.set("type", "chart");
    yBlock.set("chartType", chartType);
    yBlock.set("title", title || "[차트 1] 분기별 경영 실적 분석");
    yBlock.set("categories", ["1분기", "2분기", "3분기", "4분기"]);
    yBlock.set("series", [
      { name: "매출액", values: [180, 240, 290, 360], color: "#2563eb" },
      { name: "영업이익", values: [55, 80, 105, 140], color: "#10b981" },
    ]);
    yBlock.set("widthPercent", 85);
    yBlock.set("heightPt", 220);
    yBlock.set("align", "center");

    doc.transact(() => {
      yBlocks.insert(selectedIdx + 1, [yBlock]);
    });
    setSelectedIdx(selectedIdx + 1);
    setShowChartModal(false);
    const label = chartType === "column" ? "묶은 세로 막대형" : chartType === "bar" ? "가로 막대형" : chartType === "line" ? "꺾은선형" : "원형";
    showToast(`차트(${label})가 문서에 삽입되었습니다.`);
  };

  const updateChartType = (idx: number, newType: "column" | "bar" | "line" | "pie") => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(idx);
    if (!yBlock) return;
    doc.transact(() => {
      yBlock.set("chartType", newType);
    });
    const label = newType === "column" ? "세로 막대형" : newType === "bar" ? "가로 막대형" : newType === "line" ? "꺾은선형" : "원형";
    showToast(`차트 종류가 [${label}]으로 변경되었습니다.`);
  };

  const insertSampleChart = () => {
    setShowChartModal(true);
  };

  const insertChartWithType = (chartType: HwpxChartType, label?: string) => {
    const newChart: HwpxChartBlock = {
      id: `chart_${Date.now()}`,
      type: "chart",
      chartType,
      title: label ? `${label} 차트` : "분기별 실적 현황",
      categories: ["1분기", "2분기", "3분기", "4분기"],
      series: [
        { name: "매출액", values: [180, 240, 290, 360], color: "#3b82f6" },
        { name: "영업이익", values: [55, 80, 105, 140], color: "#10b981" },
      ],
      widthPercent: 85,
      heightPt: 180,
      align: "center",
    };
    insertBlockAfter(selectedIdx, newChart);
    showToast(`${label || chartType} 차트가 삽입되었습니다.`);
  };

  // 웹 동영상 삽입 (한컴독스)
  const insertWebVideo = () => {
    setWebVideoInput("");
    setShowWebVideoModal(true);
  };

  const confirmInsertWebVideo = () => {
    const parsed = parseWebVideoSource(webVideoInput);
    if (!parsed) {
      showToast("동영상 URL 또는 소스 코드를 입력해 주세요.");
      return;
    }
    const vidShape: HwpxShapeBlock = {
      id: `vid_${Date.now()}`,
      type: "shape",
      shapeType: "rect",
      text: `__WEB_VIDEO__:${parsed.originalUrl}`,
      widthPercent: 75,
      heightPt: 220,
      fillColor: "#000000",
      strokeColor: "#1f2937",
      strokeWidth: 1,
      align: "center",
    };
    insertBlockAfter(selectedIdx, vidShape);
    setShowWebVideoModal(false);
    showToast("웹 동영상이 문서에 삽입되었습니다.");
  };

  // 차례(목차) 만들기 (TOC)
  const insertToc = () => {
    const headings = blocks
      .filter((b): b is HwpxParagraphBlock => b.type === "paragraph" && (((b.sizePt ?? 0) >= 12) || !!b.bold))
      .map((b) => b.text.replace(/<[^>]*>/g, "").trim())
      .filter(Boolean);

    const tocLines = headings.length > 0
      ? headings.map((h, i) => `${h} ························································ ${i + 1}`)
      : [
        "1. 연구 배경 및 서론 ························································ 1",
        "2. 주요 설계 및 추진 내용 ··················································· 2",
        "3. 실증 분석 및 결과 ························································ 3",
        "4. 결론 및 향후 제언 ························································ 4",
      ];

    const tocPara: HwpxParagraphBlock = {
      id: `toc-${Date.now()}`,
      type: "paragraph",
      text: `[차  례]\n\n${tocLines.join("\n")}`,
      sizePt: 10,
      align: "left",
      fontFamily: currentPara?.fontFamily || FONT_FAMILIES[0].value,
    };
    insertBlockAfter(0, tocPara);
  };

  // 표 계산식 및 자릿점
  const handleTableCalc = (type: "sum" | "avg" | "prod" | "comma-add" | "comma-remove") => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("계산식을 적용할 표를 먼저 선택해 주세요.");
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(selectedIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;

    const hasSel = tableCellSelection && tableCellSelection.blockIdx === selectedIdx;
    const rMin = hasSel ? Math.min(tableCellSelection.startRow, tableCellSelection.endRow) : 0;
    const rMax = hasSel ? Math.max(tableCellSelection.startRow, tableCellSelection.endRow) : cur.rows.length - 1;
    const cMin = hasSel ? Math.min(tableCellSelection.startCol, tableCellSelection.endCol) : 0;
    const cMax = hasSel ? Math.max(tableCellSelection.startCol, tableCellSelection.endCol) : (cur.rows[0]?.length || 1) - 1;
    const isSingleFocusedCell = !hasSel && activeTableCell?.blockIdx === selectedIdx;

    doc.transact(() => {
      if (type === "sum" || type === "avg" || type === "prod") {
        let sum = 0;
        let prod = 1;
        let count = 0;
        for (let r = rMin; r <= rMax; r++) {
          const row = cur.rows[r];
          if (!row) continue;
          for (let c = cMin; c <= cMax; c++) {
            const cell = row[c];
            if (!cell || cell.mergedHidden) continue;
            const num = parseFloat(cell.text.replace(/,/g, "").trim());
            if (!isNaN(num)) {
              sum += num;
              prod *= num;
              count++;
            }
          }
        }
        const valStr =
          type === "sum"
            ? String(sum.toLocaleString())
            : type === "prod"
              ? (count > 0 ? String(prod.toLocaleString()) : "0")
              : (count > 0 ? (sum / count).toFixed(2) : "0");
        const targetRowIdx = Math.min(yRows.length - 1, rMax);
        const targetRow = yRows.get(targetRowIdx);
        const targetColIdx = Math.min((targetRow?.length || 1) - 1, cMax);
        const targetCell = targetRow?.get(targetColIdx);
        const yCellText = targetCell?.get("text") as Y.Text;
        if (yCellText) {
          yCellText.delete(0, yCellText.length);
          yCellText.insert(0, valStr);
        }
      } else if (type === "comma-add" || type === "comma-remove") {
        const startR = isSingleFocusedCell ? activeTableCell.row : rMin;
        const endR = isSingleFocusedCell ? activeTableCell.row : rMax;
        const startC = isSingleFocusedCell ? activeTableCell.col : cMin;
        const endC = isSingleFocusedCell ? activeTableCell.col : cMax;
        for (let rIdx = startR; rIdx <= endR; rIdx++) {
          const row = cur.rows[rIdx];
          const yRow = yRows.get(rIdx);
          if (!row || !yRow) continue;
          for (let cIdx = startC; cIdx <= endC; cIdx++) {
            const cell = row[cIdx];
            const yCell = yRow.get(cIdx);
            const yCellText = yCell?.get("text") as Y.Text;
            if (!cell || !yCellText || cell.mergedHidden) continue;
            const raw = cell.text;
            let nextText = raw;
            if (type === "comma-add") {
              nextText = raw.replace(/(^|[^0-9.,-])(-?\d[\d,]*(?:\.\d+)?)(?=$|[^0-9.,])/g, (_m, prefix: string, numToken: string) => {
                const clean = numToken.replace(/,/g, "");
                if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return _m;
                const [intPart, decPart] = clean.split(".");
                const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                return prefix + (decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt);
              });
            } else {
              nextText = raw.replace(/(\d),(?=\d{3}(?:\b|[.,]))/g, "$1");
              while (/(\d),(?=\d{3}(?:\b|[.,]))/.test(nextText)) {
                nextText = nextText.replace(/(\d),(?=\d{3}(?:\b|[.,]))/g, "$1");
              }
            }
            if (nextText !== raw) {
              yCellText.delete(0, yCellText.length);
              yCellText.insert(0, nextText);
            }
          }
        }
      }
    });
  };

  // 병합된 셀을 포함하도록 셀 선택 영역을 직사각형으로 확장
  const expandCellSelection = (
    rows: HwpxTableCell[][],
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ) => {
    let r1 = Math.max(0, Math.min(startRow, endRow));
    let r2 = Math.min(rows.length - 1, Math.max(startRow, endRow));
    let c1 = Math.max(0, Math.min(startCol, endCol));
    let c2 = Math.min((rows[0]?.length || 1) - 1, Math.max(startCol, endCol));

    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const cell = rows[r][c];
          if (!cell || cell.mergedHidden) continue;
          const cr2 = r + Math.max(1, cell.rowSpan || 1) - 1;
          const cc2 = c + Math.max(1, cell.colSpan || 1) - 1;
          const overlaps = !(cr2 < r1 || r > r2 || cc2 < c1 || c > c2);
          if (overlaps) {
            if (r < r1) { r1 = r; changed = true; }
            if (cr2 > r2) { r2 = cr2; changed = true; }
            if (c < c1) { c1 = c; changed = true; }
            if (cc2 > c2) { c2 = cc2; changed = true; }
          }
        }
      }
    }
    return { r1, r2, c1, c2 };
  };

  // 표 셀 합치기 (선택 영역 병합)
  const handleMergeTableCells = () => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("셀을 합칠 표를 먼저 선택해 주세요.");
      return;
    }
    if (!tableCellSelection || tableCellSelection.blockIdx !== selectedIdx) {
      showToast("합칠 셀을 2개 이상 드래그하거나 Shift+클릭으로 선택해 주세요.");
      return;
    }
    const { r1, r2, c1, c2 } = expandCellSelection(
      cur.rows,
      tableCellSelection.startRow,
      tableCellSelection.startCol,
      tableCellSelection.endRow,
      tableCellSelection.endCol
    );
    let visibleCount = 0;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (!cur.rows[r]?.[c]?.mergedHidden) visibleCount++;
      }
    }
    if (visibleCount < 2) {
      showToast("합칠 셀을 2개 이상 선택해 주세요.");
      return;
    }

    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(selectedIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;
    if (!yRows || yRows.length < 1) return;

    doc.transact(() => {
      const texts: string[] = [];
      for (let r = r1; r <= r2; r++) {
        const yRow = yRows.get(r);
        if (!yRow) continue;
        for (let c = c1; c <= c2; c++) {
          const yCell = yRow.get(c);
          if (!yCell || yCell.get("mergedHidden")) continue;
          const t = ((yCell.get("text") as Y.Text)?.toString() || "").trim();
          if (t) texts.push(t);
        }
      }
      const anchorCell = yRows.get(r1)?.get(c1);
      if (!anchorCell) return;
      const anchorText = anchorCell.get("text") as Y.Text | undefined;
      const combined = texts.join(" ");
      if (anchorText) {
        anchorText.delete(0, anchorText.length);
        anchorText.insert(0, combined);
      }
      anchorCell.set("colSpan", c2 - c1 + 1);
      anchorCell.set("rowSpan", r2 - r1 + 1);
      anchorCell.delete("mergedHidden");

      for (let r = r1; r <= r2; r++) {
        const yRow = yRows.get(r);
        if (!yRow) continue;
        for (let c = c1; c <= c2; c++) {
          if (r === r1 && c === c1) continue;
          const yCell = yRow.get(c);
          if (!yCell) continue;
          yCell.set("mergedHidden", true);
          yCell.set("colSpan", 1);
          yCell.set("rowSpan", 1);
          const yt = yCell.get("text") as Y.Text | undefined;
          if (yt && yt.length > 0) yt.delete(0, yt.length);
        }
      }
    });

    setTableCellSelection({ blockIdx: selectedIdx, startRow: r1, startCol: c1, endRow: r1, endCol: c1 });
    setActiveTableCell({ blockIdx: selectedIdx, row: r1, col: c1 });
    showToast("선택한 셀을 합쳤습니다.");
  };

  // 표 셀 나누기 모달 열기
  const handleSplitTableCell = () => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("셀을 나눌 표를 먼저 선택해 주세요.");
      return;
    }
    let targetRow = 0;
    let targetCol = 0;
    let endRow = 0;
    let endCol = 0;
    let canMergeBeforeSplit = false;
    if (tableCellSelection && tableCellSelection.blockIdx === selectedIdx) {
      const { r1, r2, c1, c2 } = expandCellSelection(
        cur.rows,
        tableCellSelection.startRow,
        tableCellSelection.startCol,
        tableCellSelection.endRow,
        tableCellSelection.endCol
      );
      targetRow = r1;
      targetCol = c1;
      endRow = r2;
      endCol = c2;
      let visibleCount = 0;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (!cur.rows[r]?.[c]?.mergedHidden) visibleCount++;
        }
      }
      canMergeBeforeSplit = visibleCount >= 2;
    } else if (activeTableCell && activeTableCell.blockIdx === selectedIdx) {
      targetRow = activeTableCell.row;
      targetCol = activeTableCell.col;
      endRow = targetRow;
      endCol = targetCol;
    }
    const targetCell = cur.rows[targetRow]?.[targetCol];
    if (!targetCell || targetCell.mergedHidden) {
      showToast("나눌 셀을 먼저 선택해 주세요.");
      return;
    }
    const curR = Math.max(1, targetCell.rowSpan || 1);
    const curC = Math.max(1, targetCell.colSpan || 1);
    setSplitCellModal({
      blockIdx: selectedIdx,
      row: targetRow,
      col: targetCol,
      endRow,
      endCol,
      canMergeBeforeSplit,
      initialRows: curR > 1 ? curR : 1,
      initialCols: curC > 1 ? curC : 1,
    });
  };

  // 표 셀 나누기 실행 (표 전체 격자 정렬 유지)
  const applySplitTableCell = (
    blockIdx: number,
    targetRow: number,
    targetCol: number,
    splitRows: number,
    splitCols: number,
    opts?: { endRow?: number; endCol?: number; mergeBeforeSplit?: boolean }
  ) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;
    if (!yRows || targetRow >= yRows.length) return;
    const targetYRow = yRows.get(targetRow);
    if (!targetYRow || targetCol >= targetYRow.length) return;
    const anchor = targetYRow.get(targetCol);
    if (!anchor) return;

    const shouldMergeFirst =
      Boolean(opts?.mergeBeforeSplit) &&
      opts?.endRow !== undefined &&
      opts?.endCol !== undefined &&
      (opts.endRow > targetRow || opts.endCol > targetCol);

    const curRowSpan = shouldMergeFirst
      ? opts!.endRow! - targetRow + 1
      : Math.max(1, (anchor.get("rowSpan") as number) || 1);
    const curColSpan = shouldMergeFirst
      ? opts!.endCol! - targetCol + 1
      : Math.max(1, (anchor.get("colSpan") as number) || 1);

    if (!shouldMergeFirst && splitRows === 1 && splitCols === 1 && curRowSpan === 1 && curColSpan === 1) {
      return;
    }

    const makeEmptyCell = (hidden = false) => {
      const m = new Y.Map<unknown>();
      m.set("text", new Y.Text(""));
      if (hidden) m.set("mergedHidden", true);
      return m;
    };

    const findHorizCoveringCell = (yRow: Y.Array<Y.Map<unknown>>, colIdx: number) => {
      for (let c = colIdx; c >= 0; c--) {
        const cell = yRow.get(c);
        if (cell && !cell.get("mergedHidden")) {
          return { cell, startCol: c };
        }
      }
      return null;
    };

    const findVertCoveringCell = (rowIdx: number, colIdx: number) => {
      for (let r = rowIdx; r >= 0; r--) {
        const yRow = yRows.get(r);
        const cell = yRow?.get(colIdx);
        if (cell && !cell.get("mergedHidden")) {
          return { cell, startRow: r };
        }
      }
      return null;
    };

    doc.transact(() => {
      if (shouldMergeFirst && opts?.endRow !== undefined && opts?.endCol !== undefined) {
        const texts: string[] = [];
        for (let r = targetRow; r <= opts.endRow; r++) {
          const yRow = yRows.get(r);
          if (!yRow) continue;
          for (let c = targetCol; c <= opts.endCol; c++) {
            const cell = yRow.get(c);
            if (!cell || cell.get("mergedHidden")) continue;
            const t = ((cell.get("text") as Y.Text)?.toString() || "").trim();
            if (t) texts.push(t);
          }
        }
        const anchorText = anchor.get("text") as Y.Text | undefined;
        if (anchorText) {
          anchorText.delete(0, anchorText.length);
          anchorText.insert(0, texts.join(" "));
        }
        anchor.set("colSpan", curColSpan);
        anchor.set("rowSpan", curRowSpan);
        anchor.delete("mergedHidden");
        for (let r = targetRow; r <= opts.endRow; r++) {
          const yRow = yRows.get(r);
          if (!yRow) continue;
          for (let c = targetCol; c <= opts.endCol; c++) {
            if (r === targetRow && c === targetCol) continue;
            const cell = yRow.get(c);
            if (!cell) continue;
            cell.set("mergedHidden", true);
            cell.set("colSpan", 1);
            cell.set("rowSpan", 1);
            const yt = cell.get("text") as Y.Text | undefined;
            if (yt && yt.length > 0) yt.delete(0, yt.length);
          }
        }
      }

      // 1) 열 방향 분할: 필요한 만큼 그리드 열 추가 후 다른 행은 colSpan 보정
      const extraCols = Math.max(0, splitCols - curColSpan);
      const insertColAt = targetCol + curColSpan;
      if (extraCols > 0) {
        for (let r = 0; r < yRows.length; r++) {
          const yRow = yRows.get(r);
          const inTargetRowSpan = r >= targetRow && r < targetRow + curRowSpan;
          if (!inTargetRowSpan) {
            const cov = findHorizCoveringCell(yRow, targetCol);
            if (cov) {
              const prevSpan = Math.max(1, (cov.cell.get("colSpan") as number) || 1);
              cov.cell.set("colSpan", prevSpan + extraCols);
            }
          }
          const newCells: Y.Map<unknown>[] = [];
          for (let k = 0; k < extraCols; k++) {
            newCells.push(makeEmptyCell(!inTargetRowSpan));
          }
          yRow.insert(insertColAt, newCells);
        }
      }

      const finalSpanCols = Math.max(curColSpan, splitCols);

      // 2) 행 방향 분할: 필요한 만큼 그리드 행 추가 후 다른 열은 rowSpan 보정
      const extraRows = Math.max(0, splitRows - curRowSpan);
      const insertRowAt = targetRow + curRowSpan;
      if (extraRows > 0) {
        const totalCols = yRows.get(0)?.length || 1;
        // 먼저 타겟 열 범위 밖의 기존 셀들의 rowSpan 증가
        const bumped = new Set<Y.Map<unknown>>();
        for (let c = 0; c < totalCols; c++) {
          if (c >= targetCol && c < targetCol + finalSpanCols) continue;
          const cov = findVertCoveringCell(targetRow, c);
          if (cov && !bumped.has(cov.cell)) {
            bumped.add(cov.cell);
            const prevR = Math.max(1, (cov.cell.get("rowSpan") as number) || 1);
            cov.cell.set("rowSpan", prevR + extraRows);
          }
        }
        const insertedRows: Y.Array<Y.Map<unknown>>[] = [];
        for (let k = 0; k < extraRows; k++) {
          const newRow = new Y.Array<Y.Map<unknown>>();
          for (let c = 0; c < totalCols; c++) {
            const inTargetCols = c >= targetCol && c < targetCol + finalSpanCols;
            newRow.push([makeEmptyCell(!inTargetCols)]);
          }
          insertedRows.push(newRow);
        }
        yRows.insert(insertRowAt, insertedRows);
      }

      const finalSpanRows = Math.max(curRowSpan, splitRows);

      // 3) 타겟 영역 [targetRow..targetRow+finalSpanRows-1][targetCol..targetCol+finalSpanCols-1] 정리
      const eachRowSpan = splitRows === 1 && curRowSpan > 1 ? curRowSpan : 1;
      const eachColSpan = splitCols === 1 && curColSpan > 1 ? curColSpan : 1;

      for (let r = targetRow; r < targetRow + finalSpanRows; r++) {
        const yRow = yRows.get(r);
        if (!yRow) continue;
        for (let c = targetCol; c < targetCol + finalSpanCols; c++) {
          const cell = yRow.get(c);
          if (!cell) continue;
          const isRowAnchor = splitRows === 1 ? r === targetRow : true;
          const isColAnchor = splitCols === 1 ? c === targetCol : true;
          if (isRowAnchor && isColAnchor) {
            cell.delete("mergedHidden");
            if (eachColSpan > 1) cell.set("colSpan", eachColSpan);
            else cell.delete("colSpan");
            if (eachRowSpan > 1) cell.set("rowSpan", eachRowSpan);
            else cell.delete("rowSpan");
          } else {
            cell.set("mergedHidden", true);
            cell.delete("colSpan");
            cell.delete("rowSpan");
          }
        }
      }
    });

    setTableCellSelection({
      blockIdx,
      startRow: targetRow,
      startCol: targetCol,
      endRow: targetRow,
      endCol: targetCol,
    });
    setActiveTableCell({ blockIdx, row: targetRow, col: targetCol });
    showToast(`셀을 ${splitRows}줄 × ${splitCols}칸으로 나누었습니다.`);
  };

  // 표 너비/높이 맞춤
  const handleDistributeCells = () => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("표를 먼저 선택해 주세요.");
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(selectedIdx);
    if (!yBlock) return;
    doc.transact(() => {
      yBlock.set("widthPercent", 100);
    });
  };

  // 셀 너비를 같게
  const handleEqualizeTableCellWidths = (targetBlockIdx = selectedIdx) => {
    const cur = blocks[targetBlockIdx];
    if (!cur || cur.type !== "table") {
      showToast("표를 먼저 선택해 주세요.");
      return;
    }
    const colCount = cur.rows[0]?.length || 1;
    const equalWidths = Array.from({ length: colCount }, () => Number((100 / colCount).toFixed(2)));
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(targetBlockIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    doc.transact(() => {
      yBlock.set("colWidths", equalWidths);
      if (yRows) {
        for (let r = 0; r < yRows.length; r++) {
          const yRow = yRows.get(r);
          for (let c = 0; c < yRow.length; c++) {
            yRow.get(c)?.delete("widthPercent");
          }
        }
      }
    });
    showToast("셀 너비를 같게 적용했습니다.");
  };

  // 개별 셀 너비 드래그 조절 (선택된 행들의 두 인접 셀만 조절하고 해당 행 나머지 셀 너비도 스냅샷 고정)
  const startSingleCellWidthResize = (
    e: React.MouseEvent<HTMLDivElement>,
    blockIdx: number,
    targetRows: Array<{
      rowIdx: number;
      colIdx: number;
      nextColIdx: number;
      curWidthPct: number;
      nextWidthPct: number;
      rowSnapshot: Array<{ colIdx: number; widthPct: number }>;
    }>
  ) => {
    if (targetRows.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const tableEl = e.currentTarget.closest("[data-hwpx-table]") as HTMLElement | null;
    const tableWidthPx = tableEl?.getBoundingClientRect().width || 600;
    const startX = e.clientX;
    const primary = targetRows[0];
    const pairSum = primary.curWidthPct + primary.nextWidthPct;
    const minPct = Math.min(6, pairSum / 2);
    let dxPctLatest = 0;
    document.body.style.cursor = "col-resize";

    const computeRowPair = (tr: (typeof targetRows)[number], dxPct: number) => {
      const pSum = tr.curWidthPct + tr.nextWidthPct;
      const mPct = Math.min(6, pSum / 2);
      const l = Number(Math.max(mPct, Math.min(pSum - mPct, tr.curWidthPct + dxPct)).toFixed(2));
      const r = Number((pSum - l).toFixed(2));
      return { l, r };
    };

    const buildMap = (dxPct: number) => {
      const m: Record<string, number> = {};
      for (const tr of targetRows) {
        const { l, r } = computeRowPair(tr, dxPct);
        for (const item of tr.rowSnapshot) {
          m[`${tr.rowIdx}:${item.colIdx}`] = item.widthPct;
        }
        m[`${tr.rowIdx}:${tr.colIdx}`] = l;
        m[`${tr.rowIdx}:${tr.nextColIdx}`] = r;
      }
      return m;
    };

    const onMove = (ev: MouseEvent) => {
      const rawDxPct = ((ev.clientX - startX) / Math.max(100, tableWidthPx)) * 100;
      const clampedLeft = Math.max(minPct, Math.min(pairSum - minPct, primary.curWidthPct + rawDxPct));
      dxPctLatest = clampedLeft - primary.curWidthPct;
      setTableCellResizeDraft({
        blockIdx,
        cellWidths: buildMap(dxPctLatest),
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(blockIdx);
      const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
      if (yRows) {
        doc.transact(() => {
          for (const tr of targetRows) {
            const yRow = yRows.get(tr.rowIdx);
            if (!yRow) continue;
            const { l, r } = computeRowPair(tr, dxPctLatest);
            for (const item of tr.rowSnapshot) {
              const w = item.colIdx === tr.colIdx ? l : item.colIdx === tr.nextColIdx ? r : item.widthPct;
              yRow.get(item.colIdx)?.set("widthPercent", w);
            }
          }
        });
      }
      setTableCellResizeDraft(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 셀 높이를 같게
  const handleEqualizeTableCellHeights = (targetBlockIdx = selectedIdx) => {
    const cur = blocks[targetBlockIdx];
    if (!cur || cur.type !== "table") {
      showToast("표를 먼저 선택해 주세요.");
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(targetBlockIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    doc.transact(() => {
      yBlock.delete("rowHeights");
      if (yRows) {
        for (let r = 0; r < yRows.length; r++) {
          const yRow = yRows.get(r);
          for (let c = 0; c < yRow.length; c++) {
            yRow.get(c)?.delete("heightPx");
          }
        }
      }
    });
    showToast("셀 높이를 같게 적용했습니다.");
  };

  // 개별 셀 세로 높이 드래그 조절 (선택된 열들의 위/아래 인접 셀만 조절하고 해당 열 나머지 셀 높이도 스냅샷 고정)
  const startSingleCellHeightResize = (
    e: React.MouseEvent<HTMLDivElement>,
    blockIdx: number,
    targetCols: Array<{
      colIdx: number;
      rowIdx: number;
      nextRowIdx: number;
      curHeightPx: number;
      nextHeightPx: number;
      colSnapshot: Array<{ rowIdx: number; heightPx: number }>;
    }>
  ) => {
    if (targetCols.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const zoom = Math.max(0.2, zoomPercent / 100);
    const startY = e.clientY;
    const primary = targetCols[0];
    const pairSum = primary.curHeightPx + primary.nextHeightPx;
    const minPx = Math.min(18, pairSum / 2);
    let dyLatest = 0;
    document.body.style.cursor = "row-resize";

    const computeColPair = (tc: (typeof targetCols)[number], dyPx: number) => {
      const pSum = tc.curHeightPx + tc.nextHeightPx;
      const mPx = Math.min(18, pSum / 2);
      const t = Math.round(Math.max(mPx, Math.min(pSum - mPx, tc.curHeightPx + dyPx)));
      const b = Math.round(pSum - t);
      return { t, b };
    };

    const buildMap = (dyPx: number) => {
      const m: Record<string, number> = {};
      for (const tc of targetCols) {
        const { t, b } = computeColPair(tc, dyPx);
        for (const item of tc.colSnapshot) {
          m[`${item.rowIdx}:${tc.colIdx}`] = item.heightPx;
        }
        m[`${tc.rowIdx}:${tc.colIdx}`] = t;
        m[`${tc.nextRowIdx}:${tc.colIdx}`] = b;
      }
      return m;
    };

    const onMove = (ev: MouseEvent) => {
      const rawDy = (ev.clientY - startY) / zoom;
      const clampedTop = Math.max(minPx, Math.min(pairSum - minPx, primary.curHeightPx + rawDy));
      dyLatest = clampedTop - primary.curHeightPx;
      setTableCellResizeDraft({
        blockIdx,
        cellHeights: buildMap(dyLatest),
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(blockIdx);
      const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
      if (yRows) {
        doc.transact(() => {
          for (const tc of targetCols) {
            const { t, b } = computeColPair(tc, dyLatest);
            for (const item of tc.colSnapshot) {
              const h = item.rowIdx === tc.rowIdx ? t : item.rowIdx === tc.nextRowIdx ? b : item.heightPx;
              yRows.get(item.rowIdx)?.get(tc.colIdx)?.set("heightPx", h);
            }
          }
        });
      }
      setTableCellResizeDraft(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 표 열 너비 드래그 조절
  const startTableColResize = (
    e: React.MouseEvent<HTMLDivElement>,
    blockIdx: number,
    colIdx: number,
    initialColWidths: number[]
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const tableEl = e.currentTarget.closest("[data-hwpx-table]");
    const tableWidthPx = tableEl?.getBoundingClientRect().width || 600;
    const startX = e.clientX;
    const base = [...initialColWidths];
    if (colIdx < 0 || colIdx >= base.length - 1) return;
    const pairSum = base[colIdx] + base[colIdx + 1];
    const minPct = Math.min(6, pairSum / 2);
    let latest = [...base];

    document.body.style.cursor = "col-resize";

    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startX) / Math.max(100, tableWidthPx)) * 100;
      const nextLeft = Math.max(minPct, Math.min(pairSum - minPct, base[colIdx] + dxPct));
      const nextRight = pairSum - nextLeft;
      latest = [...base];
      latest[colIdx] = Number(nextLeft.toFixed(2));
      latest[colIdx + 1] = Number(nextRight.toFixed(2));
      setTableCellResizeDraft({ blockIdx, colWidths: latest });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(blockIdx);
      if (yBlock) {
        doc.transact(() => {
          yBlock.set("colWidths", latest);
        });
      }
      setTableCellResizeDraft(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 표 우측 끝 테두리 드래그로 전체 너비 조절
  const startTableWidthResize = (
    e: React.MouseEvent<HTMLDivElement>,
    blockIdx: number,
    initialWidthPct: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const tableEl = e.currentTarget.closest("[data-hwpx-table]");
    const pageEl = tableEl?.closest(".hwpx-page-sheet") as HTMLElement | null;
    const containerW = pageEl?.getBoundingClientRect().width ? pageEl.getBoundingClientRect().width * 0.78 : 600;
    const startX = e.clientX;
    let latestW = Math.max(20, Math.min(100, initialWidthPct || 100));
    document.body.style.cursor = "col-resize";

    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startX) / Math.max(200, containerW)) * 100;
      latestW = Math.round(Math.max(20, Math.min(100, (initialWidthPct || 100) + dxPct)));
      setDragResize((prev) => ({ ...prev, [blockIdx]: { ...(prev[blockIdx] || {}), widthPercent: latestW } }));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      setDragResize((prev) => {
        const next = { ...prev };
        delete next[blockIdx];
        return next;
      });
      commitObjectResize(blockIdx, latestW, undefined);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 표 행 높이 드래그 조절
  const startTableRowResize = (
    e: React.MouseEvent<HTMLDivElement>,
    blockIdx: number,
    rowIdx: number,
    initialRowHeights: number[] | undefined,
    rowCount: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const zoom = Math.max(0.2, zoomPercent / 100);
    const tableEl = e.currentTarget.closest("[data-hwpx-table]");
    const base = Array.from({ length: rowCount }, (_, ri) => {
      const existing = initialRowHeights?.[ri];
      if (existing && existing > 0) return existing;
      const cellEl = tableEl?.querySelector(`[data-hwpx-cell][data-row-idx="${ri}"][data-row-span="1"]`)
        || tableEl?.querySelector(`[data-hwpx-cell][data-row-idx="${ri}"]`);
      return Math.max(24, Math.round((cellEl?.getBoundingClientRect().height || 34) / zoom));
    });
    const startY = e.clientY;
    let latest = [...base];

    document.body.style.cursor = "row-resize";

    const keepTotalHeight = rowIdx < rowCount - 1 && !e.shiftKey;
    const pairSum = keepTotalHeight ? base[rowIdx] + base[rowIdx + 1] : 0;
    const minPairH = keepTotalHeight ? Math.min(18, pairSum / 2) : 18;

    const onMove = (ev: MouseEvent) => {
      const dy = (ev.clientY - startY) / zoom;
      latest = [...base];
      if (keepTotalHeight) {
        const nextTop = Math.max(minPairH, Math.min(pairSum - minPairH, Math.round(base[rowIdx] + dy)));
        const nextBottom = Math.round(pairSum - nextTop);
        latest[rowIdx] = nextTop;
        latest[rowIdx + 1] = nextBottom;
      } else {
        latest[rowIdx] = Math.max(18, Math.min(600, Math.round(base[rowIdx] + dy)));
      }
      setTableCellResizeDraft({ blockIdx, rowHeights: latest });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(blockIdx);
      if (yBlock) {
        doc.transact(() => {
          yBlock.set("rowHeights", latest);
        });
      }
      setTableCellResizeDraft(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 맞춤법 일괄 교정
  const handleFixSpelling = (corrections: Array<{ from: string; to: string }>) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    doc.transact(() => {
      blocks.forEach((block, bIdx) => {
        if (block.type === "paragraph") {
          let text = block.text;
          let changed = false;
          corrections.forEach((c) => {
            if (text.includes(c.from)) {
              text = text.split(c.from).join(c.to);
              changed = true;
            }
          });
          if (changed) {
            const yBlock = yBlocks.get(bIdx);
            const yText = yBlock?.get("text") as Y.Text;
            if (yText) {
              yText.delete(0, yText.length);
              yText.insert(0, text);
            }
          }
        }
      });
    });
  };

  // 문서마당 (서식 템플릿 로드)
  const handleLoadTemplate = (templateId: "report" | "resume" | "meeting" | "official") => {
    const makeP = (text: string, sizePt = 10, bold = false, align: "left" | "center" | "right" | "justify" = "justify"): HwpxParagraphBlock => ({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "paragraph",
      text,
      sizePt,
      bold,
      align,
      fontFamily: FONT_FAMILIES[0].value,
    });

    let newBlocks: HwpxCollabBlock[] = [];
    if (templateId === "report") {
      newBlocks = [
        makeP("[팀 프로젝트] 최종 결과 보고서", 22, true, "center"),
        makeP("과제명: 대학 협업 플랫폼 실시간 문서 편집 시스템 연구", 12, false, "center"),
        makeP("소속: 공과대학 컴퓨터공학과 | 팀명: Slackers | 작성자: 팀원 일동", 10, false, "center"),
        makeP("2026년 11월 17일", 10, false, "center"),
        makeP("----------------------------------------------------------------", 10, false, "center"),
        makeP("1. 연구 배경 및 목적", 14, true, "left"),
        makeP("최근 원격 협업 및 비대면 환경의 확산으로 인해 실시간 동시 편집 기능을 지원하는 오피스 소프트웨어의 중요성이 대두되고 있다. 본 연구에서는 한컴 OWPML 표준과의 호환성을 유지하면서 웹 상에서 다자간 동시 편집이 가능한 시스템을 구현하고자 한다."),
        makeP("2. 추진 일정 및 업무 분장", 14, true, "left"),
        {
          id: `tbl-${Date.now()}`,
          type: "table",
          rows: [
            [{ text: "구분" }, { text: "담당자" }, { text: "주요 추진 내용" }],
            [{ text: "기획/설계" }, { text: "팀장" }, { text: "한컴 표준 규격 분석 및 UI/UX 와이어프레임 설계" }],
            [{ text: "엔진 개발" }, { text: "팀원 A" }, { text: "실시간 CRDT 동기화 및 MathML 수식 렌더러 구현" }],
            [{ text: "검증/배포" }, { text: "팀원 B" }, { text: "단위 테스트 통과 및 배포 파이프라인 구축" }],
          ],
        },
        makeP("3. 결론 및 향후 계획", 14, true, "left"),
        makeP("본 시스템을 통해 한글 표준 문서를 웹 브라우저만으로 손실 없이 열람 및 편집할 수 있음을 검증하였다. 향후 추가적인 고급 조판 기능과 스타일 서식을 지속적으로 확장할 예정이다."),
      ];
    } else if (templateId === "resume") {
      newBlocks = [
        makeP("입 사 지 원 서", 22, true, "center"),
        {
          id: `tbl-res-${Date.now()}`,
          type: "table",
          rows: [
            [{ text: "성 명" }, { text: "홍길동" }, { text: "생년월일" }, { text: "2000. 01. 01" }],
            [{ text: "연락처" }, { text: "010-1234-5678" }, { text: "이메일" }, { text: "hong@university.ac.kr" }],
            [{ text: "주 소" }, { text: "서울특별시 강남구 테헤란로 123" }, { text: "희망직무" }, { text: "풀스택 소프트웨어 엔지니어" }],
          ],
        },
        makeP("■ 학력 및 주요 활동 사항", 13, true, "left"),
        {
          id: `tbl-edu-${Date.now()}`,
          type: "table",
          rows: [
            [{ text: "기간" }, { text: "학교 및 기관명" }, { text: "전공 및 활동 내용" }],
            [{ text: "2020 ~ 2026" }, { text: "한국대학교" }, { text: "컴퓨터공학과 졸업 (학점 4.2 / 4.5)" }],
            [{ text: "2025 ~ 2026" }, { text: "오픈소스 프로젝트" }, { text: "실시간 협업 웹 오피스 에디터 개발 참여" }],
          ],
        },
        makeP("■ 자기소개서", 13, true, "left"),
        makeP("[지원 동기 및 직무 포부]"),
        makeP("저는 복잡한 시스템의 기술적 난제를 집요하게 파고들어 직관적이고 안정적인 사용자 경험으로 풀어내는 소프트웨어 엔지니어입니다. 귀사에서 최고의 협업 솔루션을 함께 만들어 가고 싶습니다."),
      ];
    } else if (templateId === "meeting") {
      newBlocks = [
        makeP("프로젝트 팀 정기 회의록", 20, true, "center"),
        {
          id: `tbl-meet-${Date.now()}`,
          type: "table",
          rows: [
            [{ text: "일 시" }, { text: "2026년 11월 17일 10:00" }, { text: "장 소" }, { text: "온라인 화상 회의실" }],
            [{ text: "참석자" }, { text: "팀원 전원 (김철수, 이영희, 박지민)" }, { text: "서 기" }, { text: "이영희" }],
            [{ text: "안 건" }, { text: "한컴 웹 에디터 신규 기능 배포 및 QA 점검" }],
          ],
        },
        makeP("1. 논의 안건 및 협의 사항", 13, true, "left"),
        makeP("- 모양 복사(Alt+C), 셀 합치기/나누기 등 핵심 편의 기능 탑재 완료 확인"),
        makeP("- 실시간 협업 CRDT 동기화 지연 및 충돌 테스트 결과 이상 없음 확인"),
        makeP("2. 향후 실행 계획 (Action Items)", 13, true, "left"),
        {
          id: `tbl-act-${Date.now()}`,
          type: "table",
          rows: [
            [{ text: "과제" }, { text: "담당" }, { text: "기한" }],
            [{ text: "최종 사용자 피드백 수렴" }, { text: "김철수" }, { text: "11/20" }],
            [{ text: "성능 벤치마크 보고서 작성" }, { text: "박지민" }, { text: "11/22" }],
          ],
        },
      ];
    } else if (templateId === "official") {
      newBlocks = [
        makeP("업  무  기  안  서", 22, true, "center"),
        {
          id: `tbl-off-${Date.now()}`,
          type: "table",
          rows: [
            [{ text: "기안부서" }, { text: "기술개발본부" }, { text: "기안자" }, { text: "수석연구원" }],
            [{ text: "기안일자" }, { text: "2026. 11. 17." }, { text: "문서번호" }, { text: "TECH-2026-1117" }],
          ],
        },
        makeP("제 목: 한컴오피스 호환 웹 문서 편집기 신규 기능 릴리스 승인의 건", 13, true, "left"),
        makeP("1. 귀 부서의 무궁한 발전을 기원합니다."),
        makeP("2. 당사 협업 플랫폼의 사용성 향상을 위하여 진행된 웹 에디터 신규 조판 및 서식 기능 개발이 완료되었기에 첨부와 같이 보고하오니 재가하여 주시기 바랍니다."),
        makeP("붙임: 1. 기능 명세서 1부.  2. 테스트 결과 보고서 1부.  끝."),
      ];
    }

    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    doc.transact(() => {
      yBlocks.delete(0, yBlocks.length);
      newBlocks.forEach((b) => {
        const yMap = new Y.Map<unknown>();
        yMap.set("id", b.id);
        yMap.set("type", b.type);
        if (b.type === "paragraph") {
          const yText = new Y.Text();
          yText.insert(0, b.text);
          yMap.set("text", yText);
          yMap.set("sizePt", b.sizePt);
          yMap.set("bold", b.bold);
          yMap.set("align", b.align);
          yMap.set("fontFamily", b.fontFamily);
        } else if (b.type === "table") {
          const yRows = new Y.Array<Y.Array<Y.Map<unknown>>>();
          b.rows.forEach((row: { text: string }[]) => {
            const yRow = new Y.Array<Y.Map<unknown>>();
            row.forEach((cell: { text: string }) => {
              const yCell = new Y.Map<unknown>();
              const yCellText = new Y.Text();
              yCellText.insert(0, cell.text);
              yCell.set("text", yCellText);
              yRow.push([yCell]);
            });
            yRows.push([yRow]);
          });
          yMap.set("rows", yRows);
        }
        yBlocks.push([yMap]);
      });
    });
  };

  // 텍스트 / HTML 다운로드
  const handleDownloadTxt = () => {
    const plainText = blocks
      .map((b) => {
        if (b.type === "paragraph") return b.text.replace(/<[^>]*>/g, "");
        if (b.type === "table") return b.rows.map((r) => r.map((c) => c.text).join("\t")).join("\n");
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
    const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (file.name || "문서").replace(/\.hwpx$/i, "") + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${file.name || "한글 문서"}</title>
  <style>
    body { font-family: 'Nanum Myeongjo', serif; margin: 40px auto; max-width: 800px; line-height: 1.6; color: #111; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    td, th { border: 1px solid #333; padding: 8px; }
  </style>
</head>
<body>
  ${blocks
        .map((b) => {
          if (b.type === "paragraph") return `<p style="text-align:${b.align || "left"};font-size:${b.sizePt || 10}pt;${b.bold ? "font-weight:bold;" : ""}">${b.text}</p>`;
          if (b.type === "table") {
            return `<table>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${c.text}</td>`).join("")}</tr>`).join("")}</table>`;
          }
          return "";
        })
        .join("\n")}
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (file.name || "문서").replace(/\.hwpx$/i, "") + ".html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 클립보드 오려두기 / 복사 / 붙여넣기
  useEffect(() => {
    const syncSelectionToBuffer = () => {
      const sel = window.getSelection();
      const txt = sel?.toString() ?? "";
      if (txt) copiedTextBufferRef.current = txt;
    };
    document.addEventListener("copy", syncSelectionToBuffer);
    document.addEventListener("cut", syncSelectionToBuffer);
    return () => {
      document.removeEventListener("copy", syncSelectionToBuffer);
      document.removeEventListener("cut", syncSelectionToBuffer);
    };
  }, []);

  const handleCut = () => {
    const crossSel = getCrossParagraphSelection();
    if (crossSel) {
      const selText = window.getSelection()?.toString() ?? "";
      if (selText) {
        copiedTextBufferRef.current = selText;
        navigator.clipboard?.writeText(selText).catch(() => { });
      }
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const startBlock = blocks[crossSel.startIdx];
      const endBlock = blocks[crossSel.endIdx];
      if (startBlock && endBlock && startBlock.type === "paragraph" && endBlock.type === "paragraph") {
        const mergedText = (startBlock.text || "").slice(0, crossSel.startOffset) + (endBlock.text || "").slice(crossSel.endOffset);
        doc.transact(() => {
          const yStart = yBlocks.get(crossSel.startIdx);
          const yText = yStart?.get("text") as Y.Text | undefined;
          if (yText) {
            yText.delete(0, yText.length);
            yText.insert(0, mergedText);
          }
          yBlocks.delete(crossSel.startIdx + 1, crossSel.endIdx - crossSel.startIdx);
        });
        pendingCaretRef.current = { mode: "offset", blockId: startBlock.id, offset: crossSel.startOffset };
        setIsCrossSelecting(false);
        setSelectedIdx(crossSel.startIdx);
      }
      return;
    }
    restoreSelection();
    const selText = window.getSelection()?.toString() ?? "";
    if (selText) {
      copiedTextBufferRef.current = selText;
      navigator.clipboard?.writeText(selText).catch(() => { });
    }
    document.execCommand("cut");
    triggerActiveBlockInput();
  };

  const handleCopy = () => {
    restoreSelection();
    const selText = window.getSelection()?.toString() ?? "";
    if (selText) {
      copiedTextBufferRef.current = selText;
      navigator.clipboard?.writeText(selText).catch(() => { });
    }
    document.execCommand("copy");
  };

  const handlePaste = async (explicitBlockIdx?: number) => {
    let pasteText = "";
    try {
      const clip = await navigator.clipboard?.readText();
      if (clip) pasteText = clip;
    } catch {
      // 클립보드 읽기 권한이 거부된 경우 내부 버퍼 폴백 사용
    }
    if (!pasteText) {
      pasteText = copiedTextBufferRef.current;
    }
    if (!pasteText) {
      showToast("붙여넣을 텍스트가 클립보드에 없습니다.");
      return;
    }
    const normalized = pasteText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");

    const crossSel = getCrossParagraphSelection();
    if (crossSel) {
      const startBlock = blocks[crossSel.startIdx];
      const endBlock = blocks[crossSel.endIdx];
      if (startBlock && endBlock && startBlock.type === "paragraph" && endBlock.type === "paragraph") {
        const before = (startBlock.text || "").slice(0, crossSel.startOffset);
        const after = (endBlock.text || "").slice(crossSel.endOffset);
        let focusId = startBlock.id;
        let focusOffset = crossSel.startOffset + lines[0].length;
        doc.transact(() => {
          const yStart = yBlocks.get(crossSel.startIdx);
          const yText = yStart?.get("text") as Y.Text | undefined;
          const delCount = crossSel.endIdx - crossSel.startIdx;
          if (delCount > 0) yBlocks.delete(crossSel.startIdx + 1, delCount);
          if (lines.length === 1) {
            if (yText) {
              yText.delete(0, yText.length);
              yText.insert(0, before + lines[0] + after);
            }
          } else {
            if (yText) {
              yText.delete(0, yText.length);
              yText.insert(0, before + lines[0]);
            }
            const extraMaps: Y.Map<unknown>[] = [];
            for (let i = 1; i < lines.length; i++) {
              const isLast = i === lines.length - 1;
              const newId = `para-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`;
              const m = new Y.Map<unknown>();
              m.set("id", newId);
              m.set("type", "paragraph");
              m.set("text", isLast ? lines[i] + after : lines[i]);
              if (startBlock.align) m.set("align", startBlock.align);
              if (startBlock.fontFamily) m.set("fontFamily", startBlock.fontFamily);
              if (startBlock.sizePt) m.set("sizePt", startBlock.sizePt);
              extraMaps.push(m);
              if (isLast) {
                focusId = newId;
                focusOffset = lines[i].length;
              }
            }
            yBlocks.insert(crossSel.startIdx + 1, extraMaps);
          }
        });
        setIsCrossSelecting(false);
        pendingCaretRef.current = { mode: "offset", blockId: focusId, offset: focusOffset };
        setSelectedIdx(crossSel.startIdx + lines.length - 1);
        return;
      }
    }

    const targetIdx = explicitBlockIdx ?? selectedIdx;
    const targetBlock = blocks[targetIdx];
    if (!targetBlock || targetBlock.type !== "paragraph") {
      showToast("텍스트를 붙여넣을 문단을 먼저 선택해 주세요.");
      return;
    }

    const pEl = document.querySelector<HTMLElement>(`[data-block-id="${targetBlock.id}"] p`);
    const fullText = targetBlock.text || "";
    let selStart = fullText.length;
    let selEnd = fullText.length;

    const activeSel = window.getSelection();
    const activeRange =
      activeSel && activeSel.rangeCount > 0 && pEl && pEl.contains(activeSel.anchorNode)
        ? activeSel.getRangeAt(0)
        : lastSelectionRangeRef.current && pEl && pEl.contains(lastSelectionRangeRef.current.startContainer)
          ? lastSelectionRangeRef.current
          : null;

    if (activeRange && pEl) {
      try {
        const preStart = document.createRange();
        preStart.selectNodeContents(pEl);
        preStart.setEnd(activeRange.startContainer, activeRange.startOffset);
        selStart = Math.min(fullText.length, preStart.toString().length);

        const preEnd = document.createRange();
        preEnd.selectNodeContents(pEl);
        preEnd.setEnd(activeRange.endContainer, activeRange.endOffset);
        selEnd = Math.max(selStart, Math.min(fullText.length, preEnd.toString().length));
      } catch {
        selStart = fullText.length;
        selEnd = fullText.length;
      }
    }

    const before = fullText.slice(0, selStart);
    const after = fullText.slice(selEnd);
    let focusId = targetBlock.id;
    let focusOffset = selStart + lines[0].length;

    doc.transact(() => {
      const yTarget = yBlocks.get(targetIdx);
      const yText = yTarget?.get("text") as Y.Text | undefined;
      if (lines.length === 1) {
        if (yText) {
          yText.delete(0, yText.length);
          yText.insert(0, before + lines[0] + after);
        }
      } else {
        if (yText) {
          yText.delete(0, yText.length);
          yText.insert(0, before + lines[0]);
        }
        const extraMaps: Y.Map<unknown>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const isLast = i === lines.length - 1;
          const newId = `para-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`;
          const m = new Y.Map<unknown>();
          m.set("id", newId);
          m.set("type", "paragraph");
          m.set("text", isLast ? lines[i] + after : lines[i]);
          if (targetBlock.align) m.set("align", targetBlock.align);
          if (targetBlock.fontFamily) m.set("fontFamily", targetBlock.fontFamily);
          if (targetBlock.sizePt) m.set("sizePt", targetBlock.sizePt);
          extraMaps.push(m);
          if (isLast) {
            focusId = newId;
            focusOffset = lines[i].length;
          }
        }
        yBlocks.insert(targetIdx + 1, extraMaps);
      }
    });

    pendingCaretRef.current = { mode: "offset", blockId: focusId, offset: focusOffset };
    setSelectedIdx(targetIdx + lines.length - 1);
  };

  // 실행 취소 / 다시 실행 (Yjs UndoManager 연동)
  const handleUndo = () => {
    const prevLen = doc.getArray("hwpx_blocks").length;
    if (undoManager.canUndo()) {
      undoManager.undo();
      const currentBlocks = extractBlocksFromYDoc(doc);
      setBlocks(currentBlocks);
      if (currentBlocks.length > prevLen) {
        if (lastDeletedIdxRef.current !== null && lastDeletedIdxRef.current < currentBlocks.length) {
          setSelectedIdx(lastDeletedIdxRef.current);
          lastDeletedIdxRef.current = null;
        } else {
          setSelectedIdx(Math.min(selectedIdx + 1, currentBlocks.length - 1));
        }
      } else {
        setSelectedIdx((cur) => Math.max(0, Math.min(cur, currentBlocks.length - 1)));
      }
      showToast("되돌리기(실행 취소) 완료");
    } else {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        document.execCommand("undo");
      } else {
        showToast("더 이상 되돌릴 내역이 없습니다.");
      }
    }
  };

  const handleRedo = () => {
    if (undoManager.canRedo()) {
      undoManager.redo();
      const currentBlocks = extractBlocksFromYDoc(doc);
      setBlocks(currentBlocks);
      setSelectedIdx((cur) => Math.max(0, Math.min(cur, currentBlocks.length - 1)));
      showToast("다시 실행 완료");
    } else {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        document.execCommand("redo");
      } else {
        showToast("더 이상 다시 실행할 내역이 없습니다.");
      }
    }
  };

  // 모두 선택 (Ctrl+A): 문서 내 모든 문단 선택
  const applySelectAllRange = () => {
    const root = canvasRef.current;
    if (!root) return;
    const ps = Array.from(root.querySelectorAll<HTMLElement>('[data-block-type="paragraph"] p'));
    if (ps.length === 0) return;
    const firstP = ps[0];
    const lastP = ps[ps.length - 1];
    const range = document.createRange();
    range.setStart(firstP, 0);
    range.setEnd(lastP, lastP.childNodes.length);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  useEffect(() => {
    if (!isCrossSelecting || !pendingSelectAllRef.current) return;
    applySelectAllRange();
    const timer = setTimeout(() => {
      pendingSelectAllRef.current = false;
    }, 50);
    return () => clearTimeout(timer);
  }, [isCrossSelecting]);

  const handleSelectAll = () => {
    if (!canvasRef.current) return;
    pendingSelectAllRef.current = true;
    if (isCrossSelecting) {
      applySelectAllRange();
      setTimeout(() => {
        pendingSelectAllRef.current = false;
      }, 50);
    } else {
      setIsCrossSelecting(true);
    }
  };

  // 인쇄 (Ctrl+P)
  const handlePrint = () => {
    window.print();
  };

  // 쪽 번호 계산 (새 번호로 시작 반영)
  const getDisplayPageNumber = (pIdx: number): number => {
    let num = 1;
    for (let i = 0; i <= pIdx; i++) {
      if (pageNumberStartOverrides[i] !== undefined) {
        num = pageNumberStartOverrides[i];
      } else if (i > 0) {
        num += 1;
      }
    }
    return num;
  };

  // 쪽 나누기 (Ctrl+Enter)
  const handleTogglePageBreak = () => {
    const block = blocks[selectedIdx];
    if (block && block.type === "paragraph") {
      const nextBreak = !block.pageBreak;
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(selectedIdx);
      if (yBlock) {
        doc.transact(() => {
          yBlock.set("pageBreak", nextBreak);
        });
      }
    }
  };

  const handleInsertPageBreak = () => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const targetIdx = selectedIdx >= 0 && selectedIdx < blocks.length ? selectedIdx : blocks.length - 1;
    const cur = blocks[targetIdx];
    if (cur && cur.type === "paragraph" && cur.text.trim() === "" && targetIdx > 0 && !cur.pageBreak) {
      const yBlock = yBlocks.get(targetIdx);
      if (yBlock) {
        doc.transact(() => { yBlock.set("pageBreak", true); });
        showToast("쪽 나누기가 적용되었습니다.");
        return;
      }
    }
    const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const yNew = new Y.Map<unknown>();
    yNew.set("id", newId);
    yNew.set("type", "paragraph");
    yNew.set("text", new Y.Text(""));
    yNew.set("pageBreak", true);
    const insertAt = Math.max(0, Math.min(targetIdx + 1, yBlocks.length));
    doc.transact(() => {
      yBlocks.insert(insertAt, [yNew]);
    });
    setSelectedIdx(insertAt);
    pendingCaretRef.current = { mode: "offset", blockId: newId, offset: 0 };
    showToast("쪽 나누기가 삽입되었습니다.");
  };

  const handleInsertColumnBreak = () => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const targetIdx = selectedIdx >= 0 && selectedIdx < blocks.length ? selectedIdx : blocks.length - 1;
    const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const yNew = new Y.Map<unknown>();
    yNew.set("id", newId);
    yNew.set("type", "paragraph");
    yNew.set("text", new Y.Text(""));
    const insertAt = Math.max(0, Math.min(targetIdx + 1, yBlocks.length));
    doc.transact(() => {
      yBlocks.insert(insertAt, [yNew]);
    });
    setColumnBreakBlockIds((prev) => ({ ...prev, [newId]: true }));
    setSelectedIdx(insertAt);
    pendingCaretRef.current = { mode: "offset", blockId: newId, offset: 0 };
    showToast("단 나누기가 삽입되었습니다.");
  };

  const getBlockSectionIdx = (bIdx: number): number => {
    let sec = 0;
    const limit = Math.min(Math.max(0, bIdx), blocks.length - 1);
    for (let i = 0; i <= limit; i++) {
      const b = blocks[i];
      if (b && columnSectionBreakBlockIds[b.id]) sec += 1;
    }
    return sec;
  };
  const activeSectionIdx = getBlockSectionIdx(selectedIdx >= 0 ? selectedIdx : 0);
  const columnLayout: "1" | "2" | "3" | "left" | "right" = columnSectionLayouts[activeSectionIdx] ?? "1";

  const handleInsertColumnSectionBreak = () => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const targetIdx = selectedIdx >= 0 && selectedIdx < blocks.length ? selectedIdx : blocks.length - 1;
    const prevSecIdx = getBlockSectionIdx(targetIdx);
    const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const yNew = new Y.Map<unknown>();
    yNew.set("id", newId);
    yNew.set("type", "paragraph");
    yNew.set("text", new Y.Text(""));
    const insertAt = Math.max(0, Math.min(targetIdx + 1, yBlocks.length));
    doc.transact(() => {
      yBlocks.insert(insertAt, [yNew]);
    });
    setColumnSectionBreakBlockIds((prev) => ({ ...prev, [newId]: true }));
    setColumnSectionLayouts((prev) => ({
      ...prev,
      [prevSecIdx + 1]: prev[prevSecIdx + 1] ?? "1",
    }));
    setSelectedIdx(insertAt);
    pendingCaretRef.current = { mode: "offset", blockId: newId, offset: 0 };
    showToast("다단 설정 나누기가 삽입되었습니다.");
  };

  useEffect(() => {
    if (columnLayout === "1") {
      setActiveColIdx(0);
      return;
    }
    const raf = requestAnimationFrame(() => {
      if (selectedIdx < 0) return;
      const el = document.querySelector(`[data-block-idx="${selectedIdx}"]`) as HTMLElement | null;
      if (!el) return;
      const pane = el.closest("[data-col-pane]") as HTMLElement | null;
      if (pane) {
        setActiveColIdx(pane.getAttribute("data-col-pane") === "right" ? 1 : 0);
        return;
      }
      const container = el.closest("[data-column-layout]") as HTMLElement | null;
      if (container) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const colCnt = columnLayout === "3" ? 3 : 2;
        if (cRect.width > 0) {
          const relX = (eRect.left + 4 - cRect.left) / cRect.width;
          setActiveColIdx(Math.min(colCnt - 1, Math.max(0, Math.floor(relX * colCnt))));
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedIdx, columnLayout, blocks.length]);

  const applyColumnLayout = (layout: "1" | "2" | "3" | "left" | "right") => {
    setColumnSectionLayouts((prev) => ({ ...prev, [activeSectionIdx]: layout }));
    setColumnCount(layout === "1" ? 1 : layout === "3" ? 3 : 2);
    const labelMap: Record<typeof layout, string> = {
      "1": "1단(하나)",
      "2": "2단(둘)",
      "3": "3단(셋)",
      "left": "왼쪽 다단",
      "right": "오른쪽 다단",
    };
    showToast(`단 설정이 '${labelMap[layout]}'(으)로 변경되었습니다.`);
  };

  const openNewPageNumModal = () => {
    const pIdx = Math.max(0, currentPageNum - 1);
    const curVal = pageNumberStartOverrides[pIdx] ?? getDisplayPageNumber(pIdx);
    setDraftNewPageNum(String(curVal));
    setShowNewPageNumModal(true);
  };

  const visibleTrackedChanges = trackedChanges.filter((tc) =>
    tc.kind === "format" ? showTrackFormat : showTrackInsertDelete
  );

  const focusTrackedChangeAt = (nextIdx: number, list = visibleTrackedChanges) => {
    if (list.length === 0) {
      setActiveTrackedChangeIdx(-1);
      return;
    }
    const clamped = ((nextIdx % list.length) + list.length) % list.length;
    setActiveTrackedChangeIdx(clamped);
    const tc = list[clamped];
    const bIdx = blocks.findIndex((b) => b.id === tc.blockId);
    if (bIdx !== -1) {
      setSelectedIdx(bIdx);
      const el = document.querySelector(`[data-block-idx="${bIdx}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleTrackNavigate = (dir: 1 | -1) => {
    if (visibleTrackedChanges.length === 0) {
      showToast("추적된 변경 내용이 없습니다.");
      return;
    }
    const base = activeTrackedChangeIdx >= 0 ? activeTrackedChangeIdx : (dir === 1 ? -1 : 0);
    focusTrackedChangeAt(base + dir);
  };

  const handleTrackAcceptAndNext = () => {
    if (visibleTrackedChanges.length === 0) return;
    const curIdx = activeTrackedChangeIdx >= 0 && activeTrackedChangeIdx < visibleTrackedChanges.length ? activeTrackedChangeIdx : 0;
    const target = visibleTrackedChanges[curIdx];
    const remaining = trackedChanges.filter((c) => c.id !== target.id);
    setTrackedChanges(remaining);
    const nextVisible = remaining.filter((tc) => (tc.kind === "format" ? showTrackFormat : showTrackInsertDelete));
    if (nextVisible.length > 0) {
      focusTrackedChangeAt(curIdx % nextVisible.length, nextVisible);
    } else {
      setActiveTrackedChangeIdx(-1);
    }
    showToast("변경 내용을 적용했습니다.");
  };

  const handleTrackRejectAndNext = () => {
    if (visibleTrackedChanges.length === 0) return;
    const curIdx = activeTrackedChangeIdx >= 0 && activeTrackedChangeIdx < visibleTrackedChanges.length ? activeTrackedChangeIdx : 0;
    const target = visibleTrackedChanges[curIdx];
    const bIdx = blocks.findIndex((b) => b.id === target.blockId);
    if (bIdx !== -1) {
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(bIdx);
      if (yBlock) {
        doc.transact(() => {
          if (target.kind !== "format" && target.prevText !== undefined) {
            const yText = yBlock.get("text");
            if (yText instanceof Y.Text) {
              applyTextDiffToYText(yText, target.prevText);
            }
          } else if (target.kind === "format" && target.prevStyle) {
            for (const [k, v] of Object.entries(target.prevStyle)) {
              if (v === undefined) yBlock.delete(k);
              else yBlock.set(k, v);
            }
          }
        });
      }
    }
    const remaining = trackedChanges.filter((c) => c.id !== target.id);
    setTrackedChanges(remaining);
    const nextVisible = remaining.filter((tc) => (tc.kind === "format" ? showTrackFormat : showTrackInsertDelete));
    if (nextVisible.length > 0) {
      focusTrackedChangeAt(curIdx % nextVisible.length, nextVisible);
    } else {
      setActiveTrackedChangeIdx(-1);
    }
    showToast("변경 내용을 취소(원복)했습니다.");
  };


  useEffect(() => {
    if (!ribbonPopup) return;
    const onDocClick = () => {
      setRibbonPopup(null);
      setHoverTableGrid(null);
    };
    window.addEventListener("click", onDocClick);
    return () => window.removeEventListener("click", onDocClick);
  }, [ribbonPopup]);

  useEffect(() => {
    if (!screenReaderEnabled) return;
    const b = blocks[selectedIdx];
    const desc = b
      ? b.type === "paragraph"
        ? `문단: ${(b.text || "빈 줄").slice(0, 40)}`
        : `개체(${b.type})`
      : "문서";
    setScreenReaderAnnouncement(`${currentPageNum}쪽, ${desc}`);
  }, [screenReaderEnabled, selectedIdx, currentPageNum]);

  const openHidePageModal = () => {
    const pIdx = Math.max(0, currentPageNum - 1);
    const cur = hiddenPageElements[pIdx] || {};
    setDraftHidePageOpts({
      header: Boolean(cur.header),
      footer: Boolean(cur.footer),
      pageNumber: Boolean(cur.pageNumber),
      border: Boolean(cur.border),
      background: Boolean(cur.background),
    });
    setShowHidePageModal(true);
  };

  // 모두 바꾸기 (Replace All)
  const handleReplaceAll = () => {
    if (!searchKeyword.trim()) {
      setReplaceMsg("찾을 단어를 입력해 주세요.");
      return;
    }
    const target = searchKeyword.trim();
    const replacement = replaceKeyword;
    let count = 0;

    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    doc.transact(() => {
      blocks.forEach((block, bIdx) => {
        if (block.type === "paragraph") {
          const text = block.text || "";
          if (text.includes(target)) {
            const occurrences = text.split(target).length - 1;
            count += occurrences;
            const updated = text.split(target).join(replacement);
            const yBlock = yBlocks.get(bIdx);
            if (yBlock) {
              const yText = yBlock.get("text") as Y.Text;
              if (yText) {
                yText.delete(0, yText.length);
                yText.insert(0, updated);
              }
            }
          }
        } else if (block.type === "table") {
          block.rows.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
              if (cell.text.includes(target)) {
                const occurrences = cell.text.split(target).length - 1;
                count += occurrences;
                const updated = cell.text.split(target).join(replacement);
                const yBlock = yBlocks.get(bIdx);
                const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;
                const yCell = yRows?.get(rIdx)?.get(cIdx);
                const yCellText = yCell?.get("text") as Y.Text;
                if (yCellText) {
                  yCellText.delete(0, yCellText.length);
                  yCellText.insert(0, updated);
                }
              }
            });
          });
        }
      });
    });

    setReplaceMsg(`총 ${count}곳을 변경했습니다.`);
  };

  // 문서 통계 계산 (글자수, 단어수, 개체수)
  const docStats = (() => {
    let charCountWithSpace = 0;
    let charCountNoSpace = 0;
    let wordCount = 0;
    let paraCount = 0;
    let tableCount = 0;
    let equationCount = 0;
    let shapeCount = 0;
    let imageCount = 0;

    blocks.forEach((block) => {
      if (block.type === "paragraph") {
        paraCount++;
        const raw = block.text.replace(/<[^>]*>/g, "");
        charCountWithSpace += raw.length;
        charCountNoSpace += raw.replace(/\s+/g, "").length;
        const words = raw.trim().split(/\s+/).filter(Boolean);
        wordCount += words.length;
      } else if (block.type === "table") {
        tableCount++;
        block.rows.forEach((row) => {
          row.forEach((c) => {
            charCountWithSpace += c.text.length;
            charCountNoSpace += c.text.replace(/\s+/g, "").length;
            const words = c.text.trim().split(/\s+/).filter(Boolean);
            wordCount += words.length;
          });
        });
      } else if (block.type === "equation") {
        equationCount++;
      } else if (block.type === "shape") {
        shapeCount++;
        if (block.text) {
          charCountWithSpace += block.text.length;
          charCountNoSpace += block.text.replace(/\s+/g, "").length;
        }
      } else if (block.type === "image") {
        imageCount++;
      }
    });

    return {
      charCountWithSpace,
      charCountNoSpace,
      wordCount,
      paraCount,
      tableCount,
      equationCount,
      shapeCount,
      imageCount,
    };
  })();

  // 취소선
  const applyStrikethrough = () => {
    if (isTableCellEditing) { updateActiveTableCellsStyle({ strikethrough: !activeCellStyle?.strikethrough }); return; }
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("strikeThrough", false);
      triggerActiveBlockInput();
    }
  };

  // 형광펜 (배경색)
  const applyHighlight = (color: string) => {
    if (isTableCellEditing) { updateActiveTableCellsStyle({ shadingColor: color === "transparent" ? undefined : color }); return; }
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("hiliteColor", false, color);
      triggerActiveBlockInput();
    }
    setShowHighlightPalette(false);
  };

  // 특수문자(문자표) 삽입
  const insertSymbol = (sym: string) => {
    const chars = Array.from(sym);
    if (chars.length > 0) {
      setRecentSymbols((prev) => [...chars.reverse(), ...prev.filter((c) => !chars.includes(c))].slice(0, 12));
    }
    restoreSelection();
    if (document.activeElement && document.activeElement.getAttribute("contenteditable") === "true") {
      document.execCommand("insertText", false, sym);
      triggerActiveBlockInput();
    } else {
      const block = blocks[selectedIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(selectedIdx, (block.text || "") + sym);
      }
    }
    setShowSymbolModal(false);
  };

  // 수식 블록 삽입
  const addEquation = (script: string, afterIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const newId = `eq_${Date.now()}`;
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", newId);
    yBlock.set("type", "equation");
    yBlock.set("script", new Y.Text(script || "E = mc^2"));
    const targetIdx = Math.max(0, Math.min(afterIdx + 1, yBlocks.length));
    pendingCaretRef.current = null;
    pendingObjectFocusRef.current = newId;
    doc.transact(() => {
      yBlocks.insert(targetIdx, [yBlock]);
    });
    setSelectedIdx(targetIdx);
    setShowEquationModal(false);
    setNewEquationScript("");
  };

  // 스타일 프리셋 적용 (바탕글, 개요, 제목 등)
  const applyStylePreset = (preset: string) => {
    if (preset === "title") {
      updateParagraphStyle(selectedIdx, { sizePt: 16, bold: true, align: "center" });
    } else if (preset === "heading1") {
      updateParagraphStyle(selectedIdx, { sizePt: 13, bold: true, align: "left" });
    } else if (preset === "heading2") {
      updateParagraphStyle(selectedIdx, { sizePt: 11, bold: true, align: "left" });
    } else if (preset === "body") {
      updateParagraphStyle(selectedIdx, { sizePt: 10, bold: false, align: "justify" });
    }
  };

  // 들여쓰기 / 내어쓰기
  const handleIndent = (increase: boolean) => {
    const block = blocks[selectedIdx];
    if (block && block.type === "paragraph") {
      if (increase) {
        updateParagraph(selectedIdx, "  " + block.text);
      } else {
        if (block.text.startsWith("  ")) {
          updateParagraph(selectedIdx, block.text.slice(2));
        } else if (block.text.startsWith(" ")) {
          updateParagraph(selectedIdx, block.text.slice(1));
        }
      }
    }
  };

  const applyBulletPrefix = (prefix: string | null) => {
    const block = blocks[selectedIdx];
    if (!block || block.type !== "paragraph") return;
    const stripped = block.text.replace(/^(?:[●•■▪◆♦▶○□◇▷◎☑✓★❖☞▸]\s+)/, "");
    updateParagraph(selectedIdx, prefix ? prefix + stripped : stripped);
  };

  const applyNumberPrefix = (prefix: string | null) => {
    const block = blocks[selectedIdx];
    if (!block || block.type !== "paragraph") return;
    const stripped = block.text.replace(/^(?:\(\d+\)\s+|\([가-힣a-zA-Zㄱ-ㅎ]\)\s+|\d+[.)]\s+|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s+|[가-힣A-Za-zIVXivx]+[.)]\s+)/, "");
    updateParagraph(selectedIdx, prefix ? prefix + stripped : stripped);
  };

  const handleLevelIndent = (delta: 1 | -1) => {
    const block = blocks[selectedIdx];
    if (!block || block.type !== "paragraph") return;
    const nextMargin = Math.max(0, (block.marginLeftPt || 0) + delta * 10);
    updateParagraphStyle(selectedIdx, { marginLeftPt: nextMargin });
  };

  const toggleBulletList = () => {
    if (selectedIdx === null) return;
    const block = blocks[selectedIdx];
    if (block && block.type === "paragraph") {
      if (block.text.startsWith("• ")) {
        updateParagraph(selectedIdx, block.text.slice(2));
      } else {
        updateParagraph(selectedIdx, "• " + block.text);
      }
    }
  };

  const toggleNumberList = () => {
    if (selectedIdx === null) return;
    const block = blocks[selectedIdx];
    if (block && block.type === "paragraph") {
      if (/^\d+\.\s/.test(block.text)) {
        updateParagraph(selectedIdx, block.text.replace(/^\d+\.\s/, ""));
      } else {
        updateParagraph(selectedIdx, "1. " + block.text);
      }
    }
  };

  const insertHeaderFooter = (type: "header" | "footer") => {
    if (type === "header") {
      const el = document.querySelector("main");
      if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const el = document.querySelector("main");
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  };

  // 단어 찾기
  const handleSearchNext = () => {
    const kw = searchKeyword.trim();
    if (!kw) return;
    let foundIdx = -1;
    if (searchDirection === "up") {
      for (let i = selectedIdx - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.type === "paragraph" && b.text.includes(kw)) { foundIdx = i; break; }
      }
      if (foundIdx === -1) {
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          if (b.type === "paragraph" && b.text.includes(kw)) { foundIdx = i; break; }
        }
      }
    } else {
      foundIdx = blocks.findIndex((b, i) => i > selectedIdx && b.type === "paragraph" && b.text.includes(kw));
      if (foundIdx === -1) {
        foundIdx = blocks.findIndex((b) => b.type === "paragraph" && b.text.includes(kw));
      }
    }
    if (foundIdx !== -1) {
      setSelectedIdx(foundIdx);
      const el = document.querySelector(`[data-block-idx="${foundIdx}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      showToast(`'${kw}'을(를) 찾을 수 없습니다.`);
    }
  };

  const handleReplaceOne = () => {
    const kw = searchKeyword.trim();
    if (!kw) {
      setReplaceMsg("찾을 내용을 입력해 주세요.");
      return;
    }
    const cur = blocks[selectedIdx];
    if (cur && cur.type === "paragraph" && cur.text.includes(kw)) {
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = yBlocks.get(selectedIdx);
      const yText = yBlock?.get("text");
      if (yText instanceof Y.Text) {
        doc.transact(() => {
          const idx = cur.text.indexOf(kw);
          if (idx !== -1) {
            yText.delete(idx, kw.length);
            yText.insert(idx, replaceKeyword);
          }
        });
        setReplaceMsg("1건을 바꾸었습니다.");
        handleSearchNext();
        return;
      }
    }
    handleSearchNext();
  };

  // ── 텍스트 드래그(선택 영역) 기억 및 부분 서식 적용 ──
  const lastSelectionRangeRef = useRef<Range | null>(null);
  const [hasTextSelection, setHasTextSelection] = useState(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      const activeEl = document.activeElement;
      if (
        (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) &&
        activeEl.closest("[data-hwpx-table]") &&
        (activeEl.selectionEnd ?? 0) > (activeEl.selectionStart ?? 0)
      ) {
        setHasTextSelection(true);
        return;
      }
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const anchor = sel.anchorNode;
        const parent = anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor?.parentElement;
        if (parent?.closest('[contenteditable="true"]')) {
          lastSelectionRangeRef.current = sel.getRangeAt(0).cloneRange();
          setHasTextSelection(true);
          return;
        }
      }
      setHasTextSelection(false);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("select", handleSelectionChange, true);
    document.addEventListener("mouseup", handleSelectionChange, true);
    document.addEventListener("keyup", handleSelectionChange, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("select", handleSelectionChange, true);
      document.removeEventListener("mouseup", handleSelectionChange, true);
      document.removeEventListener("keyup", handleSelectionChange, true);
    };
  }, []);

  const canDeleteSelection =
    hasTextSelection ||
    isCrossSelecting ||
    tableCellSelection !== null ||
    (selectedIdx >= 0 && Boolean(blocks[selectedIdx]) && blocks[selectedIdx].type !== "paragraph");

  const restoreSelection = () => {
    if (lastSelectionRangeRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(lastSelectionRangeRef.current);
      }
    }
  };

  const hasActiveTextSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return !!(lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed);
    }
    return sel.toString().trim().length > 0;
  };

  const triggerActiveBlockInput = () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.getAttribute("contenteditable") === "true") {
      activeEl.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      const parent = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as HTMLElement) : sel.anchorNode.parentElement;
      const editable = parent?.closest('[contenteditable="true"]');
      if (editable) {
        editable.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
    }
    if (lastSelectionRangeRef.current) {
      const common = lastSelectionRangeRef.current.commonAncestorContainer;
      const parent = common.nodeType === Node.ELEMENT_NODE ? (common as HTMLElement) : common.parentElement;
      const editable = parent?.closest('[contenteditable="true"]');
      if (editable) {
        editable.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  };

  // 부분 색상 적용 (선택 영역이 있으면 부분 적용, 없으면 문단 전체 적용)
  const applyTextColor = (colorValue: string) => {
    if (isTableCellEditing) { updateActiveTableCellsStyle({ color: colorValue }); return; }
    restoreSelection();
    const crossSel = getCrossParagraphSelection();
    if (crossSel) {
      updateParagraphStyle(selectedIdx, { color: colorValue });
    } else if (hasActiveTextSelection()) {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("foreColor", false, colorValue);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { color: colorValue });
    }
  };

  // 부분 굵게 적용
  const applyBold = () => {
    if (isTableCellEditing) { updateActiveTableCellsStyle({ bold: !activeCellStyle?.bold }); return; }
    restoreSelection();
    const crossSel = getCrossParagraphSelection();
    if (crossSel) {
      updateParagraphStyle(selectedIdx, { bold: !currentPara?.bold });
    } else if (hasActiveTextSelection()) {
      document.execCommand("bold", false);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { bold: !currentPara?.bold });
    }
  };

  // 부분 기울임 적용
  const applyItalic = () => {
    if (isTableCellEditing) { updateActiveTableCellsStyle({ italic: !activeCellStyle?.italic }); return; }
    restoreSelection();
    const crossSel = getCrossParagraphSelection();
    if (crossSel) {
      updateParagraphStyle(selectedIdx, { italic: !currentPara?.italic });
    } else if (hasActiveTextSelection()) {
      document.execCommand("italic", false);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { italic: !currentPara?.italic });
    }
  };

  // 부분 밑줄 적용
  const applyUnderline = () => {
    if (isTableCellEditing) { updateActiveTableCellsStyle({ underline: !activeCellStyle?.underline }); return; }
    restoreSelection();
    const crossSel = getCrossParagraphSelection();
    if (crossSel) {
      updateParagraphStyle(selectedIdx, { underline: !currentPara?.underline });
    } else if (hasActiveTextSelection()) {
      document.execCommand("underline", false);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { underline: !currentPara?.underline });
    }
  };

  // 글꼴 적용 (선택 영역이 있으면 해당 글자만, 없으면 문단 전체)
  const applyFontFamily = (fontVal: string) => {
    restoreSelection();
    const crossSel = getCrossParagraphSelection();
    if (hasActiveTextSelection() && !crossSel) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontFamily = fontVal;
        span.appendChild(range.extractContents());
        range.insertNode(span);
        const nr = document.createRange();
        nr.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(nr);
        lastSelectionRangeRef.current = nr.cloneRange();
        triggerActiveBlockInput();
        return;
      }
    }
    updateParagraphStyle(selectedIdx, { fontFamily: fontVal });
  };

  // 글자 크기 적용 (선택 영역이 있으면 해당 글자만, 없으면 문단 전체)
  const applyFontSize = (sizePt: number) => {
    restoreSelection();
    const crossSel = getCrossParagraphSelection();
    if (hasActiveTextSelection() && !crossSel) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontSize = `${sizePt}pt`;
        span.appendChild(range.extractContents());
        range.insertNode(span);
        const nr = document.createRange();
        nr.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(nr);
        lastSelectionRangeRef.current = nr.cloneRange();
        triggerActiveBlockInput();
        return;
      }
    }
    updateParagraphStyle(selectedIdx, { sizePt });
  };

  // 새 문단 추가
  const addParagraph = (afterIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const newId = `p_${Date.now()}`;
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", newId);
    yBlock.set("type", "paragraph");
    yBlock.set("text", new Y.Text(""));
    yBlock.set("align", "left");
    yBlock.set("sizePt", 10);
    doc.transact(() => {
      yBlocks.insert(afterIdx + 1, [yBlock]);
    });
    pendingCaretRef.current = { mode: "offset", blockId: newId, offset: 0 };
    setSelectedIdx(afterIdx + 1);
  };

  // 표 추가
  const addTable = (
    rows: number,
    cols: number,
    afterIdx: number,
    opts?: { widthPercent?: number; heightPt?: number; treatAsChar?: boolean }
  ) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const newId = `tbl_${Date.now()}`;
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", newId);
    yBlock.set("type", "table");

    const yRows = new Y.Array<Y.Array<Y.Map<unknown>>>();
    for (let r = 0; r < rows; r++) {
      const yRow = new Y.Array<Y.Map<unknown>>();
      for (let c = 0; c < cols; c++) {
        const yCell = new Y.Map<unknown>();
        yCell.set("text", new Y.Text(r === 0 ? `항목 ${c + 1}` : ""));
        yRow.push([yCell]);
      }
      yRows.push([yRow]);
    }
    yBlock.set("rows", yRows);
    if (opts?.widthPercent !== undefined) yBlock.set("widthPercent", opts.widthPercent);
    if (opts?.heightPt !== undefined) yBlock.set("heightPt", opts.heightPt);
    if (opts?.treatAsChar !== undefined) yBlock.set("treatAsChar", opts.treatAsChar);

    const targetIdx = Math.max(0, Math.min(afterIdx + 1, yBlocks.length));
    pendingCaretRef.current = null;
    pendingObjectFocusRef.current = newId;
    doc.transact(() => {
      yBlocks.insert(targetIdx, [yBlock]);
    });
    setSelectedIdx(targetIdx);
    setShowTableModal(false);
  };

  // 표 행 추가
  const addTableRow = (blockIndex: number, afterRowIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    if (!yRows || yRows.length === 0) return;

    const colCount = yRows.get(0).length;
    const newYRow = new Y.Array<Y.Map<unknown>>();
    for (let c = 0; c < colCount; c++) {
      const yCell = new Y.Map<unknown>();
      yCell.set("text", new Y.Text(""));
      newYRow.push([yCell]);
    }
    doc.transact(() => {
      yRows.insert(afterRowIdx + 1, [newYRow]);
    });
  };

  // 표 행 삭제
  const deleteTableRow = (blockIndex: number, rowIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    if (!yRows) return;
    if (yRows.length <= 1) {
      deleteBlock(blockIndex);
      return;
    }
    doc.transact(() => {
      yRows.delete(rowIdx, 1);
    });
  };

  // 표 열 추가
  const addTableCol = (blockIndex: number, afterColIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    if (!yRows) return;
    doc.transact(() => {
      for (let r = 0; r < yRows.length; r++) {
        const yRow = yRows.get(r);
        const yCell = new Y.Map<unknown>();
        yCell.set("text", new Y.Text(""));
        yRow.insert(afterColIdx + 1, [yCell]);
      }
    });
  };

  // 표 열 삭제
  const deleteTableCol = (blockIndex: number, colIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    if (!yRows || yRows.length === 0) return;
    if (yRows.get(0).length <= 1) {
      deleteBlock(blockIndex);
      return;
    }
    doc.transact(() => {
      for (let r = 0; r < yRows.length; r++) {
        const yRow = yRows.get(r);
        if (yRow.length > colIdx) {
          yRow.delete(colIdx, 1);
        }
      }
    });
  };

  // 그림 넣기 모달 열기
  const openImageInsertModal = () => {
    setImgInsertSourceType("device");
    setImgInsertFileName("");
    setImgInsertDataUrl("");
    setImgInsertUrl("");
    setImgInsertTreatAsChar(true);
    setImgInsertSizeByMouse(false);
    setShowImageInsertModal(true);
  };

  // 이미지 블록 삽입 공통 헬퍼
  const insertImageBlock = (
    srcUrl: string,
    captionText?: string,
    opts?: { widthPercent?: number; heightPt?: number; treatAsChar?: boolean; offsetX?: number; offsetY?: number; afterIdx?: number }
  ) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", `img_${Date.now()}`);
    yBlock.set("type", "image");
    yBlock.set("src", srcUrl);
    yBlock.set("widthPercent", opts?.widthPercent ?? 75);
    if (opts?.heightPt !== undefined) yBlock.set("heightPt", opts.heightPt);
    yBlock.set("align", "center");
    yBlock.set("treatAsChar", opts?.treatAsChar ?? true);
    if (opts?.offsetX) yBlock.set("offsetX", opts.offsetX);
    if (opts?.offsetY) yBlock.set("offsetY", opts.offsetY);
    if (captionText) yBlock.set("caption", captionText);

    const baseIdx = opts?.afterIdx ?? selectedIdx;
    const targetIdx = baseIdx < 0 ? yBlocks.length : Math.min(baseIdx + 1, yBlocks.length);
    doc.transact(() => {
      yBlocks.insert(targetIdx, [yBlock]);
    });
    setSelectedIdx(targetIdx);
  };

  // 이미지 파일 선택 (그림 넣기 모달 내 장치 선택)
  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;
    setImgInsertFileName(imgFile.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImgInsertDataUrl(reader.result as string);
    };
    reader.readAsDataURL(imgFile);
    e.target.value = "";
  };

  // 그림 넣기 모달 확인
  const handleConfirmImageInsert = () => {
    const srcUrl = imgInsertSourceType === "device" ? imgInsertDataUrl : imgInsertUrl.trim();
    if (!srcUrl) return;
    setShowImageInsertModal(false);
    if (!imgInsertTreatAsChar && imgInsertSizeByMouse) {
      setPendingDrawShape(null);
      setPendingDrawImage({ src: srcUrl, treatAsChar: false });
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        const contentWmm = Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0));
        const widthPt = (contentWmm * 0.75 * 2.83465);
        const calcHeightPt = Math.round(widthPt * (probe.naturalHeight / probe.naturalWidth));
        insertImageBlock(srcUrl, undefined, { treatAsChar: imgInsertTreatAsChar, heightPt: calcHeightPt });
      } else {
        insertImageBlock(srcUrl, undefined, { treatAsChar: imgInsertTreatAsChar });
      }
    };
    probe.onerror = () => {
      insertImageBlock(srcUrl, undefined, { treatAsChar: imgInsertTreatAsChar });
    };
    probe.src = srcUrl;
  };

  // 이미지 속성 변경
  const updateImageBlock = (index: number, patch: Partial<HwpxImageBlock>) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(index);
    if (!yBlock) return;
    doc.transact(() => {
      if (patch.widthPercent !== undefined) yBlock.set("widthPercent", patch.widthPercent);
      if (patch.align !== undefined) yBlock.set("align", patch.align);
      if (patch.caption !== undefined) yBlock.set("caption", patch.caption);
      if (patch.offsetX !== undefined) yBlock.set("offsetX", patch.offsetX);
      if (patch.offsetY !== undefined) yBlock.set("offsetY", patch.offsetY);
    });
  };

  // 도형 속성 수정
  const updateShapeBlock = (index: number, patch: Partial<HwpxShapeBlock>) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(index);
    if (!yBlock) return;
    doc.transact(() => {
      if (patch.shapeType !== undefined) yBlock.set("shapeType", patch.shapeType);
      if (patch.widthPercent !== undefined) yBlock.set("widthPercent", patch.widthPercent);
      if (patch.heightPt !== undefined) yBlock.set("heightPt", patch.heightPt);
      if (patch.fillColor !== undefined) yBlock.set("fillColor", patch.fillColor);
      if (patch.strokeColor !== undefined) yBlock.set("strokeColor", patch.strokeColor);
      if (patch.strokeWidth !== undefined) yBlock.set("strokeWidth", patch.strokeWidth);
      if (patch.align !== undefined) yBlock.set("align", patch.align);
      if (patch.offsetX !== undefined) yBlock.set("offsetX", patch.offsetX);
      if (patch.offsetY !== undefined) yBlock.set("offsetY", patch.offsetY);
      if (patch.text !== undefined) {
        let yText = yBlock.get("text") as Y.Text | undefined;
        if (!yText) {
          yText = new Y.Text();
          yBlock.set("text", yText);
        }
        applyTextDiffToYText(yText, patch.text);
      }
    });
  };

  // 블록 삭제
  const deleteBlock = (index: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    if (yBlocks.length <= 1) return;
    lastDeletedIdxRef.current = index;
    doc.transact(() => {
      mergeSplitParagraphAt(yBlocks, index);
      yBlocks.delete(index, 1);
    });
    setSelectedIdx(Math.max(0, index - 1));
  };

  // 표 셀 텍스트 변경
  const updateTableCell = (blockIndex: number, rowIndex: number, cellIndex: number, newText: string) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
    if (!yRows) return;
    const yRow = yRows.get(rowIndex);
    if (!yRow) return;
    const yCell = yRow.get(cellIndex);
    if (!yCell) return;
    const yText = yCell.get("text") as Y.Text | undefined;
    if (yText) {
      doc.transact(() => {
        applyTextDiffToYText(yText, newText);
      });
    }
  };

  // 수식 스크립트 변경
  const updateEquation = (blockIndex: number, newScript: string) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(blockIndex);
    if (!yBlock) return;
    const yScript = yBlock.get("script") as Y.Text | undefined;
    if (yScript) {
      doc.transact(() => {
        applyTextDiffToYText(yScript, newScript);
      });
    }
  };

  // 현재 선택된 블록의 스타일 값 (툴바 상태 반영용)
  const currentBlock = blocks[selectedIdx];
  const isParagraph = currentBlock?.type === "paragraph";
  const isTableCellEditing = Boolean(currentBlock?.type === "table" && activeTableCell?.blockIdx === selectedIdx);
  const canFormatText = isParagraph || isTableCellEditing;
  const activeCellStyleKey = isTableCellEditing && currentBlock && activeTableCell
    ? `${currentBlock.id}:${activeTableCell.row}:${activeTableCell.col}`
    : "";
  const activeCellStyle = activeCellStyleKey ? tableCellStyles[activeCellStyleKey] : undefined;
  const isObjectSelected = Boolean(
    currentBlock &&
      currentBlock.type !== "paragraph" &&
      !isTableCellEditing
  );
  const currentPara = isParagraph ? (currentBlock as HwpxParagraphBlock) : null;

  useEffect(() => {
    setLineSpacingDraft(String(currentPara?.lineSpacingPct ?? 160));
  }, [selectedIdx, currentPara?.lineSpacingPct]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[94vw] xl:max-w-[1480px] h-[94vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
        style={{
          background: "var(--card-bg, #1e1e2e)",
          borderColor: "var(--card-border, #313244)",
          color: "var(--primary-text, #cdd6f4)",
        }}
      >
        {/* ── 한컴오피스 / 한컴독스 표준 스타일 상단 헤더 & 메뉴 탭 ── */}
        <header className="bg-white border-b border-neutral-300 select-none shrink-0 text-neutral-800">
          {/* 1열: 한컴독스 공식 스타일 상단 헤더 (Images 1, 2, 4) */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-200 bg-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <HancomDocsAppLogo className="w-7 h-7 shrink-0 shadow-xs" />
              <div className="min-w-0 flex items-center gap-2">
                <span
                  onClick={handleRename}
                  className="text-sm font-semibold text-neutral-800 truncate cursor-pointer hover:bg-neutral-100 px-1.5 py-0.5 rounded transition"
                  title="클릭하여 문서 이름 바꾸기"
                >
                  {docTitle}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${dirty ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"}`}>
                  {status === "saving" ? "저장 중…" : dirty ? "수정됨" : "저장됨"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <EditorAvatars editors={roomEditors} />

              {/* 댓글 버튼 */}
              <button
                type="button"
                onClick={() => showToast("동시 편집자 댓글 및 의견 기능이 활성화되어 있습니다.")}
                className="p-1.5 rounded hover:bg-neutral-100 text-neutral-600 transition cursor-pointer"
                title="댓글"
              >
                <CommentIcon className="w-4 h-4" />
              </button>

              {/* 단축키 (K) */}
              <button
                type="button"
                onClick={() => setShowShortcutsModal(true)}
                className="w-6 h-6 rounded hover:bg-neutral-100 text-neutral-600 transition cursor-pointer text-xs font-semibold flex items-center justify-center font-mono border border-neutral-200"
                title="단축키 안내 (K)"
              >
                K
              </button>

              {/* 도움말 (?) */}
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="w-6 h-6 rounded hover:bg-neutral-100 text-neutral-600 transition cursor-pointer text-xs font-bold flex items-center justify-center"
                title="도움말 (?)"
              >
                ?
              </button>

              {/* 공유 버튼 */}
              <button
                type="button"
                onClick={handleShare}
                className="px-3 py-1 rounded text-xs font-semibold border border-neutral-300 hover:bg-neutral-50 text-neutral-700 transition cursor-pointer flex items-center gap-1"
                title="문서 링크 공유"
              >
                <span>공유</span>
              </button>

              {/* 데스크톱에서 편집 버튼 */}
              <button
                type="button"
                onClick={() => void handleDirectDownload()}
                className="px-3 py-1 rounded text-xs font-semibold border border-neutral-300 hover:bg-neutral-50 text-neutral-700 transition cursor-pointer flex items-center gap-1"
                title="데스크톱에서 편집하기 위해 HWPX 원본 다운로드"
              >
                <span>데스크톱에서 편집</span>
              </button>

              {/* 리본 접기/펼치기 버튼 */}
              <button
                type="button"
                onClick={() => setRibbonCollapsed(!ribbonCollapsed)}
                className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500 transition cursor-pointer"
                title={ribbonCollapsed ? "메뉴 툴바 펼치기" : "메뉴 툴바 접기"}
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${ribbonCollapsed ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>

              {/* 닫기 버튼 */}
              <button
                type="button"
                onClick={() => requestClose(onClose)}
                className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600 transition cursor-pointer"
                title="편집기 닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 2열: 메뉴바 & 풀다운 드롭다운 메뉴 (Images 1, 2, 3) */}
          <div className="relative flex items-center px-2 bg-white text-xs border-b border-neutral-200 whitespace-nowrap">
            {(
              [
                { id: "file", label: "파일" },
                { id: "edit", label: "편집" },
                { id: "view", label: "보기" },
                { id: "insert", label: "입력" },
                { id: "format", label: "서식" },
                { id: "page", label: "쪽" },
                { id: "table", label: "표" },
                { id: "review", label: "검토" },
                { id: "tools", label: "도구" },
              ] as const
            ).map((menu) => {
              const isDropdownOpen = openDropdown === menu.id;
              const isTabActive = activeTab === menu.id;
              return (
                <div key={menu.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab(menu.id);
                      setOpenDropdown((cur) => (cur === menu.id ? null : menu.id));
                    }}
                    onMouseEnter={() => {
                      if (openDropdown !== null) {
                        setOpenDropdown(menu.id);
                        setActiveTab(menu.id);
                      }
                    }}
                    className={`px-3.5 py-1.5 font-medium transition cursor-pointer border-b-2 ${isDropdownOpen || (openDropdown === null && isTabActive)
                      ? "border-[#0099e5] text-neutral-900 font-semibold bg-[#eceef0]"
                      : "border-transparent text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50"
                      }`}
                  >
                    {menu.label}
                  </button>

                  {/* [파일] 드롭다운 메뉴 (Hancom Docs 100% 일치) */}
                  {isDropdownOpen && menu.id === "file" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0 z-60 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[260px] text-[12px] text-neutral-800 animate-in fade-in duration-100"
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); void runSave(); }}
                        disabled={status === "saving" || !dirty}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left disabled:opacity-40 cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <SaveIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                          <span>저장하기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400">Ctrl+S</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleSaveAs(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <SaveAsIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                          <span>다른 이름으로 저장하기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400">Alt+V</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleShare(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <span className="w-4 h-4 shrink-0" />
                          <span>공유</span>
                        </span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleRename(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <span className="w-4 h-4 shrink-0" />
                          <span>이름 바꾸기</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); void handleDirectDownload(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <DownloadTrayIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                          <span>다운로드</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); void handleDownloadPdf(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <PdfDownloadIcon className="w-4 h-4 shrink-0" />
                          <span>PDF로 다운로드</span>
                        </span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); openPageSetupModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <PageSetupIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                          <span>편집 용지...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400">F7</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handlePrint(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <PrintIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                          <span>인쇄</span>
                        </span>
                        <span className="text-[11px] text-neutral-400">Ctrl+P</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowDocStatsModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <DocInfoIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                          <span>문서 정보...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400">Ctrl+Q+I</span>
                      </button>
                    </div>
                  )}

                  {/* [편집] 드롭다운 메뉴 (Hancom Docs 100% 일치) */}
                  {isDropdownOpen && menu.id === "edit" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0 z-60 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[260px] text-[12px] text-neutral-800 animate-in fade-in duration-100"
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleUndo(); }}
                        disabled={!canUndo}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left disabled:opacity-40 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <UndoIcon className="w-4 h-4 text-neutral-600" />
                          <span>되돌리기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Z</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleRedo(); }}
                        disabled={!canRedo}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left disabled:opacity-40 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <RedoIcon className="w-4 h-4 text-neutral-600" />
                          <span>다시 실행</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Shift+Z</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        disabled={!(hasTextSelection || isCrossSelecting || isObjectSelected)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setOpenDropdown(null); handleCut(); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left ${!(hasTextSelection || isCrossSelecting || isObjectSelected) ? "text-neutral-400 cursor-not-allowed" : "hover:bg-neutral-100 cursor-pointer"}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <CutIcon className="w-4 h-4 text-neutral-600" />
                          <span>오려 두기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+X</span>
                      </button>

                      <button
                        type="button"
                        disabled={!(hasTextSelection || isCrossSelecting || isObjectSelected)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setOpenDropdown(null); handleCopy(); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left ${!(hasTextSelection || isCrossSelecting || isObjectSelected) ? "text-neutral-400 cursor-not-allowed" : "hover:bg-neutral-100 cursor-pointer"}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <CopyIcon className="w-4 h-4 text-neutral-600" />
                          <span>복사하기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+C</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); void handlePaste(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PasteIcon className="w-4 h-4 text-amber-600" />
                          <span>붙이기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+V</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowFormatCopyModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <FormatPainterIcon className="w-4 h-4 text-blue-600" />
                          <span>모양 복사...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Alt+C</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        disabled={!canDeleteSelection}
                        onClick={() => { setOpenDropdown(null); deleteSelected(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <EraserIcon className="w-4 h-4 text-neutral-600" />
                          <span>지우기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+E</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setSelectedControlMarks([]); setShowClearMarksModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ClearControlMarksIcon className="w-4 h-4 text-neutral-600" />
                          <span>조판 부호 지우기</span>
                        </span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); selectAll(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SelectAllIcon className="w-4 h-4 text-neutral-600" />
                          <span>모두 선택</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+A</span>
                      </button>

                      {/* 찾기 ▶ 서브메뉴 (Images 2, 3) */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("search")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <div className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer">
                          <span className="flex items-center gap-2.5">
                            <SearchIcon className="w-4 h-4 text-neutral-600" />
                            <span>찾기</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </div>

                        {hoverSubmenu === "search" && (
                          <div
                            className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100 flex flex-col"
                            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                          >
                            <button
                              type="button"
                              onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); setShowSearchModal(true); }}
                              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2.5">
                                <SearchIcon className="w-4 h-4 text-neutral-600" />
                                <span>찾기...</span>
                              </span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+F</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); setShowReplaceModal(true); }}
                              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2.5">
                                <ReplaceIcon className="w-4 h-4 text-neutral-600" />
                                <span>찾아 바꾸기...</span>
                              </span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+H</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); setShowGotoModal(true); }}
                              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2.5">
                                <GotoIcon className="w-4 h-4 text-neutral-600" />
                                <span>찾아가기</span>
                              </span>
                              <span className="text-[11px] text-neutral-400 font-mono">Alt+G</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* [보기] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "view" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[230px] text-[12px] text-neutral-800 animate-in fade-in duration-100"
                    >
                      {/* 1. 확대/축소 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("view-zoom")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "view-zoom" ? null : "view-zoom")}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <SearchIcon className="w-3.5 h-3.5 text-neutral-600" />
                            <span>확대/축소</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </button>
                        {hoverSubmenu === "view-zoom" && (
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[150px] text-[12px] text-neutral-800 flex flex-col">
                            {[50, 75, 100, 125, 150, 200, 300].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => {
                                  setZoomFitMode("custom");
                                  setZoomPercent(pct);
                                  setOpenDropdown(null);
                                  setHoverSubmenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                              >
                                <span className="w-4 text-[#d97706] font-bold">
                                  {zoomFitMode === "custom" && zoomPercent === pct ? "✓" : ""}
                                </span>
                                <span>{pct}%</span>
                              </button>
                            ))}
                            <div className="my-1 border-t border-neutral-200" />
                            <button
                              type="button"
                              onClick={() => {
                                applyZoomFit("page");
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">
                                {zoomFitMode === "page" ? "✓" : ""}
                              </span>
                              <span>쪽 맞춤</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                applyZoomFit("width");
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">
                                {zoomFitMode === "width" ? "✓" : ""}
                              </span>
                              <span>폭 맞춤</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 2. 쪽 모양 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("view-page-shape")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "view-page-shape" ? null : "view-page-shape")}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-3.5 inline-block" />
                            <span>쪽 모양</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </button>
                        {hoverSubmenu === "view-page-shape" && (
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] text-[12px] text-neutral-800 flex flex-col">
                            {([
                              { count: 1 as const, label: "한 쪽" },
                              { count: 2 as const, label: "두 쪽" },
                              { count: 3 as const, label: "세 쪽" },
                            ]).map((opt) => (
                              <button
                                key={opt.count}
                                type="button"
                                onClick={() => {
                                  applyPageViewColumns(opt.count);
                                  setOpenDropdown(null);
                                  setHoverSubmenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                              >
                                <span className="w-4 text-[#d97706] font-bold">
                                  {pageViewColumns === opt.count ? "✓" : ""}
                                </span>
                                <span>{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. 쪽 윤곽 */}
                      <button
                        type="button"
                        onClick={() => { setShowPageOutline(!showPageOutline); setOpenDropdown(null); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-3.5 text-[#d97706] font-bold text-center">{showPageOutline ? "✓" : ""}</span>
                          <span>쪽 윤곽</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+G+L</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 4. 표시/숨기기 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("view-show-hide")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "view-show-hide" ? null : "view-show-hide")}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-3.5 inline-block" />
                            <span>표시/숨기기</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </button>
                        {hoverSubmenu === "view-show-hide" && (
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[200px] text-[12px] text-neutral-800 flex flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                setShowControlMarks(!showControlMarks);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-4 text-[#d97706] font-bold">{showControlMarks ? "✓" : ""}</span>
                                <span>조판 부호</span>
                              </span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+G+C</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowParaMarks(!showParaMarks);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-4 text-[#d97706] font-bold">{showParaMarks ? "✓" : ""}</span>
                                <span>문단 부호</span>
                              </span>
                              <span className="text-[11px] text-neutral-400 font-mono">Alt+G+T</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowTransparentLines(!showTransparentLines);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-4 text-[#d97706] font-bold">{showTransparentLines ? "✓" : ""}</span>
                                <span>투명 선</span>
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 5. 격자 보기 */}
                      <button
                        type="button"
                        onClick={() => { setShowGrid(!showGrid); setOpenDropdown(null); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <GridIcon className={`w-3.5 h-3.5 ${showGrid ? "text-[#0066cc]" : "text-neutral-600"}`} />
                          <span>격자 보기</span>
                        </span>
                        {showGrid && <span className="text-[#d97706] font-bold text-[11px]">✓</span>}
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 6. 도구 상자 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("view-toolbars")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "view-toolbars" ? null : "view-toolbars")}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-3.5 inline-block" />
                            <span>도구 상자</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </button>
                        {hoverSubmenu === "view-toolbars" && (
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] text-[12px] text-neutral-800 flex flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                setRibbonCollapsed(!ribbonCollapsed);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">{!ribbonCollapsed ? "✓" : ""}</span>
                              <span>기본</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowFormatToolbar(!showFormatToolbar);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">{showFormatToolbar ? "✓" : ""}</span>
                              <span>서식</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 7. 문서 창 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("view-doc-window")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "view-doc-window" ? null : "view-doc-window")}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-3.5 inline-block" />
                            <span>문서 창</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </button>
                        {hoverSubmenu === "view-doc-window" && (
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] text-[12px] text-neutral-800 flex flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                setShowRuler(!showRuler);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">{showRuler ? "✓" : ""}</span>
                              <span>눈금자</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 8. 메모 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("view-memo")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "view-memo" ? null : "view-memo")}
                          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <CommentIcon className="w-3.5 h-3.5 text-amber-500" />
                            <span>메모</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▶</span>
                        </button>
                        {hoverSubmenu === "view-memo" && (
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[165px] text-[12px] text-neutral-800 flex flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAllMemos(!showAllMemos);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">{showAllMemos ? "✓" : ""}</span>
                              <span>모든 메모 표시</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowMemoGuides(!showMemoGuides);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#d97706] font-bold">{showMemoGuides ? "✓" : ""}</span>
                              <span>메모 안내선 표시</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* [입력] 드롭다운 메뉴 (한컴독스 1:1 구조) */}
                  {isDropdownOpen && menu.id === "insert" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[225px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      {/* 도형 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("insert-shape")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "insert-shape" ? null : "insert-shape"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer ${hoverSubmenu === "insert-shape" ? "bg-neutral-100" : ""}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <ShapesIcon className="w-4 h-4 text-blue-600" />
                            <span>도형</span>
                          </span>
                          <span className="text-[10px] text-neutral-500">▸</span>
                        </button>
                        {hoverSubmenu === "insert-shape" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] p-2 min-w-[180px] flex flex-col">
                            {renderDrawingShapePalette((kind) => {
                              setOpenDropdown(null);
                              setHoverSubmenu(null);
                              setPendingDrawShape(kind);
                            })}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); openImageInsertModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ImageIcon className="w-4 h-4 text-emerald-600" />
                          <span>그림...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+N+I</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTableModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <TableIcon className="w-4 h-4 text-blue-600" />
                          <span>표...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); insertSampleChart(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ChartIcon className="w-4 h-4 text-sky-600" />
                          <span>차트...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); setPendingDrawShape("textbox"); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 text-center font-mono text-neutral-700">▤</span>
                          <span>글상자</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+N+B</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); insertWebVideo(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <WebVideoIcon className="w-4 h-4 text-indigo-600" />
                          <span>웹 동영상...</span>
                        </span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); openNewEquation(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <EquationIcon className="w-4 h-4 text-sky-600" />
                          <span>수식...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+N+M</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowSymbolModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SymbolIcon className="w-4 h-4 text-orange-600" />
                          <span>문자표...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+F10</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowDateModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 text-center text-neutral-700">📅</span>
                          <span>필드 입력...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+K+E</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDropdown(null);
                          insertBlockAfter(selectedIdx, {
                            id: `band_${Date.now()}`,
                            type: "shape",
                            shapeType: "line",
                            strokeColor: "#1f2937",
                            strokeWidth: 1.5,
                            widthPercent: 100,
                            heightPt: 2,
                            treatAsChar: false,
                            textWrap: "TOP_AND_BOTTOM",
                            limitToPage: true,
                            align: "center",
                          });
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 inline-block" />
                          <span>문단 띠</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+N+L</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 주석 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("insert-note")}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu(hoverSubmenu === "insert-note" ? null : "insert-note")}
                          className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer ${hoverSubmenu === "insert-note" ? "bg-neutral-100" : ""}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-4 inline-block" />
                            <span>주석</span>
                          </span>
                          <span className="text-[10px] text-neutral-500">▸</span>
                        </button>
                        {hoverSubmenu === "insert-note" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[130px] flex flex-col">
                            <button
                              type="button"
                              onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); addFootnote(); }}
                              className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <FootnoteIcon className="w-4 h-4 text-emerald-600" />
                              <span>각주</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); addEndnote(); }}
                              className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <EndnoteIcon className="w-4 h-4 text-emerald-600" />
                              <span>미주</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 캡션 넣기 ▶ */}
                      {(() => {
                        const selBlock = selectedIdx >= 0 ? blocks[selectedIdx] : null;
                        const canCaption = !!selBlock && ["table", "image", "shape", "chart"].includes(selBlock.type);
                        return (
                          <div
                            className="relative"
                            onMouseEnter={() => { if (canCaption) setHoverSubmenu("insert-caption"); }}
                            onMouseLeave={() => setHoverSubmenu(null)}
                          >
                            <button
                              type="button"
                              disabled={!canCaption}
                              onClick={() => {
                                if (!canCaption) return;
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                                addCaptionToSelected();
                              }}
                              className={`w-full flex items-center justify-between px-3 py-1.5 text-left ${canCaption ? "hover:bg-neutral-100 text-neutral-800 cursor-pointer" : "text-neutral-300 cursor-not-allowed"} ${hoverSubmenu === "insert-caption" ? "bg-neutral-100" : ""}`}
                            >
                              <span className="flex items-center gap-2.5">
                                <span className="w-4 text-center text-[10px] font-mono">A1</span>
                                <span>캡션 넣기</span>
                              </span>
                              <span className="text-[10px]">▸</span>
                            </button>
                            {canCaption && hoverSubmenu === "insert-caption" && (
                              <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[120px] flex flex-col">
                                {(["위", "아래", "왼쪽", "오른쪽"] as const).map((pos) => (
                                  <button
                                    key={pos}
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdown(null);
                                      setHoverSubmenu(null);
                                      addCaptionToSelected();
                                    }}
                                    className="w-full px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                                  >
                                    {pos}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); addMemoToBlock(selectedIdx); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <CommentIcon className="w-4 h-4 text-amber-500" />
                          <span>메모</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); openHyperlinkModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <HyperlinkIcon className="w-4 h-4 text-blue-600" />
                          <span>하이퍼링크...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+K+H</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDropdown(null);
                          setShowBookmarkModal(true);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 text-center text-blue-700">🔖</span>
                          <span>책갈피...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+K+B</span>
                      </button>
                    </div>
                  )}

                  {/* [서식] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "format" && (() => {
                    const selObj = selectedIdx >= 0 ? blocks[selectedIdx] : null;
                    const canObjProp = Boolean(selObj && ["table", "image", "shape", "chart", "equation"].includes(selObj.type));
                    return (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[230px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowCharShapeModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <CharShapeIcon className="w-4 h-4 text-blue-600" />
                          <span>글자 모양...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+L</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowParaShapeModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ParaShapeIcon className="w-4 h-4 text-blue-600" />
                          <span>문단 모양...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+T</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setBulletNumberModalTab("bullet"); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <BulletListIcon className="w-4 h-4" />
                          <span>글머리표 모양...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setBulletNumberModalTab("number"); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <NumberListIcon className="w-4 h-4" />
                          <span>문단 번호 모양...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+K+N</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleLevelIndent(1); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <IndentIncIcon className="w-4 h-4 text-blue-600" />
                          <span>한 수준 증가</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Num -</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleLevelIndent(-1); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <IndentDecIcon className="w-4 h-4 text-blue-600" />
                          <span>한 수준 감소</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Num +</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowStyleModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ParaShapeIcon className="w-4 h-4 text-blue-600" />
                          <span>스타일...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">F6</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        disabled={!canObjProp}
                        onClick={() => {
                          if (!canObjProp) return;
                          setOpenDropdown(null);
                          openPropertyModal(selectedIdx);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left ${canObjProp ? "hover:bg-neutral-100 text-neutral-800 cursor-pointer" : "text-neutral-300 cursor-not-allowed"}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 h-4 inline-flex items-center justify-center text-[11px]">◩</span>
                          <span>개체 속성...</span>
                        </span>
                        <span className={`text-[11px] font-mono ${canObjProp ? "text-neutral-400" : "text-neutral-300"}`}>P</span>
                      </button>
                    </div>
                    );
                  })()}

                  {/* [쪽] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "page" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[235px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setHoverSubmenu(null)}
                        onClick={() => { setOpenDropdown(null); openPageSetupModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PageSetupIcon className="w-4 h-4 text-neutral-600" />
                          <span>편집 용지...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">F7</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />

                      {/* 머리말 (서브메뉴) */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("page-header")}
                        onMouseLeave={() => setHoverSubmenu((prev) => (prev === "page-header" ? null : prev))}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "page-header" ? null : "page-header"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverSubmenu === "page-header" ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <HeaderIcon className="w-4 h-4 text-amber-600" />
                            <span>머리말</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▸</span>
                        </button>
                        {hoverSubmenu === "page-header" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[165px] flex flex-col">
                            {(
                              [
                                { id: "none", label: "(모양 없음)" },
                                { id: "left", label: "왼쪽 쪽 번호" },
                                { id: "center", label: "가운데 쪽 번호" },
                                { id: "right", label: "오른쪽 쪽 번호" },
                              ] as const
                            ).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setHeaderPos(item.id);
                                  setOpenDropdown(null);
                                  setHoverSubmenu(null);
                                  showToast(item.id === "none" ? "머리말을 제거했습니다." : `머리말(${item.label})이 적용되었습니다.`);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer ${headerPos === item.id ? "text-[#0066cc] font-semibold" : "text-neutral-800"}`}
                              >
                                <span>{item.label}</span>
                                {headerPos === item.id && <span className="text-[#e11d48] text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 꼬리말 (서브메뉴) */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("page-footer")}
                        onMouseLeave={() => setHoverSubmenu((prev) => (prev === "page-footer" ? null : prev))}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "page-footer" ? null : "page-footer"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverSubmenu === "page-footer" ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <FooterIcon className="w-4 h-4 text-amber-600" />
                            <span>꼬리말</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▸</span>
                        </button>
                        {hoverSubmenu === "page-footer" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[165px] flex flex-col">
                            {(
                              [
                                { id: "none", label: "(모양 없음)" },
                                { id: "left", label: "왼쪽 쪽 번호" },
                                { id: "center", label: "가운데 쪽 번호" },
                                { id: "right", label: "오른쪽 쪽 번호" },
                              ] as const
                            ).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setFooterPos(item.id);
                                  setOpenDropdown(null);
                                  setHoverSubmenu(null);
                                  showToast(item.id === "none" ? "꼬리말을 제거했습니다." : `꼬리말(${item.label})이 적용되었습니다.`);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer ${footerPos === item.id ? "text-[#0066cc] font-semibold" : "text-neutral-800"}`}
                              >
                                <span>{item.label}</span>
                                {footerPos === item.id && <span className="text-[#e11d48] text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverSubmenu(null)}
                        onClick={() => { setOpenDropdown(null); openNewPageNumModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 h-4 inline-block shrink-0" />
                          <span>새 번호로 시작...</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverSubmenu(null)}
                        onClick={() => { setOpenDropdown(null); openHidePageModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 h-4 inline-block shrink-0" />
                          <span>현재 쪽만 감추기...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+N+S</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        onMouseEnter={() => setHoverSubmenu(null)}
                        onClick={() => { setOpenDropdown(null); handleInsertPageBreak(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PageBreakIcon className="w-4 h-4 text-neutral-600" />
                          <span>쪽 나누기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Enter</span>
                      </button>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverSubmenu(null)}
                        onClick={() => { setOpenDropdown(null); handleInsertColumnBreak(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ColumnsIcon className="w-4 h-4 text-neutral-600" />
                          <span>단 나누기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Shift+Enter</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 단 (서브메뉴) */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("page-columns")}
                        onMouseLeave={() => setHoverSubmenu((prev) => (prev === "page-columns" ? null : prev))}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "page-columns" ? null : "page-columns"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverSubmenu === "page-columns" ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <ColumnsIcon className="w-4 h-4 text-neutral-600" />
                            <span>단</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▸</span>
                        </button>
                        {hoverSubmenu === "page-columns" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[140px] flex flex-col">
                            {(
                              [
                                { id: "1", label: "하나" },
                                { id: "2", label: "둘" },
                                { id: "3", label: "셋" },
                                { id: "left", label: "왼쪽" },
                                { id: "right", label: "오른쪽" },
                              ] as const
                            ).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  applyColumnLayout(item.id);
                                  setOpenDropdown(null);
                                  setHoverSubmenu(null);
                                }}
                                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer text-neutral-800"
                              >
                                <span className="flex items-center gap-2">
                                  <span className="w-3.5 text-[#e11d48] font-bold text-xs">
                                    {columnLayout === item.id ? "✓" : ""}
                                  </span>
                                  <span>{item.label}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onMouseEnter={() => setHoverSubmenu(null)}
                        onClick={() => { setOpenDropdown(null); handleInsertColumnSectionBreak(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ColumnsIcon className="w-4 h-4 text-neutral-600" />
                          <span>다단 설정 나누기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Alt+Enter</span>
                      </button>
                    </div>
                  )}

                  {/* [표] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "table" && (() => {
                    const isTableSel = selectedIdx >= 0 && blocks[selectedIdx]?.type === "table";
                    const curTable = isTableSel ? (blocks[selectedIdx] as HwpxTableBlock) : null;
                    const activeRowIdx = tableCellSelection?.blockIdx === selectedIdx
                      ? tableCellSelection.endRow
                      : activeTableCell?.blockIdx === selectedIdx
                        ? activeTableCell.row
                        : Math.max(0, (curTable?.rows.length || 1) - 1);
                    const activeColIdx = tableCellSelection?.blockIdx === selectedIdx
                      ? tableCellSelection.endCol
                      : activeTableCell?.blockIdx === selectedIdx
                        ? activeTableCell.col
                        : Math.max(0, ((curTable?.rows[0]?.length) || 1) - 1);
                    const hasCellBlockSel =
                      isTableSel && tableCellSelection !== null && tableCellSelection.blockIdx === selectedIdx;
                    const hasActiveCellFocus =
                      isTableSel && activeTableCell !== null && activeTableCell.blockIdx === selectedIdx;
                    const hasAnyCell = hasCellBlockSel || hasActiveCellFocus;
                    const isMultiCellSel =
                      hasCellBlockSel &&
                      (Math.abs(tableCellSelection.endRow - tableCellSelection.startRow) > 0 ||
                        Math.abs(tableCellSelection.endCol - tableCellSelection.startCol) > 0);
                    const isSingleCellSel = hasAnyCell && !isMultiCellSel;
                    const itemCls = (enabled: boolean, activeSub = false) =>
                      `w-full flex items-center justify-between px-3 py-1.5 text-left ${enabled ? "hover:bg-neutral-100 text-neutral-800 cursor-pointer" : "text-neutral-300 cursor-not-allowed"} ${activeSub ? "bg-neutral-100" : ""}`;
                    return (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[230px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTableModal(true); }}
                        className={itemCls(true)}
                      >
                        <span className="flex items-center gap-2.5">
                          <TableIcon className="w-4 h-4 text-neutral-700" />
                          <span>표 만들기...</span>
                        </span>
                        <span className="text-[11px] text-neutral-500 font-mono">Alt+N+T</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isTableSel}
                        onClick={() => { if (!isTableSel) return; setOpenDropdown(null); openPropertyModal(selectedIdx); }}
                        className={itemCls(isTableSel)}
                      >
                        <span className="flex items-center gap-2.5">
                          <PageSetupIcon className={`w-4 h-4 ${isTableSel ? "text-blue-600" : "text-neutral-300"}`} />
                          <span>표/셀 속성...</span>
                        </span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 셀 테두리/배경 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => { if (hasAnyCell) setHoverSubmenu("tbl-border"); }}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button type="button" disabled={!hasAnyCell} className={itemCls(hasAnyCell, hoverSubmenu === "tbl-border")}>
                          <span className="flex items-center gap-2.5">
                            <span className="w-4" />
                            <span>셀 테두리/배경</span>
                          </span>
                          <span className="text-[10px]">▸</span>
                        </button>
                        {hasAnyCell && hoverSubmenu === "tbl-border" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[155px] flex flex-col">
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); openCellBorderBgModal(selectedIdx, "border", "each"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 text-left whitespace-nowrap cursor-pointer">각 셀마다 적용...</button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); openCellBorderBgModal(selectedIdx, "border", "single"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 text-left whitespace-nowrap cursor-pointer">하나의 셀처럼 적용...</button>
                          </div>
                        )}
                      </div>

                      {/* 줄/칸 추가하기 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => { if (isSingleCellSel) setHoverSubmenu("tbl-add"); }}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button type="button" disabled={!isSingleCellSel} className={itemCls(isSingleCellSel, hoverSubmenu === "tbl-add")}>
                          <span className="flex items-center gap-2.5">
                            <span className={`w-4 text-center text-[11px] ${isSingleCellSel ? "text-blue-600" : "text-neutral-300"}`}>⊞</span>
                            <span>줄/칸 추가하기</span>
                          </span>
                          <span className="text-[10px]">▸</span>
                        </button>
                        {isSingleCellSel && hoverSubmenu === "tbl-add" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[215px] flex flex-col">
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); addTableRow(selectedIdx, Math.max(-1, activeRowIdx - 1)); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>위쪽에 줄 추가하기</span>
                            </button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); addTableRow(selectedIdx, activeRowIdx); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>아래쪽에 줄 추가하기</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Enter</span>
                            </button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); addTableCol(selectedIdx, Math.max(-1, activeColIdx - 1)); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>왼쪽에 칸 추가하기</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Alt+Insert</span>
                            </button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); addTableCol(selectedIdx, activeColIdx); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>오른쪽에 칸 추가하기</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 줄/칸 지우기 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => { if (isSingleCellSel) setHoverSubmenu("tbl-del"); }}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button type="button" disabled={!isSingleCellSel} className={itemCls(isSingleCellSel, hoverSubmenu === "tbl-del")}>
                          <span className="flex items-center gap-2.5">
                            <span className={`w-4 text-center text-[11px] ${isSingleCellSel ? "text-red-500" : "text-neutral-300"}`}>⊟</span>
                            <span>줄/칸 지우기</span>
                          </span>
                          <span className="text-[10px]">▸</span>
                        </button>
                        {isSingleCellSel && hoverSubmenu === "tbl-del" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[205px] flex flex-col">
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); deleteTableRow(selectedIdx, activeRowIdx); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>줄 지우기</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+BackSpace</span>
                            </button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); deleteTableCol(selectedIdx, activeColIdx); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>칸 지우기</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Alt+Delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="my-1 border-t border-neutral-200" />

                      <button
                        type="button"
                        disabled={!hasAnyCell}
                        onClick={() => { if (!hasAnyCell) return; setOpenDropdown(null); handleSplitTableCell(); }}
                        className={itemCls(hasAnyCell)}
                      >
                        <span className="flex items-center gap-2.5">
                          <SplitCellIcon className={`w-4 h-4 ${hasAnyCell ? "text-blue-600" : "text-neutral-300"}`} />
                          <span>셀 나누기...</span>
                        </span>
                        <span className={`text-[11px] font-mono ${hasAnyCell ? "text-neutral-400" : "text-neutral-300"}`}>S</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isMultiCellSel}
                        onClick={() => { if (!isMultiCellSel) return; setOpenDropdown(null); handleMergeTableCells(); }}
                        className={itemCls(isMultiCellSel)}
                      >
                        <span className="flex items-center gap-2.5">
                          <MergeCellIcon className={`w-4 h-4 ${isMultiCellSel ? "text-blue-600" : "text-neutral-300"}`} />
                          <span>셀 합치기</span>
                        </span>
                        <span className={`text-[11px] font-mono ${isMultiCellSel ? "text-neutral-400" : "text-neutral-300"}`}>M</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isMultiCellSel}
                        onClick={() => { if (!isMultiCellSel) return; setOpenDropdown(null); handleEqualizeTableCellHeights(); }}
                        className={itemCls(isMultiCellSel)}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 text-center text-[11px]">⇕</span>
                          <span>셀 높이를 같게</span>
                        </span>
                        <span className={`text-[11px] font-mono ${isMultiCellSel ? "text-neutral-400" : "text-neutral-300"}`}>H</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isMultiCellSel}
                        onClick={() => { if (!isMultiCellSel) return; setOpenDropdown(null); handleEqualizeTableCellWidths(); }}
                        className={itemCls(isMultiCellSel)}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 text-center text-[11px]">⇔</span>
                          <span>셀 너비를 같게</span>
                        </span>
                        <span className={`text-[11px] font-mono ${isMultiCellSel ? "text-neutral-400" : "text-neutral-300"}`}>W</span>
                      </button>

                      <div className="my-1 border-t border-neutral-200" />

                      {/* 블록 계산식 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => { if (hasAnyCell) setHoverSubmenu("tbl-calc"); }}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button type="button" disabled={!hasAnyCell} className={itemCls(hasAnyCell, hoverSubmenu === "tbl-calc")}>
                          <span className="flex items-center gap-2.5">
                            <span className="w-4" />
                            <span>블록 계산식</span>
                          </span>
                          <span className="text-[10px]">▸</span>
                        </button>
                        {hasAnyCell && hoverSubmenu === "tbl-calc" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[185px] flex flex-col">
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); handleTableCalc("sum"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>블록 합계</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Shift+S</span>
                            </button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); handleTableCalc("avg"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>블록 평균</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Shift+A</span>
                            </button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); handleTableCalc("prod"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 flex items-center justify-between text-left cursor-pointer">
                              <span>블록 곱</span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Shift+P</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 1,000 단위 구분 쉼표 ▶ */}
                      <div
                        className="relative"
                        onMouseEnter={() => { if (isTableSel) setHoverSubmenu("tbl-comma"); }}
                        onMouseLeave={() => setHoverSubmenu(null)}
                      >
                        <button type="button" disabled={!isTableSel} className={itemCls(isTableSel, hoverSubmenu === "tbl-comma")}>
                          <span className="flex items-center gap-2.5">
                            <span className="w-4" />
                            <span>1,000 단위 구분 쉼표</span>
                          </span>
                          <span className="text-[10px]">▸</span>
                        </button>
                        {isTableSel && hoverSubmenu === "tbl-comma" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[120px] flex flex-col">
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); handleTableCalc("comma-add"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer">자릿점 넣기</button>
                            <button type="button" onClick={() => { setOpenDropdown(null); setHoverSubmenu(null); handleTableCalc("comma-remove"); }} className="w-full px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer">자릿점 빼기</button>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* [검토] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "review" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[205px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("review-track")}
                        onMouseLeave={() => {
                          setHoverSubmenu((prev) => (prev === "review-track" ? null : prev));
                          setHoverReviewViewSub(false);
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "review-track" ? null : "review-track"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverSubmenu === "review-track" ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-4" />
                            <span>변경 내용 추적</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▸</span>
                        </button>

                        {hoverSubmenu === "review-track" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[195px] flex flex-col">
                            <button
                              type="button"
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => {
                                const next = !trackChangesEnabled;
                                setTrackChangesEnabled(next);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                                showToast(next ? "변경 내용 추적을 켰습니다." : "변경 내용 추적을 껐습니다.");
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#e11d48] font-bold text-xs">{trackChangesEnabled ? "✓" : ""}</span>
                              <span>변경 내용 추적</span>
                            </button>

                            <div className="my-1 border-t border-neutral-200" />

                            <button
                              type="button"
                              disabled={visibleTrackedChanges.length === 0}
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => { handleTrackAcceptAndNext(); setOpenDropdown(null); setHoverSubmenu(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${visibleTrackedChanges.length === 0 ? "text-neutral-400 cursor-not-allowed" : "hover:bg-neutral-100 cursor-pointer"}`}
                            >
                              <span className="w-4" />
                              <span>적용 후 다음으로 이동</span>
                            </button>
                            <button
                              type="button"
                              disabled={visibleTrackedChanges.length === 0}
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => { handleTrackRejectAndNext(); setOpenDropdown(null); setHoverSubmenu(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${visibleTrackedChanges.length === 0 ? "text-neutral-400 cursor-not-allowed" : "hover:bg-neutral-100 cursor-pointer"}`}
                            >
                              <span className="w-4" />
                              <span>취소 후 다음으로 이동</span>
                            </button>
                            <button
                              type="button"
                              disabled={visibleTrackedChanges.length === 0}
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => { handleTrackNavigate(1); setOpenDropdown(null); setHoverSubmenu(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${visibleTrackedChanges.length === 0 ? "text-neutral-400 cursor-not-allowed" : "hover:bg-neutral-100 cursor-pointer"}`}
                            >
                              <span className="w-4" />
                              <span>다음</span>
                            </button>
                            <button
                              type="button"
                              disabled={visibleTrackedChanges.length === 0}
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => { handleTrackNavigate(-1); setOpenDropdown(null); setHoverSubmenu(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${visibleTrackedChanges.length === 0 ? "text-neutral-400 cursor-not-allowed" : "hover:bg-neutral-100 cursor-pointer"}`}
                            >
                              <span className="w-4" />
                              <span>이전</span>
                            </button>

                            <div className="my-1 border-t border-neutral-200" />

                            <div
                              className="relative"
                              onMouseEnter={() => setHoverReviewViewSub(true)}
                              onMouseLeave={() => setHoverReviewViewSub(false)}
                            >
                              <button
                                type="button"
                                onClick={() => setHoverReviewViewSub((v) => !v)}
                                className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverReviewViewSub ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="w-4" />
                                  <span>변경 내용 보기</span>
                                </span>
                                <span className="text-[10px] text-neutral-400">▸</span>
                              </button>
                              {hoverReviewViewSub && (
                                <div className="absolute left-full top-0 ml-0.5 z-80 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[140px] flex flex-col">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowTrackInsertDelete((v) => !v);
                                      setOpenDropdown(null);
                                      setHoverSubmenu(null);
                                      setHoverReviewViewSub(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                                  >
                                    <span className="w-4 text-[#e11d48] font-bold text-xs">{showTrackInsertDelete ? "✓" : ""}</span>
                                    <span>삽입 및 삭제</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowTrackFormat((v) => !v);
                                      setOpenDropdown(null);
                                      setHoverSubmenu(null);
                                      setHoverReviewViewSub(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                                  >
                                    <span className="w-4 text-[#e11d48] font-bold text-xs">{showTrackFormat ? "✓" : ""}</span>
                                    <span>서식</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="my-1 border-t border-neutral-200" />

                            <button
                              type="button"
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => {
                                setTrackDisplayMode("final-markup");
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                                showToast("최종본 및 변경 내용 보기 모드");
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#e11d48] font-bold text-xs">{trackDisplayMode === "final-markup" ? "✓" : ""}</span>
                              <span>최종본 및 변경 내용</span>
                            </button>
                            <button
                              type="button"
                              onMouseEnter={() => setHoverReviewViewSub(false)}
                              onClick={() => {
                                setTrackDisplayMode("final");
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                                showToast("최종본 보기 모드");
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                            >
                              <span className="w-4 text-[#e11d48] font-bold text-xs">{trackDisplayMode === "final" ? "✓" : ""}</span>
                              <span>최종본</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* [도구] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "tools" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-[4px] py-1 min-w-[195px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      {/* 빠른 교정 ▸ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("tools-quick-correct")}
                        onMouseLeave={() => setHoverSubmenu((prev) => (prev === "tools-quick-correct" ? null : prev))}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "tools-quick-correct" ? null : "tools-quick-correct"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverSubmenu === "tools-quick-correct" ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-4" />
                            <span>빠른 교정</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▸</span>
                        </button>
                        {hoverSubmenu === "tools-quick-correct" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[265px] flex flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                const next = !smartQuotesEnabled;
                                setSmartQuotesEnabled(next);
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                                showToast(next ? "'곧은 따옴표'를 '둥근 따옴표'로 자동 바꾸기를 켰습니다." : "'곧은 따옴표'를 '둥근 따옴표'로 자동 바꾸기를 껐습니다.");
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer whitespace-nowrap"
                            >
                              <span className="w-4 text-[#e11d48] font-bold text-xs">{smartQuotesEnabled ? "✓" : ""}</span>
                              <span>'곧은 따옴표'를 '둥근 따옴표'로 자동 바꾸기</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 접근성 설정 ▸ */}
                      <div
                        className="relative"
                        onMouseEnter={() => setHoverSubmenu("tools-accessibility")}
                        onMouseLeave={() => setHoverSubmenu((prev) => (prev === "tools-accessibility" ? null : prev))}
                      >
                        <button
                          type="button"
                          onClick={() => setHoverSubmenu((prev) => (prev === "tools-accessibility" ? null : "tools-accessibility"))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer ${hoverSubmenu === "tools-accessibility" ? "bg-neutral-100" : "hover:bg-neutral-100"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-4" />
                            <span>접근성 설정</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">▸</span>
                        </button>
                        {hoverSubmenu === "tools-accessibility" && (
                          <div className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-xl rounded-[4px] py-1 min-w-[235px] flex flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                const next = !screenReaderEnabled;
                                setScreenReaderEnabled(next);
                                setScreenReaderAnnouncement(next ? "스크린 리더 지원 사용이 켜졌습니다." : "");
                                setOpenDropdown(null);
                                setHoverSubmenu(null);
                                showToast(next ? "스크린 리더 지원 사용을 켰습니다." : "스크린 리더 지원 사용을 껐습니다.");
                              }}
                              className="w-full flex items-center justify-between gap-4 px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer whitespace-nowrap"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-4 text-[#e11d48] font-bold text-xs">{screenReaderEnabled ? "✓" : ""}</span>
                                <span>스크린 리더 지원 사용</span>
                              </span>
                              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Alt+F1</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 3열: 한컴독스 표준 액션 리본 툴바 (기본틀 고정 유지) */}
          {!ribbonCollapsed && (
            <div className="flex items-center gap-1 px-3 py-1 bg-[#f8f9fa] border-b border-neutral-200 overflow-x-auto text-[11px] min-h-[58px] select-none whitespace-nowrap">
              {/* 1. 저장하기 */}
              <button
                type="button"
                disabled={status === "saving" || !dirty}
                onClick={() => void runSave()}
                data-ribbon-save="true"
                className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${
                  status === "saving" || !dirty
                    ? "opacity-35 grayscale cursor-not-allowed text-neutral-400"
                    : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"
                }`}
                title="저장하기 (Ctrl+S)"
              >
                <SaveIcon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">저장하기</span>
              </button>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 2. 클립보드 (오려 두기, 복사하기, 붙이기, 모양 복사) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  disabled={!(hasTextSelection || isCrossSelecting || isObjectSelected)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCut}
                  data-ribbon-cut="true"
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${
                    !(hasTextSelection || isCrossSelecting || isObjectSelected)
                      ? "opacity-35 grayscale cursor-not-allowed text-neutral-400"
                      : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"
                  }`}
                  title="오려 두기 (Ctrl+X)"
                >
                  <CutIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">오려 두기</span>
                </button>
                <button
                  type="button"
                  disabled={!(hasTextSelection || isCrossSelecting || isObjectSelected)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCopy}
                  data-ribbon-copy="true"
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${
                    !(hasTextSelection || isCrossSelecting || isObjectSelected)
                      ? "opacity-35 grayscale cursor-not-allowed text-neutral-400"
                      : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"
                  }`}
                  title="복사하기 (Ctrl+C)"
                >
                  <CopyIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">복사하기</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="붙이기 (Ctrl+V)"
                >
                  <PasteIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">붙이기</span>
                </button>
                <button
                  type="button"
                  disabled={isObjectSelected || hasTextSelection || isCrossSelecting}
                  data-ribbon-btn="format-copy"
                  onClick={() => setShowFormatCopyModal(true)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${
                    isObjectSelected || hasTextSelection || isCrossSelecting
                      ? "opacity-35 grayscale cursor-not-allowed text-neutral-400"
                      : copiedStyle
                        ? "bg-blue-50 text-[#0066cc] font-bold hover:bg-white hover:shadow-xs cursor-pointer"
                        : "text-neutral-700 hover:text-[#0066cc] hover:bg-white hover:shadow-xs cursor-pointer"
                  }`}
                  title="모양 복사 (Ctrl+Alt+C / Alt+C)"
                >
                  <FormatPainterIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">모양 복사</span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 3. 찾기 ▼ */}
              <div className="relative shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  data-ribbon-btn="search"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setRibbonPopup((prev) =>
                      prev?.kind === "search" ? null : { kind: "search", left: r.left, top: r.bottom + 2 }
                    );
                  }}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${ribbonPopup?.kind === "search" ? "bg-neutral-200/70 text-[#0066cc]" : "text-neutral-700 hover:text-[#0066cc]"}`}
                  title="찾기 (Ctrl+F) / 찾아 바꾸기 (Ctrl+H) / 찾아가기 (Alt+G)"
                >
                  <SearchIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    찾기 <span className="text-[8px]">▾</span>
                  </span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 4. 개체 삽입 (도형 ▼, 그림, 표 ▼, 차트 ▼, 웹 동영상 ▼) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <div className="relative">
                  <button
                    type="button"
                    data-ribbon-btn="shape"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setRibbonPopup((prev) =>
                        prev?.kind === "shape" ? null : { kind: "shape", left: r.left, top: r.bottom + 2 }
                      );
                    }}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${ribbonPopup?.kind === "shape" ? "bg-neutral-200/70 text-[#0066cc]" : "text-neutral-700 hover:text-[#0066cc]"}`}
                    title="도형 삽입"
                  >
                    <ShapesIcon className="w-5 h-5 text-purple-600 shrink-0" />
                    <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                      도형 <span className="text-[8px]">▾</span>
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  data-ribbon-btn="image"
                  onClick={() => openImageInsertModal()}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="그림 삽입 (Ctrl+N, I)"
                >
                  <ImageIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">그림</span>
                </button>
                <button
                  type="button"
                  data-ribbon-btn="table"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setHoverTableGrid(null);
                    setRibbonPopup((prev) =>
                      prev?.kind === "table" ? null : { kind: "table", left: r.left, top: r.bottom + 2 }
                    );
                  }}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${ribbonPopup?.kind === "table" ? "bg-neutral-200/70 text-[#0066cc]" : "text-neutral-700 hover:text-[#0066cc]"}`}
                  title="표 만들기 (Ctrl+N, T)"
                >
                  <TableIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    표 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  data-ribbon-btn="chart"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setRibbonPopup((prev) =>
                      prev?.kind === "chart" ? null : { kind: "chart", left: r.left, top: r.bottom + 2 }
                    );
                  }}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${ribbonPopup?.kind === "chart" ? "bg-neutral-200/70 text-[#0066cc]" : "text-neutral-700 hover:text-[#0066cc]"}`}
                  title="차트 삽입"
                >
                  <ChartIcon className="w-5 h-5 text-sky-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    차트 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  data-ribbon-btn="webvideo"
                  onClick={insertWebVideo}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="웹 동영상 삽입"
                >
                  <WebVideoIcon className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">웹 동영상</span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 5. 주석 및 참조 (각주, 미주, 하이퍼링크, 문자표) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  disabled={isObjectSelected}
                  data-ribbon-btn="footnote"
                  onClick={addFootnote}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${isObjectSelected ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="각주 달기 (Ctrl+N, N)"
                >
                  <FootnoteIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">각주</span>
                </button>
                <button
                  type="button"
                  disabled={isObjectSelected}
                  data-ribbon-btn="endnote"
                  onClick={addEndnote}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${isObjectSelected ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="미주 달기"
                >
                  <EndnoteIcon className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">미주</span>
                </button>
                <button
                  type="button"
                  disabled={isObjectSelected}
                  data-ribbon-btn="hyperlink"
                  onClick={openHyperlinkModal}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${isObjectSelected ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="하이퍼링크 (Ctrl+K)"
                >
                  <HyperlinkIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">하이퍼링크</span>
                </button>
                <button
                  type="button"
                  disabled={isObjectSelected}
                  data-ribbon-btn="symbol"
                  onClick={() => setShowSymbolModal(true)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${isObjectSelected ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="문자표 (Ctrl+F10)"
                >
                  <SymbolIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">문자표</span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 6. 서식 모양 (글자 모양, 문단 모양, 개체 속성) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  disabled={isObjectSelected}
                  data-ribbon-btn="char-shape"
                  onClick={() => setShowCharShapeModal(true)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${isObjectSelected ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="글자 모양 (Alt+L)"
                >
                  <CharShapeIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">글자 모양</span>
                </button>
                <button
                  type="button"
                  disabled={isObjectSelected}
                  data-ribbon-btn="para-shape"
                  onClick={() => setShowParaShapeModal(true)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${isObjectSelected ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="문단 모양 (Alt+T)"
                >
                  <ParaShapeIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">문단 모양</span>
                </button>
                <button
                  type="button"
                  disabled={hasTextSelection || isCrossSelecting}
                  data-ribbon-btn="obj-prop"
                  onClick={() => {
                    if (selectedIdx !== null) {
                      openPropertyModal(selectedIdx);
                    } else {
                      showToast("속성을 볼 개체(도형/표/이미지/문단)를 먼저 선택하세요.");
                    }
                  }}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition shrink-0 whitespace-nowrap min-w-fit ${hasTextSelection || isCrossSelecting ? "opacity-35 grayscale cursor-not-allowed text-neutral-400" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc] cursor-pointer"}`}
                  title="개체 속성 (Ctrl+N, K / P)"
                >
                  <PageSetupIcon className="w-5 h-5 text-neutral-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">개체 속성</span>
                </button>
                <button
                  type="button"
                  onClick={() => addMemoToBlock(selectedIdx)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="메모 넣기"
                >
                  <CommentIcon className="w-5 h-5 text-amber-500 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">메모</span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 7. 쪽 및 보기 (머리말 ▼, 꼬리말 ▼, 조판 부호, 문단 부호, 격자 보기) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => insertHeaderFooter("header")}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="머리말 넣기/이동"
                >
                  <HeaderIcon className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    머리말 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => insertHeaderFooter("footer")}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="꼬리말 넣기/이동"
                >
                  <FooterIcon className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    꼬리말 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowControlMarks(!showControlMarks)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${showControlMarks ? "bg-blue-100 text-[#0066cc] font-bold shadow-2xs" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc]"
                    }`}
                  title="조판 부호 켜기/끄기"
                >
                  <ClearControlMarksIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 whitespace-nowrap">조판 부호</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowParaMarks(!showParaMarks)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${showParaMarks ? "bg-blue-100 text-[#0066cc] font-bold shadow-2xs" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc]"
                    }`}
                  title="문단 부호 켜기/끄기 (Enter 기호 표시)"
                >
                  <ParaMarkIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 whitespace-nowrap">문단 부호</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${showGrid ? "bg-blue-100 text-[#0066cc] font-bold shadow-2xs" : "hover:bg-white hover:shadow-xs text-neutral-700 hover:text-[#0066cc]"
                    }`}
                  title="격자(모눈) 보기"
                >
                  <GridIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 whitespace-nowrap">격자 보기</span>
                </button>
              </div>


            </div>
          )}

          {/* 4열: 한컴 표준 빠른 서식 툴바 (2단 툴바) */}
          {showFormatToolbar && (
            <div className="flex items-center gap-1 px-3 py-1 bg-white border-b border-neutral-300 text-xs overflow-x-auto whitespace-nowrap select-none">
              {/* 실행 취소 / 다시 실행 */}
              <button
                type="button"
                onClick={handleUndo}
                className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${canUndo ? "text-neutral-800 hover:bg-neutral-100" : "text-neutral-300 hover:bg-neutral-50"
                  }`}
                title="실행 취소 (Ctrl+Z)"
              >
                <UndoIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${canRedo ? "text-neutral-800 hover:bg-neutral-100" : "text-neutral-300 hover:bg-neutral-50"
                  }`}
                title="다시 실행 (Ctrl+Y)"
              >
                <RedoIcon className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />
              <div
                data-format-toolbar-controls="true"
                data-obj-sel={isObjectSelected ? "true" : "false"}
                className={`flex items-center gap-1 ${isObjectSelected ? "opacity-35 grayscale pointer-events-none" : ""}`}
              >
              {/* 스타일 프리셋 (바탕글 ▾) */}
              <select
                onChange={(e) => applyStylePreset(e.target.value)}
                defaultValue="body"
                className="bg-neutral-50 text-neutral-800 border border-neutral-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-[#0066cc] cursor-pointer"
                title="스타일 선택"
              >
                <option value="body">바탕글</option>
                <option value="heading1">개요 1 (제목 1)</option>
                <option value="heading2">개요 2 (제목 2)</option>
                <option value="title">문서 제목</option>
              </select>

              {/* 언어 영역 (대표 ▾) */}
              <select
                defaultValue="rep"
                className="bg-neutral-50 text-neutral-800 border border-neutral-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-[#0066cc] cursor-pointer"
                title="글꼴 언어 영역"
              >
                <option value="rep">대표</option>
                <option value="hangul">한글</option>
                <option value="latin">영문</option>
                <option value="hanja">한자</option>
                <option value="symbol">기호</option>
              </select>

              {/* 대표 글꼴 */}
              <select
                disabled={!canFormatText}
                value={(isTableCellEditing ? activeCellStyle?.fontFamily : currentPara?.fontFamily) || editorFonts[0]?.value || FONT_FAMILIES[0].value}
                onChange={(e) => {
                  if (e.target.value === "__ADD_FONT__") {
                    setShowAddFontModal(true);
                    return;
                  }
                  applyFontFamily(e.target.value);
                }}
                className="bg-neutral-50 text-neutral-800 border border-neutral-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-[#0066cc] disabled:opacity-40 max-w-[130px] cursor-pointer"
                title="글꼴 변경"
              >
                {editorFonts.map((f) => (
                  <option key={f.id || f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
                <option value="__ADD_FONT__">➕ 폰트 추가 / 관리...</option>
              </select>
              <button
                type="button"
                onClick={() => setShowAddFontModal(true)}
                className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                title="글꼴(폰트) 추가 및 관리"
              >
                <span className="text-[11px]">🔤</span>
                <span className="text-[10px] text-blue-600 font-bold">+</span>
              </button>

              {/* 글자 크기 스피너 [-] 10.0 pt [+] */}
              <div className="flex items-center border border-neutral-300 rounded bg-neutral-50 overflow-hidden">
                <button
                  type="button"
                  disabled={!canFormatText}
                  onClick={() => applyFontSize(Math.max(6, (currentPara?.sizePt || 10) - 1))}
                  className="px-1 py-0.5 hover:bg-neutral-200 text-neutral-600 disabled:opacity-40 text-[10px]"
                  title="글자 크기 1pt 줄이기"
                >
                  ▼
                </button>
                <select
                  disabled={!canFormatText}
                  value={Math.round((isTableCellEditing ? activeCellStyle?.sizePt : currentPara?.sizePt) || 10)}
                  onChange={(e) => applyFontSize(Number(e.target.value))}
                  className="bg-transparent text-neutral-800 text-xs px-1 py-0.5 outline-none text-center disabled:opacity-40 cursor-pointer"
                  title="글자 크기 선택"
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}.0 pt
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!canFormatText}
                  onClick={() => applyFontSize((currentPara?.sizePt || 10) + 1)}
                  className="px-1 py-0.5 hover:bg-neutral-200 text-neutral-600 disabled:opacity-40 text-[10px]"
                  title="글자 크기 1pt 늘리기"
                >
                  ▲
                </button>
              </div>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 글자 서식: 가(굵게), 가(기울임), 가(밑줄), 가(취소선) */}
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyBold}
                className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs transition cursor-pointer ${currentPara?.bold ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="굵게 (Ctrl+B)"
              >
                가
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyItalic}
                className={`w-6 h-6 rounded flex items-center justify-center italic font-serif text-xs transition cursor-pointer ${currentPara?.italic ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="기울임 (Ctrl+I)"
              >
                가
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyUnderline}
                className={`w-6 h-6 rounded flex items-center justify-center underline text-xs transition cursor-pointer ${currentPara?.underline ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="밑줄 (Ctrl+U)"
              >
                가
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyStrikethrough}
                className="w-6 h-6 rounded flex items-center justify-center line-through text-xs hover:bg-neutral-100 text-neutral-800 transition cursor-pointer disabled:opacity-40"
                title="취소선"
              >
                가
              </button>

              {/* 글자 색상 드롭다운 */}
              <div className="relative">
                <button
                  type="button"
                  data-ribbon-btn="text-color"
                  disabled={!canFormatText}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setRibbonPopup((prev) =>
                      prev?.kind === "text-color" ? null : { kind: "text-color", left: r.left, top: r.bottom + 2 }
                    );
                  }}
                  className="h-6 px-1.5 rounded flex items-center gap-1 hover:bg-neutral-100 text-neutral-800 transition cursor-pointer disabled:opacity-40"
                  title="글자 색상"
                >
                  <span className="font-bold border-b-2" style={{ borderColor: currentPara?.color || "#111827" }}>
                    가
                  </span>
                  <span className="text-[8px]">▾</span>
                </button>
              </div>

              {/* 형광펜 (배경 하이라이트) */}
              <div className="relative">
                <button
                  type="button"
                  data-ribbon-btn="highlight"
                  disabled={!canFormatText}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setRibbonPopup((prev) =>
                      prev?.kind === "highlight" ? null : { kind: "highlight", left: r.left, top: r.bottom + 2 }
                    );
                  }}
                  className="h-6 px-1.5 rounded flex items-center gap-1 hover:bg-neutral-100 text-neutral-800 transition cursor-pointer disabled:opacity-40"
                  title="형광펜 (배경색)"
                >
                  <HighlighterIcon className="w-3.5 h-3.5" />
                  <span className="text-[8px]">▾</span>
                </button>
              </div>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 문단 정렬 4종 (양쪽맞춤, 왼, 가운데, 오른) */}
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateParagraphStyle(selectedIdx, { align: "justify" })}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${currentPara?.align === "justify" ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="양쪽 맞춤"
              >
                <AlignJustifyIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateParagraphStyle(selectedIdx, { align: "left" })}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${currentPara?.align === "left" || !currentPara?.align ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="왼쪽 정렬"
              >
                <AlignLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateParagraphStyle(selectedIdx, { align: "center" })}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${currentPara?.align === "center" ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="가운데 정렬"
              >
                <AlignCenterIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateParagraphStyle(selectedIdx, { align: "right" })}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${currentPara?.align === "right" ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="오른쪽 정렬"
              >
                <AlignRightIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateParagraphStyle(selectedIdx, { align: "justify" })}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${currentPara?.align === "justify" ? "hover:bg-neutral-100 text-neutral-800" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="배분 정렬"
              >
                <AlignDistributeIcon className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 줄 간격 (직접 입력 + 드롭다운 프리셋) */}
              <div className="relative flex items-center gap-1 text-xs text-neutral-700">
                <span title="줄 간격">
                  <LineSpacingIcon className="w-3.5 h-3.5" />
                </span>
                <div className={`flex items-center bg-neutral-50 border border-neutral-300 rounded overflow-hidden ${!isParagraph ? "opacity-40" : ""}`}>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!canFormatText}
                    value={lineSpacingDraft}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setLineSpacingDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const raw = parseFloat(lineSpacingDraft);
                        const pct = Number.isFinite(raw) ? Math.min(500, Math.max(50, Math.round(raw))) : (currentPara?.lineSpacingPct ?? 160);
                        setLineSpacingDraft(String(pct));
                        if (isParagraph && selectedIdx >= 0) updateParagraphStyle(selectedIdx, { lineSpacingPct: pct });
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        setLineSpacingDraft(String(currentPara?.lineSpacingPct ?? 160));
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={() => {
                      const raw = parseFloat(lineSpacingDraft);
                      const pct = Number.isFinite(raw) ? Math.min(500, Math.max(50, Math.round(raw))) : (currentPara?.lineSpacingPct ?? 160);
                      setLineSpacingDraft(String(pct));
                      if (isParagraph && selectedIdx >= 0 && pct !== (currentPara?.lineSpacingPct ?? 160)) {
                        updateParagraphStyle(selectedIdx, { lineSpacingPct: pct });
                      }
                    }}
                    className="w-9 bg-transparent text-neutral-800 px-1 py-0.5 text-xs text-right outline-none"
                    title="줄 간격 직접 입력 (%)"
                  />
                  <span className="text-[11px] text-neutral-500 pr-0.5 select-none">%</span>
                  <button
                    type="button"
                    disabled={!canFormatText}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      if (lineSpacingMenuPos) {
                        setLineSpacingMenuPos(null);
                      } else {
                        const rc = e.currentTarget.parentElement?.getBoundingClientRect();
                        if (rc) setLineSpacingMenuPos({ top: rc.bottom + 2, left: rc.left });
                      }
                    }}
                    className="px-1 py-0.5 border-l border-neutral-300 hover:bg-neutral-200 text-neutral-600 cursor-pointer disabled:cursor-default"
                    title="줄 간격 목록"
                  >
                    ▾
                  </button>
                </div>
                {lineSpacingMenuPos && isParagraph && (
                  <div
                    style={{ top: `${lineSpacingMenuPos.top}px`, left: `${lineSpacingMenuPos.left}px` }}
                    onMouseLeave={() => setLineSpacingMenuPos(null)}
                    className="fixed w-20 bg-white border border-neutral-300 rounded shadow-lg py-0.5 z-[9999] flex flex-col"
                  >
                    {[100, 130, 160, 180, 200, 300].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setLineSpacingDraft(String(pct));
                          setLineSpacingMenuPos(null);
                          if (selectedIdx >= 0) updateParagraphStyle(selectedIdx, { lineSpacingPct: pct });
                        }}
                        className={`w-full text-left px-2.5 py-1 text-xs hover:bg-blue-50 cursor-pointer ${(currentPara?.lineSpacingPct ?? 160) === pct ? "bg-blue-50 text-[#0066cc] font-semibold" : "text-neutral-800"}`}
                      >
                        {pct}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 들여쓰기 / 내어쓰기 */}
              <button
                type="button"
                disabled={!canFormatText}
                onClick={() => handleIndent(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
                title="내어쓰기 (공백 제거)"
              >
                <IndentDecIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canFormatText}
                onClick={() => handleIndent(true)}
                className="w-6 h-6 rounded flex items-center justify-center text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
                title="들여쓰기 (문단 시작 공백 추가)"
              >
                <IndentIncIcon className="w-3.5 h-3.5" />
              </button>

              {/* 문단 추가 / 삭제 */}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => addParagraph(selectedIdx)}
                  className="px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-medium border border-neutral-300 transition cursor-pointer flex items-center gap-1"
                  title="아래에 새 문단 추가"
                >
                  <span>↵</span>
                  <span>문단 추가</span>
                </button>
                </div>
                <button
                  type="button"
                  disabled={blocks.length <= 1}
                  onClick={() => deleteBlock(selectedIdx)}
                  className="p-1 rounded text-red-600 hover:bg-red-50 text-xs transition disabled:opacity-40 cursor-pointer"
                  title="현재 블록 삭제"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 5열: 한컴독스 표준 가로 눈금자 (Ruler) */}
          {showRuler && (() => {
            const rulerScale = showPageOutline ? Math.max(0.1, zoomPercent / 100) : 1;
            const pxPerMm = 3.78 * rulerScale;
            const pxPerPt = (96 / 72) * rulerScale;
            const rulerW = Math.round(pageWidthMm * pxPerMm);
            const contentMm = Math.max(20, pageWidthMm - pageMarginLeftMm - pageMarginRightMm);
            const colGapMm = (columnLayout === "3" ? 20 : 28) / 3.78;
            const colWidthsMm: number[] =
              columnLayout === "1"
                ? [contentMm]
                : columnLayout === "2"
                  ? [(contentMm - colGapMm) / 2, (contentMm - colGapMm) / 2]
                  : columnLayout === "3"
                    ? [(contentMm - colGapMm * 2) / 3, (contentMm - colGapMm * 2) / 3, (contentMm - colGapMm * 2) / 3]
                    : columnLayout === "left"
                      ? [(contentMm - colGapMm) * 0.35, (contentMm - colGapMm) * 0.65]
                      : [(contentMm - colGapMm) * 0.65, (contentMm - colGapMm) * 0.35];
            const safeColIdx = Math.min(colWidthsMm.length - 1, Math.max(0, activeColIdx));
            let activeColStartMm = pageMarginLeftMm;
            for (let ci = 0; ci < safeColIdx; ci++) {
              activeColStartMm += colWidthsMm[ci] + colGapMm;
            }
            const activeColEndMm = activeColStartMm + colWidthsMm[safeColIdx];
            const rulerOriginMm = activeColStartMm;
            const leftMarginPx = Math.max(16 * rulerScale, activeColStartMm * pxPerMm);
            const rightMarginPx = Math.max(16 * rulerScale, (pageWidthMm - activeColEndMm) * pxPerMm);
            const paraMarginLeftPt = currentPara?.marginLeftPt || 0;
            const paraFirstLinePt = currentPara?.firstLinePt || 0;
            const paraFirstLineOffsetPt =
              currentPara?.firstLineType === "indent"
                ? paraFirstLinePt
                : currentPara?.firstLineType === "outdent"
                  ? -paraFirstLinePt
                  : 0;
            const firstLinePx = leftMarginPx + (paraMarginLeftPt + paraFirstLineOffsetPt) * pxPerPt;
            const paraLeftPx = leftMarginPx + paraMarginLeftPt * pxPerPt;
            const paraRightPx = rightMarginPx + (currentPara?.marginRightPt || 0) * pxPerPt;

            const startDrag = (
              e: React.MouseEvent,
              mode: "pageLeft" | "pageRight" | "firstLine" | "paraLeft"
            ) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const rulerRect = e.currentTarget.parentElement?.getBoundingClientRect();
              const rulerLeft = rulerRect?.left ?? 0;
              const rulerBottom = rulerRect?.bottom ?? 0;
              const initPageLeft = pageMarginLeftMm;
              const initPageRight = pageMarginRightMm;
              const initParaLeftPt = paraMarginLeftPt;
              const initFirstLineOffsetPt = paraFirstLineOffsetPt;

              const setGuide = (label: string, leftPx: number) => {
                setRulerGuide({
                  label,
                  leftPx,
                  screenLeftPx: rulerLeft + leftPx,
                  screenTopPx: rulerBottom,
                });
              };

              if (mode === "pageLeft") setGuide(`왼쪽 여백: ${initPageLeft.toFixed(1)} mm`, 1 + Math.round(leftMarginPx));
              else if (mode === "pageRight") setGuide(`오른쪽 여백: ${initPageRight.toFixed(1)} mm`, rulerW - 1 - Math.round(rightMarginPx));
              else if (mode === "paraLeft") setGuide(`왼쪽 문단 여백: ${initParaLeftPt} pt`, 1 + Math.round(paraLeftPx));
              else if (mode === "firstLine") {
                const lbl = initFirstLineOffsetPt > 0 ? `들여쓰기: ${initFirstLineOffsetPt} pt` : initFirstLineOffsetPt < 0 ? `내어쓰기: ${Math.abs(initFirstLineOffsetPt)} pt` : "첫 줄: 보통";
                setGuide(lbl, 1 + Math.round(firstLinePx));
              }

              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                if (mode === "pageLeft") {
                  const nextMm = Math.min(80, Math.max(5, Number((initPageLeft + dx / pxPerMm).toFixed(1))));
                  setPageMarginLeftMm(nextMm);
                  setGuide(`왼쪽 여백: ${nextMm.toFixed(1)} mm`, 1 + Math.round(nextMm * pxPerMm));
                } else if (mode === "pageRight") {
                  const nextMm = Math.min(80, Math.max(5, Number((initPageRight - dx / pxPerMm).toFixed(1))));
                  setPageMarginRightMm(nextMm);
                  setGuide(`오른쪽 여백: ${nextMm.toFixed(1)} mm`, rulerW - 1 - Math.round(nextMm * pxPerMm));
                } else if (mode === "paraLeft" && isParagraph && selectedIdx >= 0) {
                  const nextPt = Math.min(120, Math.max(0, Math.round(initParaLeftPt + dx / pxPerPt)));
                  updateParagraphStyle(selectedIdx, { marginLeftPt: nextPt });
                  setGuide(`왼쪽 문단 여백: ${nextPt} pt`, 1 + Math.round(leftMarginPx + nextPt * pxPerPt));
                } else if (mode === "firstLine" && isParagraph && selectedIdx >= 0) {
                  const nextOffset = Math.min(80, Math.max(-40, Math.round(initFirstLineOffsetPt + dx / pxPerPt)));
                  updateParagraphStyle(selectedIdx, {
                    firstLineType: nextOffset > 0 ? "indent" : nextOffset < 0 ? "outdent" : "none",
                    firstLinePt: Math.abs(nextOffset),
                  });
                  const lbl = nextOffset > 0 ? `들여쓰기: ${nextOffset} pt` : nextOffset < 0 ? `내어쓰기: ${Math.abs(nextOffset)} pt` : "첫 줄: 보통";
                  setGuide(lbl, 1 + Math.round(leftMarginPx + (initParaLeftPt + nextOffset) * pxPerPt));
                }
              };

              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
                setRulerGuide(null);
              };

              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            };

            const minCm = -Math.floor(rulerOriginMm / 10);
            const maxCm = Math.floor((pageWidthMm - rulerOriginMm) / 10);
            const cmValues: number[] = [];
            for (let c = minCm; c <= maxCm; c++) cmValues.push(c);

            const minorTicksMm: number[] = [];
            for (let mm = Math.ceil((2 - rulerOriginMm) / 2) * 2; mm <= pageWidthMm - rulerOriginMm - 2; mm += 2) {
              if (mm % 10 !== 0) minorTicksMm.push(mm);
            }

            const sbW = canvasScrollRef.current ? Math.max(0, canvasScrollRef.current.offsetWidth - canvasScrollRef.current.clientWidth) : 0;

            return (
              <div
                style={sbW > 0 ? { paddingRight: `${sbW}px` } : undefined}
                className="w-full bg-[#f3f4f6] border-b border-neutral-300 select-none shrink-0"
              >
                <div
                  ref={rulerScrollRef}
                  className="w-full py-0.5 px-4 sm:px-8 overflow-x-hidden"
                >
                  <div
                    className="w-max mx-auto"
                    style={
                      showPageOutline && pageViewColumns === 1 && memos.length > 0 && showAllMemos
                        ? { paddingRight: `${Math.round(240 * rulerScale)}px` }
                        : undefined
                    }
                  >
                  <div
                    data-ruler-bar="true"
                    style={{ width: `${rulerW}px` }}
                    className="h-5 bg-white border border-neutral-300 rounded-xs relative flex items-center text-[9px] text-neutral-500 font-sans shadow-2xs"
                  >
                    {/* 왼쪽 여백/비활성 단 영역 회색 음영 */}
                    <div
                      data-ruler-left-shade="true"
                      style={{ width: `${Math.round(leftMarginPx)}px` }}
                      className="absolute left-0 top-0 bottom-0 bg-[#e5e7eb] border-r border-neutral-300 pointer-events-none"
                    />
                    {/* 오른쪽 여백/비활성 단 영역 회색 음영 */}
                    <div
                      data-ruler-right-shade="true"
                      style={{ width: `${Math.round(rightMarginPx)}px` }}
                      className="absolute right-0 top-0 bottom-0 bg-[#e5e7eb] border-l border-neutral-300 pointer-events-none"
                    />
                    {/* cm 숫자 및 눈금 */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      {minorTicksMm.map((mm) => {
                        const posPx = Math.round((rulerOriginMm + mm) * pxPerMm);
                        const isHalf = Math.abs(mm % 10) === 5;
                        return (
                          <div
                            key={`t-${mm}`}
                            style={{ left: `${posPx}px` }}
                            className={`absolute top-1/2 -translate-y-1/2 w-[1px] ${isHalf ? "h-2 bg-neutral-400" : "h-1 bg-neutral-300"}`}
                          />
                        );
                      })}
                      {cmValues.map((cm) => {
                        const posMm = rulerOriginMm + cm * 10;
                        const posPx = Math.round(posMm * pxPerMm);
                        if (posPx < 6 || posPx > rulerW - 6) return null;
                        return (
                          <div
                            key={cm}
                            style={{ left: `${posPx}px` }}
                            className="absolute inset-y-0 -translate-x-1/2 flex items-center justify-center z-1"
                          >
                            {cm !== 0 && (
                              <span className="text-[9px] text-neutral-500 bg-transparent px-0.5 leading-none">
                                {Math.abs(cm)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 첫 줄 들여쓰기 마커 (역삼각형) */}
                    <div
                      onMouseDown={(e) => startDrag(e, "firstLine")}
                      style={{ left: `${Math.round(firstLinePx)}px` }}
                      className="absolute top-0 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-transparent border-t-neutral-700 hover:border-t-[#0066cc] cursor-ew-resize z-10"
                      title="첫 줄 들여쓰기/내어쓰기 조절 (드래그)"
                    />
                    {/* 왼쪽 문단 여백 마커 (삼각형) */}
                    <div
                      onMouseDown={(e) => startDrag(e, "paraLeft")}
                      style={{ left: `${Math.round(paraLeftPx)}px` }}
                      className="absolute bottom-[4px] -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-transparent border-b-neutral-700 hover:border-b-[#0066cc] cursor-ew-resize z-10"
                      title="왼쪽 문단 여백 조절 (드래그)"
                    />
                    {/* 왼쪽 페이지 여백 마커 (사각형) */}
                    <div
                      onMouseDown={(e) => startDrag(e, "pageLeft")}
                      style={{ left: `${Math.round(leftMarginPx)}px` }}
                      className="absolute bottom-0 -translate-x-1/2 w-2.5 h-1.5 bg-neutral-700 hover:bg-[#0066cc] rounded-2xs cursor-ew-resize z-10"
                      title={`왼쪽 용지 여백: ${pageMarginLeftMm.toFixed(1)}mm (드래그)`}
                    />
                    {/* 오른쪽 용지 여백 마커 (삼각형 + 사각형) */}
                    <div
                      onMouseDown={(e) => startDrag(e, "pageRight")}
                      style={{ right: `${Math.round(paraRightPx)}px` }}
                      className="absolute bottom-0 translate-x-1/2 flex flex-col items-center cursor-ew-resize z-10 group"
                      title={`오른쪽 용지 여백: ${pageMarginRightMm.toFixed(1)}mm (드래그)`}
                    >
                      <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-transparent border-b-neutral-700 group-hover:border-b-[#0066cc]" />
                      <div className="w-2.5 h-1.5 bg-neutral-700 group-hover:bg-[#0066cc] rounded-2xs mt-0.5" />
                    </div>
                    {/* 드래그 안내 점선 및 툴팁 */}
                    {rulerGuide && (
                      <>
                        <div
                          style={{ left: `${Math.round(rulerGuide.screenLeftPx)}px`, top: `${Math.round(rulerGuide.screenTopPx)}px` }}
                          className="fixed bottom-0 w-0 border-l border-dashed border-[#0066cc]/80 pointer-events-none z-[9998]"
                        />
                        <div
                          style={{ left: `${Math.round(rulerGuide.screenLeftPx)}px`, top: `${Math.round(rulerGuide.screenTopPx + 4)}px` }}
                          className="fixed -translate-x-1/2 px-1.5 py-0.5 rounded bg-neutral-900 text-white text-[10px] whitespace-nowrap shadow-md z-[9999] pointer-events-none"
                        >
                          {rulerGuide.label}
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </header>

        {/* 한컴독스 스타일 표 만들기 모달 */}
        {showTableModal && (() => {
          const contentWidthMm = Number((Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0))).toFixed(1));
          const displayWidthMm = newTableWidthMode === "fit" ? contentWidthMm : newTableWidthMm;
          return (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/30 select-none"
              role="dialog"
              aria-label="표 만들기"
              onClick={() => setShowTableModal(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-[540px] max-w-[95vw] bg-[#f7f8fa] border border-[#b6c2d2] rounded-xs shadow-2xl overflow-hidden font-sans text-neutral-800"
              >
                {/* 상단 타이틀 바 */}
                <div className="bg-[#eef3fa] border-b border-[#d6dde8] px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-neutral-800">표 만들기</span>
                  <button
                    type="button"
                    onClick={() => setShowTableModal(false)}
                    className="text-neutral-500 hover:text-neutral-900 text-sm leading-none p-0.5 cursor-pointer"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>

                {/* 본문: 좌측 설정 영역 + 우측 만들기/취소 버튼 */}
                <div className="p-4 flex gap-3.5 items-start">
                  <div className="flex-1 bg-white border border-[#dfe5ee] rounded-xs p-4 flex flex-col gap-4">
                    {/* 1. 줄/칸 */}
                    <div>
                      <div className="text-xs font-bold text-[#1e4fa8] mb-2">줄/칸</div>
                      <div className="flex flex-col gap-2 pl-2 text-xs text-neutral-700">
                        <div className="flex items-center gap-3">
                          <span className="w-16 text-neutral-600">줄 개수</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={newTableRows}
                            onChange={(e) => setNewTableRows(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                            className="w-28 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-xs text-neutral-900 outline-none focus:border-[#1e4fa8]"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="w-16 text-neutral-600">칸 개수</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={newTableCols}
                            onChange={(e) => setNewTableCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                            className="w-28 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-xs text-neutral-900 outline-none focus:border-[#1e4fa8]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 2. 크기 지정 */}
                    <div>
                      <div className="text-xs font-bold text-[#1e4fa8] mb-2">크기 지정</div>
                      <div className="flex flex-col gap-2 pl-2 text-xs text-neutral-700">
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-neutral-600">너비</span>
                          <select
                            value={newTableWidthMode}
                            onChange={(e) => {
                              const mode = e.target.value as "fit" | "custom";
                              setNewTableWidthMode(mode);
                              if (mode === "custom") setNewTableWidthMm(contentWidthMm);
                            }}
                            className="w-28 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-xs text-neutral-800 outline-none focus:border-[#1e4fa8] cursor-pointer"
                          >
                            <option value="fit">단에 맞춤</option>
                            <option value="custom">임의 값</option>
                          </select>
                          <div className={`flex items-center border rounded-xs px-2 py-1 w-28 ${newTableWidthMode === "fit" ? "bg-[#f5f7fa] border-[#e2e7ef] text-neutral-400" : "bg-white border-[#c5ceda] text-neutral-900"}`}>
                            <input
                              type="number"
                              step="0.1"
                              min={10}
                              max={contentWidthMm}
                              disabled={newTableWidthMode === "fit"}
                              value={displayWidthMm}
                              onChange={(e) => setNewTableWidthMm(Math.max(10, Math.min(contentWidthMm, Number(e.target.value) || 10)))}
                              className="w-full bg-transparent text-xs outline-none disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] ml-1 shrink-0">mm</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-neutral-600">높이</span>
                          <select
                            value={newTableHeightMode}
                            onChange={(e) => setNewTableHeightMode(e.target.value as "auto" | "custom")}
                            className="w-28 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-xs text-neutral-800 outline-none focus:border-[#1e4fa8] cursor-pointer"
                          >
                            <option value="auto">자동</option>
                            <option value="custom">임의 값</option>
                          </select>
                          <div className={`flex items-center border rounded-xs px-2 py-1 w-28 ${newTableHeightMode === "auto" ? "bg-[#f5f7fa] border-[#e2e7ef] text-neutral-400" : "bg-white border-[#c5ceda] text-neutral-900"}`}>
                            <input
                              type="number"
                              step="0.1"
                              min={5}
                              max={350}
                              disabled={newTableHeightMode === "auto"}
                              value={newTableHeightMm}
                              onChange={(e) => setNewTableHeightMm(Math.max(5, Math.min(350, Number(e.target.value) || 5)))}
                              className="w-full bg-transparent text-xs outline-none disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] ml-1 shrink-0">mm</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. 기타 */}
                    <div>
                      <div className="text-xs font-bold text-[#1e4fa8] mb-2">기타</div>
                      <label className="inline-flex items-center gap-2 pl-2 text-xs text-neutral-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newTableTreatAsChar}
                          onChange={(e) => setNewTableTreatAsChar(e.target.checked)}
                          className="rounded-xs border-[#c5ceda] accent-[#1e4fa8] cursor-pointer"
                        />
                        <span>글자처럼 취급</span>
                      </label>
                    </div>
                  </div>

                  {/* 우측 만들기 / 취소 버튼 */}
                  <div className="w-24 flex flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const widthPercent = newTableWidthMode === "fit"
                          ? 100
                          : Math.max(5, Math.min(100, Number(((newTableWidthMm / contentWidthMm) * 100).toFixed(2))));
                        const heightPt = newTableHeightMode === "custom"
                          ? Math.max(2, Number((newTableHeightMm / (25.4 / 72)).toFixed(2)))
                          : undefined;
                        addTable(newTableRows, newTableCols, selectedIdx, {
                          widthPercent,
                          heightPt,
                          treatAsChar: newTableTreatAsChar,
                        });
                      }}
                      className="w-full py-2 bg-white hover:bg-[#eef4fc] border border-[#c5ceda] rounded-xs text-xs font-medium text-neutral-800 shadow-2xs cursor-pointer transition-colors"
                    >
                      만들기
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTableModal(false)}
                      className="w-full py-2 bg-white hover:bg-neutral-100 border border-[#c5ceda] rounded-xs text-xs font-medium text-neutral-700 shadow-2xs cursor-pointer transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 한컴 표준 차트 만들기 모달 */}
        {showChartModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs select-none">
            <div className="bg-white border border-neutral-300 shadow-2xl rounded-sm flex flex-col w-[560px] max-w-[96vw] text-neutral-800 overflow-hidden font-sans">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#f0f4f9] border-b border-neutral-200">
                <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <ChartIcon className="w-4 h-4 text-[#0066cc]" />
                  <span>차트 만들기 (한컴 표준)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowChartModal(false)}
                  className="text-neutral-400 hover:text-neutral-700 text-sm cursor-pointer p-0.5"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    차트 제목
                  </label>
                  <input
                    type="text"
                    value={chartTitleInput}
                    onChange={(e) => setChartTitleInput(e.target.value)}
                    placeholder="차트 제목을 입력하세요..."
                    className="w-full bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#0066cc]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-2">
                    차트 종류 선택
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        id: "column" as const,
                        name: "묶은 세로 막대형",
                        desc: "시간 경과 또는 범주 간의 데이터 크기를 세로 막대로 직관적으로 비교합니다.",
                        icon: (
                          <svg className="w-8 h-8 text-[#0066cc]" viewBox="0 0 40 40" fill="currentColor">
                            <rect x="6" y="16" width="6" height="20" rx="1" fill="#2563eb" />
                            <rect x="14" y="8" width="6" height="28" rx="1" fill="#10b981" />
                            <rect x="22" y="20" width="6" height="16" rx="1" fill="#2563eb" />
                            <rect x="30" y="12" width="6" height="24" rx="1" fill="#10b981" />
                          </svg>
                        ),
                      },
                      {
                        id: "bar" as const,
                        name: "가로 막대형",
                        desc: "항목별 순위나 긴 레이블의 수치 비교에 적합합니다.",
                        icon: (
                          <svg className="w-8 h-8 text-[#10b981]" viewBox="0 0 40 40" fill="currentColor">
                            <rect x="4" y="6" width="22" height="6" rx="1" fill="#2563eb" />
                            <rect x="4" y="14" width="30" height="6" rx="1" fill="#10b981" />
                            <rect x="4" y="22" width="18" height="6" rx="1" fill="#2563eb" />
                            <rect x="4" y="30" width="26" height="6" rx="1" fill="#10b981" />
                          </svg>
                        ),
                      },
                      {
                        id: "line" as const,
                        name: "꺾은선형",
                        desc: "시간의 흐름에 따른 연속적인 추세 및 변화 경향을 파악할 때 유용합니다.",
                        icon: (
                          <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 30 L16 16 L26 22 L34 8" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="6" cy="30" r="2.5" fill="#2563eb" />
                            <circle cx="16" cy="16" r="2.5" fill="#2563eb" />
                            <circle cx="26" cy="22" r="2.5" fill="#2563eb" />
                            <circle cx="34" cy="8" r="2.5" fill="#2563eb" />
                          </svg>
                        ),
                      },
                      {
                        id: "pie" as const,
                        name: "원형 (파이 차트)",
                        desc: "전체에 대한 각 항목의 백분율 비율과 구성 비중을 한눈에 표시합니다.",
                        icon: (
                          <svg className="w-8 h-8" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="16" fill="#3b82f6" />
                            <path d="M20 20 L20 4 A16 16 0 0 1 36 20 Z" fill="#10b981" />
                            <path d="M20 20 L36 20 A16 16 0 0 1 20 36 Z" fill="#f59e0b" />
                          </svg>
                        ),
                      },
                    ].map((type) => (
                      <div
                        key={type.id}
                        onClick={() => setSelectedChartType(type.id)}
                        className={`p-3 rounded-lg border-2 cursor-pointer flex items-center gap-3 transition-all ${selectedChartType === type.id
                          ? "border-[#0066cc] bg-blue-50/50 shadow-xs"
                          : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                          }`}
                      >
                        <div className="shrink-0 p-1 bg-white rounded border border-neutral-200 shadow-2xs">
                          {type.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-neutral-900 flex items-center justify-between">
                            <span>{type.name}</span>
                            {selectedChartType === type.id && (
                              <span className="text-[10px] text-[#0066cc] font-bold">선택됨 ✓</span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 line-clamp-2 mt-0.5 leading-tight">
                            {type.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded border border-neutral-200 leading-relaxed">
                  💡 삽입된 차트는 본문에서 자유롭게 크기 조절, 드래그 이동, 차트 종류 변경 및 <strong>[데이터 편집]</strong>을 통해 수치를 언제든지 수정할 수 있습니다.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-4 py-3 bg-[#f8fafc] border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowChartModal(false)}
                  className="px-4 py-1.5 rounded text-xs text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 cursor-pointer font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => insertChart(selectedChartType, chartTitleInput)}
                  className="px-4 py-1.5 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer shadow-xs"
                >
                  차트 만들기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 한컴 표준 차트 데이터 편집 모달 */}
        {showChartDataModal && chartEditingIdx !== null && blocks[chartEditingIdx] && blocks[chartEditingIdx].type === "chart" && (() => {
          const chart = blocks[chartEditingIdx] as HwpxChartBlock;
          return (
            <div key={`chart-data-${chart.id}-${chartEditingIdx}`} className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs select-none">
              <div className="bg-white border border-neutral-300 shadow-2xl rounded-sm flex flex-col w-[600px] max-w-[96vw] max-h-[90vh] text-neutral-800 overflow-hidden font-sans">
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#f0f4f9] border-b border-neutral-200">
                  <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <ChartIcon className="w-4 h-4 text-[#0066cc]" />
                    <span>차트 데이터 편집 - {chart.title || "차트"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowChartDataModal(false)}
                    className="text-neutral-400 hover:text-neutral-700 text-sm cursor-pointer p-0.5"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      차트 제목
                    </label>
                    <input
                      type="text"
                      defaultValue={chart.title || ""}
                      id="hwpx-chart-edit-title"
                      className="w-full bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#0066cc]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      범주 (가로축 항목들, 쉼표로 구분)
                    </label>
                    <input
                      type="text"
                      defaultValue={(chart.categories || []).join(", ")}
                      id="hwpx-chart-edit-categories"
                      className="w-full bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#0066cc]"
                      placeholder="1분기, 2분기, 3분기, 4분기"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-2">
                      데이터 계열 (수치, 쉼표로 구분)
                    </label>
                    <div className="flex flex-col gap-2">
                      {(chart.series || []).map((s, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2 p-2 bg-neutral-50 rounded border border-neutral-200">
                          <input
                            type="color"
                            defaultValue={s.color || "#2563eb"}
                            id={`hwpx-chart-edit-color-${sIdx}`}
                            className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                            title="계열 색상"
                          />
                          <input
                            type="text"
                            defaultValue={s.name}
                            id={`hwpx-chart-edit-name-${sIdx}`}
                            placeholder="계열 이름"
                            className="w-24 bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-900"
                          />
                          <input
                            type="text"
                            defaultValue={s.values.join(", ")}
                            id={`hwpx-chart-edit-vals-${sIdx}`}
                            placeholder="값들 (예: 10, 20, 30, 40)"
                            className="flex-1 bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-900 font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3 bg-[#f8fafc] border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setShowChartDataModal(false)}
                    className="px-4 py-1.5 rounded text-xs text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 cursor-pointer font-medium"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const titleEl = document.getElementById("hwpx-chart-edit-title") as HTMLInputElement | null;
                      const catEl = document.getElementById("hwpx-chart-edit-categories") as HTMLInputElement | null;
                      const newTitle = titleEl?.value.trim() || chart.title;
                      const rawCats = catEl?.value || "";
                      const newCategories = rawCats.split(",").map((s) => s.trim()).filter(Boolean);

                      const newSeries = (chart.series || []).map((s, sIdx) => {
                        const colEl = document.getElementById(`hwpx-chart-edit-color-${sIdx}`) as HTMLInputElement | null;
                        const nameEl = document.getElementById(`hwpx-chart-edit-name-${sIdx}`) as HTMLInputElement | null;
                        const valsEl = document.getElementById(`hwpx-chart-edit-vals-${sIdx}`) as HTMLInputElement | null;
                        const sColor = colEl?.value || s.color;
                        const sName = nameEl?.value.trim() || s.name;
                        const rawVals = valsEl?.value || "";
                        const sVals = rawVals.split(",").map((v) => Number(v.trim()) || 0);
                        return { name: sName, values: sVals, color: sColor };
                      });

                      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                      const yBlock = yBlocks.get(chartEditingIdx);
                      if (yBlock) {
                        doc.transact(() => {
                          yBlock.set("title", newTitle);
                          yBlock.set("categories", newCategories);
                          yBlock.set("series", newSeries);
                        });
                      }
                      setShowChartDataModal(false);
                      showToast("차트 데이터가 성공적으로 업데이트되었습니다.");
                    }}
                    className="px-4 py-1.5 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer shadow-xs"
                  >
                    적용하기
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 한컴독스 표준 찾기 모달 (Ctrl+F) */}
        {showSearchModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/25" onClick={() => setShowSearchModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-white rounded-xs shadow-2xl border border-[#4a89dc] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
            >
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">찾기</span>
                <button type="button" onClick={() => setShowSearchModal(false)} className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer">✕</button>
              </div>
              <div className="p-4 flex items-start gap-3 bg-[#f8fafc] text-[12px]">
                <div className="flex-1 border border-[#c8d3e2] rounded-xs p-3.5 bg-white shadow-2xs flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-neutral-800">찾을 내용</span>
                    <input
                      type="text"
                      autoFocus
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchNext()}
                      className="flex-1 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-[12px] text-neutral-900 outline-none focus:border-[#1e4fa8]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-[#1e4fa8]">찾을 방향</span>
                    <div className="flex items-center gap-4 pl-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="findDir" checked={searchDirection === "down"} onChange={() => setSearchDirection("down")} className="accent-[#0066cc]" />
                        <span>아래로</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="findDir" checked={searchDirection === "up"} onChange={() => setSearchDirection("up")} className="accent-[#0066cc]" />
                        <span>위로</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="findDir" checked={searchDirection === "all"} onChange={() => setSearchDirection("all")} className="accent-[#0066cc]" />
                        <span>문서 전체</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="w-22 shrink-0 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={!searchKeyword.trim()}
                    onClick={handleSearchNext}
                    className="w-full h-8 border-2 border-[#4a89dc] bg-white hover:bg-neutral-50 text-neutral-900 text-[12px] font-medium rounded-xs cursor-pointer disabled:opacity-40 shadow-2xs"
                  >
                    다음 찾기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSearchModal(false)}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer shadow-2xs"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 한글 문자표(특수문자) 모달 */}
        {showSymbolModal && (() => {
          const activeCat = CHAR_MAP_CATEGORIES.find((c) => c.name === symbolCategory) || CHAR_MAP_CATEGORIES[0];
          const commitSymbols = (val: string) => {
            if (!val) return;
            insertSymbol(val);
            setSymbolInputText("");
          };
          return (
            <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/30 backdrop-blur-[1px] select-none" onClick={() => setShowSymbolModal(false)}>
              <div className="bg-white border border-blue-400 shadow-2xl rounded-xs w-[680px] max-w-[95vw] flex flex-col overflow-hidden text-neutral-800 font-sans" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#f4f7fb] border-b border-neutral-200">
                  <span className="text-[13px] font-bold text-neutral-900 tracking-tight">문자표</span>
                  <button type="button" onClick={() => setShowSymbolModal(false)} className="text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded hover:bg-neutral-200/60 cursor-pointer">✕</button>
                </div>
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 border border-neutral-200 rounded p-3 bg-white flex flex-col gap-3">
                    <div className="flex gap-3 h-[290px]">
                      {/* 좌측: 문자 영역 */}
                      <div className="w-44 flex flex-col gap-1 shrink-0">
                        <span className="text-xs font-bold text-[#0066cc]">문자 영역</span>
                        <div className="flex-1 border border-neutral-300 overflow-y-auto bg-white">
                          {CHAR_MAP_CATEGORIES.map((cat) => (
                            <button
                              key={cat.name}
                              type="button"
                              onClick={() => setSymbolCategory(cat.name)}
                              className={`w-full px-2.5 py-1 text-left text-xs cursor-pointer transition ${symbolCategory === cat.name ? "bg-neutral-300/80 text-neutral-900 font-medium" : "text-neutral-700 hover:bg-neutral-100"}`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* 우측: 문자 선택 + 최근 사용한 문자 */}
                      <div className="flex-1 flex flex-col gap-2 min-w-0">
                        <div className="flex-1 flex flex-col gap-1 min-h-0">
                          <span className="text-xs font-bold text-[#0066cc]">문자 선택</span>
                          <div className="flex-1 border border-neutral-300 p-1.5 overflow-y-auto bg-white">
                            <div className="grid grid-cols-11 gap-0.5 text-sm text-center">
                              {activeCat.chars.map((ch, idx) => (
                                <button
                                  key={`${activeCat.name}-${idx}-${ch}`}
                                  type="button"
                                  onClick={() => setSymbolInputText((prev) => prev + ch)}
                                  onDoubleClick={() => commitSymbols(ch)}
                                  title={`${ch} (클릭: 입력창 추가 / 더블클릭: 바로 넣기)`}
                                  className="h-7 flex items-center justify-center border border-neutral-200 hover:bg-blue-50 hover:border-blue-400 hover:text-[#0066cc] cursor-pointer transition"
                                >
                                  {ch}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <span className="text-xs font-bold text-[#0066cc]">최근 사용한 문자</span>
                          <div className="h-9 border border-neutral-300 px-1.5 flex items-center gap-1 overflow-x-auto bg-white">
                            {recentSymbols.length === 0 ? (
                              <span className="text-[11px] text-neutral-400 px-1">없음</span>
                            ) : (
                              recentSymbols.map((ch, idx) => (
                                <button
                                  key={`recent-${idx}-${ch}`}
                                  type="button"
                                  onClick={() => setSymbolInputText((prev) => prev + ch)}
                                  onDoubleClick={() => commitSymbols(ch)}
                                  className="w-7 h-7 shrink-0 flex items-center justify-center border border-neutral-200 hover:bg-blue-50 hover:text-[#0066cc] text-sm cursor-pointer"
                                >
                                  {ch}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* 하단: 입력 문자 */}
                    <div className="flex items-center gap-2.5 pt-1">
                      <span className="text-xs font-bold text-[#0066cc] shrink-0">입력 문자</span>
                      <input
                        type="text"
                        value={symbolInputText}
                        onChange={(e) => setSymbolInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && symbolInputText) { e.preventDefault(); commitSymbols(symbolInputText); }
                          if (e.key === "Escape") { e.preventDefault(); setShowSymbolModal(false); }
                        }}
                        className="flex-1 bg-white border border-neutral-300 rounded-xs px-2 py-1 text-xs outline-none focus:border-[#0066cc]"
                      />
                    </div>
                  </div>
                  {/* 우측 버튼: 넣기 / 취소 */}
                  <div className="w-24 flex flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={!symbolInputText}
                      onClick={() => commitSymbols(symbolInputText)}
                      className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-xs"
                    >
                      넣기
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSymbolModal(false)}
                      className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 hover:bg-neutral-100 transition cursor-pointer shadow-xs"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 수식 편집 / 삽입 모달 (한컴오피스 표준 스타일) */}
        {showEquationModal && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-5 rounded-xl flex flex-col gap-3.5 w-[540px] max-w-[95vw] text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2.5">
              <span className="flex items-center gap-1.5 text-sm text-[#0066cc]">
                <EquationIcon className="w-4 h-4" />
                <span>{editingEquationIdx !== null ? "수식 편집" : "새 수식 만들기"}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowEquationModal(false);
                  setEditingEquationIdx(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </h4>

            {/* 1. 빠른 수식 템플릿 팔레트 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-600">수식 템플릿:</span>
              <div className="flex flex-wrap gap-1">
                {HWPX_EQUATION_TEMPLATES.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setNewEquationScript((prev) => (prev ? `${prev} ${item.template}` : item.template))}
                    className="px-2 py-1 rounded border border-neutral-200 bg-neutral-50 hover:bg-blue-50 hover:border-blue-300 text-xs font-serif text-neutral-800 cursor-pointer transition flex items-center gap-1"
                    title={`${item.label} (${item.template})`}
                  >
                    <span className="font-bold text-[#0066cc]">{item.preview}</span>
                    <span className="text-[10px] text-neutral-500 font-sans">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 연산 기호 & 그리스 문자 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-600">기호 및 그리스 문자:</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 border border-neutral-200 rounded-md bg-neutral-50/50">
                {HWPX_OPERATOR_SYMBOLS.slice(0, 16).map((sym) => (
                  <button
                    key={sym.script}
                    type="button"
                    onClick={() => setNewEquationScript((prev) => (prev ? `${prev} ${sym.script}` : sym.script))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-neutral-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-xs font-serif text-neutral-800 cursor-pointer transition"
                    title={`${sym.label} (${sym.script})`}
                  >
                    {sym.symbol}
                  </button>
                ))}
                <div className="w-[1px] h-6 bg-neutral-300 my-auto mx-0.5" />
                {HWPX_GREEK_SYMBOLS.map((sym) => (
                  <button
                    key={sym.script}
                    type="button"
                    onClick={() => setNewEquationScript((prev) => (prev ? `${prev} ${sym.script}` : sym.script))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-neutral-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-xs font-serif text-neutral-800 cursor-pointer transition"
                    title={`${sym.label} (${sym.script})`}
                  >
                    {sym.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 스크립트 입력창 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-neutral-600">수식 스크립트 (한글 표준 수식 또는 LaTeX):</label>
                <span className="text-[10px] text-neutral-400 font-mono">예: f(x) = {"{x+1}"} over {"{x-1}"}</span>
              </div>
              <textarea
                autoFocus
                rows={2}
                value={newEquationScript}
                onChange={(e) => setNewEquationScript(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveEquation();
                  }
                }}
                placeholder="수식 스크립트 입력 (예: E = mc^2, sqrt {a^2 + b^2}, {a} over {b})..."
                className="bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#0066cc] font-mono leading-relaxed resize-none"
              />
            </div>

            {/* 4. 실시간 수식 렌더링 미리보기 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-600">실시간 수식 렌더링 미리보기:</span>
              <div className="min-h-[56px] max-h-36 overflow-auto bg-neutral-50/70 border border-neutral-200 rounded-lg p-3 flex items-center justify-center shadow-inner">
                <div
                  dangerouslySetInnerHTML={{ __html: parseHwpEquation(newEquationScript) }}
                  className="hwpx-rendered-equation-wrapper select-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2.5 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => {
                  setShowEquationModal(false);
                  setEditingEquationIdx(null);
                }}
                className="px-3.5 py-1.5 rounded text-xs text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEquation}
                className="px-4 py-1.5 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer shadow-xs"
              >
                {editingEquationIdx !== null ? "수식 변경 완료" : "수식 삽입하기"}
              </button>
            </div>
          </div>
        )}

        {/* 글자 모양 모달 (한컴독스 표준: 기본 + 확장 탭) */}
        {showCharShapeModal && (
          <CharShapeModal
            initial={{
              fontFamily: currentPara?.fontFamily || editorFonts[0]?.value || FONT_FAMILIES[0].value,
              sizePt: currentPara?.sizePt || 10,
              bold: Boolean(currentPara?.bold),
              italic: Boolean(currentPara?.italic),
              underline: Boolean(currentPara?.underline),
              strikethrough: Boolean(currentPara?.strikethrough),
              color: currentPara?.color || "#000000",
              shadingColor: currentPara?.shadingColor || "",
              relativeSizePct: currentPara?.relativeSizePct ?? 100,
              charWidthPct: currentPara?.charWidthPct ?? 100,
              charPosPct: currentPara?.charPosPct ?? 0,
              letterSpacingPct: currentPara?.letterSpacingPct ?? 0,
            }}
            editorFonts={editorFonts}
            onOpenAddFont={() => setShowAddFontModal(true)}
            onApply={(v) => {
              const targetBlockId = currentPara?.id;
              const applySpanStyle = (span: HTMLSpanElement) => {
                if (v.fontFamily) span.style.fontFamily = v.fontFamily;
                const effPt = (v.sizePt || 10) * ((v.relativeSizePct ?? 100) / 100);
                span.style.fontSize = `${Number(effPt.toFixed(2))}pt`;
                span.style.fontWeight = v.bold ? "bold" : "normal";
                span.style.fontStyle = v.italic ? "italic" : "normal";
                span.style.textDecoration =
                  [v.underline ? "underline" : "", v.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none";
                if (v.color) span.style.color = v.color;
                span.style.backgroundColor = v.shadingColor || "";
                span.style.letterSpacing = v.letterSpacingPct ? `${v.letterSpacingPct * 0.01}em` : "";
                if (v.charWidthPct && v.charWidthPct !== 100) {
                  span.style.display = "inline-block";
                  span.style.transform = `scaleX(${v.charWidthPct / 100})`;
                  span.style.transformOrigin = "left center";
                }
                if (v.charPosPct) {
                  span.style.position = "relative";
                  span.style.top = `${-v.charPosPct * 0.01}em`;
                }
                if (v.superscript) span.style.verticalAlign = "super";
                else if (v.subscript) span.style.verticalAlign = "sub";
              };

              restoreSelection();
              const sel = window.getSelection();
              const range =
                sel && sel.rangeCount > 0 && !sel.isCollapsed
                  ? sel.getRangeAt(0)
                  : lastSelectionRangeRef.current && !lastSelectionRangeRef.current.collapsed
                    ? lastSelectionRangeRef.current
                    : null;

              const crossSel = getCrossParagraphSelection();
              if (range && !crossSel) {
                const startEl =
                  range.startContainer.nodeType === Node.ELEMENT_NODE
                    ? (range.startContainer as HTMLElement)
                    : range.startContainer.parentElement;
                const pEl = startEl?.closest('[data-block-type="paragraph"] p') as HTMLElement | null;
                if (pEl && pEl.contains(range.commonAncestorContainer)) {
                  const span = document.createElement("span");
                  applySpanStyle(span);
                  span.appendChild(range.extractContents());
                  range.insertNode(span);
                  const newRange = document.createRange();
                  newRange.selectNodeContents(span);
                  sel?.removeAllRanges();
                  sel?.addRange(newRange);
                  lastSelectionRangeRef.current = newRange.cloneRange();
                  pEl.dispatchEvent(new Event("input", { bubbles: true }));
                  requestAnimationFrame(() => {
                    pEl.focus({ preventScroll: true });
                    pEl.scrollIntoView({ block: "nearest", inline: "nearest" });
                  });
                  return;
                }
              }

              if (crossSel) {
                // 문단 간 드래그 선택 시 각 문단의 선택 범위만 span으로 스타일 적용
                const root = canvasRef.current;
                if (root) {
                  for (let i = crossSel.startIdx; i <= crossSel.endIdx; i++) {
                    const pEl = root.querySelector<HTMLElement>(`[data-block-type="paragraph"] p[data-block-idx="${i}"]`);
                    if (!pEl) continue;
                    const textLen = (pEl.innerText || "").replace(/\r?\n$/, "").length;
                    const sOff = i === crossSel.startIdx ? crossSel.startOffset : 0;
                    const eOff = i === crossSel.endIdx ? crossSel.endOffset : textLen;
                    if (eOff <= sOff) continue;
                    const startPt = resolveNodeAndOffset(pEl, sOff);
                    const endPt = resolveNodeAndOffset(pEl, eOff);
                    const r = document.createRange();
                    r.setStart(startPt.node, startPt.offset);
                    r.setEnd(endPt.node, endPt.offset);
                    const span = document.createElement("span");
                    applySpanStyle(span);
                    span.appendChild(r.extractContents());
                    r.insertNode(span);
                  }
                  setIsCrossSelecting(false);
                }
                return;
              }

              updateParagraphStyle(selectedIdx, {
                fontFamily: v.fontFamily,
                sizePt: v.sizePt,
                bold: v.bold,
                italic: v.italic,
                underline: v.underline,
                strikethrough: v.strikethrough,
                color: v.color,
                shadingColor: v.shadingColor,
                relativeSizePct: v.relativeSizePct,
                charWidthPct: v.charWidthPct,
                charPosPct: v.charPosPct,
                letterSpacingPct: v.letterSpacingPct,
              });
              focusParagraphById(targetBlockId);
            }}
            onClose={() => setShowCharShapeModal(false)}
          />
        )}

        {/* 문단 모양 모달 (한컴독스 표준: 기본 + 테두리/배경 탭) */}
        {showParaShapeModal && (
          <ParaShapeModal
            initial={{
              align: currentPara?.align || "justify",
              marginLeftPt: currentPara?.marginLeftPt ?? 0,
              marginRightPt: currentPara?.marginRightPt ?? 0,
              firstLineType: currentPara?.firstLineType ?? "none",
              firstLinePt: currentPara?.firstLinePt ?? 0,
              lineSpacingPct: currentPara?.lineSpacingPct ?? 160,
              spaceBeforePt: currentPara?.spaceBeforePt ?? 0,
              spaceAfterPt: currentPara?.spaceAfterPt ?? 0,
              paraBorderType: currentPara?.paraBorderType || "없음",
              paraBorderWidth: currentPara?.paraBorderWidth || "0.1mm",
              paraBorderColor: currentPara?.paraBorderColor || "#000000",
              paraBgColor: currentPara?.paraBgColor || "",
            }}
            onApply={(v) => {
              const targetBlockId = currentPara?.id;
              updateParagraphStyle(selectedIdx, {
                align: v.align,
                marginLeftPt: v.marginLeftPt,
                marginRightPt: v.marginRightPt,
                firstLineType: v.firstLineType,
                firstLinePt: v.firstLinePt,
                lineSpacingPct: v.lineSpacingPct,
                spaceBeforePt: v.spaceBeforePt,
                spaceAfterPt: v.spaceAfterPt,
                paraBorderType: v.paraBorderType,
                paraBorderWidth: v.paraBorderWidth,
                paraBorderColor: v.paraBorderColor,
                paraBgColor: v.paraBgColor,
              });
              focusParagraphById(targetBlockId);
            }}
            onClose={() => setShowParaShapeModal(false)}
          />
        )}

        {/* 한컴독스 표준 찾아 바꾸기 모달 (Ctrl+H) */}
        {showReplaceModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/25" onClick={() => setShowReplaceModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[460px] bg-white rounded-xs shadow-2xl border border-[#4a89dc] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
            >
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">찾아 바꾸기</span>
                <button type="button" onClick={() => setShowReplaceModal(false)} className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer">✕</button>
              </div>
              <div className="p-4 flex items-start gap-3 bg-[#f8fafc] text-[12px]">
                <div className="flex-1 border border-[#c8d3e2] rounded-xs p-3.5 bg-white shadow-2xs flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-neutral-800">찾을 내용</span>
                    <input
                      type="text"
                      autoFocus
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="flex-1 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-[12px] text-neutral-900 outline-none focus:border-[#1e4fa8]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-neutral-800">바꿀 내용</span>
                    <input
                      type="text"
                      value={replaceKeyword}
                      onChange={(e) => setReplaceKeyword(e.target.value)}
                      className="flex-1 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-[12px] text-neutral-900 outline-none focus:border-[#1e4fa8]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="font-bold text-[#1e4fa8]">찾을 방향</span>
                    <div className="flex items-center gap-4 pl-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="replaceDir" checked={searchDirection === "down"} onChange={() => setSearchDirection("down")} className="accent-[#0066cc]" />
                        <span>아래로</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="replaceDir" checked={searchDirection === "up"} onChange={() => setSearchDirection("up")} className="accent-[#0066cc]" />
                        <span>위로</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="replaceDir" checked={searchDirection === "all"} onChange={() => setSearchDirection("all")} className="accent-[#0066cc]" />
                        <span>문서 전체</span>
                      </label>
                    </div>
                  </div>
                  {replaceMsg && (
                    <div className="text-[11px] text-[#0066cc] font-medium bg-blue-50 px-2 py-1 rounded-xs">
                      {replaceMsg}
                    </div>
                  )}
                </div>
                <div className="w-22 shrink-0 flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={!searchKeyword.trim()}
                    onClick={handleReplaceOne}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer disabled:opacity-40 shadow-2xs"
                  >
                    바꾸기
                  </button>
                  <button
                    type="button"
                    disabled={!searchKeyword.trim()}
                    onClick={handleSearchNext}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer disabled:opacity-40 shadow-2xs"
                  >
                    다음 찾기
                  </button>
                  <button
                    type="button"
                    disabled={!searchKeyword.trim()}
                    onClick={handleReplaceAll}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer disabled:opacity-40 shadow-2xs"
                  >
                    모두 바꾸기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReplaceModal(false)}
                    className="w-full h-8 border-2 border-[#4a89dc] bg-white hover:bg-neutral-50 text-neutral-900 text-[12px] font-medium rounded-xs cursor-pointer shadow-2xs"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 한컴독스 표준 문서 정보 대화상자 (100% 매칭) */}
        {showDocStatsModal && (
          <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowDocStatsModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xs shadow-2xl border border-[#4a89dc] w-full max-w-[580px] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
            >
              {/* 타이틀 바 */}
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">문서 정보</span>
                <button
                  type="button"
                  onClick={() => setShowDocStatsModal(false)}
                  className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              {/* 본문 영역: 좌측 정보 카드 + 우측 확인 버튼 */}
              <div className="p-4 flex items-start gap-3 bg-[#f8fafc]">
                <div className="flex-1 border border-[#c8d3e2] rounded-xs px-5 py-4 bg-white shadow-2xs flex flex-col gap-3 text-[12px]">
                  {/* 1. 파일명 / 마지막 저장한 날짜 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">파일명</span>
                      <span className="text-neutral-900 truncate">{docTitle}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">마지막 저장한 날짜</span>
                      <span className="text-neutral-900">{new Date().toLocaleString("ko-KR")}</span>
                    </div>
                  </div>

                  <div className="border-t border-neutral-200" />

                  {/* 2. 문서 버전 / 프로그램 버전 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">문서 버전</span>
                      <span className="text-neutral-900">5.1.1.0.6</span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">프로그램 버전</span>
                      <span className="text-neutral-900">12.90.0.1161</span>
                    </div>
                  </div>

                  <div className="border-t border-neutral-200" />

                  {/* 3. 글자(공백 포함) / 쪽 수 / 원고지(200자 기준) */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">글자(공백 포함)</span>
                      <span className="text-neutral-900">
                        {docStats.charCountWithSpace.toLocaleString()} 자
                        <span className="text-neutral-400 text-[11px] ml-2">
                          (공백 제외 {docStats.charCountNoSpace.toLocaleString()} 자 · {docStats.wordCount.toLocaleString()} 어절)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">쪽 수</span>
                      <span className="text-neutral-900">{Math.max(1, Math.ceil(blocks.length / 22))} 쪽</span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-[155px] shrink-0 font-bold text-[#1e4fa8]">원고지(200자 기준)</span>
                      <span className="text-neutral-900">{Math.max(1, Math.ceil(docStats.charCountWithSpace / 200))} 장</span>
                    </div>
                  </div>
                </div>

                {/* 우측 확인 버튼 */}
                <div className="w-22 shrink-0 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDocStatsModal(false)}
                    className="w-full h-8 border-2 border-[#4a89dc] bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-900 text-[12px] font-medium rounded-xs transition cursor-pointer text-center shadow-2xs"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 단축키 일람 모달 */}
        {showShortcutsModal && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-5 rounded-xl flex flex-col gap-3.5 w-96 max-h-[80vh] overflow-y-auto text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <ShortcutsIcon className="w-4 h-4 text-[#0066cc]" />
                <span>한컴오피스 한글 대표 단축키</span>
              </span>
              <button type="button" onClick={() => setShowShortcutsModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex flex-col gap-2 text-xs">
              <div className="font-bold text-neutral-900 text-[11px] bg-neutral-100 px-2 py-1 rounded">기본 편집</div>
              <div className="grid grid-cols-2 gap-1 px-1">
                <span className="text-neutral-600">저장하기:</span> <span className="font-mono font-semibold">Ctrl + S</span>
                <span className="text-neutral-600">실행 취소:</span> <span className="font-mono font-semibold">Ctrl + Z</span>
                <span className="text-neutral-600">다시 실행:</span> <span className="font-mono font-semibold">Ctrl + Y</span>
                <span className="text-neutral-600">모두 선택:</span> <span className="font-mono font-semibold">Ctrl + A</span>
                <span className="text-neutral-600">찾기 / 바꾸기:</span> <span className="font-mono font-semibold">Ctrl + F / H</span>
                <span className="text-neutral-600">인쇄:</span> <span className="font-mono font-semibold">Ctrl + P</span>
              </div>
              <div className="font-bold text-neutral-900 text-[11px] bg-neutral-100 px-2 py-1 rounded mt-1">서식 및 모양</div>
              <div className="grid grid-cols-2 gap-1 px-1">
                <span className="text-neutral-600">글자 모양:</span> <span className="font-mono font-semibold">Alt + L</span>
                <span className="text-neutral-600">문단 모양:</span> <span className="font-mono font-semibold">Alt + T</span>
                <span className="text-neutral-600">모양 복사:</span> <span className="font-mono font-semibold">Alt + C</span>
                <span className="text-neutral-600">진하게(굵게):</span> <span className="font-mono font-semibold">Ctrl + B</span>
                <span className="text-neutral-600">기울임:</span> <span className="font-mono font-semibold">Ctrl + I</span>
                <span className="text-neutral-600">밑줄:</span> <span className="font-mono font-semibold">Ctrl + U</span>
              </div>
              <div className="font-bold text-neutral-900 text-[11px] bg-neutral-100 px-2 py-1 rounded mt-1">삽입 및 개체</div>
              <div className="grid grid-cols-2 gap-1 px-1">
                <span className="text-neutral-600">문자표:</span> <span className="font-mono font-semibold">Ctrl + F10</span>
                <span className="text-neutral-600">표 만들기:</span> <span className="font-mono font-semibold">Ctrl + N, T</span>
                <span className="text-neutral-600">수식 삽입:</span> <span className="font-mono font-semibold">Ctrl + N, M</span>
                <span className="text-neutral-600">쪽 나누기:</span> <span className="font-mono font-semibold">Ctrl + Enter</span>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* 도움말 (?) 모달 */}
        {showHelpModal && (
          <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowHelpModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xs shadow-2xl border border-[#4a89dc] w-full max-w-[520px] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
            >
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#0066cc] text-white text-[10px] font-bold flex items-center justify-center">?</span>
                  <span>한컴오피스 Web 한글 도움말</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer transition"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 bg-[#f8fafc] flex flex-col gap-3 text-xs">
                <div className="bg-white border border-[#c8d3e2] rounded-xs p-3.5 flex flex-col gap-2.5">
                  <div>
                    <h5 className="font-bold text-[#1e4fa8] mb-1">1. 기본 편집 및 실시간 협업</h5>
                    <p className="text-neutral-600 leading-relaxed">
                      팀원들과 문서를 동시에 편집할 수 있으며 모든 변경 사항은 실시간으로 동기화됩니다. 저장(Ctrl+S)하거나 파일 메뉴에서 .hwpx / .pdf로 내보낼 수 있습니다.
                    </p>
                  </div>
                  <div className="border-t border-neutral-100 pt-2">
                    <h5 className="font-bold text-[#1e4fa8] mb-1">2. 용지 및 서식 설정</h5>
                    <p className="text-neutral-600 leading-relaxed">
                      편집 용지(F7)에서 A4·B5·신국판 등 19종 용지 규격과 여백·방향을 설정하고, 글자 모양(Alt+L)·문단 모양(Alt+T)으로 세밀한 조판 서식을 지정할 수 있습니다.
                    </p>
                  </div>
                  <div className="border-t border-neutral-100 pt-2">
                    <h5 className="font-bold text-[#1e4fa8] mb-1">3. 표 · 도형 · 수식 · 차트 개체 편집</h5>
                    <p className="text-neutral-600 leading-relaxed">
                      상단 리본에서 표, 도형, 그림, 수식, 차트를 삽입할 수 있으며, 개체 선택 시 나타나는 전용 도구 모음과 개체 속성(P)에서 크기·배치·테두리·캡션을 편집합니다.
                    </p>
                  </div>
                  <div className="border-t border-neutral-100 pt-2 flex items-center justify-between text-[11px] text-neutral-500">
                    <span>OWPML (.hwpx) 표준 포맷 호환</span>
                    <span>버전 12.90.0.1161</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHelpModal(false);
                      setShowShortcutsModal(true);
                    }}
                    className="px-3 py-1.5 rounded-xs text-xs border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 font-medium cursor-pointer"
                  >
                    단축키 안내 보기 (K)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHelpModal(false)}
                    className="px-4 py-1.5 rounded-xs text-xs border-2 border-[#4a89dc] bg-white hover:bg-neutral-50 text-neutral-900 font-medium cursor-pointer"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 한컴독스 표준 편집 용지 대화상자 (사용자 업로드 캡처 이미지 100% 매칭) */}
        {showPageSetupModal && (
          <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xs shadow-2xl border border-[#c8d3e2] w-full max-w-[620px] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150">
              {/* 타이틀 바 */}
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">편집 용지</span>
                <button
                  type="button"
                  onClick={() => setShowPageSetupModal(false)}
                  className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              {/* 본문 영역: 좌측 옵션 카드(메인) + 우측 확인/취소 버튼 */}
              <div className="p-4 flex items-start gap-3 bg-[#f8fafc]">
                {/* 좌측 옵션 카드 메인 테두리 박스 */}
                <div className="flex-1 border border-[#c8d3e2] rounded-xs p-4 flex flex-col gap-4 bg-white shadow-2xs">
                  {/* 1. 용지 종류 */}
                  <div className="flex flex-col gap-2.5">
                    <h5 className="text-[13px] font-bold text-[#1e4fa8]">용지 종류</h5>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-neutral-800 shrink-0 w-10">종류</span>
                      <select
                        value={draftPageSizeType}
                        onChange={(e) => handleDraftPageSizeTypeChange(e.target.value)}
                        className="flex-1 bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-[12px] text-neutral-900 outline-none focus:border-[#1e4fa8] cursor-pointer"
                      >
                        {Object.entries(HANCOM_PAPER_SIZES).map(([key, info]) => (
                          <option key={key} value={key}>
                            {info.label}
                          </option>
                        ))}
                        <option value="Custom">사용자 정의</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-6 pl-12 text-[12px] text-neutral-800">
                      <div className="flex items-center gap-2">
                        <span>폭</span>
                        <PageSetupNumberInput
                          value={draftPageWidthMm}
                          onChange={(val) => {
                            setDraftPageWidthMm(val);
                            setDraftPageSizeType("Custom");
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span>길이</span>
                        <PageSetupNumberInput
                          value={draftPageHeightMm}
                          onChange={(val) => {
                            setDraftPageHeightMm(val);
                            setDraftPageSizeType("Custom");
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. 용지 방향 & 제본 (2열 레이아웃) */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* 용지 방향 */}
                    <div className="flex flex-col gap-2.5">
                      <h5 className="text-[13px] font-bold text-[#1e4fa8]">용지 방향</h5>
                      <div className="flex items-center gap-2.5">
                        {/* 세로 (Portrait) */}
                        <button
                          type="button"
                          onClick={() => handleDraftOrientationChange("portrait")}
                          className={`w-10 h-11 border rounded-xs flex items-center justify-center cursor-pointer transition ${draftPageOrientation === "portrait"
                            ? "border-[#7b8ba5] bg-[#e2e6ee] shadow-2xs"
                            : "border-[#c5ceda] bg-white hover:bg-neutral-50"
                            }`}
                          title="세로 방향"
                        >
                          <div className="w-5 h-7 border border-neutral-600 bg-white flex flex-col justify-center gap-0.5 p-0.5 shadow-2xs">
                            <div className="w-full h-[1.5px] bg-neutral-400" />
                            <div className="w-full h-[1.5px] bg-neutral-400" />
                            <div className="w-full h-[1.5px] bg-neutral-400" />
                            <div className="w-2/3 h-[1.5px] bg-neutral-400" />
                          </div>
                        </button>
                        {/* 가로 (Landscape) */}
                        <button
                          type="button"
                          onClick={() => handleDraftOrientationChange("landscape")}
                          className={`w-11 h-10 border rounded-xs flex items-center justify-center cursor-pointer transition ${draftPageOrientation === "landscape"
                            ? "border-[#7b8ba5] bg-[#e2e6ee] shadow-2xs"
                            : "border-[#c5ceda] bg-white hover:bg-neutral-50"
                            }`}
                          title="가로 방향"
                        >
                          <div className="w-7 h-5 border border-neutral-600 bg-white flex flex-col justify-center gap-0.5 p-0.5 shadow-2xs">
                            <div className="w-full h-[1.5px] bg-neutral-400" />
                            <div className="w-full h-[1.5px] bg-neutral-400" />
                            <div className="w-2/3 h-[1.5px] bg-neutral-400" />
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* 제본 */}
                    <div className="flex flex-col gap-2.5">
                      <h5 className="text-[13px] font-bold text-[#1e4fa8]">제본</h5>
                      <div className="flex items-center gap-2">
                        {/* 한쪽 제본 */}
                        <button
                          type="button"
                          onClick={() => setDraftPageBindingType("left")}
                          className={`w-10 h-11 border rounded-xs flex items-center justify-center cursor-pointer transition ${draftPageBindingType === "left"
                            ? "border-[#7b8ba5] bg-[#e2e6ee] shadow-2xs"
                            : "border-[#c5ceda] bg-white hover:bg-neutral-50"
                            }`}
                          title="한쪽 제본"
                        >
                          <div className="w-5 h-7 border border-neutral-600 bg-white relative flex items-center justify-center shadow-2xs">
                            <div className="absolute left-0 inset-y-0 w-1 border-r border-dashed border-neutral-500" />
                            <span className="text-[10px] text-blue-600 font-bold ml-1 font-serif">가</span>
                          </div>
                        </button>

                        {/* 맞쪽 제본 */}
                        <button
                          type="button"
                          onClick={() => setDraftPageBindingType("spread")}
                          className={`w-11 h-11 border rounded-xs flex items-center justify-center cursor-pointer transition ${draftPageBindingType === "spread"
                            ? "border-[#7b8ba5] bg-[#e2e6ee] shadow-2xs"
                            : "border-[#c5ceda] bg-white hover:bg-neutral-50"
                            }`}
                          title="맞쪽 제본"
                        >
                          <div className="w-8 h-7 border border-neutral-600 bg-white relative flex items-center justify-between px-0.5 shadow-2xs">
                            <span className="text-[9px] text-blue-600 font-bold font-serif">가</span>
                            <div className="h-full w-[1px] bg-neutral-300" />
                            <span className="text-[9px] text-blue-600 font-bold font-serif">나</span>
                          </div>
                        </button>

                        {/* 위쪽 제본 */}
                        <button
                          type="button"
                          onClick={() => setDraftPageBindingType("top")}
                          className={`w-10 h-11 border rounded-xs flex items-center justify-center cursor-pointer transition ${draftPageBindingType === "top"
                            ? "border-[#7b8ba5] bg-[#e2e6ee] shadow-2xs"
                            : "border-[#c5ceda] bg-white hover:bg-neutral-50"
                            }`}
                          title="위쪽 제본"
                        >
                          <div className="w-5 h-7 border border-neutral-600 bg-white relative flex flex-col items-center justify-center shadow-2xs">
                            <div className="absolute top-0 inset-x-0 h-1 border-b border-dashed border-neutral-500" />
                            <span className="text-[10px] text-blue-600 font-bold mt-1 font-serif">가</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3. 용지 여백 */}
                  <div className="flex flex-col gap-2.5">
                    <h5 className="text-[13px] font-bold text-[#1e4fa8]">용지 여백</h5>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] text-neutral-800">
                      {/* 좌열: 위쪽, 왼쪽, 머리말, 제본 */}
                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">위쪽</span>
                        <PageSetupNumberInput
                          value={draftPageMarginTopMm}
                          onChange={(val) => setDraftPageMarginTopMm(val)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">아래쪽</span>
                        <PageSetupNumberInput
                          value={draftPageMarginBottomMm}
                          onChange={(val) => setDraftPageMarginBottomMm(val)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">왼쪽</span>
                        <PageSetupNumberInput
                          value={draftPageMarginLeftMm}
                          onChange={(val) => setDraftPageMarginLeftMm(val)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">오른쪽</span>
                        <PageSetupNumberInput
                          value={draftPageMarginRightMm}
                          onChange={(val) => setDraftPageMarginRightMm(val)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">머리말</span>
                        <PageSetupNumberInput
                          value={draftPageHeaderMm}
                          onChange={(val) => setDraftPageHeaderMm(val)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">꼬리말</span>
                        <PageSetupNumberInput
                          value={draftPageFooterMm}
                          onChange={(val) => setDraftPageFooterMm(val)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="w-12 shrink-0">제본</span>
                        <PageSetupNumberInput
                          value={draftPageGutterMm}
                          onChange={(val) => setDraftPageGutterMm(val)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. 구분선 & 적용 범위 */}
                  <div className="border-t border-[#e2e8f0] pt-3 flex items-center gap-3 text-[12px]">
                    <span className="text-neutral-800 shrink-0">적용 범위</span>
                    <select
                      value={draftPageApplyScope}
                      onChange={(e) => setDraftPageApplyScope(e.target.value)}
                      className="bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-[12px] text-neutral-800 outline-none focus:border-[#1e4fa8] cursor-pointer min-w-[120px]"
                    >
                      <option value="문서 전체">문서 전체</option>
                      <option value="현재 구역">현재 구역</option>
                    </select>
                  </div>
                </div>

                {/* 우측 확인 / 취소 버튼 스택 (캡처 이미지 100% 매칭) */}
                <div className="w-[88px] flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleApplyPageSetup}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-800 text-[13px] rounded-xs transition cursor-pointer text-center font-medium shadow-2xs"
                  >
                    확인
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPageSetupModal(false)}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-800 text-[13px] rounded-xs transition cursor-pointer text-center shadow-2xs"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 한컴오피스 / 한컴독스 표준 우클릭 컨텍스트 메뉴 (문단 일반/선택 & 개체) ── */}
        {contextMenu && (() => {
          if (contextMenu.blockType === "paragraph") {
            const hasSel = Boolean(contextMenu.hasSelection);
            const handleEraseSelection = () => {
              const crossSel = getCrossParagraphSelection();
              if (crossSel) {
                const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                const startBlock = blocks[crossSel.startIdx];
                const endBlock = blocks[crossSel.endIdx];
                if (startBlock && endBlock && startBlock.type === "paragraph" && endBlock.type === "paragraph") {
                  const mergedText = (startBlock.text || "").slice(0, crossSel.startOffset) + (endBlock.text || "").slice(crossSel.endOffset);
                  doc.transact(() => {
                    const yStart = yBlocks.get(crossSel.startIdx);
                    const yText = yStart?.get("text") as Y.Text | undefined;
                    if (yText) {
                      yText.delete(0, yText.length);
                      yText.insert(0, mergedText);
                    }
                    yBlocks.delete(crossSel.startIdx + 1, crossSel.endIdx - crossSel.startIdx);
                  });
                  pendingCaretRef.current = { mode: "offset", blockId: startBlock.id, offset: crossSel.startOffset };
                  setIsCrossSelecting(false);
                  setSelectedIdx(crossSel.startIdx);
                  return;
                }
              }
              restoreSelection();
              document.execCommand("delete");
              triggerActiveBlockInput();
            };
            return (
              <div
                data-context-menu="true"
                style={{
                  top: `${Math.min(contextMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - (hasSel ? 340 : 260))}px`,
                  left: `${Math.min(contextMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 240)}px`,
                }}
                className="fixed z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[230px] text-[12px] text-neutral-800 select-none animate-in fade-in duration-100 font-sans"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.preventDefault()}
              >
                {hasSel && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); handleCut(); }}
                      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <CutIcon className="w-4 h-4 text-neutral-600" />
                        <span>오려 두기</span>
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono">Ctrl+X</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); handleCopy(); }}
                      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <CopyIcon className="w-4 h-4 text-neutral-600" />
                        <span>복사하기</span>
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono">Ctrl+C</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const targetIdx = contextMenu.blockIdx;
                    setContextMenu(null);
                    void handlePaste(targetIdx);
                  }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <PasteIcon className="w-4 h-4 text-amber-600" />
                    <span>붙이기</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Ctrl+V</span>
                </button>

                {hasSel && (
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); handleEraseSelection(); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <EraserIcon className="w-4 h-4 text-neutral-600" />
                      <span>지우기</span>
                    </span>
                  </button>
                )}

                <div className="my-1 border-t border-neutral-200" />

                <button
                  type="button"
                  onClick={() => { setContextMenu(null); setShowCharShapeModal(true); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <CharShapeIcon className="w-4 h-4 text-blue-600" />
                    <span>글자 모양...</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Alt+L</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setContextMenu(null); setShowParaShapeModal(true); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <ParaShapeIcon className="w-4 h-4 text-blue-600" />
                    <span>문단 모양...</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Alt+T</span>
                </button>

                <div className="my-1 border-t border-neutral-200" />

                <button
                  type="button"
                  onClick={() => { setContextMenu(null); openHyperlinkModal(); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <HyperlinkIcon className="w-4 h-4 text-blue-600" />
                    <span>하이퍼링크...</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Ctrl+K+H</span>
                </button>

                <div className="my-1 border-t border-neutral-200" />

                <button
                  type="button"
                  onClick={() => {
                    const targetIdx = contextMenu.blockIdx;
                    setContextMenu(null);
                    addMemoToBlock(targetIdx);
                  }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <CommentIcon className="w-4 h-4 text-amber-500" />
                    <span>메모</span>
                  </span>
                </button>

                {!hasSel && (
                  <>
                    <div className="my-1 border-t border-neutral-200" />
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        showToast(`${currentPageNum}쪽 ${contextMenu.blockIdx + 1}번째 문단 위치를 공유했습니다.`);
                      }}
                      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="w-4 inline-block" />
                        <span>채팅 창에 현재 위치 공유</span>
                      </span>
                    </button>
                  </>
                )}
              </div>
            );
          }

          if (contextMenu.blockType === "table" && tableCellSelection?.blockIdx === contextMenu.blockIdx) {
            const { blockIdx: tblIdx, startRow, startCol, endRow, endCol } = tableCellSelection;
            const rMin = Math.min(startRow, endRow);
            const rMax = Math.max(startRow, endRow);
            const cMin = Math.min(startCol, endCol);
            const cMax = Math.max(startCol, endCol);
            const isMultiCell = rMin !== rMax || cMin !== cMax;

            const copySelectedCellsText = (cutAfter = false) => {
              const tbl = blocks[tblIdx];
              if (!tbl || tbl.type !== "table") return;
              const lines: string[] = [];
              for (let r = rMin; r <= rMax; r++) {
                const cols: string[] = [];
                for (let c = cMin; c <= cMax; c++) {
                  cols.push(tbl.rows[r]?.[c]?.text ?? "");
                }
                lines.push(cols.join("\t"));
              }
              void navigator.clipboard?.writeText(lines.join("\n"));
              if (cutAfter) {
                deleteSelected();
              }
            };

            const setSelectedCellsBg = (bgColor: string) => {
              const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
              const yBlock = yBlocks.get(tblIdx);
              const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
              if (!yRows) return;
              doc.transact(() => {
                for (let r = rMin; r <= rMax; r++) {
                  const yRow = yRows.get(r);
                  if (!yRow) continue;
                  for (let c = cMin; c <= cMax; c++) {
                    const yCell = yRow.get(c);
                    if (yCell) yCell.set("bgColor", bgColor);
                  }
                }
              });
            };

            const insertRowAt = (offset: 0 | 1) => {
              const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
              const yBlock = yBlocks.get(tblIdx);
              const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
              if (!yRows || yRows.length === 0) return;
              const colCount = yRows.get(0)?.length ?? 1;
              doc.transact(() => {
                const newRow = new Y.Array<Y.Map<unknown>>();
                for (let c = 0; c < colCount; c++) {
                  const yCell = new Y.Map<unknown>();
                  yCell.set("text", new Y.Text(""));
                  newRow.push([yCell]);
                }
                yRows.insert(Math.min(yRows.length, rMin + offset), [newRow]);
              });
            };

            const insertColAt = (offset: 0 | 1) => {
              const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
              const yBlock = yBlocks.get(tblIdx);
              const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
              if (!yRows) return;
              doc.transact(() => {
                for (let r = 0; r < yRows.length; r++) {
                  const yRow = yRows.get(r);
                  if (!yRow) continue;
                  const yCell = new Y.Map<unknown>();
                  yCell.set("text", new Y.Text(""));
                  yRow.insert(Math.min(yRow.length, cMin + offset), [yCell]);
                }
              });
            };

            const deleteCurrentRow = () => {
              const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
              const yBlock = yBlocks.get(tblIdx);
              const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
              if (!yRows || yRows.length <= 1) return;
              doc.transact(() => {
                yRows.delete(rMin, 1);
              });
              setTableCellSelection(null);
            };

            const deleteCurrentCol = () => {
              const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
              const yBlock = yBlocks.get(tblIdx);
              const yRows = yBlock?.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>> | undefined;
              if (!yRows || (yRows.get(0)?.length ?? 0) <= 1) return;
              doc.transact(() => {
                for (let r = 0; r < yRows.length; r++) {
                  const yRow = yRows.get(r);
                  if (yRow && cMin < yRow.length) yRow.delete(cMin, 1);
                }
              });
              setTableCellSelection(null);
            };

            return (
              <div
                data-context-menu="true"
                style={{
                  top: `${Math.min(contextMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 460)}px`,
                  left: `${Math.min(contextMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 250)}px`,
                }}
                className="fixed z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[240px] text-[12px] text-neutral-800 select-none animate-in fade-in duration-100 font-sans"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  type="button"
                  onClick={() => { copySelectedCellsText(true); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <CutIcon className="w-4 h-4 text-neutral-600" />
                    <span>오려 두기</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Ctrl+X</span>
                </button>
                <button
                  type="button"
                  onClick={() => { copySelectedCellsText(false); setContextMenu(null); showToast("선택한 셀을 복사했습니다."); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <CopyIcon className="w-4 h-4 text-neutral-600" />
                    <span>복사하기</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Ctrl+C</span>
                </button>
                <button
                  type="button"
                  onClick={() => { deleteSelected(); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left pl-9.5"
                >
                  <span>셀 지우기</span>
                </button>

                <div className="my-1 border-t border-neutral-200" />

                <button
                  type="button"
                  onClick={() => { setContextMenu(null); setShowCharShapeModal(true); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] font-semibold text-blue-600">가</span>
                    <span>글자 모양...</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Alt+L</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setContextMenu(null); setShowParaShapeModal(true); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] text-blue-600">≡</span>
                    <span>문단 모양...</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">Alt+T</span>
                </button>

                <div className="my-1 border-t border-neutral-200" />

                <button
                  type="button"
                  onClick={() => { openPropertyModal(tblIdx); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <TableIcon className="w-4 h-4 text-blue-600" />
                  <span>표/셀 속성...</span>
                </button>

                <div className="relative group/sub">
                  <button
                    type="button"
                    onClick={() => { openCellBorderBgModal(tblIdx, "border"); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left pl-9.5"
                  >
                    <span>셀 테두리/배경</span>
                    <span className="text-[10px] text-neutral-400">▸</span>
                  </button>
                  <div className="hidden group-hover/sub:block absolute left-full top-0 ml-0.5 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[165px] z-80">
                    <button
                      type="button"
                      onClick={() => {
                        openCellBorderBgModal(tblIdx, "border", "each");
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 text-neutral-800 cursor-pointer"
                    >
                      각 셀마다 적용...
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openCellBorderBgModal(tblIdx, "border", "single");
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 text-neutral-800 cursor-pointer"
                    >
                      하나의 셀처럼 적용...
                    </button>
                  </div>
                </div>

                <div className="my-1 border-t border-neutral-200" />

                <button
                  type="button"
                  onClick={() => { handleEqualizeTableCellHeights(contextMenu.blockIdx); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] text-blue-600">↕</span>
                    <span>셀 높이를 같게</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">H</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleEqualizeTableCellWidths(contextMenu.blockIdx); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] text-blue-600">↔</span>
                    <span>셀 너비를 같게</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">W</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleMergeTableCells(); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] text-blue-600">⊞</span>
                    <span>셀 합치기</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">M</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleSplitTableCell(); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-[11px] text-blue-600">⊟</span>
                    <span>셀 나누기...</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">S</span>
                </button>

                <div className="relative group/add">
                  <button
                    type="button"
                    disabled={isMultiCell}
                    className={`w-full px-3 py-1.5 flex items-center justify-between text-left ${isMultiCell ? "text-neutral-300 cursor-not-allowed" : "hover:bg-neutral-100 text-neutral-800 cursor-pointer"}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-4 text-center text-[11px]">＋</span>
                      <span>줄/칸 추가하기</span>
                    </span>
                    <span className="text-[10px]">▸</span>
                  </button>
                  {!isMultiCell && (
                    <div className="hidden group-hover/add:block absolute left-full top-0 ml-0.5 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] z-80">
                      <button type="button" onClick={() => { insertRowAt(0); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">위에 줄 추가</button>
                      <button type="button" onClick={() => { insertRowAt(1); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">아래에 줄 추가</button>
                      <button type="button" onClick={() => { insertColAt(0); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">왼쪽에 칸 추가</button>
                      <button type="button" onClick={() => { insertColAt(1); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">오른쪽에 칸 추가</button>
                    </div>
                  )}
                </div>

                <div className="relative group/del">
                  <button
                    type="button"
                    disabled={isMultiCell}
                    className={`w-full px-3 py-1.5 flex items-center justify-between text-left ${isMultiCell ? "text-neutral-300 cursor-not-allowed" : "hover:bg-neutral-100 text-neutral-800 cursor-pointer"}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-4 text-center text-[11px]">－</span>
                      <span>줄/칸 지우기</span>
                    </span>
                    <span className="text-[10px]">▸</span>
                  </button>
                  {!isMultiCell && (
                    <div className="hidden group-hover/del:block absolute left-full top-0 ml-0.5 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[120px] z-80">
                      <button type="button" onClick={() => { deleteCurrentRow(); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">줄 지우기</button>
                      <button type="button" onClick={() => { deleteCurrentCol(); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">칸 지우기</button>
                    </div>
                  )}
                </div>

                <div className="relative group/calc">
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left pl-9.5"
                  >
                    <span>블록 계산식</span>
                    <span className="text-[10px] text-neutral-400">▸</span>
                  </button>
                  <div className="hidden group-hover/calc:block absolute left-full top-0 ml-0.5 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[120px] z-80">
                    <button type="button" onClick={() => { handleTableCalc("sum"); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">블록 합계</button>
                    <button type="button" onClick={() => { handleTableCalc("avg"); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">블록 평균</button>
                  </div>
                </div>

                <div className="relative group/comma">
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-neutral-800 cursor-pointer text-left pl-9.5"
                  >
                    <span>1,000 단위 구분 쉼표</span>
                    <span className="text-[10px] text-neutral-400">▸</span>
                  </button>
                  <div className="hidden group-hover/comma:block absolute left-full top-0 ml-0.5 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[130px] z-80">
                    <button type="button" onClick={() => { handleTableCalc("comma-add"); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">자릿점 넣기</button>
                    <button type="button" onClick={() => { handleTableCalc("comma-remove"); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left hover:bg-neutral-100 cursor-pointer">자릿점 빼기</button>
                  </div>
                </div>
              </div>
            );
          }

          const targetBlock = blocks[contextMenu.blockIdx];
          const hasCaption = !!(
            targetBlock &&
            (("captionPos" in targetBlock && targetBlock.captionPos && targetBlock.captionPos !== "none") ||
              ("caption" in targetBlock && targetBlock.caption && targetBlock.caption.trim() !== ""))
          );
          const isShape = targetBlock?.type === "shape";
          const shapeHasText = isShape && !!((targetBlock as HwpxShapeBlock).text);

          return (
            <div
              data-context-menu="true"
              style={{
                top: `${Math.min(contextMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 340)}px`,
                left: `${Math.min(contextMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 220)}px`,
              }}
              className="fixed z-70 bg-white border border-neutral-300 shadow-2xl rounded-sm py-1 w-52 text-xs text-neutral-800 select-none animate-in fade-in duration-100 font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1. 오려 두기 (Ctrl+X) */}
              <button
                type="button"
                onClick={() => {
                  cutBlockToBuffer(contextMenu.blockIdx);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <line x1="20" y1="4" x2="8.12" y2="15.88" />
                    <line x1="14.47" y1="14.48" x2="20" y2="20" />
                    <line x1="8.12" y1="8.12" x2="12" y2="12" />
                  </svg>
                  <span>오려 두기</span>
                </span>
                <span className="text-[11px] text-neutral-400 font-mono">Ctrl+X</span>
              </button>

              {/* 2. 복사하기 (Ctrl+C) */}
              <button
                type="button"
                onClick={() => {
                  copyBlockToBuffer(contextMenu.blockIdx);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="9" width="13" height="13" rx="1.5" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>복사하기</span>
                </span>
                <span className="text-[11px] text-neutral-400 font-mono">Ctrl+C</span>
              </button>

              {/* 3. 지우기 */}
              <button
                type="button"
                onClick={() => {
                  deleteBlock(contextMenu.blockIdx);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="16" rx="1" fill="#e0edff" stroke="#3b82f6" strokeWidth="1.5" />
                    <line x1="3" y1="10" x2="21" y2="10" stroke="#3b82f6" strokeWidth="1" />
                    <line x1="10" y1="4" x2="10" y2="20" stroke="#3b82f6" strokeWidth="1" />
                    <path d="M14 13l6 6m0-6l-6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>지우기</span>
                </span>
              </button>

              <div className="h-[1px] bg-neutral-200 my-1 mx-2" />

              {/* 4. 순서 ▶ (서브메뉴: 맨 앞으로, 앞으로, 뒤로, 맨 뒤로) */}
              <div className="relative group/order">
                <div className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer">
                  <span className="flex items-center gap-2 pl-6">
                    <span>순서</span>
                  </span>
                  <span className="text-[10px] text-neutral-400">▶</span>
                </div>
                {/* 우측 호버 서브메뉴 */}
                <div className="hidden group-hover/order:block absolute left-full top-0 -ml-1 bg-white border border-neutral-300 shadow-2xl rounded-sm py-1 w-32 z-80 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      reorderBlock(contextMenu.blockIdx, "front");
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#ebf3fb] cursor-pointer text-neutral-800"
                  >
                    맨 앞으로
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reorderBlock(contextMenu.blockIdx, "forward");
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#ebf3fb] cursor-pointer text-neutral-800"
                  >
                    앞으로
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reorderBlock(contextMenu.blockIdx, "backward");
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#ebf3fb] cursor-pointer text-neutral-800"
                  >
                    뒤로
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reorderBlock(contextMenu.blockIdx, "back");
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#ebf3fb] cursor-pointer text-neutral-800"
                  >
                    맨 뒤로
                  </button>
                </div>
              </div>

              <div className="h-[1px] bg-neutral-200 my-1 mx-2" />

              {/* 5. 캡션 넣기 */}
              <button
                type="button"
                disabled={hasCaption}
                onClick={() => {
                  if (hasCaption || contextMenu.blockType === "paragraph") return;
                  const autoText = getAutoCaptionText(contextMenu.blockIdx, contextMenu.blockType);
                  const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                  const yBlock = yBlocks.get(contextMenu.blockIdx);
                  if (yBlock) {
                    doc.transact(() => {
                      const existingCap = targetBlock && "caption" in targetBlock ? targetBlock.caption : "";
                      const nextCap = existingCap && existingCap.trim() ? existingCap : autoText;
                      yBlock.set("caption", nextCap);
                      const currentPos = targetBlock && "captionPos" in targetBlock ? targetBlock.captionPos : "";
                      yBlock.set("captionPos", currentPos && currentPos !== "none" ? currentPos : "bottom_center");
                    });
                  }
                  setContextMenu(null);
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left ${hasCaption
                  ? "text-neutral-300 cursor-not-allowed"
                  : "hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer"
                  }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="13" rx="1.5" stroke={hasCaption ? "#d1d5db" : "#4b5563"} strokeWidth="1.5" />
                  <text x="4" y="22" fill={hasCaption ? "#d1d5db" : "#2563eb"} fontSize="9" fontWeight="bold" fontFamily="sans-serif">A1</text>
                </svg>
                <span>캡션 넣기</span>
              </button>

              {/* 캡션 지우기 */}
              <button
                type="button"
                disabled={!hasCaption}
                onClick={() => {
                  if (!hasCaption) return;
                  const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                  const yBlock = yBlocks.get(contextMenu.blockIdx);
                  if (yBlock) {
                    doc.transact(() => {
                      yBlock.delete("caption");
                      yBlock.set("captionPos", "none");
                    });
                  }
                  setContextMenu(null);
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left pl-9 ${hasCaption
                  ? "hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer"
                  : "text-neutral-300 cursor-not-allowed"
                  }`}
              >
                <span>캡션 지우기</span>
              </button>

              {/* 6. 도형 안에 글자 넣기 */}
              <button
                type="button"
                disabled={!isShape}
                onClick={() => {
                  if (isShape) {
                    const currText = (targetBlock as HwpxShapeBlock).text || "도형 텍스트";
                    updateShapeBlock(contextMenu.blockIdx, { text: currText });
                    showToast("도형 안에 글자가 추가되었습니다.");
                  }
                  setContextMenu(null);
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left ${isShape
                  ? "hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer"
                  : "text-neutral-300 cursor-not-allowed"
                  }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="1" stroke={isShape ? "#3b82f6" : "#cbd5e1"} strokeWidth="1.2" strokeDasharray="2 2" fill={isShape ? "#eff6ff" : "#f8fafc"} />
                  <line x1="8" y1="9" x2="8" y2="15" stroke={isShape ? "#3b82f6" : "#cbd5e1"} strokeWidth="1.5" />
                </svg>
                <span>도형 안에 글자 넣기</span>
              </button>

              {/* 글상자 속성 없애기 */}
              <button
                type="button"
                disabled={!shapeHasText}
                onClick={() => {
                  if (shapeHasText) {
                    updateShapeBlock(contextMenu.blockIdx, { text: "" });
                  }
                  setContextMenu(null);
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left pl-9 ${shapeHasText
                  ? "hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer"
                  : "text-neutral-300 cursor-not-allowed"
                  }`}
              >
                <span>글상자 속성 없애기</span>
              </button>

              <div className="h-[1px] bg-neutral-200 my-1 mx-2" />

              {/* 7. 하이퍼링크... (Ctrl+K+H) */}
              <button
                type="button"
                onClick={() => {
                  openHyperlinkModal();
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ebf3fb] text-neutral-800 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3.6 9h16.8M3.6 15h16.8" />
                    <ellipse cx="12" cy="12" rx="4" ry="9" />
                    <path d="M10 14a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" stroke="#2563eb" strokeWidth="1.8" />
                  </svg>
                  <span>하이퍼링크...</span>
                </span>
                <span className="text-[11px] text-neutral-400 font-mono">Ctrl+K+H</span>
              </button>

              <div className="h-[1px] bg-neutral-200 my-1 mx-2" />

              {/* 8. 개체 속성... (P) */}
              <button
                type="button"
                onClick={() => {
                  openPropertyModal(contextMenu.blockIdx);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ebf3fb] text-neutral-900 font-normal cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="4" width="14" height="14" rx="1.5" stroke="#4b5563" strokeWidth="1.5" />
                    <path d="M8 16l4 4 8-9" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>개체 속성...</span>
                </span>
                <span className="text-[11px] text-neutral-500 font-mono">P</span>
              </button>
            </div>
          );
        })()}

        {/* ── 한컴오피스 / 한컴독스 표준 [표/셀 속성 / 그림 속성 / 도형 속성] 모달 ── */}
        {showPropertyModal && propertyTargetIdx !== null && blocks[propertyTargetIdx] && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs select-none">
            <div className="bg-white border border-neutral-300 shadow-2xl rounded-sm flex flex-col w-[640px] max-w-[96vw] max-h-[92vh] text-neutral-800 overflow-hidden font-sans">
              {/* 상단 윈도우 타이틀바 */}
              <div className="flex items-center justify-between px-3 py-2 bg-[#f0f4f9] border-b border-neutral-200">
                <span className="text-xs font-bold text-neutral-900">
                  {blocks[propertyTargetIdx]?.type === "table"
                    ? "표/셀 속성"
                    : blocks[propertyTargetIdx]?.type === "image"
                      ? "그림 개체 속성"
                      : "도형 개체 속성"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPropertyModal(false)}
                  className="text-neutral-400 hover:text-neutral-700 text-sm cursor-pointer p-0.5 leading-none"
                  title="닫기"
                >
                  ✕
                </button>
              </div>

              {/* 본문: 좌측 탭 및 내용 영역 + 우측 [확인], [취소] 버튼 영역 (한컴 고유 스타일) */}
              <div className="flex flex-1 min-h-[420px] overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-neutral-200 overflow-hidden">
                  {/* 상단 탭 바 */}
                  <div className="flex items-center gap-1 px-3 pt-2 bg-neutral-50/80 border-b border-neutral-200 text-xs shrink-0">
                    {[
                      { id: "basic" as const, label: "기본" },
                      { id: "margin" as const, label: "여백/캡션" },
                      ...(blocks[propertyTargetIdx]?.type === "table"
                        ? [
                            { id: "table" as const, label: "표" },
                            { id: "cell" as const, label: "셀" },
                          ]
                        : [
                            { id: "border" as const, label: "테두리" },
                            { id: "background" as const, label: "배경" },
                          ]),
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPropActiveTab(tab.id)}
                        className={`px-3 py-1 font-medium transition cursor-pointer border-b-2 text-xs ${propActiveTab === tab.id
                          ? "border-[#0066cc] text-[#0066cc] font-bold bg-white -mb-px border-t border-x border-neutral-200"
                          : "border-transparent text-neutral-600 hover:text-neutral-900"
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* 탭 내용 영역 */}
                  <div className="flex-1 p-4 overflow-y-auto text-xs flex flex-col gap-3.5">
                    {/* [1. 기본 탭 - 첨부 2번 이미지 100% 매칭] */}
                    {propActiveTab === "basic" && (
                      <div className="flex flex-col gap-3.5">
                        {/* 크기 */}
                        <div className="border border-neutral-200 rounded p-3 bg-white">
                          <span className="font-bold text-[#0066cc] block mb-2.5">크기</span>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-neutral-600">너비</span>
                              <select
                                value={propWidthType}
                                onChange={(e) => setPropWidthType(e.target.value as "고정값" | "비율")}
                                className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs outline-none"
                              >
                                <option value="고정값">고정값</option>
                                <option value="비율">비율</option>
                              </select>
                              <input
                                type="number"
                                step="0.1"
                                min="10"
                                max="300"
                                value={propWidthMm}
                                onChange={(e) => setPropWidthMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-neutral-600">높이</span>
                              <select
                                value={propHeightType}
                                onChange={(e) => setPropHeightType(e.target.value as "고정값")}
                                className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs outline-none"
                              >
                                <option value="고정값">고정값</option>
                              </select>
                              <input
                                type="number"
                                step="0.1"
                                min="5"
                                max="300"
                                value={propHeightMm}
                                onChange={(e) => setPropHeightMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                          </div>
                          <div className="mt-2.5">
                            <label className="flex items-center gap-1.5 cursor-pointer text-neutral-700">
                              <input
                                type="checkbox"
                                checked={propLockSize}
                                onChange={(e) => setPropLockSize(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>크기 고정</span>
                            </label>
                          </div>
                        </div>

                        {/* 위치 */}
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <span className="font-bold text-[#0066cc] block">위치</span>

                          {/* 글자처럼 취급 */}
                          <label className="flex items-center gap-1.5 cursor-pointer text-neutral-900 font-medium">
                            <input
                              type="checkbox"
                              checked={propTreatAsChar}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPropTreatAsChar(checked);
                                if (checked) setPropTextWrap("TOP_AND_BOTTOM");
                                else setPropTextWrap("IN_FRONT_OF_TEXT");
                              }}
                              className="accent-[#0066cc]"
                            />
                            <span>글자처럼 취급</span>
                          </label>

                          {/* 본문과의 배치 (4개 나비 아이콘) */}
                          <div className={`flex flex-col gap-1 mt-1 ${propTreatAsChar ? "opacity-40 pointer-events-none" : ""}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-neutral-600 text-[11px]">본문과의 배치</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-neutral-500 text-[11px]">본문 위치</span>
                                <select
                                  value={propTextPos}
                                  onChange={(e) => setPropTextPos(e.target.value as "양쪽" | "왼쪽" | "오른쪽")}
                                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none"
                                >
                                  <option value="양쪽">양쪽</option>
                                  <option value="왼쪽">왼쪽</option>
                                  <option value="오른쪽">오른쪽</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {[
                                { id: "SQUARE" as const, label: "어울림", symbol: "🦋" },
                                { id: "TOP_AND_BOTTOM" as const, label: "자리차지", symbol: "🦋" },
                                { id: "IN_FRONT_OF_TEXT" as const, label: "글 앞으로", symbol: "🦋" },
                                { id: "BEHIND_TEXT" as const, label: "글 뒤로", symbol: "🦋" },
                              ].map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setPropTextWrap(item.id)}
                                  className={`px-3 py-1.5 rounded border flex items-center gap-1 text-xs cursor-pointer transition ${propTextWrap === item.id
                                    ? "bg-blue-50 border-[#0066cc] text-[#0066cc] font-bold shadow-xs"
                                    : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                                    }`}
                                  title={item.label}
                                >
                                  <span>{item.symbol}</span>
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 가로 / 세로 기준 설정 */}
                          <div className={`grid grid-cols-1 gap-2 mt-1 ${propTreatAsChar ? "opacity-40 pointer-events-none" : ""}`}>
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-neutral-600">가로</span>
                              <select
                                value={propHorzRelTo}
                                onChange={(e) => setPropHorzRelTo(e.target.value as "단" | "문단" | "쪽")}
                                className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                              >
                                <option value="단">단</option>
                                <option value="문단">문단</option>
                                <option value="쪽">쪽</option>
                              </select>
                              <select
                                value={propHorzAlign}
                                onChange={(e) => setPropHorzAlign(e.target.value as "왼쪽" | "가운데" | "오른쪽")}
                                className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                              >
                                <option value="왼쪽">왼쪽</option>
                                <option value="가운데">가운데</option>
                                <option value="오른쪽">오른쪽</option>
                              </select>
                              <span className="text-neutral-500 text-[11px] ml-1">기준</span>
                              <input
                                type="number"
                                step="0.1"
                                value={propHorzOffsetMm}
                                onChange={(e) => setPropHorzOffsetMm(Number(e.target.value))}
                                className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-neutral-600">세로</span>
                              <select
                                value={propVertRelTo}
                                onChange={(e) => setPropVertRelTo(e.target.value as "문단" | "쪽")}
                                className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                              >
                                <option value="문단">문단</option>
                                <option value="쪽">쪽</option>
                              </select>
                              <select
                                value={propVertAlign}
                                onChange={(e) => setPropVertAlign(e.target.value as "위쪽" | "가운데" | "아래쪽")}
                                className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                              >
                                <option value="위쪽">위쪽</option>
                                <option value="가운데">가운데</option>
                                <option value="아래쪽">아래쪽</option>
                              </select>
                              <span className="text-neutral-500 text-[11px] ml-1">기준</span>
                              <input
                                type="number"
                                step="0.1"
                                value={propVertOffsetMm}
                                onChange={(e) => setPropVertOffsetMm(Number(e.target.value))}
                                className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                          </div>

                          {/* 하단 체크박스 3개 (글자처럼 취급 시 전부 비활성화) */}
                          <div className={`flex flex-col gap-1.5 mt-1 border-t border-neutral-100 pt-2 text-[11px] ${propTreatAsChar ? "text-neutral-400 opacity-50 pointer-events-none" : "text-neutral-700"}`}>
                            <label className={`flex items-center gap-1.5 ${propTreatAsChar ? "cursor-not-allowed" : "cursor-pointer"}`}>
                              <input
                                type="checkbox"
                                checked={propLimitToPage}
                                disabled={propTreatAsChar}
                                onChange={(e) => setPropLimitToPage(e.target.checked)}
                                className="accent-[#0066cc] disabled:opacity-50"
                              />
                              <span>쪽 영역 안으로 제한</span>
                            </label>
                            <label className={`flex items-center gap-1.5 ${propTreatAsChar || !propLimitToPage ? "opacity-50 text-neutral-400 cursor-not-allowed" : "cursor-pointer"}`}>
                              <input
                                type="checkbox"
                                checked={propAllowOverlap}
                                disabled={propTreatAsChar || !propLimitToPage}
                                onChange={(e) => setPropAllowOverlap(e.target.checked)}
                                className="accent-[#0066cc] disabled:opacity-50"
                              />
                              <span>서로 겹침 허용</span>
                            </label>
                            <label className={`flex items-center gap-1.5 ${propTreatAsChar || propTextWrap === "IN_FRONT_OF_TEXT" || propTextWrap === "BEHIND_TEXT" ? "opacity-50 text-neutral-400 cursor-not-allowed" : "cursor-pointer"}`}>
                              <input
                                type="checkbox"
                                checked={propKeepWithAnchor}
                                disabled={propTreatAsChar || propTextWrap === "IN_FRONT_OF_TEXT" || propTextWrap === "BEHIND_TEXT"}
                                onChange={(e) => setPropKeepWithAnchor(e.target.checked)}
                                className="accent-[#0066cc] disabled:opacity-50"
                              />
                              <span>개체와 조판 부호를 항상 같은 쪽에 놓기</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* [2. 여백/캡션 탭 - 첨부 3번 이미지 100% 매칭] */}
                    {propActiveTab === "margin" && (
                      <div className="flex flex-col gap-3.5">
                        {/* 바깥 여백 */}
                        <div className="border border-neutral-200 rounded p-3 bg-white">
                          <span className="font-bold text-[#0066cc] block mb-2.5">바깥 여백</span>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">왼쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propMarginLeftMm}
                                onChange={(e) => setPropMarginLeftMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">위쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propMarginTopMm}
                                onChange={(e) => setPropMarginTopMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">오른쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propMarginRightMm}
                                onChange={(e) => setPropMarginRightMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">아래쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propMarginBottomMm}
                                onChange={(e) => setPropMarginBottomMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                          </div>
                        </div>

                        {/* 캡션 */}
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-3">
                          <span className="font-bold text-[#0066cc] block">캡션</span>
                          <div className="flex items-start gap-5">
                            {/* 8방향 캡션 위치 버튼 그리드 */}
                            <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1.5 rounded border border-neutral-300 shrink-0">
                              {[
                                { id: "top_left", label: "#1 ⬉" },
                                { id: "top_center", label: "#1 ⬆" },
                                { id: "top_right", label: "⬈ #1" },
                                { id: "left_center", label: "#1 ⬅" },
                                { id: "none", label: "■" },
                                { id: "right_center", label: "➡ #1" },
                                { id: "bottom_left", label: "#1 ⬋" },
                                { id: "bottom_center", label: "#1 ⬇" },
                                { id: "bottom_right", label: "⬊ #1" },
                              ].map((btn) => (
                                <button
                                  key={btn.id}
                                  type="button"
                                  onClick={() => {
                                    setPropCaptionPos(btn.id);
                                    if (btn.id !== "none" && !propCaption.trim() && propertyTargetIdx !== null) {
                                      const blk = blocks[propertyTargetIdx];
                                      if (blk && (blk.type === "table" || blk.type === "image" || blk.type === "shape" || blk.type === "chart")) {
                                        setPropCaption(getAutoCaptionText(propertyTargetIdx, blk.type));
                                      }
                                    }
                                  }}
                                  className={`w-9 h-8 rounded text-[10px] font-mono flex items-center justify-center border cursor-pointer transition ${propCaptionPos === btn.id
                                    ? "bg-[#0066cc] text-white border-[#0066cc] font-bold"
                                    : "bg-white text-blue-700 border-neutral-300 hover:bg-neutral-50"
                                    }`}
                                  title={btn.id}
                                >
                                  {btn.label}
                                </button>
                              ))}
                            </div>

                            {/* 크기 및 간격 */}
                            {(() => {
                              const isCaptionNone = propCaptionPos === "none";
                              const isCaptionSide = propCaptionPos === "left_center" || propCaptionPos === "right_center";
                              const disableSize = isCaptionNone || !isCaptionSide;
                              const disableGap = isCaptionNone;
                              const disableExpandWidth = isCaptionNone || isCaptionSide;
                              const disableSingleLine = isCaptionNone;
                              return (
                                <div className="flex flex-col gap-2 flex-1">
                                  <div className={`flex items-center gap-2 ${disableSize ? "opacity-50 text-neutral-400" : ""}`}>
                                    <span className="w-24 text-neutral-600">크기</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      disabled={disableSize}
                                      value={propCaptionSizeMm}
                                      onChange={(e) => setPropCaptionSizeMm(Number(e.target.value))}
                                      className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs disabled:bg-neutral-100 disabled:text-neutral-400"
                                    />
                                    <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                                  </div>
                                  <div className={`flex items-center gap-2 ${disableGap ? "opacity-50 text-neutral-400" : ""}`}>
                                    <span className="w-24 text-neutral-600">개체와의 간격</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      disabled={disableGap}
                                      value={propCaptionGapMm}
                                      onChange={(e) => setPropCaptionGapMm(Number(e.target.value))}
                                      className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs disabled:bg-neutral-100 disabled:text-neutral-400"
                                    />
                                    <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                                  </div>
                                  <div className="flex flex-col gap-1 mt-1 text-[11px] text-neutral-700">
                                    <label className={`flex items-center gap-1.5 ${disableExpandWidth ? "opacity-50 text-neutral-400 cursor-not-allowed" : "cursor-pointer"}`}>
                                      <input
                                        type="checkbox"
                                        checked={propCaptionExpandWidth}
                                        disabled={disableExpandWidth}
                                        onChange={(e) => setPropCaptionExpandWidth(e.target.checked)}
                                        className="accent-[#0066cc] disabled:opacity-50"
                                      />
                                      <span>여백 부분까지 너비 확대</span>
                                    </label>
                                    <label className={`flex items-center gap-1.5 ${disableSingleLine ? "opacity-50 text-neutral-400 cursor-not-allowed" : "cursor-pointer"}`}>
                                      <input
                                        type="checkbox"
                                        checked={propCaptionSingleLine}
                                        disabled={disableSingleLine}
                                        onChange={(e) => setPropCaptionSingleLine(e.target.checked)}
                                        className="accent-[#0066cc] disabled:opacity-50"
                                      />
                                      <span>한 줄로 입력</span>
                                    </label>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* 캡션 텍스트 내용 */}
                          <div className={`flex flex-col gap-1 border-t border-neutral-100 pt-2 ${propCaptionPos === "none" ? "opacity-50" : ""}`}>
                            <span className="text-neutral-600 text-[11px]">캡션 내용 입력:</span>
                            <input
                              type="text"
                              disabled={propCaptionPos === "none"}
                              value={propCaption}
                              onChange={(e) => setPropCaption(e.target.value)}
                              placeholder="[그림/표 캡션 입력...]"
                              className="bg-neutral-50 border border-neutral-300 rounded px-2 py-1 text-xs outline-none focus:border-[#0066cc] disabled:bg-neutral-100 disabled:text-neutral-400"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* [3. 테두리 탭 - 첨부 4번 이미지 100% 매칭] */}
                    {propActiveTab === "border" && (
                      <>
                        {blocks[propertyTargetIdx]?.type === "table" && (
                          <div className="mb-2 px-2.5 py-1.5 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center justify-between">
                            <span>적용 범위: <strong>{propCellBorderScope === "merged" ? "하나의 셀처럼 적용" : "각 셀마다 적용"}</strong></span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => setPropCellBorderScope("each")} className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${propCellBorderScope === "each" ? "bg-blue-600 text-white" : "bg-white border border-blue-200 text-blue-700"}`}>각 셀</button>
                              <button type="button" onClick={() => setPropCellBorderScope("merged")} className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${propCellBorderScope === "merged" ? "bg-blue-600 text-white" : "bg-white border border-blue-200 text-blue-700"}`}>하나의 셀</button>
                            </div>
                          </div>
                        )}
                      <div className="flex flex-col gap-3.5">
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <span className="font-bold text-[#0066cc] block">테두리</span>
                          <div className="flex items-center gap-4">
                            <span className="w-12 text-neutral-600">종류</span>
                            <select
                              value={propBorderType}
                              onChange={(e) => setPropBorderType(e.target.value)}
                              className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-44"
                            >
                              <option value="SOLID">실선 ───────</option>
                              <option value="DASH">쇄선 ‑ ‑ ‑ ‑ ‑ ‑ ‑</option>
                              <option value="DOT">점선 ·················</option>
                              <option value="DOUBLE">이중실선 ═══════</option>
                              <option value="NONE">테두리 없음</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="w-12 text-neutral-600">굵기</span>
                            <select
                              value={propBorderThickness}
                              onChange={(e) => setPropBorderThickness(e.target.value)}
                              className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-44"
                            >
                              <option value="0.1mm">0.10mm ─</option>
                              <option value="0.12mm">0.12mm ──</option>
                              <option value="0.2mm">0.20mm ───</option>
                              <option value="0.3mm">0.30mm ━━━━</option>
                              <option value="0.5mm">0.50mm ━━━━━</option>
                              <option value="0.7mm">0.70mm ━━━━━━</option>
                              <option value="1.0mm">1.00mm ━━━━━━━━</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="w-12 text-neutral-600">색</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={propBorderColor.startsWith("#") ? propBorderColor : "#000000"}
                                onChange={(e) => setPropBorderColor(e.target.value)}
                                className="w-12 h-6 p-0 border border-neutral-300 rounded cursor-pointer"
                              />
                              <div className="flex items-center gap-1">
                                {["#000000", "#1F2937", "#2563EB", "#DC2626", "#059669", "#7C3AED"].map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setPropBorderColor(c)}
                                    style={{ backgroundColor: c }}
                                    className={`w-4 h-4 rounded-full border border-neutral-300 cursor-pointer ${propBorderColor === c ? "ring-2 ring-blue-500" : ""
                                      }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1">
                            <label className="flex items-center gap-2 cursor-pointer text-neutral-700">
                              <input
                                type="checkbox"
                                checked={propCellSpacingEnabled}
                                onChange={(e) => setPropCellSpacingEnabled(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>셀 간격</span>
                              <input
                                type="number"
                                step="0.1"
                                disabled={!propCellSpacingEnabled}
                                value={propCellSpacingMm}
                                onChange={(e) => setPropCellSpacingMm(Number(e.target.value))}
                                className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs disabled:opacity-40"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </label>
                          </div>
                        </div>

                        {/* 적용 위치 (5개 그리드 버튼) */}
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2">
                          <span className="font-bold text-[#0066cc] block">적용 위치</span>
                          <div className="flex items-center gap-2">
                            {[
                              { id: "all" as const, label: "모두", icon: "⊞" },
                              { id: "outer" as const, label: "바깥쪽", icon: "□" },
                              { id: "inner" as const, label: "안쪽", icon: "┼" },
                              { id: "none" as const, label: "없음", icon: "✕" },
                              { id: "custom" as const, label: "대각선", icon: "◸" },
                            ].map((pos) => (
                              <button
                                key={pos.id}
                                type="button"
                                onClick={() => setPropBorderTarget(pos.id)}
                                className={`w-10 h-10 rounded border flex flex-col items-center justify-center text-xs cursor-pointer transition ${propBorderTarget === pos.id
                                  ? "bg-blue-50 border-[#0066cc] text-[#0066cc] font-bold"
                                  : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                                  }`}
                                title={pos.label}
                              >
                                <span className="text-sm">{pos.icon}</span>
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-neutral-400 mt-2 border-t border-neutral-100 pt-2">
                            표 테두리는 [셀 간격]에 값을 입력해야 나타납니다.
                          </p>
                        </div>
                      </div>
                      </>
                    )}

                    {/* [4. 배경 탭 - 첨부 5번 이미지 100% 매칭] */}
                    {propActiveTab === "background" && (
                      <div className="flex flex-col gap-3.5">
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-3">
                          <span className="font-bold text-[#0066cc] block">채우기</span>

                          {/* 라디오: 색 채우기 없음 */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="fillType"
                              checked={propFillMode === "none"}
                              onChange={() => setPropFillMode("none")}
                              className="accent-[#0066cc]"
                            />
                            <span>색 채우기 없음</span>
                          </label>

                          {/* 라디오: 색 */}
                          <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="fillType"
                                checked={propFillMode === "color"}
                                onChange={() => setPropFillMode("color")}
                                className="accent-[#0066cc]"
                              />
                              <span>색</span>
                            </label>
                            <div className={`ml-6 flex flex-col gap-2 ${propFillMode !== "color" ? "opacity-40 pointer-events-none" : ""}`}>
                              <div className="flex items-center gap-4">
                                <span className="w-16 text-neutral-600">면 색</span>
                                <input
                                  type="color"
                                  value={propFillColor.startsWith("#") ? propFillColor : "#FFFFFF"}
                                  onChange={(e) => setPropFillColor(e.target.value)}
                                  className="w-16 h-6 p-0 border border-neutral-300 rounded cursor-pointer"
                                />
                                <div className="flex items-center gap-1">
                                  {["#FFFFFF", "#F1F5F9", "#EFF6FF", "#FEF3C7", "#DCFCE7", "#FCE7F3", "#E0E7FF"].map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setPropFillColor(c)}
                                      style={{ backgroundColor: c }}
                                      className={`w-5 h-5 rounded border border-neutral-300 cursor-pointer ${propFillColor === c ? "ring-2 ring-blue-500" : ""
                                        }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="w-16 text-neutral-600">무늬 색</span>
                                <input
                                  type="color"
                                  value={propPatternColor}
                                  onChange={(e) => setPropPatternColor(e.target.value)}
                                  className="w-16 h-6 p-0 border border-neutral-300 rounded cursor-pointer"
                                />
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="w-16 text-neutral-600">무늬 모양</span>
                                <select
                                  value={propPatternType}
                                  onChange={(e) => setPropPatternType(e.target.value)}
                                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-36"
                                >
                                  <option value="none">없음</option>
                                  <option value="horizontal">가로선</option>
                                  <option value="vertical">세로선</option>
                                  <option value="cross">격자 십자</option>
                                  <option value="diagonal_up">오른쪽 위 대각선</option>
                                  <option value="diagonal_down">오른쪽 아래 대각선</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* 그림 채우기 */}
                          <div className="border-t border-neutral-100 pt-3 flex flex-col gap-2">
                            <label className="flex items-center gap-2 cursor-pointer font-medium text-neutral-800">
                              <input
                                type="checkbox"
                                checked={propFillImageEnabled}
                                onChange={(e) => setPropFillImageEnabled(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>그림</span>
                            </label>
                            <div className={`ml-6 flex flex-col gap-2 ${!propFillImageEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                              <div className="flex items-center gap-2">
                                <span className="w-16 text-neutral-600">그림 파일</span>
                                <input
                                  type="text"
                                  readOnly
                                  value="그림 없음"
                                  className="bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 text-neutral-500 text-xs w-44"
                                />
                                <button
                                  type="button"
                                  className="px-2 py-0.5 rounded border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-xs"
                                >
                                  파일 선택
                                </button>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="w-16 text-neutral-600">채우기 유형</span>
                                <select
                                  value={propFillImageMode}
                                  onChange={(e) => setPropFillImageMode(e.target.value)}
                                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs"
                                >
                                  <option value="fit">크기에 맞추어</option>
                                  <option value="tile">바둑판식</option>
                                  <option value="center">가운데로</option>
                                </select>
                                <span className="text-neutral-600 ml-2">밝기</span>
                                <input
                                  type="number"
                                  value={propFillImageBrightness}
                                  onChange={(e) => setPropFillImageBrightness(Number(e.target.value))}
                                  className="w-14 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                                />
                                <span className="text-neutral-500 font-mono text-[11px]">%</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="w-16 text-neutral-600">그림 효과</span>
                                <select
                                  value={propFillImageEffect}
                                  onChange={(e) => setPropFillImageEffect(e.target.value)}
                                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs"
                                >
                                  <option value="none">효과 없음</option>
                                  <option value="grayscale">회색조(그레이스케일)</option>
                                  <option value="watermark">워터마크</option>
                                </select>
                                <span className="text-neutral-600 ml-2">대비</span>
                                <input
                                  type="number"
                                  value={propFillImageContrast}
                                  onChange={(e) => setPropFillImageContrast(Number(e.target.value))}
                                  className="w-14 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                                />
                                <span className="text-neutral-500 font-mono text-[11px]">%</span>
                              </div>
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-neutral-700 mt-1">
                                <input
                                  type="checkbox"
                                  checked={propFillImageWatermark}
                                  onChange={(e) => setPropFillImageWatermark(e.target.checked)}
                                  className="accent-[#0066cc]"
                                />
                                <span>워터마크 효과</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* [5. 표 탭 - 첨부 6번 이미지 100% 매칭] */}
                    {propActiveTab === "table" && blocks[propertyTargetIdx]?.type === "table" && (
                      <div className="flex flex-col gap-3.5">
                        {/* 여러 쪽 지원 */}
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <span className="font-bold text-[#0066cc] block">여러 쪽 지원</span>
                          <div className="flex items-center gap-3">
                            <span className="text-neutral-600">쪽 경계에서</span>
                            <div className="flex items-center gap-1">
                              {[
                                { id: "divide" as const, label: "나눔", icon: "⫴" },
                                { id: "cell_divide" as const, label: "셀 단위로 나눔", icon: "⫵" },
                                { id: "no_divide" as const, label: "나누지 않음", icon: "⊔" },
                              ].map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setPropTablePageBreak(item.id)}
                                  className={`px-3 py-1.5 rounded border text-xs cursor-pointer flex items-center gap-1.5 transition ${propTablePageBreak === item.id
                                    ? "bg-blue-50 border-[#0066cc] text-[#0066cc] font-bold"
                                    : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                                    }`}
                                  title={item.label}
                                >
                                  <span>{item.icon}</span>
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 mt-1 border-t border-neutral-100 pt-2 text-[11px] text-neutral-700">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={propRepeatHeader}
                                onChange={(e) => setPropRepeatHeader(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>제목 줄 자동 반복</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={propSplitBorderEnabled}
                                onChange={(e) => setPropSplitBorderEnabled(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>자동으로 나뉜 표의 경계선 설정</span>
                            </label>
                            {propSplitBorderEnabled && (
                              <div className="ml-5 grid grid-cols-3 gap-2 mt-1">
                                <select
                                  value={propSplitBorderType}
                                  onChange={(e) => setPropSplitBorderType(e.target.value)}
                                  className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                                >
                                  <option value="SOLID">실선 ───</option>
                                  <option value="DASH">점선 ····</option>
                                </select>
                                <select
                                  value={propSplitBorderThickness}
                                  onChange={(e) => setPropSplitBorderThickness(e.target.value)}
                                  className="bg-neutral-50 border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                                >
                                  <option value="0.1mm">0.10mm</option>
                                  <option value="0.2mm">0.20mm</option>
                                </select>
                                <input
                                  type="color"
                                  value={propSplitBorderColor}
                                  onChange={(e) => setPropSplitBorderColor(e.target.value)}
                                  className="w-12 h-6 p-0 border border-neutral-300 rounded"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 모든 셀의 안 여백 */}
                        <div className="border border-neutral-200 rounded p-3 bg-white">
                          <span className="font-bold text-[#0066cc] block mb-2.5">모든 셀의 안 여백</span>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">왼쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propCellPaddingLeftMm}
                                onChange={(e) => setPropCellPaddingLeftMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">위쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propCellPaddingTopMm}
                                onChange={(e) => setPropCellPaddingTopMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">오른쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propCellPaddingRightMm}
                                onChange={(e) => setPropCellPaddingRightMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-neutral-600">아래쪽</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={propCellPaddingBottomMm}
                                onChange={(e) => setPropCellPaddingBottomMm(Number(e.target.value))}
                                className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                              />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* [6. 셀 탭 - 한컴독스 표/셀 속성 셀 탭 매칭] */}
                    {propActiveTab === "cell" && blocks[propertyTargetIdx]?.type === "table" && (
                      <div className="flex flex-col gap-3.5">
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <label className="flex items-center gap-1.5 font-medium text-neutral-800 cursor-pointer">
                            <input type="checkbox" checked={propCellSizeEnabled} onChange={(e) => setPropCellSizeEnabled(e.target.checked)} className="accent-[#0066cc]" />
                            <span>셀 크기 적용</span>
                          </label>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-5">
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-neutral-600">너비</span>
                              <input type="number" step="0.1" min="1" disabled={!propCellSizeEnabled} value={propCellWidthMm} onChange={(e) => setPropCellWidthMm(Number(e.target.value))} className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs disabled:bg-neutral-100 disabled:text-neutral-400" />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-neutral-600">높이</span>
                              <input type="number" step="0.1" min="1" disabled={!propCellSizeEnabled} value={propCellHeightMm} onChange={(e) => setPropCellHeightMm(Number(e.target.value))} className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs disabled:bg-neutral-100 disabled:text-neutral-400" />
                              <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                            </div>
                          </div>
                        </div>
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <label className="flex items-center gap-1.5 font-medium text-neutral-800 cursor-pointer">
                            <input type="checkbox" checked={propCellPadEnabled} onChange={(e) => setPropCellPadEnabled(e.target.checked)} className="accent-[#0066cc]" />
                            <span>안 여백 지정</span>
                          </label>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-5">
                            {[
                              { label: "왼쪽", val: propCellPadLeftMm, set: setPropCellPadLeftMm },
                              { label: "위쪽", val: propCellPadTopMm, set: setPropCellPadTopMm },
                              { label: "오른쪽", val: propCellPadRightMm, set: setPropCellPadRightMm },
                              { label: "아래쪽", val: propCellPadBottomMm, set: setPropCellPadBottomMm },
                            ].map((item) => (
                              <div key={item.label} className="flex items-center gap-2">
                                <span className="w-10 text-neutral-600">{item.label}</span>
                                <input type="number" step="0.1" min="0" disabled={!propCellPadEnabled} value={item.val} onChange={(e) => item.set(Number(e.target.value))} className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs disabled:bg-neutral-100 disabled:text-neutral-400" />
                                <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <span className="font-bold text-[#0066cc] block">속성</span>
                          <div className="flex items-start gap-8">
                            <div className="flex flex-col gap-2 text-neutral-700">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={propCellProtect} onChange={(e) => setPropCellProtect(e.target.checked)} className="accent-[#0066cc]" />
                                <span>셀 보호</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={propCellHeader} onChange={(e) => setPropCellHeader(e.target.checked)} className="accent-[#0066cc]" />
                                <span>제목 셀</span>
                              </label>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-neutral-700">세로 정렬</span>
                              <div className="flex items-center gap-1.5">
                                {[
                                  { id: "top" as const, title: "위쪽 정렬", y1: 5, y2: 8 },
                                  { id: "middle" as const, title: "가운데 정렬", y1: 10, y2: 14 },
                                  { id: "bottom" as const, title: "아래쪽 정렬", y1: 16, y2: 19 },
                                ].map((al) => (
                                  <button
                                    key={al.id}
                                    type="button"
                                    title={al.title}
                                    onClick={() => setPropCellVertAlign(al.id)}
                                    className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer transition ${propCellVertAlign === al.id ? "bg-neutral-300/70 border-neutral-500" : "bg-white border-neutral-300 hover:bg-neutral-50"}`}
                                  >
                                    <svg className="w-4 h-4 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                                      <rect x="4" y="3" width="16" height="18" rx="0.5" />
                                      <line x1="7" y1={al.y1} x2="17" y2={al.y1} />
                                      <line x1="7" y1={al.y2} x2="14" y2={al.y2} />
                                    </svg>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2">
                          <span className="font-bold text-[#0066cc] block">필드</span>
                          <div className="flex flex-col gap-1">
                            <span className="text-neutral-700">필드 이름</span>
                            <input type="text" value={propCellFieldName} onChange={(e) => setPropCellFieldName(e.target.value)} className="w-full bg-white border border-neutral-300 rounded px-2 py-1 text-xs outline-none focus:border-[#0066cc]" />
                          </div>
                          <label className="flex items-center gap-1.5 cursor-pointer text-neutral-700 mt-0.5">
                            <input type="checkbox" checked={propCellEditableInForm} onChange={(e) => setPropCellEditableInForm(e.target.checked)} className="accent-[#0066cc]" />
                            <span>양식 모드에서 편집 가능</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 우측 상단 한컴오피스 고유 버튼 영역 ([확인], [취소] - 첨부 2~6번 동일 위치) */}
                <div className="w-28 p-3 bg-neutral-50/50 flex flex-col gap-2 shrink-0 border-l border-neutral-200">
                  <button
                    type="button"
                    onClick={saveProperties}
                    className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 font-normal hover:bg-neutral-100 hover:border-neutral-500 transition cursor-pointer shadow-xs"
                  >
                    확인
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPropertyModal(false)}
                    className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 font-normal hover:bg-neutral-100 hover:border-neutral-500 transition cursor-pointer shadow-xs"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 한컴오피스 / 한컴독스 표준 [셀 테두리/배경] 분리 모달 ── */}
        {showCellBorderBgModal && propertyTargetIdx !== null && blocks[propertyTargetIdx]?.type === "table" && (
          <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/30 backdrop-blur-[1px] select-none" onClick={() => setShowCellBorderBgModal(false)}>
            <div className="bg-white border border-blue-400 shadow-2xl rounded-xs w-[540px] max-w-[95vw] flex flex-col overflow-hidden text-neutral-800 font-sans" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#f4f7fb] border-b border-neutral-200">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">셀 테두리/배경</span>
                <button type="button" onClick={() => setShowCellBorderBgModal(false)} className="text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded hover:bg-neutral-200/60 cursor-pointer">✕</button>
              </div>
              <div className="flex flex-1 min-h-[380px] overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-neutral-200 overflow-hidden">
                  <div className="flex items-center gap-1 px-3 pt-2 bg-neutral-50/80 border-b border-neutral-200 text-xs shrink-0">
                    {[{ id: "border" as const, label: "테두리" }, { id: "background" as const, label: "배경" }, { id: "diagonal" as const, label: "대각선" }].map((tab) => (
                      <button key={tab.id} type="button" onClick={() => setCellBorderBgTab(tab.id)} className={`px-3 py-1 font-medium transition cursor-pointer border-b-2 text-xs ${cellBorderBgTab === tab.id ? "border-[#0066cc] text-[#0066cc] font-bold bg-white -mb-px border-t border-x border-neutral-200" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}>{tab.label}</button>
                    ))}
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto text-xs flex flex-col gap-3.5">
                    {cellBorderBgTab === "border" && (
                      <div className="flex flex-col gap-3.5">
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <span className="font-bold text-[#0066cc] block">테두리</span>
                          <div className="flex items-center gap-4"><span className="w-12 text-neutral-600">종류</span><select value={propBorderType} onChange={(e) => setPropBorderType(e.target.value)} className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-44"><option value="SOLID">실선 ──────</option><option value="DASH">파선 - - - - -</option><option value="DOT">점선 ········</option><option value="DOUBLE">이중선 ══════</option><option value="NONE">없음</option></select></div>
                          <div className="flex items-center gap-4"><span className="w-12 text-neutral-600">굵기</span><select value={propBorderThickness} onChange={(e) => setPropBorderThickness(e.target.value)} className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-44"><option value="0.1mm">0.10mm</option><option value="0.12mm">0.12mm (기본)</option><option value="0.2mm">0.20mm</option><option value="0.4mm">0.40mm</option><option value="0.7mm">0.70mm</option></select></div>
                          <div className="flex items-center gap-4"><span className="w-12 text-neutral-600">색</span><input type="color" value={propBorderColor} onChange={(e) => setPropBorderColor(e.target.value)} className="w-44 h-6 p-0.5 bg-white border border-neutral-300 rounded cursor-pointer" /></div>
                        </div>
                        <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-2.5">
                          <span className="font-bold text-[#0066cc] block">적용 위치</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              { id: "all" as const, title: "모든 테두리", outer: true, inner: true, disableSingle: true },
                              { id: "outer" as const, title: "바깥쪽", outer: true, inner: false, disableSingle: false },
                              { id: "inner" as const, title: "안쪽", outer: false, inner: true, disableSingle: true },
                              { id: "top" as const, title: "위쪽", top: true, disableSingle: false, gapLeft: true },
                              { id: "bottom" as const, title: "아래쪽", bottom: true, disableSingle: false },
                              { id: "left" as const, title: "왼쪽", left: true, disableSingle: false },
                              { id: "right" as const, title: "오른쪽", right: true, disableSingle: false },
                              { id: "h_inner" as const, title: "가로 안쪽", hInner: true, disableSingle: true, gapLeft: true },
                              { id: "v_inner" as const, title: "세로 안쪽", vInner: true, disableSingle: true },
                            ].map((item) => {
                              const isDisabled = cellBorderApplyMode === "single" && item.disableSingle;
                              const isActive = !isDisabled && propBorderTarget === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  disabled={isDisabled}
                                  title={item.title}
                                  onClick={() => setPropBorderTarget(item.id === "all" || item.id === "outer" || item.id === "inner" ? item.id : "custom")}
                                  className={`w-8 h-8 rounded border flex items-center justify-center transition ${item.gapLeft ? "ml-2" : ""} ${isDisabled ? "opacity-35 bg-neutral-50 border-neutral-200 cursor-not-allowed" : isActive ? "bg-blue-50 border-[#0066cc] cursor-pointer" : "bg-white border-neutral-300 hover:bg-neutral-50 cursor-pointer"}`}
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 18 18" fill="none">
                                    <rect x="2" y="2" width="14" height="14" stroke="#9ca3af" strokeWidth="1" strokeDasharray="1.5 1.5" />
                                    <line x1="9" y1="2" x2="9" y2="16" stroke="#9ca3af" strokeWidth="1" strokeDasharray="1.5 1.5" />
                                    <line x1="2" y1="9" x2="16" y2="9" stroke="#9ca3af" strokeWidth="1" strokeDasharray="1.5 1.5" />
                                    {item.outer && <rect x="2" y="2" width="14" height="14" stroke="#111827" strokeWidth="1.4" />}
                                    {item.inner && <><line x1="9" y1="2" x2="9" y2="16" stroke="#111827" strokeWidth="1.4" /><line x1="2" y1="9" x2="16" y2="9" stroke="#111827" strokeWidth="1.4" /></>}
                                    {item.top && <line x1="2" y1="2" x2="16" y2="2" stroke="#111827" strokeWidth="1.6" />}
                                    {item.bottom && <line x1="2" y1="16" x2="16" y2="16" stroke="#111827" strokeWidth="1.6" />}
                                    {item.left && <line x1="2" y1="2" x2="2" y2="16" stroke="#111827" strokeWidth="1.6" />}
                                    {item.right && <line x1="16" y1="2" x2="16" y2="16" stroke="#111827" strokeWidth="1.6" />}
                                    {item.hInner && <line x1="2" y1="9" x2="16" y2="9" stroke="#111827" strokeWidth="1.6" />}
                                    {item.vInner && <line x1="9" y1="2" x2="9" y2="16" stroke="#111827" strokeWidth="1.6" />}
                                  </svg>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    {cellBorderBgTab === "background" && (
                      <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-3">
                        <span className="font-bold text-[#0066cc] block">채우기</span>
                        <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="cellFillMode" checked={propFillMode === "none"} onChange={() => setPropFillMode("none")} className="accent-[#0066cc]" /><span>색 채우기 없음</span></label>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="cellFillMode" checked={propFillMode === "color"} onChange={() => setPropFillMode("color")} className="accent-[#0066cc]" /><span>색</span></label>
                          <div className={`pl-6 flex flex-col gap-2 ${propFillMode !== "color" ? "opacity-50 pointer-events-none" : ""}`}>
                            <div className="flex items-center gap-3"><span className="w-12 text-neutral-600">면 색</span><input type="color" value={propFillColor} onChange={(e) => setPropFillColor(e.target.value)} className="w-24 h-6 p-0.5 bg-white border border-neutral-300 rounded cursor-pointer" /></div>
                          </div>
                        </div>
                      </div>
                    )}
                    {cellBorderBgTab === "diagonal" && (
                      <div className="border border-neutral-200 rounded p-3 bg-white flex flex-col gap-3">
                        <span className="font-bold text-[#0066cc] block">대각선</span>
                        <div className="flex items-center gap-4"><span className="w-12 text-neutral-600">종류</span><select value={cellDiagType} onChange={(e) => setCellDiagType(e.target.value)} className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-44"><option value="SOLID">실선 ──────</option><option value="DASH">파선 - - - - -</option><option value="DOT">점선 ········</option></select></div>
                        <div className="flex items-center gap-4"><span className="w-12 text-neutral-600">굵기</span><select value={cellDiagThickness} onChange={(e) => setCellDiagThickness(e.target.value)} className="bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 text-xs outline-none w-44"><option value="0.1mm">0.10mm</option><option value="0.2mm">0.20mm</option><option value="0.4mm">0.40mm</option></select></div>
                        <div className="flex items-center gap-4"><span className="w-12 text-neutral-600">색</span><input type="color" value={cellDiagColor} onChange={(e) => setCellDiagColor(e.target.value)} className="w-44 h-6 p-0.5 bg-white border border-neutral-300 rounded cursor-pointer" /></div>
                        <div className="flex flex-col gap-2 pt-1">
                          <span className="font-semibold text-blue-700">\ 대각선</span>
                          <div className="flex items-center gap-1.5">{["none", "single", "double"].map((d) => (<button key={d} type="button" onClick={() => setCellDiagBackslash(d)} className={`w-7 h-7 rounded border text-xs flex items-center justify-center cursor-pointer ${cellDiagBackslash === d ? "bg-neutral-300/70 border-neutral-500" : "bg-white border-neutral-300 hover:bg-neutral-50"}`}>{d === "none" ? "□" : d === "single" ? "⧵" : "⑊"}</button>))}</div>
                          <span className="font-semibold text-blue-700">/ 대각선</span>
                          <div className="flex items-center gap-1.5">{["none", "single", "double"].map((d) => (<button key={d} type="button" onClick={() => setCellDiagSlash(d)} className={`w-7 h-7 rounded border text-xs flex items-center justify-center cursor-pointer ${cellDiagSlash === d ? "bg-neutral-300/70 border-neutral-500" : "bg-white border-neutral-300 hover:bg-neutral-50"}`}>{d === "none" ? "□" : d === "single" ? "⁄" : "⫽"}</button>))}</div>
                          <span className="font-semibold text-blue-700">+ 중심선</span>
                          <div className="flex items-center gap-1.5">{["none", "horz", "vert", "both"].map((d) => (<button key={d} type="button" onClick={() => setCellDiagCenter(d)} className={`w-7 h-7 rounded border text-xs flex items-center justify-center cursor-pointer ${cellDiagCenter === d ? "bg-neutral-300/70 border-neutral-500" : "bg-white border-neutral-300 hover:bg-neutral-50"}`}>{d === "none" ? "□" : d === "horz" ? "─" : d === "vert" ? "│" : "┼"}</button>))}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-28 p-3 bg-neutral-50/50 flex flex-col gap-2 shrink-0 border-l border-neutral-200">
                  <button type="button" onClick={() => applyCellBorderBg(true)} className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 font-normal hover:bg-neutral-100 hover:border-neutral-500 transition cursor-pointer shadow-xs">확인</button>
                  <button type="button" onClick={() => setShowCellBorderBgModal(false)} className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 font-normal hover:bg-neutral-100 hover:border-neutral-500 transition cursor-pointer shadow-xs">취소</button>
                  <button type="button" onClick={() => applyCellBorderBg(false)} className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 font-normal hover:bg-neutral-100 hover:border-neutral-500 transition cursor-pointer shadow-xs mt-1">적용</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 한컴오피스 / 한컴독스 표준 [웹 동영상 넣기] 모달 ── */}
        {showWebVideoModal && (
          <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/30 backdrop-blur-[1px] select-none" onClick={() => setShowWebVideoModal(false)}>
            <div className="bg-white border border-blue-400 shadow-2xl rounded-xs w-[560px] max-w-[95vw] flex flex-col overflow-hidden text-neutral-800 font-sans" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#f4f7fb] border-b border-neutral-200">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">웹 동영상 넣기</span>
                <button type="button" onClick={() => setShowWebVideoModal(false)} className="text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded hover:bg-neutral-200/60 cursor-pointer">✕</button>
              </div>
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 border border-neutral-200 rounded p-3 flex flex-col gap-2 bg-white">
                  <input
                    type="text"
                    autoFocus
                    value={webVideoInput}
                    onChange={(e) => setWebVideoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); confirmInsertWebVideo(); }
                      if (e.key === "Escape") { e.preventDefault(); setShowWebVideoModal(false); }
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-white border border-neutral-300 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#0066cc]"
                  />
                  <span className="text-[11px] text-neutral-600">동영상의 URL 또는 소스 코드를 웹 사이트에서 복사하여 붙여 넣으세요.</span>
                </div>
                <div className="w-24 flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!webVideoInput.trim()}
                    onClick={confirmInsertWebVideo}
                    className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-xs"
                  >
                    넣기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWebVideoModal(false)}
                    className="w-full py-1.5 rounded text-xs bg-white text-neutral-800 border border-neutral-400 hover:bg-neutral-100 transition cursor-pointer shadow-xs"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 에러 바 */}
        {error && (
          <div className="px-5 py-2 text-xs bg-red-500/15 text-red-400 border-b border-red-500/20">
            {error}
          </div>
        )}

        {/* 메인 문서 편집 영역 (한글 A4 용지 스타일 / 쪽 윤곽 끔 시 연속 편집 모드) */}
        <div className="relative flex-1 flex overflow-hidden">
        <main
          ref={canvasScrollRef}
          onScroll={(e) => {
            lastKnownScrollTopRef.current = e.currentTarget.scrollTop;
            if (rulerScrollRef.current && Math.abs(rulerScrollRef.current.scrollLeft - e.currentTarget.scrollLeft) > 1) {
              rulerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          className={`flex-1 overflow-auto ${showPageOutline ? "p-4 sm:p-8 bg-[#edf0f5]" : "p-0 bg-white"} ${pendingDrawShape ? "cursor-crosshair" : ""}`}
        >
          {inlineCaretIndicator && (
            <div
              data-inline-drop-caret="true"
              className="fixed w-[2px] bg-[#0066cc] pointer-events-none z-70 rounded-full shadow-xs"
              style={{
                left: `${inlineCaretIndicator.left}px`,
                top: `${inlineCaretIndicator.top}px`,
                height: `${inlineCaretIndicator.height}px`,
              }}
            />
          )}
          {(pendingDrawShape || pendingDrawImage) && (
            <div className="sticky top-2 z-50 mx-auto w-fit px-3 py-1 rounded-full bg-[#0066cc] text-white text-[11px] font-medium shadow-md pointer-events-none">
              그리기 모드 ({pendingDrawImage ? "그림" : pendingDrawShape === "textbox" ? "가로 글상자" : pendingDrawShape === "rect" ? "직사각형" : pendingDrawShape === "ellipse" ? "타원" : pendingDrawShape === "line" ? "직선" : "호"}) — 문서 위에서 드래그하거나 클릭하세요 (ESC 취소)
            </div>
          )}
          {drawPreviewRect && (drawPreviewRect.width > 2 || drawPreviewRect.height > 2) && (pendingDrawShape || pendingDrawImage) && (
            <div
              data-draw-preview="true"
              className="fixed z-50 pointer-events-none"
              style={{
                left: `${drawPreviewRect.left}px`,
                top: `${drawPreviewRect.top}px`,
                width: `${Math.max(2, drawPreviewRect.width)}px`,
                height: `${Math.max(2, drawPreviewRect.height)}px`,
              }}
            >
              <div className="absolute bottom-full left-0 mb-1 text-[11px] font-sans text-neutral-900 whitespace-nowrap bg-white/80 px-1 rounded-xs">
                {`너비 = ${((drawPreviewRect.width / (zoomPercent / 100)) / 37.8).toFixed(2)} cm, 높이 = ${((drawPreviewRect.height / (zoomPercent / 100)) / 37.8).toFixed(2)} cm`}
              </div>
              {pendingDrawShape === "ellipse" ? (
                <div className="w-full h-full rounded-full border border-black bg-white/30" />
              ) : pendingDrawShape === "line" ? (
                <svg className="w-full h-full overflow-visible">
                  <line
                    x1={drawPreviewRect.startX - drawPreviewRect.left}
                    y1={drawPreviewRect.startY - drawPreviewRect.top}
                    x2={drawPreviewRect.curX - drawPreviewRect.left}
                    y2={drawPreviewRect.curY - drawPreviewRect.top}
                    stroke="#000000"
                    strokeWidth="1.2"
                  />
                </svg>
              ) : pendingDrawShape === "arc" ? (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <path
                    d="M 1 1 A 98 98 0 0 1 99 99"
                    fill="none"
                    stroke="#000000"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : (
                <div className="w-full h-full border border-black bg-white/30" />
              )}
            </div>
          )}
          <div
            className={`${showPageOutline ? "mx-auto my-6" : "w-full"} shrink-0 relative ${memos.length > 0 && showAllMemos ? "overflow-visible" : "overflow-clip"}`}
            style={
              showPageOutline && canvasUnscaledSize
                ? {
                  width: `${Math.round(canvasUnscaledSize.w * (zoomPercent / 100))}px`,
                  height: `${Math.round(canvasUnscaledSize.h * (zoomPercent / 100))}px`,
                }
                : undefined
            }
          >
            <div
              ref={canvasRef}
              contentEditable={isCrossSelecting}
              suppressContentEditableWarning={true}
              role="textbox"
              aria-multiline="true"
              onBeforeInput={(e) => {
                if (isCrossSelecting) e.preventDefault();
              }}
              onKeyDownCapture={(e) => {
                if (pendingDrawShape && e.key === "Escape") {
                  e.preventDefault();
                  setPendingDrawShape(null);
                  drawDragStartRef.current = null;
                }
              }}
              onMouseDown={(e) => {
                if (e.button !== 0 || pendingDrawShape) return;
                const target = e.target as HTMLElement | null;
                if (!target) return;
                if (target.closest("button, input, textarea, select, [data-drag-handle]")) return;
                const pEl = target.closest('[data-block-type="paragraph"] p') as HTMLElement | null;
                if (isCrossSelecting) {
                  setIsCrossSelecting(false);
                }
                if (!pEl) {
                  crossDragRef.current = null;
                  return;
                }
                const idxAttr = pEl.getAttribute("data-block-idx");
                const startIdx = idxAttr !== null ? Number(idxAttr) : NaN;
                if (isNaN(startIdx)) return;
                crossDragRef.current = {
                  startIdx,
                  startOffset: getPointOffsetInParagraph(pEl, e.clientX, e.clientY),
                  crossed: false,
                };
              }}
              style={
                showPageOutline
                  ? {
                      transform: `scale(${zoomPercent / 100})`,
                      transformOrigin: "top left",
                    }
                  : undefined
              }
              className={`${pendingDrawShape ? "cursor-crosshair " : ""}${
                !showPageOutline
                  ? "w-full flex flex-col items-stretch gap-0"
                  : `w-max ${pageViewColumns === 3
                    ? "grid grid-cols-[repeat(3,max-content)] gap-6 justify-items-center"
                    : pageViewColumns === 2
                      ? "grid grid-cols-[repeat(2,max-content)] gap-6 justify-items-center"
                      : `flex flex-col items-center gap-6 ${memos.length > 0 && showAllMemos ? "pr-[240px]" : ""}`
                    }`
              }`}
            >
              {pages.map((pageIndices, pageIdx) => (
                <div
                  key={`page-${pageIdx}`}
                  data-page-idx={pageIdx}
                  onClick={(e) => {
                    if (justFinishedCrossDragRef.current || Date.now() - lastPointerActionAtRef.current < 250) return;
                    if (e.target === e.currentTarget && pageIndices.length > 0) {
                      const lastIdx = pageIndices[pageIndices.length - 1].idx;
                      const lastBlock = blocks[lastIdx];
                      if (lastBlock?.type === "paragraph") {
                        setSelectedIdx(lastIdx);
                        pendingCaretRef.current = { mode: "offset", blockId: lastBlock.id, offset: lastBlock.text.length };
                      } else {
                        setSelectedIdx(-1);
                      }
                    }
                  }}
                  className={`h-auto flex flex-col bg-white text-neutral-900 shrink-0 transition-shadow duration-150 outline-none cursor-text relative ${
                    showPageOutline && !hiddenPageElements[pageIdx]?.border
                      ? "shadow-xl rounded-xs border border-neutral-300"
                      : `w-full ${pageIdx > 0 ? "border-t border-dashed border-neutral-300" : ""}`
                  } ${showGrid ? "bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]" : ""
                    } ${pagePulse ? "ring-4 ring-blue-500/50 shadow-2xl scale-[1.005]" : ""}`}
                  style={
                    showPageOutline
                      ? {
                          fontFamily: "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif",
                          boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
                          width: `${Math.round(pageWidthMm * 3.78)}px`,
                          minHeight: `${Math.round(pageHeightMm * 3.78)}px`,
                          paddingTop: `${Math.max(16, Math.round((pageMarginTopMm + pageHeaderMm) * 3.78))}px`,
                          paddingBottom: `${Math.max(16, Math.round((pageMarginBottomMm + pageFooterMm) * 3.78))}px`,
                          paddingLeft: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          paddingRight: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                        }
                      : {
                          fontFamily: "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif",
                          padding: "16px 28px",
                        }
                  }
                >
                  {/* 상하좌우 여백 모서리 꺾쇠 표시선 (한컴독스 자름표 / 여백 경계선) */}
                  {showPageOutline && (
                    <>
                      <div
                        className="absolute pointer-events-none border-t border-l border-neutral-400/80"
                        style={{
                          top: `${Math.max(16, Math.round((pageMarginTopMm + pageHeaderMm) * 3.78))}px`,
                          left: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                      <div
                        className="absolute pointer-events-none border-t border-r border-neutral-400/80"
                        style={{
                          top: `${Math.max(16, Math.round((pageMarginTopMm + pageHeaderMm) * 3.78))}px`,
                          right: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                      <div
                        className="absolute pointer-events-none border-b border-l border-neutral-400/80"
                        style={{
                          bottom: `${Math.max(16, Math.round((pageMarginBottomMm + pageFooterMm) * 3.78))}px`,
                          left: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                      <div
                        className="absolute pointer-events-none border-b border-r border-neutral-400/80"
                        style={{
                          bottom: `${Math.max(16, Math.round((pageMarginBottomMm + pageFooterMm) * 3.78))}px`,
                          right: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                    </>
                  )}
                  {/* 머리말 / 상단 쪽 번호 */}
                  {(() => {
                    const hidden = hiddenPageElements[pageIdx] || {};
                    const showHeaderNum = headerPos !== "none" && !hidden.header && !hidden.pageNumber;
                    const showTopCenterNum = pageNumberPos === "top-center" && !hidden.header && !hidden.pageNumber;
                    if (!showHeaderNum && !showTopCenterNum) return null;
                    const align = showHeaderNum ? headerPos : "center";
                    return (
                      <div
                        data-page-header={pageIdx}
                        className={`absolute left-0 right-0 pointer-events-none select-none text-[9.5pt] text-neutral-600 flex ${
                          align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center"
                        }`}
                        style={{
                          top: `${Math.max(10, Math.round(pageMarginTopMm * 3.78))}px`,
                          paddingLeft: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          paddingRight: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                        }}
                      >
                        <span>- {getDisplayPageNumber(pageIdx)} -</span>
                      </div>
                    );
                  })()}
                  <div className="flex-1 flex flex-col gap-1">
                  {(() => {
                    let pageCounter = pageIdx;
                    const isInlineObjBlock = (_b?: HwpxCollabBlock) => false;

                    const renderPageItem = ({ idx, sliceStart, sliceEnd }: (typeof pageIndices)[number]) => {
                      const block = blocks[idx];
                      if (!block || isNoteBlock(block)) return null;
                      const isInlinePara = block.type === "paragraph" && (isInlineObjBlock(blocks[idx - 1]) || isInlineObjBlock(blocks[idx + 1]));
                      const isInlineImageWithText = false;
                      const isInlineShapeWithText = false;
                      const isSelected = selectedIdx === idx;
                      const showPageBreak = block.type === "paragraph" && block.pageBreak && idx > 0;

                      const handleBlockDragOver = (e: React.DragEvent) => {
                        const rawFrom = e.dataTransfer.getData("application/x-hwpx-block");
                        const from = rawFrom !== "" ? Number(rawFrom) : (draggedBlockIdxRef.current ?? draggedBlockIdx);
                        if (from === null || isNaN(from) || from === idx) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        const rect = e.currentTarget.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        const pos = e.clientY < midY ? "before" : "after";
                        setDropIndicator({ idx, pos });
                      };

                      const handleBlockDragLeave = () => {
                        if (dropIndicator?.idx === idx) {
                          setDropIndicator(null);
                        }
                      };

                      const handleBlockDrop = (e: React.DragEvent) => {
                        const rawFrom = e.dataTransfer.getData("application/x-hwpx-block");
                        const from = rawFrom !== "" ? Number(rawFrom) : (draggedBlockIdxRef.current ?? draggedBlockIdx);
                        if (from === null || isNaN(from) || from === idx) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        const pos = e.clientY < midY ? "before" : "after";
                        moveBlock(from, idx, pos);
                        setDraggedBlock(null);
                        setDropIndicator(null);
                      };

                      const renderDropIndicator = () => {
                        if (dropIndicator?.idx !== idx) return null;
                        return (
                          <div
                            className={`absolute left-0 right-0 h-1 bg-blue-500 z-50 pointer-events-none rounded-full shadow-md animate-pulse ${dropIndicator.pos === "before" ? "-top-1" : "-bottom-1"
                              }`}
                          />
                        );
                      };

                      if (block.type === "paragraph") {
                        const alignClass =
                          block.align === "center"
                            ? "text-center"
                            : block.align === "right"
                              ? "text-right"
                              : block.align === "justify"
                                ? "text-justify"
                                : "text-left";
                        const fontSize = block.sizePt ? `${block.sizePt}pt` : "10pt";

                        return (
                          <div
                            key={`${block.id}-${sliceStart ?? 0}`}
                            data-block-id={block.id}
                            data-block-idx={idx}
                            data-block-type="paragraph"
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const sel = window.getSelection();
                              const hasSel = Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
                              setSelectedIdx(idx);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                blockIdx: idx,
                                blockType: "paragraph",
                                hasSelection: hasSel,
                              });
                            }}
                            onDragOver={handleBlockDragOver}
                            onDragLeave={handleBlockDragLeave}
                            onDrop={handleBlockDrop}
                            className={isInlinePara ? "inline relative z-[1]" : "w-full relative z-[1]"}
                          >
                            {renderDropIndicator()}

                            {showPageBreak && (
                              <div
                                data-page-break-line="true"
                                contentEditable={false}
                                className="my-10 -mx-10 sm:-mx-16 flex items-center justify-center gap-3 py-2 bg-neutral-100 border-y border-neutral-300 select-none cursor-default"
                              >
                                <div className="h-[1px] flex-1 bg-neutral-300" />
                                <span className="text-[11px] font-bold text-neutral-600 tracking-wider">
                                  ── {++pageCounter} 쪽 ──
                                </span>
                                <div className="h-[1px] flex-1 bg-neutral-300" />
                              </div>
                            )}

                            {(() => {
                              const blockMemos = memos.filter((m) => m.blockId === block.id);
                              const hasMemos = blockMemos.length > 0;
                              const blockTrackedChanges = trackDisplayMode === "final-markup"
                                ? visibleTrackedChanges.filter((tc) => tc.blockId === block.id)
                                : [];
                              const isActiveTrackedBlock = activeTrackedChangeIdx >= 0
                                && visibleTrackedChanges[activeTrackedChangeIdx]?.blockId === block.id
                                && trackDisplayMode === "final-markup";
                              return (
                                <div data-tracked-change={blockTrackedChanges.length > 0 ? blockTrackedChanges[0].kind : undefined}
                        className={`${isInlinePara ? "inline" : ""} relative ${hasMemos && showAllMemos ? "bg-orange-50/75 border-b border-orange-300/80 rounded-[2px]" : ""} ${blockTrackedChanges.length > 0 ? (isActiveTrackedBlock ? "border-l-2 border-rose-600 bg-rose-50/50 pl-1.5" : "border-l-2 border-rose-400 bg-rose-50/25 pl-1.5") : ""}`}>
                                  {showControlMarks && (idx === 0 || showPageBreak || hasMemos) && (
                                    <div className="flex items-center gap-1 mb-0.5 select-none pointer-events-none flex-wrap">
                                      {idx === 0 && (
                                        <span data-control-mark="section" className="text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px]">
                                          [구역]
                                        </span>
                                      )}
                                      {showPageBreak && (
                                        <span data-control-mark="pageBreak" className="text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px]">
                                          [쪽 나누기]
                                        </span>
                                      )}
                                      {columnBreakBlockIds[block.id] && (
                                        <span data-control-mark="columnBreak" className="text-[10px] font-mono text-amber-700 bg-amber-50/90 border border-amber-200 px-1 rounded-[2px]">
                                          [단 나누기]
                                        </span>
                                      )}
                                      {columnSectionBreakBlockIds[block.id] && (
                                        <span data-control-mark="columnSectionBreak" className="text-[10px] font-mono text-emerald-700 bg-emerald-50/90 border border-emerald-200 px-1 rounded-[2px]">
                                          [다단 설정 나누기]
                                        </span>
                                      )}
                                      {hasMemos && (
                                        <span data-control-mark="memoStart" className="text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px]">
                                          [메모 시작]
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  <ContentEditableParagraph
                                    block={block}
                                    idx={idx}
                                    sliceStart={sliceStart}
                                    sliceEnd={sliceEnd}
                                    alignClass={alignClass}
                                    fontSize={fontSize}
                                    showParaMarks={showParaMarks}
                                    inlineFlow={isInlinePara}
                                    isCrossSelecting={isCrossSelecting}
                                    onSelect={() => {
                                      if (!justFinishedCrossDragRef.current) setSelectedIdx(idx);
                                    }}
                                    onChangeText={(newText) => updateParagraph(idx, newText)}
                                    onSplit={(before, after) => splitParagraph(idx, before, after)}
                                    onMergePrevious={() => mergeParagraphWithPrevious(idx)}
                                    onNavigatePrev={(clientX) => navigateToPrevParagraph(idx, clientX)}
                                    onNavigateNext={(clientX) => navigateToNextParagraph(idx, clientX)}
                                    onIndent={(inc) => handleIndent(inc)}
                                    onDragStart={() => setDraggedBlock(idx)}
                                    onDragEnd={() => {
                                      setDraggedBlock(null);
                                      setDropIndicator(null);
                                    }}
                                  />

                                  {showControlMarks && hasMemos && (
                                    <span data-control-mark="memoEnd" className="inline-block mt-0.5 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                                      [메모 끝]
                                    </span>
                                  )}


                                </div>
                              );
                            })()}
                          </div>
                        );
                      }

                      if (block.type === "table") {
                        const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                        const isMoved = currentOffset.x !== 0 || currentOffset.y !== 0;
                        const currentWidthPct = dragResize[idx]?.widthPercent ?? block.widthPercent ?? 100;
                        const tblWidth = `${currentWidthPct}%`;
                        const tblBg = block.fillMode === "none" || !block.fillColor || block.fillColor === "transparent" ? "transparent" : block.fillColor;
                        const bStyle = block.borderType === "DASH" ? "dashed" : block.borderType === "DOT" ? "dotted" : block.borderType === "DOUBLE" ? "double" : block.borderType === "NONE" ? "none" : "solid";
                        const bColor = block.borderColor || "#000000";
                        const bWidth = block.borderThickness || "1px";
                        const hasOuterBorder = block.borderType !== "NONE";
                        const padTop = block.cellPaddingTopMm !== undefined ? `${block.cellPaddingTopMm * 3.78}px` : "4px";
                        const padBottom = block.cellPaddingBottomMm !== undefined ? `${block.cellPaddingBottomMm * 3.78}px` : "4px";
                        const padLeft = block.cellPaddingLeftMm !== undefined ? `${block.cellPaddingLeftMm * 3.78}px` : "6.8px";
                        const padRight = block.cellPaddingRightMm !== undefined ? `${block.cellPaddingRightMm * 3.78}px` : "6.8px";
                        const hasCellSpacing = !!(block.cellSpacingEnabled && (block.cellSpacingMm || 0) > 0);
                        const cellSpacingPx = hasCellSpacing && block.cellSpacingMm ? `${block.cellSpacingMm * 3.78}px` : "0px";
                        const hasTableCaption = !!((block.captionPos && block.captionPos !== "none") || (block.caption !== undefined && block.caption !== null && block.caption !== ""));
                        const isCaptionTop = hasTableCaption && block.captionPos?.startsWith("top");
                        const isCaptionBottom = hasTableCaption && !isCaptionTop;
                        const captionAlignClass = block.captionPos?.includes("left") ? "justify-start" : block.captionPos?.includes("right") ? "justify-end" : "justify-center";

                        return (
                          <div
                            key={`${block.id}-${sliceStart ?? 0}`}
                            data-block-id={block.id}
                            data-block-idx={idx}
                            data-block-type="table"
                            contentEditable={false}
                            onDragOver={handleBlockDragOver}
                            onDragLeave={handleBlockDragLeave}
                            onDrop={handleBlockDrop}
                            onClick={(e) => {
                              setSelectedIdx(idx);
                              if (!(e.target as HTMLElement | null)?.closest("[data-hwpx-cell]")) {
                                setActiveTableCell(null);
                                setTableCellSelection(null);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedIdx(idx);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                blockIdx: idx,
                                blockType: "table",
                              });
                            }}
                            onPointerDown={(e) => {
                              const targetEl = e.target as HTMLElement | null;
                              if (!targetEl) return;
                              if (
                                targetEl.tagName === "INPUT" ||
                                targetEl.tagName === "TEXTAREA" ||
                                targetEl.tagName === "BUTTON" ||
                                targetEl.closest("button") ||
                                targetEl.closest(".table-remote-control") ||
                                targetEl.closest("[data-col-resize-handle]") ||
                                targetEl.closest("[data-row-resize-handle]")
                              ) {
                                return;
                              }
                              handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y);
                            }}
                            style={{
                              transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                              zIndex: isSelected ? 20 : 1,
                              marginTop: block.marginTopMm ? `${block.marginTopMm * 3.78}px` : undefined,
                              marginBottom: block.marginBottomMm ? `${block.marginBottomMm * 3.78}px` : undefined,
                              marginLeft: block.marginLeftMm ? `${block.marginLeftMm * 3.78}px` : 0,
                              marginRight: block.marginRightMm ? `${block.marginRightMm * 3.78}px` : "auto",
                              width: tblWidth,
                            }}
                            className={`hwpx-resizable-box my-2 py-1 relative group/tbl cursor-default select-none ${isSelected ? "ring-1 ring-blue-500 rounded shadow-md" : ""
                              }`}
                          >
                            {renderDropIndicator()}
                            {/* 8방향 선택 조절점 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                            {isSelected && (
                              <HwpxSelectionHandles
                                onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                              />
                            )}

                            {/* 표 전용 우측 플로팅 리모컨 */}
                            {isSelected && (
                              <HwpxFloatingToolbar
                                icon={<TableIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                title="표 리모컨"
                                badge={
                                  <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-1 py-0.5 rounded border border-neutral-200">
                                    {block.rows.length}×{block.rows[0]?.length || 0}
                                  </span>
                                }
                                onClose={() => setSelectedIdx(-1)}
                              >
                                <button
                                  type="button"
                                  onClick={() => openPropertyModal(idx)}
                                  className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-neutral-50 border border-neutral-200 font-medium cursor-pointer"
                                  title="표/셀 개체 속성 (단축키 P)"
                                >
                                  <span>⚙</span>
                                  <span>개체 속성 (P)</span>
                                </button>

                                <HwpxRemoteSizeControls
                                  widthPercent={dragResize[idx]?.widthPercent ?? block.widthPercent ?? 100}
                                  heightPt={dragResize[idx]?.heightPt ?? block.heightPt}
                                  contentWidthMm={Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0))}
                                  onChangeWidth={(w) => commitObjectResize(idx, w, undefined)}
                                  onChangeHeight={(h) => commitObjectResize(idx, undefined, h)}
                                />

                                <div className="space-y-1">
                                  <div className="text-[10px] font-semibold text-neutral-500 px-0.5">행 / 열 편집</div>
                                  <div className="grid grid-cols-2 gap-1">
                                    <button type="button" onClick={() => addTableRow(idx, block.rows.length - 1)} className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors" title="표 맨 아래에 행 추가">+ 행 추가</button>
                                    <button type="button" onClick={() => deleteTableRow(idx, block.rows.length - 1)} className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors" title="마지막 행 삭제">- 행 삭제</button>
                                    <button type="button" onClick={() => addTableCol(idx, (block.rows[0]?.length || 1) - 1)} className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors" title="표 오른쪽에 열 추가">+ 열 추가</button>
                                    <button type="button" onClick={() => deleteTableCol(idx, (block.rows[0]?.length || 1) - 1)} className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors" title="마지막 열 삭제">- 열 삭제</button>
                                  </div>
                                </div>

                                <div className="pt-1 border-t border-neutral-200">
                                  <button type="button" onClick={() => deleteBlock(idx)} className="w-full py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors" title="표 전체 삭제">
                                    <span>🗑</span><span>표 삭제</span>
                                  </button>
                                </div>
                              </HwpxFloatingToolbar>
                            )}

                            {/* 상단 캡션 */}
                            {showControlMarks && (
                              <span data-control-mark="table" className="inline-block mb-0.5 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                                [표]
                              </span>
                            )}
                            {isCaptionTop && (
                              <div className={`mb-2 text-xs text-neutral-800 font-sans flex items-center ${captionAlignClass}`}>
                                <div className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 shadow-2xs">
                                  <span className="text-[10px] text-blue-700 font-bold font-mono">#1</span>
                                  <input
                                    type="text"
                                    value={block.caption || ""}
                                    onChange={(e) => {
                                      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                                      const yBlock = yBlocks.get(idx);
                                      if (yBlock) yBlock.set("caption", e.target.value);
                                    }}
                                    placeholder="[표 캡션 입력...]"
                                    className="bg-transparent border-none outline-none text-xs text-neutral-800 font-semibold min-w-[70px]"
                                  />
                                </div>
                              </div>
                            )}

                            <div className="w-full">
                              {(() => {
                                const effectiveBorder = hasOuterBorder
                                  ? `${bWidth} ${bStyle} ${bColor}`
                                  : showTransparentLines
                                    ? "1px dashed rgba(220, 38, 38, 0.35)"
                                    : "none";
                                const colCount = block.rows[0]?.length || 1;
                                const activeColWidths =
                                  tableCellResizeDraft?.blockIdx === idx &&
                                  tableCellResizeDraft.colWidths?.length === colCount
                                    ? tableCellResizeDraft.colWidths
                                    : block.colWidths?.length === colCount
                                      ? block.colWidths
                                      : Array.from({ length: colCount }, () => 100 / colCount);
                                const activeRowHeights =
                                  tableCellResizeDraft?.blockIdx === idx &&
                                  tableCellResizeDraft.rowHeights?.length === block.rows.length
                                    ? tableCellResizeDraft.rowHeights
                                    : block.rowHeights;
                                const draftCellWidths =
                                  tableCellResizeDraft?.blockIdx === idx ? tableCellResizeDraft.cellWidths : undefined;

                                // 행별 독립 셀 너비(1000단위 그리드) 계산 — rowSpan 포함
                                const cellPlacements: Array<
                                  Array<{ startUnit: number; spanUnits: number; widthPct: number; nextColIdx: number | null }>
                                > = Array.from({ length: block.rows.length }, () => []);
                                const occupiedRanges: Array<Array<{ colStart: number; colEnd: number; startUnit: number; endUnit: number }>> =
                                  Array.from({ length: block.rows.length }, () => []);

                                for (let r = 0; r < block.rows.length; r++) {
                                  const rowArr = block.rows[r];
                                  const rowOcc = [...occupiedRanges[r]].sort((a, b) => a.colStart - b.colStart);
                                  let cursorUnit = 0;
                                  let c = 0;
                                  let occIdx = 0;
                                  while (c < rowArr.length) {
                                    if (occIdx < rowOcc.length && c === rowOcc[occIdx].colStart) {
                                      cursorUnit = rowOcc[occIdx].endUnit;
                                      c = rowOcc[occIdx].colEnd + 1;
                                      occIdx++;
                                      continue;
                                    }
                                    const segColEnd = occIdx < rowOcc.length ? rowOcc[occIdx].colStart - 1 : rowArr.length - 1;
                                    const segUnitEnd = occIdx < rowOcc.length ? rowOcc[occIdx].startUnit : 1000;
                                    const segUnits = Math.max(10, segUnitEnd - cursorUnit);

                                    const segCells: Array<{ cIdx: number; cSpan: number; rSpan: number; rawW: number }> = [];
                                    let cc = c;
                                    while (cc <= segColEnd) {
                                      const cell = rowArr[cc];
                                      const cSpan = Math.max(1, cell?.colSpan || 1);
                                      const rSpan = Math.max(1, cell?.rowSpan || 1);
                                      if (!cell?.mergedHidden) {
                                        const draftW = draftCellWidths?.[`${r}:${cc}`];
                                        let fallbackW = 0;
                                        for (let k = 0; k < cSpan; k++) {
                                          fallbackW += activeColWidths[cc + k] ?? 100 / colCount;
                                        }
                                        const rawW = draftW ?? (cell.widthPercent && cell.widthPercent > 0 ? cell.widthPercent : fallbackW);
                                        segCells.push({ cIdx: cc, cSpan, rSpan, rawW });
                                      }
                                      cc += cSpan;
                                    }

                                    const rawSum = segCells.reduce((acc, item) => acc + item.rawW, 0) || 100;
                                    let segCursor = cursorUnit;
                                    segCells.forEach((item, idxInSeg) => {
                                      const isLastInSeg = idxInSeg === segCells.length - 1;
                                      const u = isLastInSeg
                                        ? segUnitEnd - segCursor
                                        : Math.max(20, Math.round((item.rawW / rawSum) * segUnits));
                                      const pct = Number(((u / 1000) * 100).toFixed(2));
                                      const nextColIdx = idxInSeg < segCells.length - 1 ? segCells[idxInSeg + 1].cIdx : null;
                                      cellPlacements[r][item.cIdx] = {
                                        startUnit: segCursor,
                                        spanUnits: u,
                                        widthPct: pct,
                                        nextColIdx,
                                      };
                                      if (item.rSpan > 1) {
                                        for (let rr = r + 1; rr < Math.min(block.rows.length, r + item.rSpan); rr++) {
                                          occupiedRanges[rr].push({
                                            colStart: item.cIdx,
                                            colEnd: item.cIdx + item.cSpan - 1,
                                            startUnit: segCursor,
                                            endUnit: segCursor + u,
                                          });
                                        }
                                      }
                                      segCursor += u;
                                    });
                                    cursorUnit = segUnitEnd;
                                    c = segColEnd + 1;
                                  }
                                }

                                const draftCellHeights =
                                  tableCellResizeDraft?.blockIdx === idx ? tableCellResizeDraft.cellHeights : undefined;
                                const baseRowHeightsPx = block.rows.map((_, ri) => {
                                  const rh = activeRowHeights?.[ri];
                                  return rh && rh > 0 ? rh : 30;
                                });
                                const totalTableHeightPx = baseRowHeightsPx.reduce((a, b) => a + b, 0);

                                // 열별 독립 셀 높이(1000단위 세로 그리드) 계산 — colSpan 포함
                                const cellYPlacements: Array<
                                  Array<{ startYUnit: number; spanYUnits: number; heightPx: number; nextRowIdx: number | null }>
                                > = Array.from({ length: block.rows.length }, () => []);
                                const occupiedYRanges: Array<Array<{ rowStart: number; rowEnd: number; startYUnit: number; endYUnit: number }>> =
                                  Array.from({ length: colCount }, () => []);

                                for (let c = 0; c < colCount; c++) {
                                  const colOcc = [...occupiedYRanges[c]].sort((a, b) => a.rowStart - b.rowStart);
                                  let cursorYUnit = 0;
                                  let r = 0;
                                  let occIdx = 0;
                                  while (r < block.rows.length) {
                                    if (occIdx < colOcc.length && r === colOcc[occIdx].rowStart) {
                                      cursorYUnit = colOcc[occIdx].endYUnit;
                                      r = colOcc[occIdx].rowEnd + 1;
                                      occIdx++;
                                      continue;
                                    }
                                    const segRowEnd = occIdx < colOcc.length ? colOcc[occIdx].rowStart - 1 : block.rows.length - 1;
                                    const segYEnd = occIdx < colOcc.length ? colOcc[occIdx].startYUnit : 1000;
                                    const segYUnits = Math.max(10, segYEnd - cursorYUnit);

                                    const segCells: Array<{ rIdx: number; cSpan: number; rSpan: number; rawH: number }> = [];
                                    let rr = r;
                                    while (rr <= segRowEnd) {
                                      const cell = block.rows[rr]?.[c];
                                      const cSpan = Math.max(1, cell?.colSpan || 1);
                                      const rSpan = Math.max(1, cell?.rowSpan || 1);
                                      if (!cell?.mergedHidden) {
                                        const draftH = draftCellHeights?.[`${rr}:${c}`];
                                        let fallbackH = 0;
                                        for (let k = 0; k < rSpan; k++) {
                                          fallbackH += baseRowHeightsPx[rr + k] ?? 30;
                                        }
                                        const rawH = draftH ?? (cell.heightPx && cell.heightPx > 0 ? cell.heightPx : fallbackH);
                                        segCells.push({ rIdx: rr, cSpan, rSpan, rawH });
                                      }
                                      rr += rSpan;
                                    }

                                    const rawHSum = segCells.reduce((acc, item) => acc + item.rawH, 0) || totalTableHeightPx;
                                    let segYCursor = cursorYUnit;
                                    segCells.forEach((item, idxInSeg) => {
                                      const isLastInSeg = idxInSeg === segCells.length - 1;
                                      const u = isLastInSeg
                                        ? segYEnd - segYCursor
                                        : Math.max(20, Math.round((item.rawH / rawHSum) * segYUnits));
                                      const hPx = Math.max(18, Math.round((u / 1000) * totalTableHeightPx));
                                      const nextRowIdx = idxInSeg < segCells.length - 1 ? segCells[idxInSeg + 1].rIdx : null;
                                      cellYPlacements[item.rIdx][c] = {
                                        startYUnit: segYCursor,
                                        spanYUnits: u,
                                        heightPx: hPx,
                                        nextRowIdx,
                                      };
                                      if (item.cSpan > 1) {
                                        for (let cc = c + 1; cc < Math.min(colCount, c + item.cSpan); cc++) {
                                          occupiedYRanges[cc].push({
                                            rowStart: item.rIdx,
                                            rowEnd: item.rIdx + item.rSpan - 1,
                                            startYUnit: segYCursor,
                                            endYUnit: segYCursor + u,
                                          });
                                        }
                                      }
                                      segYCursor += u;
                                    });
                                    cursorYUnit = segYEnd;
                                    r = segRowEnd + 1;
                                  }
                                }

                                return (
                                  <div
                                    data-hwpx-table="true"
                                    data-transparent-border={!hasOuterBorder && showTransparentLines ? "true" : "false"}
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(1000, minmax(0, 1fr))",
                                      gridTemplateRows: "repeat(1000, minmax(0, 1fr))",
                                      height: `${totalTableHeightPx}px`,
                                      minHeight: `${totalTableHeightPx}px`,
                                      backgroundColor: tblBg,
                                      border: effectiveBorder,
                                      gap: hasCellSpacing ? cellSpacingPx : undefined,
                                    }}
                                    className="w-full text-xs text-neutral-900"
                                  >
                                    {block.rows.map((row, rIdx) => {
                                      const isHeaderRow = rIdx === 0;
                                      return row.map((cell, cIdx) => {
                                        if (cell.mergedHidden) return null;
                                        const cSpan = Math.max(1, cell.colSpan || 1);
                                        const rSpan = Math.max(1, cell.rowSpan || 1);
                                        const placement = cellPlacements[rIdx]?.[cIdx] || {
                                          startUnit: Math.round((cIdx / colCount) * 1000),
                                          spanUnits: Math.round((cSpan / colCount) * 1000),
                                          widthPct: (cSpan / colCount) * 100,
                                          nextColIdx: cIdx + cSpan < colCount ? cIdx + cSpan : null,
                                        };
                                        const isAtRightEdge = placement.startUnit + placement.spanUnits >= 999;
                                        const isAtBottomEdge = rIdx + rSpan >= block.rows.length;
                                        const isCellSelected =
                                          tableCellSelection !== null &&
                                          tableCellSelection.blockIdx === idx &&
                                          !(
                                            rIdx + rSpan - 1 < Math.min(tableCellSelection.startRow, tableCellSelection.endRow) ||
                                            rIdx > Math.max(tableCellSelection.startRow, tableCellSelection.endRow) ||
                                            cIdx + cSpan - 1 < Math.min(tableCellSelection.startCol, tableCellSelection.endCol) ||
                                            cIdx > Math.max(tableCellSelection.startCol, tableCellSelection.endCol)
                                          );
                                        const isActiveEndCell =
                                          isCellSelected &&
                                          tableCellSelection.endRow >= rIdx &&
                                          tableCellSelection.endRow <= rIdx + rSpan - 1 &&
                                          tableCellSelection.endCol >= cIdx &&
                                          tableCellSelection.endCol <= cIdx + cSpan - 1;
                                        const nextPlacement =
                                          placement.nextColIdx !== null
                                            ? cellPlacements[rIdx]?.[placement.nextColIdx]
                                            : undefined;
                                        const yPlacement = cellYPlacements[rIdx]?.[cIdx] || {
                                          startYUnit: Math.round((rIdx / Math.max(1, block.rows.length)) * 1000),
                                          spanYUnits: Math.round((rSpan / Math.max(1, block.rows.length)) * 1000),
                                          heightPx: baseRowHeightsPx[rIdx] ?? 30,
                                          nextRowIdx: rIdx + rSpan < block.rows.length ? rIdx + rSpan : null,
                                        };
                                        const nextYPlacement =
                                          yPlacement.nextRowIdx !== null
                                            ? cellYPlacements[yPlacement.nextRowIdx]?.[cIdx]
                                            : undefined;

                                        return (
                                          <div
                                            key={`${rIdx}-${cIdx}`}
                                            data-hwpx-cell="true"
                                            data-row-idx={rIdx}
                                            data-col-idx={cIdx}
                                            data-col-span={cSpan}
                                            data-row-span={rSpan}
                                            data-width-pct={placement.widthPct}
                                            data-height-px={yPlacement.heightPx}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setSelectedIdx(idx);
                                              if (!isCellSelected) {
                                                setTableCellSelection({ blockIdx: idx, startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
                                              }
                                              setContextMenu({ x: e.clientX, y: e.clientY, blockIdx: idx, blockType: "table" });
                                            }}
                                            onMouseDown={(e) => {
                                              if (e.button !== 0) return;
                                              setSelectedIdx(idx);
                                              if (e.ctrlKey || e.metaKey) {
                                                e.preventDefault();
                                                window.getSelection()?.removeAllRanges();
                                                if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === "INPUT") {
                                                  document.activeElement.blur();
                                                }
                                                setActiveTableCell({ blockIdx: idx, row: rIdx, col: cIdx });
                                                setTableCellSelection({
                                                  blockIdx: idx,
                                                  startRow: rIdx,
                                                  startCol: cIdx,
                                                  endRow: rIdx,
                                                  endCol: cIdx,
                                                });
                                                return;
                                              }
                                              if (e.shiftKey) {
                                                if (tableCellSelection && tableCellSelection.blockIdx === idx) {
                                                  e.preventDefault();
                                                  window.getSelection()?.removeAllRanges();
                                                  setTableCellSelection({ ...tableCellSelection, endRow: rIdx, endCol: cIdx });
                                                  return;
                                                }
                                                if (activeTableCell && activeTableCell.blockIdx === idx) {
                                                  e.preventDefault();
                                                  window.getSelection()?.removeAllRanges();
                                                  setTableCellSelection({
                                                    blockIdx: idx,
                                                    startRow: activeTableCell.row,
                                                    startCol: activeTableCell.col,
                                                    endRow: rIdx,
                                                    endCol: cIdx,
                                                  });
                                                  return;
                                                }
                                              }
                                              setActiveTableCell({ blockIdx: idx, row: rIdx, col: cIdx });
                                              tableDragRef.current = { blockIdx: idx, startRow: rIdx, startCol: cIdx, active: true };
                                              if (tableCellSelection) setTableCellSelection(null);
                                            }}
                                            onMouseEnter={() => {
                                              const drag = tableDragRef.current;
                                              if (!drag || !drag.active || drag.blockIdx !== idx) return;
                                              if (drag.startRow !== rIdx || drag.startCol !== cIdx || tableCellSelection?.blockIdx === idx) {
                                                window.getSelection()?.removeAllRanges();
                                                if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === "INPUT") {
                                                  document.activeElement.blur();
                                                }
                                                setTableCellSelection({ blockIdx: idx, startRow: drag.startRow, startCol: drag.startCol, endRow: rIdx, endCol: cIdx });
                                              }
                                            }}
                                            style={{
                                              gridColumn: `${placement.startUnit + 1} / span ${placement.spanUnits}`,
                                              gridRow: `${yPlacement.startYUnit + 1} / span ${yPlacement.spanYUnits}`,
                                              paddingTop: yPlacement.heightPx < 26 ? "1px" : padTop,
                                              paddingBottom: yPlacement.heightPx < 26 ? "1px" : padBottom,
                                              paddingLeft: padLeft,
                                              paddingRight: padRight,
                                              borderRight: hasCellSpacing ? effectiveBorder : isAtRightEdge ? "none" : effectiveBorder,
                                              borderBottom: hasCellSpacing ? effectiveBorder : isAtBottomEdge ? "none" : effectiveBorder,
                                              borderLeft: hasCellSpacing ? effectiveBorder : undefined,
                                              borderTop: hasCellSpacing ? effectiveBorder : undefined,
                                              backgroundColor: cell.bgColor || undefined,
                                            }}
                                            className={`relative flex items-center cursor-cell min-w-0 min-h-0 overflow-hidden ${isHeaderRow && !tblBg && !cell.bgColor ? "bg-neutral-50/60 font-semibold" : ""} ${isCellSelected ? "select-none" : ""}`}
                                          >
                                            {isCellSelected && (
                                              <span aria-hidden="true" className="pointer-events-none absolute inset-[2px] bg-neutral-400/55 z-[1] flex items-center justify-center">
                                                {isActiveEndCell && <span className="w-1.5 h-1.5 rounded-full bg-red-600 ring-1 ring-white shadow-xs" />}
                                              </span>
                                            )}
                                            <div
                                              data-col-resize-handle={cIdx + cSpan - 1}
                                              onPointerDown={(e) => e.stopPropagation()}
                                              onMouseDown={(e) => {
                                                const nextCellObj = placement.nextColIdx !== null ? row[placement.nextColIdx] : undefined;
                                                const isNextCellSelected =
                                                  placement.nextColIdx !== null &&
                                                  tableCellSelection !== null &&
                                                  tableCellSelection.blockIdx === idx &&
                                                  (() => {
                                                    const ncSpan = Math.max(1, nextCellObj?.colSpan || 1);
                                                    const nrSpan = Math.max(1, nextCellObj?.rowSpan || 1);
                                                    return !(
                                                      rIdx + nrSpan - 1 < Math.min(tableCellSelection.startRow, tableCellSelection.endRow) ||
                                                      rIdx > Math.max(tableCellSelection.startRow, tableCellSelection.endRow) ||
                                                      placement.nextColIdx + ncSpan - 1 < Math.min(tableCellSelection.startCol, tableCellSelection.endCol) ||
                                                      placement.nextColIdx > Math.max(tableCellSelection.startCol, tableCellSelection.endCol)
                                                    );
                                                  })();
                                                const isBoundaryInSelection = isCellSelected || isNextCellSelected;
                                                const isAlreadyStaggered =
                                                  (cell.widthPercent !== undefined && cell.widthPercent > 0) ||
                                                  (nextCellObj?.widthPercent !== undefined && nextCellObj.widthPercent > 0);
                                                if (
                                                  !e.shiftKey &&
                                                  (isBoundaryInSelection || e.ctrlKey || e.altKey || isAlreadyStaggered) &&
                                                  placement.nextColIdx !== null &&
                                                  nextPlacement
                                                ) {
                                                  const targetRowIndices: number[] = [];
                                                  if (isBoundaryInSelection && tableCellSelection && tableCellSelection.blockIdx === idx) {
                                                    const selR1 = Math.min(tableCellSelection.startRow, tableCellSelection.endRow);
                                                    const selR2 = Math.max(tableCellSelection.startRow, tableCellSelection.endRow);
                                                    for (let rr = selR1; rr <= selR2; rr++) targetRowIndices.push(rr);
                                                  } else {
                                                    targetRowIndices.push(rIdx);
                                                  }
                                                  const targetRows = targetRowIndices
                                                    .map((rr) => {
                                                      const pl = cellPlacements[rr]?.[cIdx];
                                                      const nCol = pl?.nextColIdx ?? null;
                                                      const nPl = nCol !== null ? cellPlacements[rr]?.[nCol] : undefined;
                                                      if (!pl || nCol === null || !nPl) return null;
                                                      const snap = (cellPlacements[rr] || [])
                                                        .map((x, colI) => (x ? { colIdx: colI, widthPct: x.widthPct } : null))
                                                        .filter((x): x is { colIdx: number; widthPct: number } => x !== null);
                                                      return {
                                                        rowIdx: rr,
                                                        colIdx: cIdx,
                                                        nextColIdx: nCol,
                                                        curWidthPct: pl.widthPct,
                                                        nextWidthPct: nPl.widthPct,
                                                        rowSnapshot: snap,
                                                      };
                                                    })
                                                    .filter((x): x is NonNullable<typeof x> => x !== null);
                                                  if (targetRows.length > 0) {
                                                    startSingleCellWidthResize(e, idx, targetRows);
                                                    return;
                                                  }
                                                }
                                                const endCol = cIdx + cSpan - 1;
                                                if (endCol < colCount - 1) {
                                                  startTableColResize(e, idx, endCol, activeColWidths);
                                                } else {
                                                  startTableWidthResize(e, idx, dragResize[idx]?.widthPercent ?? block.widthPercent ?? 100);
                                                }
                                              }}
                                              className="absolute top-0 bottom-0 -right-[5px] w-[10px] z-30 cursor-col-resize flex justify-center group/colres select-none"
                                              title="열 너비 조절 (셀 블록 선택 또는 Ctrl+드래그: 선택 셀만 조절, Shift+드래그: 열 전체 조절)"
                                            >
                                              <div className="w-[2px] h-full bg-transparent group-hover/colres:bg-blue-500/80 transition-colors" />
                                            </div>
                                            <div
                                              data-row-resize-handle={rIdx + rSpan - 1}
                                              onPointerDown={(e) => e.stopPropagation()}
                                              onMouseDown={(e) => {
                                                const nextRowCellObj = yPlacement.nextRowIdx !== null ? block.rows[yPlacement.nextRowIdx]?.[cIdx] : undefined;
                                                const isNextRowCellSelected =
                                                  yPlacement.nextRowIdx !== null &&
                                                  tableCellSelection !== null &&
                                                  tableCellSelection.blockIdx === idx &&
                                                  (() => {
                                                    const ncSpan = Math.max(1, nextRowCellObj?.colSpan || 1);
                                                    const nrSpan = Math.max(1, nextRowCellObj?.rowSpan || 1);
                                                    return !(
                                                      yPlacement.nextRowIdx + nrSpan - 1 < Math.min(tableCellSelection.startRow, tableCellSelection.endRow) ||
                                                      yPlacement.nextRowIdx > Math.max(tableCellSelection.startRow, tableCellSelection.endRow) ||
                                                      cIdx + ncSpan - 1 < Math.min(tableCellSelection.startCol, tableCellSelection.endCol) ||
                                                      cIdx > Math.max(tableCellSelection.startCol, tableCellSelection.endCol)
                                                    );
                                                  })();
                                                const isVertBoundaryInSelection = isCellSelected || isNextRowCellSelected;
                                                const isAlreadyStaggeredVert =
                                                  (cell.heightPx !== undefined && cell.heightPx > 0) ||
                                                  (nextRowCellObj?.heightPx !== undefined && nextRowCellObj.heightPx > 0);
                                                if (
                                                  !e.shiftKey &&
                                                  (isVertBoundaryInSelection || e.ctrlKey || e.altKey || isAlreadyStaggeredVert) &&
                                                  yPlacement.nextRowIdx !== null &&
                                                  nextYPlacement
                                                ) {
                                                  const targetColIndices: number[] = [];
                                                  if (isVertBoundaryInSelection && tableCellSelection && tableCellSelection.blockIdx === idx) {
                                                    const selC1 = Math.min(tableCellSelection.startCol, tableCellSelection.endCol);
                                                    const selC2 = Math.max(tableCellSelection.startCol, tableCellSelection.endCol);
                                                    for (let cc = selC1; cc <= selC2; cc++) targetColIndices.push(cc);
                                                  } else {
                                                    targetColIndices.push(cIdx);
                                                  }
                                                  const targetCols = targetColIndices
                                                    .map((cc) => {
                                                      const yp = cellYPlacements[rIdx]?.[cc];
                                                      const nRow = yp?.nextRowIdx ?? null;
                                                      const nYp = nRow !== null ? cellYPlacements[nRow]?.[cc] : undefined;
                                                      if (!yp || nRow === null || !nYp) return null;
                                                      const snap = cellYPlacements
                                                        .map((rowArr, rowI) => (rowArr?.[cc] ? { rowIdx: rowI, heightPx: rowArr[cc].heightPx } : null))
                                                        .filter((x): x is { rowIdx: number; heightPx: number } => x !== null);
                                                      return {
                                                        colIdx: cc,
                                                        rowIdx: rIdx,
                                                        nextRowIdx: nRow,
                                                        curHeightPx: yp.heightPx,
                                                        nextHeightPx: nYp.heightPx,
                                                        colSnapshot: snap,
                                                      };
                                                    })
                                                    .filter((x): x is NonNullable<typeof x> => x !== null);
                                                  if (targetCols.length > 0) {
                                                    startSingleCellHeightResize(e, idx, targetCols);
                                                    return;
                                                  }
                                                }
                                                startTableRowResize(e, idx, rIdx + rSpan - 1, activeRowHeights, block.rows.length);
                                              }}
                                              className="absolute left-0 right-0 -bottom-[5px] h-[10px] z-30 cursor-row-resize flex items-center group/rowres select-none"
                                              title="행 높이 조절 (셀 블록 선택 또는 Ctrl+드래그: 이 셀만 조절, Shift+드래그: 행 전체 조절)"
                                            >
                                              <div className="h-[2px] w-full bg-transparent group-hover/rowres:bg-blue-500/80 transition-colors" />
                                            </div>
                                            <input
                                              type="text"
                                              value={cell.text}
                                              onChange={(e) => updateTableCell(idx, rIdx, cIdx, e.target.value)}
                                              onFocus={() => {
                                                setSelectedIdx(idx);
                                                setActiveTableCell({ blockIdx: idx, row: rIdx, col: cIdx });
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape" && tableCellSelection) { e.preventDefault(); setTableCellSelection(null); return; }
                                                if (e.key === "F5") { e.preventDefault(); setTableCellSelection({ blockIdx: idx, startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx }); return; }
                                                if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                                                  e.preventDefault();
                                                  setTableCellSelection((prev) => {
                                                    const base = prev && prev.blockIdx === idx ? prev : { blockIdx: idx, startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx };
                                                    let nextRow = base.endRow;
                                                    let nextCol = base.endCol;
                                                    if (e.key === "ArrowUp") nextRow = Math.max(0, nextRow - 1);
                                                    if (e.key === "ArrowDown") nextRow = Math.min(block.rows.length - 1, nextRow + 1);
                                                    if (e.key === "ArrowLeft") nextCol = Math.max(0, nextCol - 1);
                                                    if (e.key === "ArrowRight") nextCol = Math.min(row.length - 1, nextCol + 1);
                                                    return { ...base, endRow: nextRow, endCol: nextCol };
                                                  });
                                                  return;
                                                }
                                                if ((e.key === "Delete" || e.key === "Backspace") && tableCellSelection && tableCellSelection.blockIdx === idx) { e.preventDefault(); deleteSelected(); return; }
                                                if (e.key === "ArrowUp") {
                                                  if (rIdx === 0) {
                                                    e.preventDefault();
                                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                    navigateToPrevParagraph(idx, rect.left);
                                                  } else {
                                                    const tableEl = (e.target as HTMLElement).closest("[data-hwpx-table]");
                                                    const targetInput = tableEl?.querySelector(`[data-row-idx="${rIdx - 1}"][data-col-idx="${cIdx}"] input`) as HTMLInputElement | null;
                                                    if (targetInput) {
                                                      e.preventDefault();
                                                      targetInput.focus();
                                                    }
                                                  }
                                                } else if (e.key === "ArrowDown") {
                                                  if (rIdx === block.rows.length - 1) {
                                                    e.preventDefault();
                                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                    navigateToNextParagraph(idx, rect.left);
                                                  } else {
                                                    const tableEl = (e.target as HTMLElement).closest("[data-hwpx-table]");
                                                    const targetInput = tableEl?.querySelector(`[data-row-idx="${rIdx + 1}"][data-col-idx="${cIdx}"] input`) as HTMLInputElement | null;
                                                    if (targetInput) {
                                                      e.preventDefault();
                                                      targetInput.focus();
                                                    }
                                                  }
                                                } else if (e.key === "ArrowLeft") {
                                                  const inputEl = e.currentTarget;
                                                  if (inputEl.selectionStart === 0 && inputEl.selectionEnd === 0) {
                                                    if (cIdx === 0 && rIdx === 0) {
                                                      e.preventDefault();
                                                      navigateToPrevParagraph(idx, 999999);
                                                    } else if (cIdx > 0) {
                                                      const tableEl = inputEl.closest("[data-hwpx-table]");
                                                      const prevInput = tableEl?.querySelector(`[data-row-idx="${rIdx}"][data-col-idx="${cIdx - 1}"] input`) as HTMLInputElement | null;
                                                      if (prevInput) {
                                                        e.preventDefault();
                                                        prevInput.focus();
                                                        prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
                                                      }
                                                    }
                                                  }
                                                } else if (e.key === "ArrowRight") {
                                                  const inputEl = e.currentTarget;
                                                  const valLen = inputEl.value.length;
                                                  if (inputEl.selectionStart === valLen && inputEl.selectionEnd === valLen) {
                                                    if (cIdx === row.length - 1 && rIdx === block.rows.length - 1) {
                                                      e.preventDefault();
                                                      navigateToNextParagraph(idx, 0);
                                                    } else if (cIdx < row.length - 1) {
                                                      const tableEl = inputEl.closest("[data-hwpx-table]");
                                                      const nextInput = tableEl?.querySelector(`[data-row-idx="${rIdx}"][data-col-idx="${cIdx + 1}"] input`) as HTMLInputElement | null;
                                                      if (nextInput) {
                                                        e.preventDefault();
                                                        nextInput.focus();
                                                        nextInput.setSelectionRange(0, 0);
                                                      }
                                                    }
                                                  }
                                                }
                                              }}
                                              style={(() => {
                                                const cs = tableCellStyles[`${block.id}:${rIdx}:${cIdx}`];
                                                if (!cs) return undefined;
                                                const dec = [cs.underline ? "underline" : "", cs.strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
                                                return {
                                                  fontFamily: cs.fontFamily,
                                                  fontSize: cs.sizePt ? `${cs.sizePt}pt` : undefined,
                                                  fontWeight: "normal",
                                                  textShadow: cs.bold ? "0.42px 0 0 currentColor, -0.15px 0 0 currentColor" : undefined,
                                                  fontStyle: cs.italic ? "italic" : undefined,
                                                  textDecoration: dec || undefined,
                                                  color: cs.color,
                                                  backgroundColor: cs.shadingColor,
                                                  textAlign: cs.align === "justify" ? "left" : cs.align,
                                                } as React.CSSProperties;
                                              })()}
                                              className={`relative z-[2] w-full min-w-0 bg-transparent border-none outline-none px-1 ${yPlacement.heightPx < 26 ? "py-0 leading-none" : "py-0.5"} rounded focus:bg-blue-50 text-center font-sans text-xs cursor-text`}
                                            />
                                          </div>
                                        );
                                      });
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* 하단 캡션 */}
                            {isCaptionBottom && (
                              <div className={`mt-2 text-xs text-neutral-800 font-sans flex items-center ${captionAlignClass}`}>
                                <div className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 shadow-2xs">
                                  <span className="text-[10px] text-blue-700 font-bold font-mono">#1</span>
                                  <input
                                    type="text"
                                    value={block.caption || ""}
                                    onChange={(e) => {
                                      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                                      const yBlock = yBlocks.get(idx);
                                      if (yBlock) yBlock.set("caption", e.target.value);
                                    }}
                                    placeholder="[표 캡션 입력...]"
                                    className="bg-transparent border-none outline-none text-xs text-neutral-800 font-semibold min-w-[70px]"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (block.type === "image") {
                        const alignClass = block.align === "right" ? "items-end" : block.align === "center" ? "items-center" : "items-start";
                        const currentWidthPct = dragResize[idx]?.widthPercent ?? block.widthPercent ?? 75;
                        const widthStyle = `${currentWidthPct}%`;
                        const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                        const isMoved = currentOffset.x !== 0 || currentOffset.y !== 0;
                        const hasImageCaption = !!((block.captionPos && block.captionPos !== "none") || (block.caption !== undefined && block.caption !== null && block.caption !== ""));
                        const isImageCaptionTop = hasImageCaption && block.captionPos?.startsWith("top");
                        const isImageCaptionBottom = hasImageCaption && !isImageCaptionTop;
                        const imageCaptionAlign = block.captionPos?.includes("left") ? "justify-start" : block.captionPos?.includes("right") ? "justify-end" : "justify-center";

                        const isImgSquare = block.treatAsChar === false && block.textWrap === "SQUARE";
                        const isImgTopBottom = block.treatAsChar === false && block.textWrap === "TOP_AND_BOTTOM";
                        const isImgBehind = block.treatAsChar === false && block.textWrap === "BEHIND_TEXT";
                        const imgSquareFloat = isImgSquare
                          ? (block.textFlow === "LEFT_ONLY" || (block.textFlow !== "RIGHT_ONLY" && currentOffset.x > 160) ? "right" : "left")
                          : undefined;

                        return (
                          <div
                            key={`${block.id}-${sliceStart ?? 0}`}
                            data-block-id={block.id}
                            data-block-idx={idx}
                            data-block-type="image"
                            contentEditable={false}
                            onDragOver={handleBlockDragOver}
                            onDragLeave={handleBlockDragLeave}
                            onDrop={handleBlockDrop}
                            onClick={() => setSelectedIdx(idx)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedIdx(idx);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                blockIdx: idx,
                                blockType: "image",
                              });
                            }}
                            style={{
                              width: isInlineImageWithText ? widthStyle : undefined,
                              transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                              zIndex: isSelected ? 30 : isImgBehind ? 0 : block.treatAsChar === false ? 15 : 1,
                            }}
                            className={
                              block.treatAsChar === false
                                  ? "h-0 my-0 overflow-visible flex flex-col items-start cursor-default select-none relative group/img"
                                  : isInlineImageWithText
                                    ? "inline-block align-bottom mx-1 my-0.5 cursor-default select-none relative group/img"
                                    : `my-2 flex flex-col cursor-default select-none relative group/img ${alignClass}`
                            }
                          >
                            {renderDropIndicator()}
                            {showControlMarks && (
                              <span data-control-mark="image" className="inline-block mb-0.5 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                                [그림]
                              </span>
                            )}
                            {/* 그림 상단 캡션 */}
                            {isImageCaptionTop && (
                              <div className={`mb-2 text-xs text-neutral-800 font-sans flex items-center ${imageCaptionAlign}`} style={{ width: widthStyle }}>
                                <div className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 shadow-2xs">
                                  <span className="text-[10px] text-blue-700 font-bold font-mono">#1</span>
                                  <input
                                    type="text"
                                    value={block.caption || ""}
                                    onChange={(e) => updateImageBlock(idx, { caption: e.target.value })}
                                    placeholder="[그림 캡션 입력...]"
                                    className="bg-transparent border-none outline-none text-xs text-neutral-800 font-semibold min-w-[70px]"
                                  />
                                </div>
                              </div>
                            )}

                            <div
                              onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                              onDoubleClick={(e) => {
                                if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;
                                e.stopPropagation();
                                setSelectedIdx(idx);
                                openPropertyModal(idx);
                              }}
                              className={`hwpx-resizable-box shrink-0 relative flex flex-col items-center ${block.treatAsChar === false ? "cursor-move" : "cursor-grab active:cursor-grabbing"} ${isSelected
                                ? "outline outline-[1.5px] outline-[#0066cc] outline-offset-1"
                                : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                                }`}
                              style={{ width: isInlineImageWithText ? "100%" : widthStyle }}
                            >
                              {/* 8방향 선택 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                              {isSelected && (
                                <HwpxSelectionHandles
                                  onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                                />
                              )}

                              {/* 그림 전용 우측 플로팅 리모컨 */}
                              {isSelected && (
                                <HwpxFloatingToolbar
                                  icon={<ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                  title="그림 리모컨"
                                  onClose={() => setSelectedIdx(-1)}
                                >
                                  <button
                                    type="button"
                                    onClick={() => openPropertyModal(idx)}
                                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-neutral-50 border border-neutral-200 font-medium cursor-pointer"
                                    title="그림 개체 속성 (단축키 P)"
                                  >
                                    <span>⚙</span>
                                    <span>개체 속성 (P)</span>
                                  </button>

                                  <HwpxRemoteSizeControls
                                    widthPercent={currentWidthPct}
                                    heightPt={dragResize[idx]?.heightPt ?? block.heightPt}
                                    contentWidthMm={Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0))}
                                  onChangeWidth={(w) => commitObjectResize(idx, w, undefined)}
                                    onChangeHeight={(h) => commitObjectResize(idx, undefined, h)}
                                  />

                                  <div className="pt-1 border-t border-neutral-200">
                                    <button type="button" onClick={() => deleteBlock(idx)} className="w-full py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors" title="그림 삭제">
                                      <span>🗑</span><span>그림 삭제</span>
                                    </button>
                                  </div>
                                </HwpxFloatingToolbar>
                              )}

                              <img
                                src={block.src}
                                alt={block.caption || "그림"}
                                style={block.heightPt ? { height: `${block.heightPt}pt` } : undefined}
                                className={block.heightPt ? "w-full object-contain block select-none pointer-events-none" : "w-full h-auto object-contain max-h-[600px] block select-none pointer-events-none"}
                              />
                            </div>

                            {/* 그림 하단 캡션 */}
                            {isImageCaptionBottom && (
                              <div className={`mt-2 text-xs text-neutral-800 font-sans flex items-center ${imageCaptionAlign}`} style={{ width: widthStyle }}>
                                <div className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 shadow-2xs">
                                  <span className="text-[10px] text-blue-700 font-bold font-mono">#1</span>
                                  <input
                                    type="text"
                                    value={block.caption || ""}
                                    onChange={(e) => updateImageBlock(idx, { caption: e.target.value })}
                                    placeholder="[그림 캡션 입력...]"
                                    className="bg-transparent border-none outline-none text-xs text-neutral-800 font-semibold min-w-[70px]"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (block.type === "shape") {
                        const alignClass = block.align === "right" ? "items-end" : block.align === "center" ? "items-center" : "items-start";
                        const currentWidthPct = dragResize[idx]?.widthPercent ?? block.widthPercent ?? 75;
                        const currentHeightPt = dragResize[idx]?.heightPt ?? block.heightPt ?? (block.shapeType === "line" ? 2 : 60);
                        const widthStyle = `${currentWidthPct}%`;
                        const isLine = block.shapeType === "line";
                        const borderRadius = block.shapeType === "roundRect" ? "8px" : block.shapeType === "ellipse" ? "9999px" : "0px";
                        const fillColor = block.fillColor === "transparent" ? "transparent" : (block.fillColor || "#FFFFFF");
                        const strokeColor = block.strokeColor || "#1F2937";
                        const strokeWidth = block.strokeWidth || 1.5;
                        const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                        const isMoved = currentOffset.x !== 0 || currentOffset.y !== 0;
                        const hasShapeCaption = !!((block.captionPos && block.captionPos !== "none") || (block.caption !== undefined && block.caption !== null && block.caption !== ""));
                        const isShapeCaptionTop = hasShapeCaption && block.captionPos?.startsWith("top");
                        const isShapeCaptionBottom = hasShapeCaption && !isShapeCaptionTop;
                        const shapeCaptionAlign = block.captionPos?.includes("left") ? "justify-start" : block.captionPos?.includes("right") ? "justify-end" : "justify-center";

                        const isShapeSquare = block.treatAsChar === false && block.textWrap === "SQUARE";
                        const isShapeTopBottom = block.treatAsChar === false && block.textWrap === "TOP_AND_BOTTOM";
                        const isShapeBehind = block.treatAsChar === false && block.textWrap === "BEHIND_TEXT";
                        const shapeSquareFloat = isShapeSquare
                          ? (block.textFlow === "LEFT_ONLY" || (block.textFlow !== "RIGHT_ONLY" && currentOffset.x > 160) ? "right" : "left")
                          : undefined;

                        return (
                          <div
                            key={`${block.id}-${sliceStart ?? 0}`}
                            data-block-id={block.id}
                            data-block-idx={idx}
                            data-block-type="shape"
                            tabIndex={-1}
                            contentEditable={false}
                            onDragOver={handleBlockDragOver}
                            onDragLeave={handleBlockDragLeave}
                            onDrop={handleBlockDrop}
                            onClick={() => setSelectedIdx(idx)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedIdx(idx);
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                blockIdx: idx,
                                blockType: "shape",
                              });
                            }}
                            style={{
                              width: isInlineShapeWithText ? widthStyle : undefined,
                              transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                              zIndex: isSelected ? 30 : isShapeBehind ? 0 : block.treatAsChar === false ? 15 : 1,
                            }}
                            className={
                                !block.id.startsWith("band_") && block.treatAsChar === false && block.textWrap !== "TOP_AND_BOTTOM"
                                  ? "h-0 my-0 overflow-visible flex flex-col items-start cursor-default select-none relative group/shape"
                                  : isInlineShapeWithText
                                    ? "inline-block align-bottom mx-1 my-0.5 cursor-default select-none relative group/shape"
                                    : `${block.text?.startsWith("__WEB_VIDEO__:") ? "my-0" : block.id.startsWith("band_") ? "my-1" : "my-2"} flex flex-col cursor-default select-none relative group/shape ${alignClass}`
                            }
                          >
                            {renderDropIndicator()}
                            {showControlMarks && (
                              <span data-control-mark="shape" className="inline-block mb-0.5 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                                [도형]
                              </span>
                            )}
                            {/* 도형 상단 캡션 */}
                            {isShapeCaptionTop && (
                              <div className={`mb-2 text-xs text-neutral-800 font-sans flex items-center ${shapeCaptionAlign}`} style={{ width: widthStyle }}>
                                <div className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 shadow-2xs">
                                  <span className="text-[10px] text-blue-700 font-bold font-mono">#1</span>
                                  <input
                                    type="text"
                                    value={block.caption || ""}
                                    onChange={(e) => updateShapeBlock(idx, { caption: e.target.value })}
                                    placeholder="[도형 캡션 입력...]"
                                    className="bg-transparent border-none outline-none text-xs text-neutral-800 font-semibold min-w-[70px]"
                                  />
                                </div>
                              </div>
                            )}

                            <div
                              onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                              onDoubleClick={(e) => {
                                const targetEl = e.target as HTMLElement;
                                if (targetEl.closest("button, input, select")) return;
                                if (targetEl.tagName === "TEXTAREA" && (block.text || "").trim().length > 0) return;
                                e.stopPropagation();
                                setSelectedIdx(idx);
                                openPropertyModal(idx);
                              }}
                              className={`hwpx-resizable-box shrink-0 relative flex flex-col items-center ${block.treatAsChar === false || isMoved ? "cursor-move" : "cursor-grab active:cursor-grabbing"} ${isSelected
                                ? "outline outline-[1.5px] outline-[#0066cc] outline-offset-1"
                                : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                                }`}
                              style={{ width: isInlineShapeWithText ? "100%" : widthStyle }}
                            >
                              {/* 8방향 선택 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                              {isSelected && (
                                <HwpxSelectionHandles
                                  onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                                />
                              )}

                              {/* 도형 전용 우측 플로팅 리모컨 */}
                              {isSelected && (
                                <HwpxFloatingToolbar
                                  icon={<ShapesIcon className="w-3.5 h-3.5 text-[#0066cc] shrink-0" />}
                                  title={
                                    block.isTextBox
                                      ? "글상자"
                                      : block.shapeType === "rect"
                                        ? "직사각형"
                                        : block.shapeType === "roundRect"
                                          ? "둥근 사각형"
                                          : block.shapeType === "ellipse"
                                            ? "타원"
                                            : block.shapeType === "arc"
                                              ? "호"
                                              : "직선"
                                  }
                                  onClose={() => setSelectedIdx(-1)}
                                >
                                  <button
                                    type="button"
                                    onClick={() => openPropertyModal(idx)}
                                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-neutral-50 border border-neutral-200 font-medium cursor-pointer"
                                    title="도형 개체 속성 (단축키 P)"
                                  >
                                    <span>⚙</span>
                                    <span>개체 속성 (P)</span>
                                  </button>

                                  <HwpxRemoteSizeControls
                                    widthPercent={currentWidthPct}
                                    heightPt={currentHeightPt}
                                    contentWidthMm={Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0))}
                                  onChangeWidth={(w) => commitObjectResize(idx, w, undefined)}
                                    onChangeHeight={(h) => commitObjectResize(idx, undefined, h)}
                                  />

                                  {!isLine && (
                                    <HwpxRemoteColorPicker
                                      label="채우기"
                                      color={fillColor}
                                      allowTransparent
                                      onChange={(c) => updateShapeBlock(idx, { fillColor: c })}
                                    />
                                  )}

                                  <HwpxRemoteColorPicker
                                    label="선 색상"
                                    color={strokeColor}
                                    onChange={(c) => updateShapeBlock(idx, { strokeColor: c })}
                                  />

                                  <div className="pt-1 border-t border-neutral-200">
                                    <button type="button" onClick={() => deleteBlock(idx)} className="w-full py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors" title="도형 삭제">
                                      <span>🗑</span><span>도형 삭제</span>
                                    </button>
                                  </div>
                                </HwpxFloatingToolbar>
                              )}

                              {/* 도형 렌더링 */}
                              {block.shapeType === "arc" ? (
                                <div style={{ width: "100%", height: `${currentHeightPt}pt` }} className="flex items-center justify-center">
                                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                    <path
                                      d="M 1 1 A 98 98 0 0 1 99 99"
                                      fill="none"
                                      stroke={strokeColor}
                                      strokeWidth={Math.max(1, strokeWidth)}
                                      vectorEffect="non-scaling-stroke"
                                      strokeDasharray={block.strokeType === "DASH" ? "6,4" : block.strokeType === "DOT" ? "2,3" : undefined}
                                    />
                                  </svg>
                                </div>
                              ) : isLine ? (
                                currentHeightPt > 4.5 ? (
                                  <svg
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="none"
                                    style={{ width: "100%", height: `${currentHeightPt}pt` }}
                                    className="overflow-visible"
                                  >
                                    <line
                                      x1="0"
                                      y1={block.lineDir === "bl-tr" ? 100 : 0}
                                      x2="100"
                                      y2={block.lineDir === "bl-tr" ? 0 : 100}
                                      stroke={strokeColor}
                                      strokeWidth={Math.max(1.5, strokeWidth)}
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  </svg>
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: `${Math.max(1, strokeWidth)}px`,
                                      backgroundColor: strokeColor,
                                    }}
                                    className={block.id.startsWith("band_") ? "my-0.5" : "my-3"}
                                  />
                                )
                              ) : (
                                block.text?.startsWith("__WEB_VIDEO__:") ? (() => {
                                  const rawVidUrl = block.text.slice("__WEB_VIDEO__:".length);
                                  const parsedVid = parseWebVideoSource(rawVidUrl);
                                  const isPlaying = Boolean(playingVideoIds[block.id]);
                                  return (
                                    <div
                                      style={{ width: "100%", height: `${currentHeightPt}pt` }}
                                      className="relative bg-black overflow-hidden flex items-center justify-center"
                                    >
                                      {isPlaying && parsedVid ? (
                                        parsedVid.kind === "video" ? (
                                          <video src={parsedVid.embedUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
                                        ) : (
                                          <iframe
                                            src={parsedVid.embedUrl}
                                            title="웹 동영상"
                                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                                            allowFullScreen
                                            className="w-full h-full border-0"
                                          />
                                        )
                                      ) : (
                                        <>
                                          {parsedVid?.thumbUrl && (
                                            <img src={parsedVid.thumbUrl} alt="웹 동영상 썸네일" className="w-full h-full object-contain bg-black pointer-events-none" />
                                          )}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPlayingVideoIds((prev) => ({ ...prev, [block.id]: true }));
                                            }}
                                            title="동영상 재생"
                                            className="absolute inset-0 m-auto w-14 h-14 rounded-full border-2 border-white bg-black/45 hover:bg-black/65 flex items-center justify-center cursor-pointer transition shadow-lg"
                                          >
                                            <svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <polygon points="7 5 19 12 7 19 7 5" />
                                            </svg>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  );
                                })() : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${currentHeightPt}pt`,
                                    backgroundColor: fillColor,
                                    borderColor: strokeColor,
                                    borderWidth: `${strokeWidth}px`,
                                    borderStyle: block.strokeType === "DASH" ? "dashed" : block.strokeType === "DOT" ? "dotted" : "solid",
                                    borderRadius,
                                  }}
                            className={(block.isTextBox || (block.text !== undefined && block.text !== "")) ? "p-3 flex items-center justify-center relative overflow-hidden" : "relative overflow-hidden"}
                          >
                            {(block.isTextBox || (block.text !== undefined && block.text !== "")) && (
                              <textarea
                                value={block.text || ""}
                                onChange={(e) => updateShapeBlock(idx, { text: e.target.value })}
                                onFocus={() => setSelectedIdx(idx)}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowUp") {
                                    const target = e.currentTarget;
                                    if (target.selectionStart === 0 && target.selectionEnd === 0) {
                                      e.preventDefault();
                                      const rect = target.getBoundingClientRect();
                                      navigateToPrevParagraph(idx, rect.left);
                                    }
                                  } else if (e.key === "ArrowDown") {
                                    const target = e.currentTarget;
                                    const valLen = target.value.length;
                                    if (target.selectionStart === valLen && target.selectionEnd === valLen) {
                                      e.preventDefault();
                                      const rect = target.getBoundingClientRect();
                                      navigateToNextParagraph(idx, rect.left);
                                    }
                                  }
                                }}
                                placeholder="글상자 내용 입력..."
                                rows={Math.max(1, (block.text || "").split("\n").length)}
                                className="w-full h-full bg-transparent border-none outline-none text-center text-xs text-neutral-900 resize-none font-sans leading-relaxed"
                              />
                            )}
                          </div>
                          )
                        )}
                      </div>

                      {/* 도형 하단 캡션 */}
                      {isShapeCaptionBottom && (
                        <div className={`mt-2 text-xs text-neutral-800 font-sans flex items-center ${shapeCaptionAlign}`} style={{ width: widthStyle }}>
                          <div className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded px-2 py-0.5 shadow-2xs">
                            <span className="text-[10px] text-blue-700 font-bold font-mono">#1</span>
                            <input
                              type="text"
                              value={block.caption || ""}
                              onChange={(e) => updateShapeBlock(idx, { caption: e.target.value })}
                              placeholder="[도형 캡션 입력...]"
                              className="bg-transparent border-none outline-none text-xs text-neutral-800 font-semibold min-w-[70px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.type === "equation") {
                  const mathML = parseHwpEquation(block.script || "");
                  const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                  const isMoved = currentOffset.x !== 0 || currentOffset.y !== 0;

                  return (
                    <div
                      key={`${block.id}-${sliceStart ?? 0}`}
                      data-block-id={block.id}
                      data-block-idx={idx}
                      data-block-type="equation"
                      tabIndex={-1}
                      contentEditable={false}
                      onDragOver={handleBlockDragOver}
                      onDragLeave={handleBlockDragLeave}
                      onDrop={handleBlockDrop}
                      onClick={(e) => { if (e.target === e.currentTarget) setSelectedIdx(-1); }}
                      style={{
                        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                        zIndex: isSelected ? 30 : 1,
                      }}
                      className="my-2 flex flex-col items-start cursor-default select-none relative group/eq outline-none"
                    >
                      {renderDropIndicator()}
                      {showControlMarks && (
                        <span data-control-mark="equation" className="self-start mb-1 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                          [수식]
                        </span>
                      )}
                      <div
                        onClick={(e) => { e.stopPropagation(); setSelectedIdx(idx); }}
                        onDoubleClick={(e) => { e.stopPropagation(); openEditEquation(idx); }}
                        onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                        className={`relative inline-flex items-center justify-start px-0.5 py-0 rounded-xs transition-all cursor-move ${
                          isSelected
                            ? "outline outline-[1.5px] outline-[#0066cc] outline-offset-2 bg-blue-50/20"
                            : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                        }`}
                      >
                        {/* 8방향 선택 핸들 */}
                        {isSelected && <HwpxSelectionHandles />}

                        {/* 수식 전용 우측 플로팅 리모컨 */}
                        {isSelected && (
                          <HwpxFloatingToolbar
                            icon={<EquationIcon className="w-3.5 h-3.5 text-[#0066cc] shrink-0" />}
                            title="수식 리모컨"
                            onClose={() => setSelectedIdx(-1)}
                          >
                            <button
                              type="button"
                              onClick={() => openEditEquation(idx)}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-neutral-50 border border-neutral-200 font-medium cursor-pointer"
                            >
                              <span>✏️</span>
                              <span>수식 편집</span>
                            </button>

                            <div className="pt-1 border-t border-neutral-200">
                              <button type="button" onClick={() => deleteBlock(idx)} className="w-full py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors" title="수식 삭제">
                                <span>🗑</span><span>수식 삭제</span>
                              </button>
                            </div>
                          </HwpxFloatingToolbar>
                        )}

                        {/* 미려한 한글 MathML 수식 렌더링 */}
                        <div
                          dangerouslySetInnerHTML={{ __html: mathML }}
                          className="hwpx-rendered-equation-wrapper py-0 px-1 pointer-events-none select-none"
                        />
                      </div>
                    </div>
                  );
                }

                if (block.type === "chart") {
                  const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                  const widthStyle = `${block.widthPercent || 85}%`;
                  const chartAlignClass =
                    block.align === "center"
                      ? "items-center text-center"
                      : block.align === "right"
                      ? "items-end text-right"
                      : "items-start text-left";

                  return (
                    <div
                      key={`${block.id}-${sliceStart ?? 0}`}
                      data-block-id={block.id}
                      data-block-idx={idx}
                      data-block-type="chart"
                      contentEditable={false}
                      onDragOver={handleBlockDragOver}
                      onDragLeave={handleBlockDragLeave}
                      onDrop={handleBlockDrop}
                      onClick={() => setSelectedIdx(idx)}
                      onDoubleClick={() => openEditChartData(idx)}
                      style={{
                        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                        zIndex: isSelected ? 30 : block.treatAsChar === false ? 15 : 1,
                      }}
                      className={
                        block.treatAsChar === false
                          ? "h-0 my-0 overflow-visible flex flex-col items-start cursor-default select-none relative group/chart"
                          : `my-3 flex flex-col ${chartAlignClass} cursor-default select-none relative group/chart`
                      }
                    >
                      {renderDropIndicator()}
                      {showControlMarks && (
                        <span data-control-mark="chart" className="self-start mb-1 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                          [차트]
                        </span>
                      )}

                      <div
                        onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                        onDoubleClick={(e) => {
                          if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;
                          e.stopPropagation();
                          setSelectedIdx(idx);
                          openPropertyModal(idx);
                        }}
                        className={`hwpx-resizable-box relative flex flex-col items-center cursor-move p-2 rounded-none bg-white border border-neutral-300 transition-all ${
                          isSelected
                            ? "outline outline-2 outline-[#0066cc] outline-offset-2 shadow-md"
                            : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                        }`}
                        style={{ width: widthStyle }}
                      >
                        {/* 8방향 선택 핸들 */}
                        {isSelected && (
                          <HwpxSelectionHandles
                            onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                          />
                        )}

                        {/* 차트 전용 우측 플로팅 리모컨 */}
                        {isSelected && (
                          <HwpxFloatingToolbar
                            icon={<ChartIcon className="w-3.5 h-3.5 text-[#0066cc] shrink-0" />}
                            title="차트 리모컨"
                            onClose={() => setSelectedIdx(-1)}
                          >
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openPropertyModal(idx); }}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-neutral-50 border border-neutral-200 font-medium cursor-pointer"
                              title="차트 개체 속성 (단축키 P)"
                            >
                              <span>⚙</span>
                              <span>개체 속성 (P)</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEditChartData(idx); }}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-white border border-neutral-200 font-medium cursor-pointer"
                              title="차트 데이터 및 레이블 편집"
                            >
                              <span>✏️</span>
                              <span>데이터 편집</span>
                            </button>

                            <HwpxRemoteSizeControls
                              widthPercent={dragResize[idx]?.widthPercent ?? block.widthPercent ?? 85}
                              heightPt={dragResize[idx]?.heightPt ?? block.heightPt}
                              contentWidthMm={Math.max(50, pageWidthMm - pageMarginLeftMm - pageMarginRightMm - (pageBindingType === "left" ? pageGutterMm : 0))}
                                  onChangeWidth={(w) => commitObjectResize(idx, w, undefined)}
                              onChangeHeight={(h) => commitObjectResize(idx, undefined, h)}
                            />

                            <div className="space-y-1">
                              <div className="text-[10px] font-semibold text-neutral-500 px-0.5">차트 종류</div>
                              <div className="grid grid-cols-2 gap-1">
                                {[
                                  { id: "column" as const, label: "세로막대", icon: "📊" },
                                  { id: "bar" as const, label: "가로막대", icon: "📶" },
                                  { id: "line" as const, label: "꺾은선", icon: "📈" },
                                  { id: "pie" as const, label: "원형", icon: "🍕" },
                                ].map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); updateChartType(idx, t.id); }}
                                    className={`px-1.5 py-1 rounded text-[10px] font-medium transition cursor-pointer flex items-center justify-center gap-0.5 border ${
                                      block.chartType === t.id
                                        ? "bg-[#0066cc] text-white border-[#0066cc] font-bold"
                                        : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                                    }`}
                                    title={`${t.label} 차트로 전환`}
                                  >
                                    <span>{t.icon}</span>
                                    <span>{t.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="pt-1 border-t border-neutral-200">
                              <button type="button" onClick={(e) => { e.stopPropagation(); deleteBlock(idx); }} className="w-full py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors" title="차트 삭제">
                                <span>🗑</span><span>차트 삭제</span>
                              </button>
                            </div>
                          </HwpxFloatingToolbar>
                        )}

                        {/* 실제 차트 SVG 렌더링 */}
                        {block.title && (
                          <div className="w-full text-center text-xs font-bold text-neutral-800 pt-1">
                            {block.title}
                          </div>
                        )}
                        <div className="w-full flex justify-center py-2">
                          <HwpxSvgChart chart={block} />
                        </div>
                      </div>

                      {/* 하단 캡션 */}
                      {block.caption && (
                        <div className="mt-1 text-xs text-neutral-600 font-medium text-center">
                          {block.caption}
                        </div>
                      )}
                    </div>
                  );
                }

                return null;
              };

              const sectionGroups: Array<{
                secIdx: number;
                secLayout: "1" | "2" | "3" | "left" | "right";
                items: typeof pageIndices;
              }> = [];
              for (const item of pageIndices) {
                const secIdx = getBlockSectionIdx(item.idx);
                const secLayout = columnSectionLayouts[secIdx] ?? "1";
                const lastGroup = sectionGroups[sectionGroups.length - 1];
                if (!lastGroup || lastGroup.secIdx !== secIdx) {
                  sectionGroups.push({ secIdx, secLayout, items: [item] });
                } else {
                  lastGroup.items.push(item);
                }
              }

              return sectionGroups.map((group, gIdx) => {
                const secStyle: React.CSSProperties | undefined =
                  group.secLayout === "left" || group.secLayout === "right"
                    ? {
                        display: "grid",
                        gridTemplateColumns: group.secLayout === "left" ? "35fr 65fr" : "65fr 35fr",
                        columnGap: "28px",
                        alignItems: "start",
                      }
                    : group.secLayout !== "1"
                      ? {
                          columnCount: group.secLayout === "3" ? 3 : 2,
                          columnGap: group.secLayout === "3" ? "20px" : "28px",
                        }
                      : undefined;

                let content: React.ReactNode;
                if (group.secLayout === "left" || group.secLayout === "right") {
                  const breakPos = group.items.findIndex(({ idx }, i) => i > 0 && blocks[idx] && columnBreakBlockIds[blocks[idx].id]);
                  let splitAt = breakPos !== -1 ? breakPos : -1;
                  if (splitAt === -1) {
                    const weights = group.items.map(({ idx, sliceStart, sliceEnd }) => {
                      const b = blocks[idx];
                      if (!b) return 1;
                      if (b.type === "paragraph") {
                        const len = (sliceEnd ?? b.text.length) - (sliceStart ?? 0);
                        return Math.max(1, Math.ceil(len / 32));
                      }
                      return 5;
                    });
                    const totalW = weights.reduce((a, b) => a + b, 0);
                    const targetW = totalW * (group.secLayout === "left" ? 0.35 : 0.65);
                    let acc = 0;
                    splitAt = Math.max(1, Math.floor(group.items.length * (group.secLayout === "left" ? 0.35 : 0.65)));
                    for (let i = 0; i < weights.length - 1; i++) {
                      acc += weights[i];
                      if (acc >= targetW) {
                        splitAt = i + 1;
                        break;
                      }
                    }
                  }
                  const leftItems = group.items.slice(0, splitAt);
                  const rightItems = group.items.slice(splitAt);
                  content = (
                    <>
                      <div data-col-pane="left" className="min-w-0">{leftItems.map(renderPageItem)}</div>
                      <div data-col-pane="right" className="min-w-0">{rightItems.map(renderPageItem)}</div>
                    </>
                  );
                } else {
                  content = group.items.map(renderPageItem);
                }

                return (
                  <div
                    key={`col-sec-${group.secIdx}-${gIdx}`}
                    data-column-section={group.secIdx}
                    data-column-layout={group.secLayout}
                    style={secStyle}
                  >
                    {content}
                  </div>
                );
              });
            })()}
              <div className="clear-both" />
                  </div>
                  {/* 한컴독스 표준: 페이지 하단 각주(구분선 ~5cm + 1) ...) 및 마지막 페이지 미주 */}
                  {(() => {
                    const noteDocOrder = new Map<string, number>();
                    let noteScanSeq = 0;
                    const noteSupRe = /<sup\b[^>]*data-note-id=["']([^"']+)["'][^>]*>/gi;
                    for (const blk of blocks) {
                      if (isNoteBlock(blk) || blk.type !== "paragraph") continue;
                      let m: RegExpExecArray | null;
                      noteSupRe.lastIndex = 0;
                      while ((m = noteSupRe.exec(blk.text || "")) !== null) {
                        if (!noteDocOrder.has(m[1])) {
                          noteDocOrder.set(m[1], noteScanSeq++);
                        }
                      }
                    }
                    const byNoteDocOrder = (a: { b: HwpxCollabBlock; bIdx: number }, c: { b: HwpxCollabBlock; bIdx: number }) => {
                      const oa = noteDocOrder.get(a.b.id);
                      const oc = noteDocOrder.get(c.b.id);
                      if (oa !== undefined && oc !== undefined) return oa - oc;
                      if (oa !== undefined) return -1;
                      if (oc !== undefined) return 1;
                      return a.bIdx - c.bIdx;
                    };
                    const allFootnotes = blocks
                      .map((b, bIdx) => ({ b, bIdx }))
                      .filter(({ b }) => b.id.startsWith("footnote-"))
                      .sort(byNoteDocOrder);
                    const allEndnotes = blocks
                      .map((b, bIdx) => ({ b, bIdx }))
                      .filter(({ b }) => b.id.startsWith("endnote-"))
                      .sort(byNoteDocOrder);

                    const pageBodyHtml = pageIndices
                      .map(({ idx }) => {
                        const blk = blocks[idx];
                        return blk && blk.type === "paragraph" ? blk.text || "" : "";
                      })
                      .join("\n");

                    const matchedFootnotes = allFootnotes.filter(({ b }) => pageBodyHtml.includes(b.id)).sort((a, c) => pageBodyHtml.indexOf(a.b.id) - pageBodyHtml.indexOf(c.b.id));
                    const orphanFootnotes =
                      pageIdx === pages.length - 1
                        ? allFootnotes.filter(({ b }) =>
                            !pages.some((pg) =>
                              pg.some(({ idx }) => {
                                const blk = blocks[idx];
                                return blk && blk.type === "paragraph" && (blk.text || "").includes(b.id);
                              })
                            )
                          )
                        : [];
                    const pageFootnotes = [...matchedFootnotes, ...orphanFootnotes];
                    const showEndnotesHere = pageIdx === pages.length - 1 && allEndnotes.length > 0;

                    if (pageFootnotes.length === 0 && !showEndnotesHere) return null;

                    return (
                      <div className="mt-auto pt-3 flex flex-col gap-2 select-text">
                        {pageFootnotes.length > 0 && (
                          <div data-footnote-area="true" className="flex flex-col gap-0.5">
                            <div className="w-[180px] border-t border-neutral-800 mb-1.5" />
                            {pageFootnotes.map(({ b, bIdx }) => {
                              const num = allFootnotes.findIndex((x) => x.b.id === b.id) + 1;
                              return (
                                <div key={b.id} data-note-row={b.id} className="group/note flex items-baseline gap-1.5 text-[9pt] leading-snug text-neutral-900">
                                  <button
                                    type="button"
                                    data-note-jump={b.id}
                                    title="본문 번호 위치로 이동"
                                    onClick={() => {
                                      const supTarget = document.querySelector<HTMLElement>(`sup[data-note-id="${b.id}"]`);
                                      if (supTarget) {
                                        supTarget.scrollIntoView({ behavior: "smooth", block: "center" });
                                        const bodyPara = supTarget.closest<HTMLElement>("[contenteditable='true']");
                                        bodyPara?.focus({ preventScroll: true });
                                        flashNoteHighlight(supTarget);
                                      }
                                    }}
                                    className="shrink-0 select-none text-[#0066cc] hover:underline cursor-pointer"
                                  >
                                    {num})
                                  </button>
                                  <input
                                    type="text"
                                    data-note-input={b.id}
                                    value={b.type === "paragraph" ? b.text : ""}
                                    onChange={(e) => updateParagraph(bIdx, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        e.currentTarget.blur();
                                        const bodyEl = document.querySelector<HTMLElement>(`[data-block-idx="${selectedIdx}"] [contenteditable="true"]`);
                                        bodyEl?.focus();
                                      }
                                    }}
                                    placeholder="각주 내용 입력..."
                                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[9pt] leading-snug text-neutral-900 placeholder:text-neutral-300"
                                  />
                                  <button
                                    type="button"
                                    title="각주 삭제"
                                    onClick={() => deleteNoteBlock(b.id)}
                                    className="opacity-0 group-hover/note:opacity-100 text-[10px] text-neutral-400 hover:text-red-600 px-1 cursor-pointer transition"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {showEndnotesHere && (
                          <div data-endnote-area="true" className="flex flex-col gap-0.5 pt-2">
                            {allEndnotes.map(({ b, bIdx }, enIdx) => (
                              <div key={b.id} data-note-row={b.id} className="group/note flex items-baseline gap-1.5 text-[9pt] leading-snug text-neutral-900">
                                <button
                                  type="button"
                                  data-note-jump={b.id}
                                  title="본문 번호 위치로 이동"
                                  onClick={() => {
                                    const supTarget = document.querySelector<HTMLElement>(`sup[data-note-id="${b.id}"]`);
                                    if (supTarget) {
                                      supTarget.scrollIntoView({ behavior: "smooth", block: "center" });
                                      const bodyPara = supTarget.closest<HTMLElement>("[contenteditable='true']");
                                      bodyPara?.focus({ preventScroll: true });
                                      flashNoteHighlight(supTarget);
                                    }
                                  }}
                                  className="shrink-0 select-none text-[#0066cc] hover:underline cursor-pointer"
                                >
                                  {enIdx + 1})
                                </button>
                                <input
                                  type="text"
                                  data-note-input={b.id}
                                  value={b.type === "paragraph" ? b.text : ""}
                                  onChange={(e) => updateParagraph(bIdx, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                      const bodyEl = document.querySelector<HTMLElement>(`[data-block-idx="${selectedIdx}"] [contenteditable="true"]`);
                                      bodyEl?.focus();
                                    }
                                  }}
                                  placeholder="미주 내용 입력..."
                                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-[9pt] leading-snug text-neutral-900 placeholder:text-neutral-300"
                                />
                                <button
                                  type="button"
                                  title="미주 삭제"
                                  onClick={() => deleteNoteBlock(b.id)}
                                  className="opacity-0 group-hover/note:opacity-100 text-[10px] text-neutral-400 hover:text-red-600 px-1 cursor-pointer transition"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {showAllMemos && (() => {
                    const pageBlockIdSet = new Set(pageIndices.map((p) => blocks[p.idx]?.id).filter(Boolean));
                    const pageMemos = memos.filter((m) => pageBlockIdSet.has(m.blockId));
                    return (
                      <PageMemoLane
                        pageIdx={pageIdx}
                        pageMemos={pageMemos}
                        allMemos={memos}
                        showPageOutline={showPageOutline}
                        showMemoGuides={showMemoGuides}
                        activeMemoId={activeMemoId}
                        setActiveMemoId={setActiveMemoId}
                        updateMemoText={updateMemoText}
                        deleteMemo={deleteMemo}
                        zoomPercent={zoomPercent}
                        columnLayout={columnLayout}
                        blocksLength={blocks.length}
                      />
                    );
                  })()}
                  {/* 꼬리말 / 하단 쪽 번호 */}
                  {(() => {
                    const hidden = hiddenPageElements[pageIdx] || {};
                    const activeFooter = footerPos !== "none"
                      ? footerPos
                      : pageNumberPos === "bottom-left"
                        ? "left"
                        : pageNumberPos === "bottom-center"
                          ? "center"
                          : pageNumberPos === "bottom-right"
                            ? "right"
                            : "none";
                    if (activeFooter === "none" || hidden.footer || hidden.pageNumber) return null;
                    return (
                      <div
                        data-page-footer={pageIdx}
                        className={`absolute left-0 right-0 pointer-events-none select-none text-[9.5pt] text-neutral-600 flex ${
                          activeFooter === "left" ? "justify-start" : activeFooter === "right" ? "justify-end" : "justify-center"
                        }`}
                        style={{
                          bottom: `${Math.max(10, Math.round(pageMarginBottomMm * 3.78))}px`,
                          paddingLeft: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          paddingRight: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                        }}
                      >
                        <span>- {getDisplayPageNumber(pageIdx)} -</span>
                      </div>
                    );
                  })()}
              </div>
            ))}
            </div>
          </div>
        </main>
        <div id="hwpx-remote-slot" className="pointer-events-none absolute top-6 right-6 z-40" />
        {ribbonPopup?.kind === "search" && (
          <div
            data-ribbon-popup="search"
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ribbonPopup.left}px`, top: `${ribbonPopup.top}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
            className="fixed z-80 bg-white border border-neutral-300 rounded-[4px] py-1 min-w-[205px] text-xs text-neutral-800 flex flex-col"
          >
            <button
              type="button"
              onClick={() => { setRibbonPopup(null); setShowSearchModal(true); }}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <SearchIcon className="w-4 h-4 text-neutral-600" />
                <span>찾기...</span>
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+F</span>
            </button>
            <button
              type="button"
              onClick={() => { setRibbonPopup(null); setShowReplaceModal(true); }}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <ReplaceIcon className="w-4 h-4 text-neutral-600" />
                <span>찾아 바꾸기...</span>
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">Ctrl+H</span>
            </button>
            <button
              type="button"
              onClick={() => { setRibbonPopup(null); setShowGotoModal(true); }}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-4 text-center text-[#0066cc] font-bold">↪</span>
                <span>찾아가기</span>
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">Alt+G</span>
            </button>
          </div>
        )}
        {ribbonPopup?.kind === "shape" && (
          <div
            data-ribbon-popup="shape"
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ribbonPopup.left}px`, top: `${ribbonPopup.top}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
            className="fixed z-80 bg-white border border-neutral-300 rounded-[4px] p-2 min-w-[185px]"
          >
            {renderDrawingShapePalette((kind) => {
              setRibbonPopup(null);
              setPendingDrawShape(kind);
            })}
          </div>
        )}
        {ribbonPopup?.kind === "table" && (
          <div
            data-ribbon-popup="table"
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ribbonPopup.left}px`, top: `${ribbonPopup.top}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
            className="fixed z-80 bg-white border border-neutral-300 rounded-[4px] p-2 text-xs text-neutral-800 flex flex-col gap-1.5"
          >
            <button
              type="button"
              onClick={() => { setRibbonPopup(null); setHoverTableGrid(null); }}
              className="w-full py-1 border border-neutral-200 rounded-[2px] hover:bg-neutral-100 text-center text-[11px] text-neutral-700 cursor-pointer"
            >
              {hoverTableGrid ? `${hoverTableGrid.r} × ${hoverTableGrid.c} 표` : "취소"}
            </button>
            <div
              className="grid grid-cols-10 gap-1"
              onMouseLeave={() => setHoverTableGrid(null)}
            >
              {Array.from({ length: 100 }, (_, i) => {
                const r = Math.floor(i / 10) + 1;
                const c = (i % 10) + 1;
                const active = Boolean(hoverTableGrid && r <= hoverTableGrid.r && c <= hoverTableGrid.c);
                return (
                  <button
                    key={`tg-${r}-${c}`}
                    type="button"
                    data-table-grid-cell={`${r}x${c}`}
                    onMouseEnter={() => setHoverTableGrid({ r, c })}
                    onClick={() => {
                      const targetIdx = selectedIdx >= 0 && selectedIdx < blocks.length ? selectedIdx : blocks.length - 1;
                      addTable(r, c, targetIdx);
                      setRibbonPopup(null);
                      setHoverTableGrid(null);
                    }}
                    className={`w-4 h-4 border rounded-[1px] cursor-pointer transition-colors ${
                      active ? "bg-blue-200 border-blue-500" : "bg-white border-neutral-300 hover:border-blue-400"
                    }`}
                    title={`${r} × ${c} 표 만들기`}
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => { setRibbonPopup(null); setHoverTableGrid(null); setShowTableModal(true); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 border-t border-neutral-200 hover:bg-neutral-100 text-left cursor-pointer mt-0.5"
            >
              <TableIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>표 만들기...</span>
            </button>
          </div>
        )}
        {ribbonPopup?.kind === "chart" && (
          <div
            data-ribbon-popup="chart"
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ribbonPopup.left}px`, top: `${ribbonPopup.top}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
            className="fixed z-80 bg-white border border-neutral-300 rounded-[4px] p-2.5 text-xs text-neutral-800"
          >
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { type: "column", label: "묶은 세로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><rect x="6" y="6" width="5" height="19" fill="#3b82f6"/><rect x="12" y="10" width="5" height="15" fill="#d1d5db"/><rect x="20" y="14" width="5" height="11" fill="#3b82f6"/><rect x="26" y="8" width="5" height="17" fill="#d1d5db"/></svg> },
                  { type: "stacked-column", label: "누적 세로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><rect x="8" y="18" width="8" height="7" fill="#65a30d"/><rect x="8" y="11" width="8" height="7" fill="#3b82f6"/><rect x="8" y="6" width="8" height="5" fill="#d1d5db"/><rect x="20" y="20" width="8" height="5" fill="#65a30d"/><rect x="20" y="12" width="8" height="8" fill="#3b82f6"/><rect x="20" y="6" width="8" height="6" fill="#d1d5db"/></svg> },
                  { type: "line", label: "꺾은선형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><polyline points="6,21 14,14 22,8 30,15" fill="none" stroke="#3b82f6" strokeWidth="1.8"/><polyline points="6,15 14,10 22,17 30,11" fill="none" stroke="#65a30d" strokeWidth="1.8"/></svg> },
                  { type: "bar", label: "묶은 가로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><rect x="3" y="5" width="24" height="4" fill="#3b82f6"/><rect x="3" y="10" width="17" height="4" fill="#d1d5db"/><rect x="3" y="15" width="11" height="4" fill="#3b82f6"/><rect x="3" y="20" width="21" height="4" fill="#d1d5db"/></svg> },
                  { type: "stacked-bar", label: "누적 가로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><rect x="3" y="6" width="12" height="6" fill="#65a30d"/><rect x="15" y="6" width="8" height="6" fill="#3b82f6"/><rect x="23" y="6" width="7" height="6" fill="#d1d5db"/><rect x="3" y="16" width="8" height="6" fill="#65a30d"/><rect x="11" y="16" width="11" height="6" fill="#3b82f6"/><rect x="22" y="16" width="8" height="6" fill="#d1d5db"/></svg> },

                  { type: "scatter", label: "분산형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><circle cx="9" cy="8" r="2.2" fill="#3b82f6"/><circle cx="19" cy="18" r="2.2" fill="#3b82f6"/><circle cx="28" cy="12" r="2.2" fill="#3b82f6"/><circle cx="10" cy="19" r="2.2" fill="#65a30d"/><circle cx="19" cy="11" r="2.2" fill="#65a30d"/><circle cx="28" cy="21" r="2.2" fill="#65a30d"/></svg> },
                  { type: "pie", label: "원형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><circle cx="18" cy="14" r="10" fill="#d1d5db"/><path d="M18,14 L18,4 A10,10 0 0,1 28,14 L18,14 Z" fill="#3b82f6"/><path d="M18,14 L28,14 A10,10 0 0,1 8,14 Z" fill="#65a30d"/></svg> },
                  { type: "exploded-pie", label: "쪼개진 원형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><path d="M17,13 L17,4 A9,9 0 0,0 8,13 Z" fill="#d1d5db"/><path d="M19,14 L28,14 A9,9 0 0,0 19,5 Z" fill="#3b82f6"/><path d="M18,15 L9,15 A9,9 0 0,0 27,15 Z" fill="#65a30d"/></svg> },
                  { type: "doughnut", label: "도넛형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><circle cx="18" cy="14" r="9.5" fill="none" stroke="#65a30d" strokeWidth="5"/><path d="M18,4.5 A9.5,9.5 0 0,1 27.5,14" fill="none" stroke="#3b82f6" strokeWidth="5"/><path d="M27.5,14 A9.5,9.5 0 0,1 12,21.5" fill="none" stroke="#d1d5db" strokeWidth="5"/></svg> },
                  { type: "area", label: "영역형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><polygon points="3,25 3,15 16,12 31,6 31,25" fill="#d1d5db"/><polygon points="3,25 3,13 18,9 31,18 31,25" fill="#3b82f6" fillOpacity="0.85"/></svg> },

                  { type: "stacked-area", label: "누적 영역형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><line x1="3" y1="25" x2="33" y2="25" stroke="#9ca3af"/><line x1="3" y1="3" x2="3" y2="25" stroke="#9ca3af"/><polygon points="3,25 3,13 13,5 22,12 31,6 31,25" fill="#d1d5db"/><polygon points="3,25 3,18 13,12 22,19 31,13 31,25" fill="#3b82f6"/></svg> },
                  { type: "radar", label: "방사형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><polygon points="18,4 28,11 24,23 12,23 8,11" fill="none" stroke="#9ca3af" strokeWidth="1"/><polygon points="18,8 25,12 22,20 14,20 11,12" fill="none" stroke="#3b82f6" strokeWidth="1.4"/><polygon points="18,10 23,14 20,21 15,19 12,13" fill="none" stroke="#65a30d" strokeWidth="1.4"/></svg> },
                  { type: "column-3d", label: "3차원 묶은 세로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><rect x="4" y="4" width="26" height="20" fill="none" stroke="#9ca3af"/><rect x="8" y="10" width="5" height="14" fill="#3b82f6"/><rect x="13" y="7" width="5" height="17" fill="#d1d5db"/><rect x="21" y="14" width="5" height="10" fill="#3b82f6"/></svg> },
                  { type: "stacked-column-3d", label: "3차원 누적 세로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><rect x="4" y="4" width="26" height="20" fill="none" stroke="#9ca3af"/><rect x="9" y="17" width="6" height="7" fill="#65a30d"/><rect x="9" y="11" width="6" height="6" fill="#3b82f6"/><rect x="9" y="6" width="6" height="5" fill="#d1d5db"/><rect x="20" y="18" width="6" height="6" fill="#65a30d"/><rect x="20" y="13" width="6" height="5" fill="#3b82f6"/></svg> },
                  { type: "bar-3d", label: "3차원 묶은 가로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><rect x="4" y="4" width="26" height="20" fill="none" stroke="#9ca3af"/><rect x="6" y="7" width="18" height="4" fill="#d1d5db"/><rect x="6" y="11" width="12" height="4" fill="#3b82f6"/><rect x="6" y="17" width="16" height="4" fill="#d1d5db"/></svg> },

                  { type: "stacked-bar-3d", label: "3차원 누적 가로 막대형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><rect x="4" y="4" width="26" height="20" fill="none" stroke="#9ca3af"/><rect x="6" y="7" width="9" height="5" fill="#65a30d"/><rect x="15" y="7" width="7" height="5" fill="#3b82f6"/><rect x="22" y="7" width="6" height="5" fill="#d1d5db"/><rect x="6" y="16" width="8" height="5" fill="#65a30d"/><rect x="14" y="16" width="9" height="5" fill="#3b82f6"/></svg> },
                  { type: "pie-3d", label: "3차원 원형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><ellipse cx="18" cy="17" rx="10" ry="7" fill="#4d7c0f"/><circle cx="18" cy="13" r="9.5" fill="#d1d5db"/><path d="M18,13 L18,3.5 A9.5,9.5 0 0,1 27.5,13 Z" fill="#3b82f6"/><path d="M18,13 L27.5,13 A9.5,9.5 0 0,1 8.5,13 Z" fill="#65a30d"/></svg> },
                  { type: "exploded-pie-3d", label: "3차원 쪼개진 원형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><path d="M17,12 L17,4 A8,8 0 0,0 9,12 Z" fill="#d1d5db"/><path d="M19,13 L27,13 A8,8 0 0,0 19,5 Z" fill="#3b82f6"/><path d="M18,16 L10,16 A8,8 0 0,0 26,16 Z" fill="#65a30d"/></svg> },
                  { type: "area-3d", label: "3차원 영역형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><rect x="4" y="4" width="26" height="20" fill="none" stroke="#9ca3af"/><polygon points="6,23 6,13 15,8 28,15 28,23" fill="#d1d5db"/><polygon points="6,23 6,16 15,12 28,18 28,23" fill="#3b82f6"/></svg> },
                  { type: "stacked-area-3d", label: "3차원 누적 영역형", svg: <svg viewBox="0 0 36 28" className="w-9 h-7"><rect x="4" y="4" width="26" height="20" fill="none" stroke="#9ca3af"/><polygon points="6,23 6,12 14,6 22,12 28,8 28,23" fill="#d1d5db"/><polygon points="6,23 6,17 14,12 22,18 28,14 28,23" fill="#3b82f6"/></svg> },
                ] as const
              ).map((item) => (
                <button
                  key={item.type}
                  type="button"
                  data-chart-gallery-item={item.type}
                  title={item.label}
                  onClick={() => {
                    insertChartWithType(item.type, item.label);
                    setRibbonPopup(null);
                  }}
                  className="p-1.5 rounded-[3px] border border-transparent hover:border-neutral-300 hover:bg-neutral-100 cursor-pointer flex items-center justify-center"
                >
                  {item.svg}
                </button>
              ))}
            </div>
          </div>
        )}
        {ribbonPopup?.kind === "text-color" && (
          <div
            data-ribbon-popup="text-color"
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ribbonPopup.left}px`, top: `${ribbonPopup.top}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
            className="fixed z-80 bg-white border border-neutral-300 rounded-[4px] p-2 flex items-center gap-1.5"
          >
            {FONT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyTextColor(c.value);
                  setRibbonPopup(null);
                }}
                className="w-4 h-4 rounded-full border border-black/20 hover:scale-125 transition cursor-pointer"
                style={{ background: c.value }}
                title={c.label}
              />
            ))}
            <input
              type="color"
              value={currentPara?.color || "#111827"}
              onChange={(e) => {
                applyTextColor(e.target.value);
                setRibbonPopup(null);
              }}
              className="w-5 h-5 rounded cursor-pointer"
              title="사용자 지정 색상"
            />
          </div>
        )}
        {ribbonPopup?.kind === "highlight" && (
          <div
            data-ribbon-popup="highlight"
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ribbonPopup.left}px`, top: `${ribbonPopup.top}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
            className="fixed z-80 bg-white border border-neutral-300 rounded-[4px] p-2 flex items-center gap-1.5"
          >
            {[
              { color: "#fef08a", label: "노랑" },
              { color: "#bbf7d0", label: "연두" },
              { color: "#bae6fd", label: "하늘" },
              { color: "#fbcfe8", label: "분홍" },
              { color: "#fed7aa", label: "주황" },
              { color: "transparent", label: "없음" },
            ].map((h) => (
              <button
                key={h.color}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyHighlight(h.color);
                  setRibbonPopup(null);
                }}
                className="w-4 h-4 rounded border border-neutral-400 hover:scale-125 transition cursor-pointer"
                style={{ background: h.color === "transparent" ? "#fff" : h.color }}
                title={h.label}
              />
            ))}
          </div>
        )}
        <div role="status" aria-live="polite" data-screen-reader-region="true" data-screen-reader-active={screenReaderEnabled ? "true" : "false"} className="sr-only">
          {screenReaderEnabled ? screenReaderAnnouncement : ""}
        </div>
        </div>

        {/* 한컴독스 표준 하단 상태 표시줄 */}
        <footer className="h-7 bg-[#f3f4f6] border-t border-neutral-300 px-4 flex items-center justify-between text-[11px] text-neutral-600 select-none shrink-0 z-30 font-sans">
          {/* 좌측 정보: 쪽, 구역, 줄/칸 */}
          <div className="flex items-center gap-3">
            <span className="hover:text-blue-600 cursor-pointer" title="클릭하여 원하는 쪽으로 이동" onClick={() => setShowGotoModal(true)}>
              {currentPageNum}/{totalPages} 쪽
            </span>
            <span className="text-neutral-300">|</span>
            <span>1 구역</span>
            <span className="text-neutral-300">|</span>
            <span>1줄 1칸</span>
          </div>

          {/* 중앙/우측 정보: 현재 편집 용지 규격 뱃지 + 배율 + 보기 모드 */}
          <div className="flex items-center gap-3">
            {/* 현재 편집 용지 규격 (클릭 시 편집 용지 모달 열림) */}
            <button
              type="button"
              onClick={openPageSetupModal}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-xs hover:bg-neutral-200 text-neutral-700 transition cursor-pointer"
              title="클릭하여 편집 용지 설정 열기"
            >
              <PageSetupIcon className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-medium text-neutral-800">
                {pageSizeType} ({pageWidthMm}×{pageHeightMm}mm, {pageOrientation === "portrait" ? "세로" : "가로"})
              </span>
            </button>
            <span className="text-neutral-300">|</span>

            {/* 배율 조절 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setZoomFitMode("custom"); setZoomPercent((prev) => Math.max(30, prev - 10)); }}
                className="w-4 h-4 flex items-center justify-center rounded-xs hover:bg-neutral-200 text-neutral-700 cursor-pointer"
                title="축소"
              >
                -
              </button>
              <input
                type="range"
                min="30"
                max="300"
                step="5"
                value={zoomPercent}
                onChange={(e) => { setZoomFitMode("custom"); setZoomPercent(Number(e.target.value)); }}
                className="w-16 h-1 bg-neutral-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <button
                type="button"
                onClick={() => { setZoomFitMode("custom"); setZoomPercent((prev) => Math.min(300, prev + 10)); }}
                className="w-4 h-4 flex items-center justify-center rounded-xs hover:bg-neutral-200 text-neutral-700 cursor-pointer"
                title="확대"
              >
                +
              </button>
              <span className="w-10 text-right font-mono text-[11px] text-neutral-700">{zoomPercent}%</span>
            </div>

            <span className="text-neutral-300">|</span>
            {/* 보기 모드: 쪽 맞춤 / 폭 맞춤 / 100% */}
            <div className="flex items-center gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => setZoomPercent(100)}
                className={`px-1.5 py-0.5 rounded-xs cursor-pointer ${zoomPercent === 100 ? "bg-neutral-300 font-bold text-neutral-900" : "hover:bg-neutral-200 text-neutral-600"}`}
                title="100% 기본 크기"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => setZoomPercent(120)}
                className={`px-1.5 py-0.5 rounded-xs cursor-pointer ${zoomPercent === 120 ? "bg-neutral-300 font-bold text-neutral-900" : "hover:bg-neutral-200 text-neutral-600"}`}
                title="폭 맞춤"
              >
                폭맞춤
              </button>
              <button
                type="button"
                onClick={() => setZoomPercent(80)}
                className={`px-1.5 py-0.5 rounded-xs cursor-pointer ${zoomPercent === 80 ? "bg-neutral-300 font-bold text-neutral-900" : "hover:bg-neutral-200 text-neutral-600"}`}
                title="쪽 맞춤"
              >
                쪽맞춤
              </button>
            </div>
          </div>
        </footer>

        {/* 한컴독스 표준 찾아가기 (Alt+G) 대화상자 */}
        {showGotoModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowGotoModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-white rounded-xs shadow-2xl border border-[#4a89dc] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
            >
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">찾아가기</span>
                <button type="button" onClick={() => setShowGotoModal(false)} className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer">✕</button>
              </div>
              <div className="p-4 flex items-start gap-3 bg-[#f8fafc] text-[12px]">
                <div className="flex-1 border border-[#c8d3e2] rounded-xs p-3.5 bg-white shadow-2xs flex gap-4">
                  {/* 좌측 대상 선택 라디오 */}
                  <div className="flex flex-col gap-2 w-24 shrink-0">
                    {(
                      [
                        { id: "page", label: "쪽" },
                        { id: "section", label: "구역" },
                        { id: "line", label: "줄" },
                        { id: "style", label: "스타일" },
                        { id: "control", label: "조판 부호" },
                        { id: "bookmark", label: "책갈피" },
                      ] as const
                    ).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="gotoType"
                          checked={gotoType === opt.id}
                          onChange={() => setGotoType(opt.id)}
                          className="accent-[#0066cc]"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {/* 중앙 번호 입력 및 목록 */}
                  <div className="flex-1 flex flex-col gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={gotoPageInput}
                      onChange={(e) => setGotoPageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleGoto(Number(gotoPageInput) || 1);
                      }}
                      className="w-full bg-white border border-[#c5ceda] rounded-xs px-2 py-1 text-[12px] outline-none focus:border-[#1e4fa8]"
                    />
                    <div className="h-36 border border-[#c5ceda] rounded-xs bg-white overflow-y-auto">
                      {Array.from(
                        { length: gotoType === "line" ? Math.max(1, blocks.length) : Math.max(1, Math.ceil(blocks.length / 22)) },
                        (_, i) => i + 1
                      ).map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setGotoPageInput(String(num))}
                          onDoubleClick={() => handleGoto(num)}
                          className={`w-full text-left px-2 py-1 text-[12px] cursor-pointer ${
                            Number(gotoPageInput) === num ? "bg-[#dcdcdc] text-neutral-900 font-medium" : "hover:bg-neutral-100"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="w-20 shrink-0 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleGoto(Number(gotoPageInput) || 1)}
                    className="w-full h-8 border-2 border-[#4a89dc] bg-white hover:bg-neutral-50 text-neutral-900 text-[12px] font-medium rounded-xs cursor-pointer shadow-2xs"
                  >
                    가기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGotoModal(false)}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer shadow-2xs"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 한컴독스 표준 조판 부호 지우기 모달 */}
        {showClearMarksModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowClearMarksModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-white rounded-xs shadow-2xl border border-[#4a89dc] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
            >
              <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-900 tracking-tight">조판 부호 지우기</span>
                <button type="button" onClick={() => setShowClearMarksModal(false)} className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer">✕</button>
              </div>
              <div className="p-4 flex items-start gap-3 bg-[#f8fafc] text-[12px]">
                <div className="flex-1 border border-[#c8d3e2] rounded-xs p-3.5 bg-white shadow-2xs flex flex-col gap-3">
                  <div className="h-64 border border-[#c5ceda] rounded-xs bg-white overflow-y-auto p-2.5 flex flex-col gap-2">
                    {CONTROL_MARK_ITEMS.map((item) => {
                      const checked = selectedControlMarks.includes(item);
                      return (
                        <label key={item} className="flex items-center gap-2 cursor-pointer text-neutral-800 hover:text-neutral-950">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedControlMarks((prev) => [...prev, item]);
                              } else {
                                setSelectedControlMarks((prev) => prev.filter((x) => x !== item));
                              }
                            }}
                            className="accent-[#0066cc] w-3.5 h-3.5"
                          />
                          <span>{item}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedControlMarks.length === CONTROL_MARK_ITEMS.length) {
                          setSelectedControlMarks([]);
                        } else {
                          setSelectedControlMarks([...CONTROL_MARK_ITEMS]);
                        }
                      }}
                      className="px-3 py-1.5 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer shadow-2xs"
                    >
                      {selectedControlMarks.length === CONTROL_MARK_ITEMS.length ? "모두 해제" : "모두 선택"}
                    </button>
                  </div>
                </div>
                <div className="w-20 shrink-0 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={selectedControlMarks.length === 0}
                    onClick={applyClearControlMarks}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-900 text-[12px] font-medium rounded-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                  >
                    지우기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearMarksModal(false)}
                    className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer shadow-2xs"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 다른 이름으로 저장하기 모달 */}
        {showSaveAsModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={() => setShowSaveAsModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-neutral-300 shadow-2xl p-5 rounded-xl flex flex-col gap-3 w-88 text-neutral-800 animate-in fade-in duration-150"
            >
              <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
                <span className="flex items-center gap-1.5">
                  <SaveAsIcon className="w-4 h-4 text-[#0066cc]" />
                  <span>다른 이름으로 저장하기</span>
                </span>
                <button type="button" onClick={() => setShowSaveAsModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
              </h4>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="text-neutral-600 font-medium">저장할 파일 이름 (.hwpx)</label>
                <input
                  type="text"
                  autoFocus
                  value={saveAsInput}
                  onChange={(e) => setSaveAsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmSaveAs();
                    if (e.key === "Escape") setShowSaveAsModal(false);
                  }}
                  className="border border-neutral-300 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#0066cc]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowSaveAsModal(false)}
                  className="px-3.5 py-1.5 rounded text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmSaveAs}
                  className="px-4 py-1.5 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 이름 바꾸기 모달 */}
        {showRenameModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={() => setShowRenameModal(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-neutral-300 shadow-2xl p-5 rounded-xl flex flex-col gap-3 w-88 text-neutral-800 animate-in fade-in duration-150"
            >
              <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
                <span className="flex items-center gap-1.5">
                  <RenameIcon className="w-4 h-4 text-[#0066cc]" />
                  <span>문서 이름 바꾸기</span>
                </span>
                <button type="button" onClick={() => setShowRenameModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
              </h4>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="text-neutral-600 font-medium">새 문서 이름</label>
                <input
                  type="text"
                  autoFocus
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") setShowRenameModal(false);
                  }}
                  className="border border-neutral-300 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#0066cc]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="px-3.5 py-1.5 rounded text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmRename}
                  className="px-4 py-1.5 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 공공안심글꼴 모달 */}
        {showSafeFontModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
            <div className="bg-white border border-neutral-300 shadow-2xl p-5 rounded-xl flex flex-col gap-3 w-96 max-h-[80vh] overflow-y-auto text-neutral-800 animate-in fade-in duration-150">
              <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
                <span className="flex items-center gap-1.5">
                  <SafeFontIcon className="w-4 h-4 text-emerald-600" />
                  <span>공공안심글꼴 (K-안심글꼴)</span>
                </span>
                <button type="button" onClick={() => setShowSafeFontModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
              </h4>
              <p className="text-[11px] text-neutral-500">
                정부 및 지자체에서 배포한 안심하고 상업적/비상업적으로 무료 이용 가능한 글꼴입니다.
              </p>
              <div className="flex flex-col gap-1.5 divide-y divide-neutral-100">
                {[
                  { name: "나눔명조", family: "'Nanum Myeongjo', serif", desc: "네이버 배포 본문용 명조체" },
                  { name: "나눔고딕", family: "'Nanum Gothic', sans-serif", desc: "네이버 배포 가독성 높은 고딕체" },
                  { name: "마루 부리", family: "'MaruBuri', serif", desc: "화면용 본문 맞춤 부리(명조) 글꼴" },
                  { name: "함초롬바탕", family: "'Hamchorom Batang', serif", desc: "한글과컴퓨터 표준 명조 글꼴" },
                  { name: "함초롬돋움", family: "'Hamchorom Dotum', sans-serif", desc: "한글과컴퓨터 표준 고딕 글꼴" },
                  { name: "프리텐다드", family: "'Pretendard', sans-serif", desc: "모던 표준 고딕 본문 글꼴" },
                ].map((f) => (
                  <div key={f.name} className="flex items-center justify-between pt-2">
                    <div>
                      <div className="text-xs font-semibold text-neutral-800" style={{ fontFamily: f.family }}>{f.name}</div>
                      <div className="text-[10px] text-neutral-400">{f.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        applyFontFamily(f.family);
                        setShowSafeFontModal(false);
                      }}
                      className="px-2.5 py-1 text-[11px] rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold cursor-pointer border border-emerald-200 transition"
                    >
                      적용
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowSafeFontModal(false)}
                  className="px-4 py-1.5 rounded text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 공유 성공 토스트 */}
        {showShareToast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-70 bg-neutral-900/90 text-white px-4 py-2 rounded-full shadow-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span>📋</span>
            <span>문서 공유 링크가 클립보드에 복사되었습니다!</span>
          </div>
        )}

        {/* 일반 알림 토스트 */}
        {generalToast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-70 bg-neutral-900/90 text-white px-5 py-2.5 rounded-full shadow-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span>ℹ️</span>
            <span>{generalToast}</span>
          </div>
        )}

        {/* 편집 용지 적용 토스트 */}
        {showPageSetupToast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-70 bg-neutral-900/90 text-white px-5 py-2.5 rounded-full shadow-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span>📄</span>
            <span>
              편집 용지가 적용되었습니다 ({pageSizeType} {pageOrientation === "portrait" ? "세로" : "가로"}, 폭 {pageWidthMm}mm × 길이 {pageHeightMm}mm, 여백: 상{pageMarginTopMm}·하{pageMarginBottomMm}·좌{pageMarginLeftMm}·우{pageMarginRightMm}mm)
            </span>
          </div>
        )}

        {/* 숨겨진 그림 파일 선택 input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFileSelect}
          className="hidden"
        />

        {/* 한컴독스 스타일 그림 넣기 모달 */}
        {showImageInsertModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-label="그림 넣기">
            <div className="w-full max-w-[490px] bg-[#f7f8fa] rounded-sm shadow-2xl border border-neutral-300 overflow-hidden font-sans text-neutral-800">
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#edf3fb] border-b border-neutral-200">
                <span className="text-[13px] font-medium text-neutral-800">그림 넣기</span>
                <button
                  type="button"
                  onClick={() => setShowImageInsertModal(false)}
                  className="text-neutral-500 hover:text-neutral-800 text-base leading-none px-1 cursor-pointer"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              <div className="p-3.5 flex gap-3 items-start">
                <div className="flex-1 bg-white border border-neutral-300 rounded-xs p-3.5 space-y-3 text-[12px]">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="hwpx-img-source"
                        checked={imgInsertSourceType === "device"}
                        onChange={() => setImgInsertSourceType("device")}
                        className="accent-[#0066cc] cursor-pointer"
                      />
                      <span>장치</span>
                    </label>
                    <div className="flex items-center gap-2 pl-5">
                      <button
                        type="button"
                        onClick={() => {
                          setImgInsertSourceType("device");
                          imageInputRef.current?.click();
                        }}
                        className="px-2.5 py-1 bg-[#efefef] hover:bg-[#e5e5e5] border border-neutral-400 rounded-xs text-[12px] text-neutral-800 cursor-pointer shrink-0"
                      >
                        파일 선택
                      </button>
                      <span className="text-neutral-600 truncate max-w-[200px]">
                        {imgInsertFileName || "선택된 파일 없음"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="hwpx-img-source"
                        checked={imgInsertSourceType === "url"}
                        onChange={() => setImgInsertSourceType("url")}
                        className="accent-[#0066cc] cursor-pointer"
                      />
                      <span>웹 주소</span>
                    </label>
                    <div className="pl-5">
                      <input
                        type="url"
                        value={imgInsertUrl}
                        onFocus={() => setImgInsertSourceType("url")}
                        onChange={(e) => {
                          setImgInsertSourceType("url");
                          setImgInsertUrl(e.target.value);
                        }}
                        placeholder=""
                        className={`w-full h-7 px-2 border rounded-xs text-[12px] outline-none ${imgInsertSourceType === "url" ? "bg-white border-neutral-400 focus:border-[#0066cc]" : "bg-neutral-50 border-neutral-200 text-neutral-400"}`}
                      />
                    </div>
                  </div>

                  <div className="pt-1 space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={imgInsertTreatAsChar}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setImgInsertTreatAsChar(checked);
                          if (checked) setImgInsertSizeByMouse(false);
                        }}
                        className="accent-[#0066cc] cursor-pointer"
                      />
                      <span>글자처럼 취급</span>
                    </label>
                    <label className={`flex items-center gap-2 select-none ${imgInsertTreatAsChar ? "text-neutral-400 cursor-not-allowed" : "text-neutral-800 cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={imgInsertSizeByMouse}
                        disabled={imgInsertTreatAsChar}
                        onChange={(e) => setImgInsertSizeByMouse(e.target.checked)}
                        className="accent-[#0066cc] disabled:opacity-50"
                      />
                      <span>마우스로 크기 지정</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 w-[76px] shrink-0 text-[12px]">
                  <button
                    type="button"
                    onClick={handleConfirmImageInsert}
                    disabled={imgInsertSourceType === "device" ? !imgInsertDataUrl : !imgInsertUrl.trim()}
                    className="w-full py-1.5 border rounded-xs transition disabled:bg-white disabled:border-neutral-200 disabled:text-neutral-300 disabled:cursor-not-allowed bg-white hover:bg-neutral-50 border-neutral-400 text-neutral-800 font-medium cursor-pointer"
                  >
                    넣기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImageInsertModal(false)}
                    className="w-full py-1.5 bg-white hover:bg-neutral-50 border border-neutral-400 rounded-xs text-neutral-800 cursor-pointer"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 닫기 전 저장 확인 모달 */}
        {confirmClose && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog">
            <div className="w-full max-w-sm p-5 rounded-2xl shadow-2xl border" style={{ background: "var(--card-bg, #181926)", borderColor: "var(--card-border, #363a4f)" }}>
              <h3 className="text-sm font-bold mb-2">저장하지 않은 변경사항</h3>
              <p className="text-xs text-neutral-300 leading-relaxed mb-5">
                수정 중인 내용이 아직 저장되지 않았습니다. 저장하고 닫으시겠습니까?
              </p>
              <div className="flex justify-end gap-2 text-xs font-bold">
                <button type="button" onClick={() => discardAndClose(onClose)} className="px-3 py-1.5 rounded-lg border border-neutral-600 text-neutral-400 hover:text-white">
                  저장 안 함
                </button>
                <button type="button" onClick={keepEditing} className="px-3 py-1.5 rounded-lg border border-neutral-600 text-neutral-300">
                  계속 수정
                </button>
                <button type="button" onClick={() => void saveAndClose(onClose)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white">
                  저장 후 닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 글꼴(폰트) 추가 / 관리 모달 */}
        {showAddFontModal && (
          <AddFontModal
            onClose={() => setShowAddFontModal(false)}
            onFontAdded={(font) => {
              setEditorFonts(getAllEditorFonts());
              applyFontFamily(font.value);
            }}
          />
        )}

        {/* 한컴 고급 기능 모달들 (모양 복사, 글자 바꾸기, 하이퍼링크, 날짜, 상용구, 쪽 번호, 워터마크, 템플릿, 표 계산식, 맞춤법) */}
        <FormatCopyModal
          isOpen={showFormatCopyModal}
          onClose={() => setShowFormatCopyModal(false)}
          onCopy={handleApplyFormatCopyMode}
          isTableSelected={blocks[selectedIdx]?.type === "table"}
        />
        <TextConvertModal
          isOpen={showTextConvertModal}
          onClose={() => setShowTextConvertModal(false)}
          onConvert={handleTextConvert}
        />
        <HyperlinkModal
          isOpen={showHyperlinkModal}
          onClose={() => setShowHyperlinkModal(false)}
          onInsert={handleInsertHyperlink}
          initialText={hyperlinkInitialText}
        />
        <BookmarkModal
          isOpen={showBookmarkModal}
          onClose={() => setShowBookmarkModal(false)}
          onInsert={handleInsertBookmark}
          onGoto={handleGotoBookmark}
          bookmarks={documentBookmarks}
        />
        <BulletAndNumberModal
          isOpen={bulletNumberModalTab !== null}
          initialTab={bulletNumberModalTab ?? "bullet"}
          onClose={() => setBulletNumberModalTab(null)}
          onApplyBullet={applyBulletPrefix}
          onApplyNumber={applyNumberPrefix}
        />
        <StyleModal
          isOpen={showStyleModal}
          onClose={() => setShowStyleModal(false)}
          onApply={applyStylePreset}
          currentStyleInfo={(() => {
            const cur = blocks[selectedIdx];
            if (!cur || cur.type !== "paragraph") return undefined;
            const txt = cur.text || "";
            const listKind = /^[●•■▪◆♦▶○□◇▷◎☑✓★❖☞▸]\s+/.test(txt)
              ? "글머리표"
              : /^(?:\(\d+\)|\([가-힣a-zA-Zㄱ-ㅎ]\)|\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|[가-힣A-Za-zIVXivx]+[.)])\s+/.test(txt)
                ? "문단 번호"
                : "없음";
            return {
              marginLeftPt: cur.marginLeftPt,
              marginRightPt: cur.marginRightPt,
              firstLineType: cur.firstLineType,
              align: cur.align,
              lineSpacingPct: cur.lineSpacingPct,
              fontFamily: cur.fontFamily,
              sizePt: cur.sizePt,
              charWidthPct: cur.charWidthPct,
              letterSpacingPct: cur.letterSpacingPct,
              listKind,
            };
          })()}
          onOpenParaShape={() => setShowParaShapeModal(true)}
          onOpenCharShape={() => setShowCharShapeModal(true)}
          onOpenBulletNumber={() => setBulletNumberModalTab("bullet")}
        />
        <DeleteTableCellsModal
          isOpen={deleteTableCellsPrompt !== null}
          onKeepShape={() => {
            if (deleteTableCellsPrompt) executeTableCellDelete(deleteTableCellsPrompt, true);
            setDeleteTableCellsPrompt(null);
          }}
          onDeleteCells={() => {
            if (deleteTableCellsPrompt) executeTableCellDelete(deleteTableCellsPrompt, false);
            setDeleteTableCellsPrompt(null);
          }}
          onClose={() => setDeleteTableCellsPrompt(null)}
        />
        <SplitCellModal
          isOpen={splitCellModal !== null}
          initialRows={splitCellModal?.initialRows ?? 1}
          initialCols={splitCellModal?.initialCols ?? 1}
          canMergeBeforeSplit={splitCellModal?.canMergeBeforeSplit ?? false}
          onClose={() => setSplitCellModal(null)}
          onConfirm={({ rows, cols, mergeBeforeSplit }) => {
            if (!splitCellModal) return;
            applySplitTableCell(splitCellModal.blockIdx, splitCellModal.row, splitCellModal.col, rows, cols, {
              endRow: splitCellModal.endRow,
              endCol: splitCellModal.endCol,
              mergeBeforeSplit,
            });
          }}
        />
        <InsertDateModal
          isOpen={showDateModal}
          onClose={() => setShowDateModal(false)}
          onInsert={handleInsertDate}
        />
        <AutoTextModal
          isOpen={showAutoTextModal}
          onClose={() => setShowAutoTextModal(false)}
          onInsert={handleInsertAutoText}
        />
        <PageNumberModal
          isOpen={showPageNumberModal}
          onClose={() => setShowPageNumberModal(false)}
          currentPos={pageNumberPos}
          onApply={(pos) => {
            setPageNumberPos(pos);
            showToast(pos === "none" ? "쪽 번호가 해제되었습니다." : "쪽 번호가 설정되었습니다.");
          }}
        />
        <WatermarkModal
          isOpen={showWatermarkModal}
          onClose={() => setShowWatermarkModal(false)}
          currentWatermark={watermarkText}
          onApply={(text) => {
            setWatermarkText(text);
            showToast(text ? `바탕쪽 워터마크가 설정되었습니다: ${text}` : "워터마크가 해제되었습니다.");
          }}
        />
        <TemplateModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onLoadTemplate={handleLoadTemplate}
        />
        <TableCalcModal
          isOpen={showTableCalcModal}
          onClose={() => setShowTableCalcModal(false)}
          onCalculate={handleTableCalc}
        />
        <SpellCheckModal
          isOpen={showSpellCheckModal}
          onClose={() => setShowSpellCheckModal(false)}
          fullText={blocks.map((b) => (b.type === "paragraph" ? b.text : "")).join("\n")}
          onFixAll={(rules) => {
            const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
            let fixed = 0;
            doc.transact(() => {
              blocks.forEach((b, idx) => {
                if (b.type === "paragraph") {
                  let updated = b.text;
                  for (const r of rules) {
                    if (updated.includes(r.from)) {
                      updated = updated.split(r.from).join(r.to);
                      fixed++;
                    }
                  }
                  if (updated !== b.text) {
                    const yText = yBlocks.get(idx)?.get("text");
                    if (yText instanceof Y.Text) {
                      yText.delete(0, yText.length);
                      yText.insert(0, updated);
                    }
                  }
                }
              });
            });
            showToast(fixed > 0 ? `맞춤법 교정 ${fixed}건 적용 완료` : "교정할 맞춤법 오류가 없습니다.");
          }}
        />
        {/* 새 번호로 시작 모달 */}
        {showNewPageNumModal && (
          <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/35" onClick={() => setShowNewPageNumModal(false)}>
            <div className="bg-white rounded-[4px] border border-neutral-300 shadow-2xl w-[320px] p-4 text-xs text-neutral-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-neutral-200">
                <span className="font-bold text-[13px]">새 번호로 시작</span>
                <button type="button" onClick={() => setShowNewPageNumModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
              </div>
              <div className="mb-3 text-neutral-600">
                현재 쪽(<span className="font-semibold text-neutral-900">{currentPageNum}쪽</span>)부터 적용할 시작 번호를 입력하세요.
              </div>
              <div className="flex items-center gap-2 mb-4">
                <label className="w-20 text-neutral-700 font-medium">시작 번호</label>
                <input
                  type="number"
                  min={1}
                  value={draftNewPageNum}
                  onChange={(e) => setDraftNewPageNum(e.target.value)}
                  className="flex-1 border border-neutral-300 rounded-[4px] px-2 py-1 text-xs outline-none focus:border-[#0066cc]"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pIdx = Math.max(0, currentPageNum - 1);
                    setPageNumberStartOverrides((prev) => {
                      const next = { ...prev };
                      delete next[pIdx];
                      return next;
                    });
                    setShowNewPageNumModal(false);
                    showToast("기본 쪽 번호 순서로 복원했습니다.");
                  }}
                  className="px-3 py-1.5 rounded-[4px] border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPageNumModal(false)}
                  className="px-3 py-1.5 rounded-[4px] border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const val = Math.max(1, parseInt(draftNewPageNum, 10) || 1);
                    const pIdx = Math.max(0, currentPageNum - 1);
                    setPageNumberStartOverrides((prev) => ({ ...prev, [pIdx]: val }));
                    if (headerPos === "none" && footerPos === "none" && pageNumberPos === "none") {
                      setFooterPos("center");
                    }
                    setShowNewPageNumModal(false);
                    showToast(`${currentPageNum}쪽부터 쪽 번호를 ${val}(으)로 시작합니다.`);
                  }}
                  className="px-3 py-1.5 rounded-[4px] bg-[#0066cc] text-white hover:bg-[#0052a3] font-medium cursor-pointer"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 현재 쪽만 감추기 모달 */}
        {showHidePageModal && (
          <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/35" onClick={() => setShowHidePageModal(false)}>
            <div className="bg-white rounded-[4px] border border-neutral-300 shadow-2xl w-[320px] p-4 text-xs text-neutral-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-neutral-200">
                <span className="font-bold text-[13px]">현재 쪽만 감추기 ({currentPageNum}쪽)</span>
                <button type="button" onClick={() => setShowHidePageModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {(
                  [
                    { key: "header", label: "머리말 감추기" },
                    { key: "footer", label: "꼬리말 감추기" },
                    { key: "pageNumber", label: "쪽 번호 감추기" },
                    { key: "border", label: "쪽 테두리 감추기" },
                    { key: "background", label: "배경 감추기" },
                  ] as const
                ).map((item) => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draftHidePageOpts[item.key]}
                      onChange={(e) => setDraftHidePageOpts((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowHidePageModal(false)}
                  className="px-3 py-1.5 rounded-[4px] border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pIdx = Math.max(0, currentPageNum - 1);
                    setHiddenPageElements((prev) => ({ ...prev, [pIdx]: { ...draftHidePageOpts } }));
                    setShowHidePageModal(false);
                    showToast(`${currentPageNum}쪽 감추기 설정이 적용되었습니다.`);
                  }}
                  className="px-3 py-1.5 rounded-[4px] bg-[#0066cc] text-white hover:bg-[#0052a3] font-medium cursor-pointer"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
