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
  HwpxImageBlock,
  HwpxChartBlock,
  HwpxParagraphBlock,
  HwpxShapeBlock,
  HwpxTableBlock,
  hwpxCollabKey,
  hwpxCollabText,
  initHwpxYDoc,
  parseHwpxXmlToBlocks,
  serializeBlocksToHwpxPackage,
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
import { HwpxSelectionHandles, HwpxFloatingToolbar, type ResizeDirection } from "./HwpxObjectHandles";
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
  { label: "바탕체 / 명조", value: "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif" },
  { label: "고딕 / 돋움", value: "Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif" },
  { label: "궁서체", value: "'Gungsuh', 'GungsuhChe', serif" },
  { label: "굴림체", value: "'Gulim', 'GulimChe', sans-serif" },
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
  element.focus();
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

  if (chartType === "pie") {
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
      const textX = cx + (r * 0.65) * Math.cos((Math.PI * (midAngle - 90)) / 180);
      const textY = cy + (r * 0.65) * Math.sin((Math.PI * (midAngle - 90)) / 180);
      const pct = Math.round((val / total) * 100);
      return { d, color: colors[idx % colors.length], label: categories[idx], pct, textX, textY };
    });

    return (
      <svg viewBox="0 0 500 230" className="w-full h-auto select-none font-sans">
        <rect width="500" height="230" fill="#fafafa" rx="8" />
        {slices.map((s, i) => (
          <g key={i}>
            <path d={s.d} fill={s.color} stroke="#ffffff" strokeWidth="2" />
            {s.pct >= 8 && (
              <text x={s.textX} y={s.textY} fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                {s.pct}%
              </text>
            )}
          </g>
        ))}
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
  alignClass,
  fontSize,
  showParaMarks,
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
  alignClass: string;
  fontSize: string;
  showParaMarks: boolean;
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

  // 외부(Yjs 동기화, 되돌리기(Undo)/다시 실행(Redo), 협업 동기화 등)에서 텍스트가 갱신되었을 때 DOM 동기화
  useLayoutEffect(() => {
    const el = pRef.current;
    if (!el) return;
    const currentDomText = (el.innerText || "").replace(/\r?\n$/, "");
    const targetText = block.text || "";
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
      el.innerText = targetText;
      if (isFocusedHere) {
        setCaretOffset(el, Math.min(curOffset, targetText.length));
      }
    }
  }, [block.text]);

  const handleInput = () => {
    const el = pRef.current;
    if (!el) return;
    const text = el.innerText || "";
    const clean = text.endsWith("\n") ? text.slice(0, -1) : text;
    onChangeText(clean);
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
    <div className="w-full my-0.5 relative group">
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
        onClick={onSelect}
        onInput={handleInput}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        className={`w-full p-0 leading-relaxed outline-none min-h-[1.5em] whitespace-pre-wrap break-words cursor-text ${alignClass} ${showParaMarks ? "after:content-['↵'] after:text-[#0066cc] after:text-[11px] after:font-sans after:opacity-90 after:ml-0.5 after:select-none after:pointer-events-none" : ""
          }`}
        style={{
          fontSize: `${((block.sizePt || 10) * ((block.relativeSizePct ?? 100) / 100)).toFixed(2)}pt`,
          fontWeight: block.bold ? "bold" : "normal",
          fontStyle: block.italic ? "italic" : "normal",
          textDecoration:
            [block.underline ? "underline" : "", block.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none",
          color: block.color || "#111827",
          backgroundColor: block.paraBgColor || block.shadingColor || undefined,
          fontFamily: block.fontFamily || "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif",
          lineHeight: block.lineSpacingPct ? block.lineSpacingPct / 100 : 1.65,
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
              ? `max(1px, ${block.paraBorderWidth || "0.1mm"}) ${
                  block.paraBorderType === "점선" ? "dotted" : block.paraBorderType === "파선" ? "dashed" : "solid"
                } ${block.paraBorderColor || "#000000"}`
              : undefined,
          letterSpacing: block.letterSpacingPct ? `${block.letterSpacingPct * 0.01}em` : undefined,
          width: block.charWidthPct && block.charWidthPct !== 100 ? `${10000 / block.charWidthPct}%` : undefined,
          transform: block.charWidthPct && block.charWidthPct !== 100 ? `scaleX(${block.charWidthPct / 100})` : undefined,
          transformOrigin: block.charWidthPct && block.charWidthPct !== 100 ? "left top" : undefined,
          position: block.charPosPct ? "relative" : undefined,
          top: block.charPosPct ? `${-block.charPosPct * 0.01}em` : undefined,
          textJustify: block.align === "justify" ? "auto" : undefined,
          wordBreak: "break-all",
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

export default function HwpxEditorModal({
  projectId,
  file,
  room,
  mode,
  rawHwpxBytes,
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
      const currentBlocks = extractBlocksFromYDoc(doc);
      const { sectionXml: newSectionXml, headerXml: newHeaderXml } = serializeBlocksToHwpxPackage(
        currentBlocks,
        originalXml,
        originalHeaderXml
      );

      const newEntries = prepareHwpxPackageEntries(zipEntries, newSectionXml, newHeaderXml);
      const updatedHwpxBytes = await writeZipEntries(newEntries);
      return save(updatedHwpxBytes, text, baseVersionId, auto);
    },
  });

  // 편집기 내에서 바로 수정된 최신 HWPX 파일 즉시 다운로드
  const handleDirectDownload = async (overrideFileName?: string) => {
    try {
      // 현재 포커스된 contenteditable이 있다면 blur시켜 마지막 입력 텍스트를 Y.Doc에 즉각 커밋
      if (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) {
        document.activeElement.blur();
      }

      const currentBlocks = extractBlocksFromYDoc(doc);
      const { sectionXml: newSectionXml, headerXml: newHeaderXml } = serializeBlocksToHwpxPackage(
        currentBlocks,
        originalXml,
        originalHeaderXml
      );

      const newEntries = prepareHwpxPackageEntries(zipEntries, newSectionXml, newHeaderXml);
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
  const [newTableRows, setNewTableRows] = useState(3);
  const [newTableCols, setNewTableCols] = useState(3);
  const [showShapeModal, setShowShapeModal] = useState(false);
  const [newShapeType, setNewShapeType] = useState<"rect" | "roundRect" | "ellipse" | "line">("rect");
  const [newShapeText, setNewShapeText] = useState("");
  const [newShapeFill, setNewShapeFill] = useState("#FFFFFF");
  const [newShapeStroke, setNewShapeStroke] = useState("#1F2937");
  const [newShapeWidth, setNewShapeWidth] = useState(75);

  // 차트 모달 및 편집 상태
  const [showChartModal, setShowChartModal] = useState(false);
  const [selectedChartType, setSelectedChartType] = useState<"column" | "bar" | "line" | "pie">("column");
  const [chartTitleInput, setChartTitleInput] = useState("[차트 1] 분기별 경영 실적 분석");
  const [showChartDataModal, setShowChartDataModal] = useState(false);
  const [chartEditingIdx, setChartEditingIdx] = useState<number | null>(null);

  // 한컴 고급 기능 모달 상태
  const [showFormatCopyModal, setShowFormatCopyModal] = useState(false);
  const [showTextConvertModal, setShowTextConvertModal] = useState(false);
  const [showHyperlinkModal, setShowHyperlinkModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showAutoTextModal, setShowAutoTextModal] = useState(false);
  const [showPageNumberModal, setShowPageNumberModal] = useState(false);
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTableCalcModal, setShowTableCalcModal] = useState(false);
  const [showSpellCheckModal, setShowSpellCheckModal] = useState(false);

  // 쪽 및 조판 상태
  const [pageNumberPos, setPageNumberPos] = useState<"bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "none">("bottom-center");
  const [watermarkText, setWatermarkText] = useState("");
  const [columnCount, setColumnCount] = useState<1 | 2 | 3>(1);
  const [showLineNumbers, setShowLineNumbers] = useState(false);

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
  const [canvasUnscaledSize, setCanvasUnscaledSize] = useState<{ w: number; h: number } | null>(null);
  const [isCrossSelecting, setIsCrossSelecting] = useState(false);
  const crossDragRef = useRef<{ startIdx: number; startOffset: number; crossed: boolean } | null>(null);
  const justFinishedCrossDragRef = useRef(false);
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
  const deleteSelected = () => {
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
      setBlocks(extractBlocksFromYDoc(doc));
      setMemos(extractMemosFromYDoc(doc));
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
    if (pendingObjectFocusRef.current) {
      const objId = pendingObjectFocusRef.current;
      const objEl = document.querySelector<HTMLElement>(`[data-block-id="${objId}"]`);
      if (objEl) {
        pendingObjectFocusRef.current = null;
        objEl.scrollIntoView({ block: "nearest", inline: "nearest" });
        const firstInput = objEl.querySelector<HTMLElement>("input, textarea");
        if (firstInput) {
          firstInput.focus({ preventScroll: true });
        } else {
          objEl.focus({ preventScroll: true });
        }
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
        pEl.focus();
        setCaretOffset(pEl, target.offset);
      }
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

  const setDraggedBlock = (idx: number | null) => {
    draggedBlockIdxRef.current = idx;
    setDraggedBlockIdx(idx);
  };

  // 블록 순서 이동 함수 (Y.Doc CRDT 안전 복제 및 이동)
  const moveBlock = (fromIndex: number, toIndex: number, pos: "before" | "after") => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    if (fromIndex < 0 || fromIndex >= yBlocks.length) return;
    if (toIndex < 0 || toIndex >= yBlocks.length) return;
    if (fromIndex === toIndex) return;

    const sourceMap = yBlocks.get(fromIndex);
    if (!sourceMap) return;

    let targetIndex = pos === "after" ? toIndex + 1 : toIndex;
    if (fromIndex < targetIndex) {
      targetIndex--;
    }
    if (fromIndex === targetIndex) return;

    doc.transact(() => {
      const cloned = cloneYBlock(sourceMap);
      yBlocks.delete(fromIndex, 1);
      yBlocks.insert(targetIndex, [cloned]);
    });
    setSelectedIdx(targetIndex);
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
    doc.transact(() => {
      yBlock.set("offsetX", offsetX);
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
        yBlock.set("widthPercent", Math.max(10, Math.min(100, Math.round(widthPercent))));
      }
      if (heightPt !== undefined) {
        yBlock.set("heightPt", Math.max(5, Math.round(heightPt)));
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

    const canvasEl = canvasRef.current;
    const canvasStyle = canvasEl ? window.getComputedStyle(canvasEl) : null;
    const padLeft = canvasStyle ? parseFloat(canvasStyle.paddingLeft) || 40 : 40;
    const padRight = canvasStyle ? parseFloat(canvasStyle.paddingRight) || 40 : 40;
    const contentWidth = canvasEl ? Math.max(200, canvasEl.clientWidth - padLeft - padRight) : 680;

    const blockWidthPct = "widthPercent" in block ? (block as { widthPercent?: number }).widthPercent : undefined;
    const blockHeightPt = "heightPt" in block ? (block as { heightPt?: number }).heightPt : undefined;

    const initialWidthPct = blockWidthPct ?? (block.type === "table" ? 100 : 75);
    const startWidthPx = startRect ? (startRect.width / zoom) : (contentWidth * (initialWidthPct / 100));
    const startHeightPt = blockHeightPt ?? (startRect ? (startRect.height / zoom) : 60);

    const align = ("align" in block ? (block as { align?: string }).align : undefined) || "center";
    const factorX = align === "center" ? 2 : 1;

    let currentWidthPct = initialWidthPct;
    let currentHeightPt = startHeightPt;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startX) / zoom;
      const dy = (moveEvt.clientY - startY) / zoom;

      let deltaW = 0;
      if (dir.includes("e")) {
        deltaW = dx * factorX;
      } else if (dir.includes("w")) {
        deltaW = -dx * factorX;
      }

      let deltaH = 0;
      if (dir.includes("s")) {
        deltaH = dy;
      } else if (dir.includes("n")) {
        deltaH = -dy;
      }

      if (dir.includes("e") || dir.includes("w")) {
        const newWidthPx = Math.max(40, startWidthPx + deltaW);
        currentWidthPct = Math.max(10, Math.min(100, Math.round((newWidthPx / contentWidth) * 100)));
      }

      if (dir.includes("n") || dir.includes("s")) {
        if (block.type === "shape" && (block as { shapeType?: string }).shapeType === "line") {
          currentHeightPt = 2;
        } else {
          currentHeightPt = Math.max(15, Math.min(1200, Math.round(startHeightPt + deltaH)));
        }
      }

      setDragResize((prev) => ({
        ...prev,
        [blockIdx]: {
          widthPercent: currentWidthPct,
          heightPt: currentHeightPt,
        },
      }));
    };

    const onPointerUp = () => {
      try {
        handleEl.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      setDragResize((prev) => {
        const next = { ...prev };
        delete next[blockIdx];
        return next;
      });

      const isShape = block.type === "shape";
      commitObjectResize(blockIdx, currentWidthPct, isShape ? currentHeightPt : undefined);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 개체 자유 드래그 이동 시작 핸들러
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
      targetEl.closest(".table-remote-control") ||
      targetEl.closest(".hwpx-resize-handle")
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setSelectedIdx(blockIdx);

    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = Math.max(0.2, zoomPercent / 100);

    let currentOffX = initialOffsetX;
    let currentOffY = initialOffsetY;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startX) / zoom;
      const dy = (moveEvt.clientY - startY) / zoom;
      currentOffX = Math.round(initialOffsetX + dx);
      currentOffY = Math.round(initialOffsetY + dy);

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
      commitObjectOffset(blockIdx, currentOffX, currentOffY);
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
    doc.transact(() => {
      applyTextDiffToYText(yText, newText);
    });
  };

  // 문단 서식 변경 (폰트, 크기, 굵기, 기울임, 밑줄, 색상, 정렬) - 다중 선택 범위 일괄 지원
  const updateParagraphStyle = (index: number, patch: Partial<HwpxParagraphBlock>) => {
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

  // 한컴독스 표준 편집 용지 상태 (사용자 업로드 캡처 이미지 100% 매칭)
  const [pageSizeType, setPageSizeType] = useState<string>("A4");
  const [pageWidthMm, setPageWidthMm] = useState<number>(210.0);
  const [pageHeightMm, setPageHeightMm] = useState<number>(297.0);
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">("portrait");
  const [pageBindingType, setPageBindingType] = useState<"left" | "spread" | "top">("left");
  const [pageMarginTopMm, setPageMarginTopMm] = useState<number>(20.0);
  const [pageMarginBottomMm, setPageMarginBottomMm] = useState<number>(20.0);
  const [pageMarginLeftMm, setPageMarginLeftMm] = useState<number>(25.0);
  const [pageMarginRightMm, setPageMarginRightMm] = useState<number>(25.0);
  const [pageHeaderMm, setPageHeaderMm] = useState<number>(15.0);
  const [pageFooterMm, setPageFooterMm] = useState<number>(10.0);
  const [pageGutterMm, setPageGutterMm] = useState<number>(0.0);
  const [pageApplyScope, setPageApplyScope] = useState<string>("문서 전체");
  const [showPageSetupToast, setShowPageSetupToast] = useState(false);
  const [pagePulse, setPagePulse] = useState(false);

  // 자동 페이지 나누기: 블록 실측 높이와 수동 쪽 나누기(pageBreak)를 기준으로 페이지별 블록 인덱스 계산
  const recomputePagination = useCallback(() => {
    if (blocks.length === 0) {
      setPageBreakIndices((prev) => (prev.length === 1 && prev[0] === 0 ? prev : [0]));
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
    const padTop = Math.max(16, Math.round(pageMarginTopMm * 3.78));
    const padBottom = Math.max(16, Math.round(pageMarginBottomMm * 3.78));
    const usableH = Math.max(160, pagePxH - padTop - padBottom);

    const breaks: number[] = [0];
    let accH = 0;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const el = root.querySelector<HTMLElement>(`[data-block-idx="${i}"]`);
      const style = el ? window.getComputedStyle(el) : null;
      const mb = style ? parseFloat(style.marginBottom || "0") || 0 : 0;
      const mt = style ? parseFloat(style.marginTop || "0") || 0 : 0;
      const h = el ? Math.max(16, el.offsetHeight + mt + mb) : 28;

      if (i === 0) {
        accH = h;
        continue;
      }

      const forced = b.type === "paragraph" && Boolean(b.pageBreak);
      if (forced || (accH + h > usableH && i > breaks[breaks.length - 1])) {
        breaks.push(i);
        accH = h;
      } else {
        accH += h;
      }
    }

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
  }, [blocks, pageHeightMm, pageMarginTopMm, pageMarginBottomMm, pageViewColumns, showPageOutline]);

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

  const pages = useMemo(() => {
    if (blocks.length === 0) return [[]];
    const validBreaks = pageBreakIndices.filter((idx) => idx >= 0 && idx < blocks.length);
    if (validBreaks.length === 0 || validBreaks[0] !== 0) {
      validBreaks.unshift(0);
    }
    return validBreaks.map((start, pIdx) => {
      const end = validBreaks[pIdx + 1] ?? blocks.length;
      const indices: number[] = [];
      for (let i = start; i < end; i++) indices.push(i);
      return indices;
    });
  }, [blocks.length, pageBreakIndices]);

  const totalPages = Math.max(1, pages.length);
  const currentPageNum = useMemo(() => {
    const found = pages.findIndex((indices) => indices.includes(selectedIdx));
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
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showSymbolModal, setShowSymbolModal] = useState(false);
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
  const [propActiveTab, setPropActiveTab] = useState<"basic" | "margin" | "border" | "background" | "table">("basic");

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
  const [propCaptionPos, setPropCaptionPos] = useState<string>("bottom_center");
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

  const openPropertyModal = (idx: number) => {
    const block = blocks[idx];
    if (!block || (block.type !== "table" && block.type !== "image" && block.type !== "shape" && block.type !== "chart")) return;

    setPropertyTargetIdx(idx);
    setPropActiveTab("basic");

    const isFloating = block.treatAsChar !== undefined ? !block.treatAsChar : ((block.offsetX !== undefined && block.offsetX !== 0) || (block.offsetY !== undefined && block.offsetY !== 0));
    setPropTreatAsChar(!isFloating);
    setPropTextWrap(block.textWrap || (isFloating ? "IN_FRONT_OF_TEXT" : "TOP_AND_BOTTOM"));

    const offX = block.offsetX || 0;
    const offY = block.offsetY || 0;
    setPropHorzOffsetMm(Number((offX / 3.78).toFixed(2)));
    setPropVertOffsetMm(Number((offY / 3.78).toFixed(2)));

    // 바깥 여백
    setPropMarginLeftMm(block.marginLeftMm ?? 0.0);
    setPropMarginRightMm(block.marginRightMm ?? 0.0);
    setPropMarginTopMm(block.marginTopMm ?? 0.0);
    setPropMarginBottomMm(block.marginBottomMm ?? 0.0);

    // 캡션
    setPropCaption(block.caption !== undefined && block.caption !== "" ? block.caption : getAutoCaptionText(idx, block.type));
    setPropCaptionPos(block.captionPos ?? "bottom_center");

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
      setPropWidthMm(Number(((wPct / 100) * 150).toFixed(2)));
      setPropHeightMm(block.heightPt ? Number((block.heightPt * 0.3527).toFixed(2)) : 60.0);
      setPropBorderType(block.borderType || "SOLID");
      setPropBorderThickness(block.borderThickness || "0.12mm");
      setPropBorderColor(block.borderColor || "#000000");
    } else if (block.type === "shape") {
      const wPct = block.widthPercent || 75;
      setPropWidthMm(Number(((wPct / 100) * 150).toFixed(2)));
      setPropHeightMm(Number(((block.heightPt || 60) * 0.3527).toFixed(2)));
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
      yBlock.set("textWrap", propTextWrap);

      const computedWidthPct = Math.max(10, Math.min(100, Math.round((propWidthMm / 150) * 100)));
      yBlock.set("widthPercent", computedWidthPct);
      yBlock.set("heightPt", Math.max(5, Math.round(propHeightMm / 0.3527)));

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
    setPropertyTargetIdx(null);
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
      if (!isCrossSelecting || crossDragRef.current?.crossed) return;
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
      // F7: 편집 용지 모달
      if (e.key === "F7" || e.keyCode === 118) {
        e.preventDefault();
        openPageSetupModal();
        return;
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
        setShowHyperlinkModal(true);
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

  // 하이퍼링크 삽입
  const handleInsertHyperlink = (text: string, url: string) => {
    restoreSelection();
    const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0066cc;text-decoration:underline;font-weight:500;">${text}</a>`;
    if (document.activeElement && document.activeElement.getAttribute("contenteditable") === "true") {
      document.execCommand("insertHTML", false, linkHtml);
      triggerActiveBlockInput();
    } else {
      const block = blocks[selectedIdx];
      if (block && block.type === "paragraph") {
        updateParagraph(selectedIdx, (block.text || "") + " " + linkHtml);
      }
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
      yBlock.set("strokeColor", block.strokeColor || "#0066cc");
      yBlock.set("strokeWidth", block.strokeWidth || 1.5);
      yBlock.set("widthPercent", block.widthPercent || 65);
      yBlock.set("align", block.align || "center");
      if (block.text) yBlock.set("text", block.text);
    }
    const targetIdx = afterIdx < 0 ? yBlocks.length : Math.min(afterIdx + 1, yBlocks.length);
    doc.transact(() => {
      yBlocks.insert(targetIdx, [yBlock]);
    });
    setSelectedIdx(targetIdx);
  };

  // 글상자 (Text Box) 삽입
  const addTextBox = () => {
    const newId = `shape-${Date.now()}`;
    const block: HwpxShapeBlock = {
      id: newId,
      type: "shape",
      shapeType: "rect",
      text: "글상자 내용을 입력하세요.",
      fillColor: "#FFFFFF",
      strokeColor: "#0066cc",
      strokeWidth: 1.5,
      widthPercent: 65,
      align: "center",
    };
    insertBlockAfter(selectedIdx, block);
  };

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

  // 각주 달기
  const addFootnote = () => {
    const cur = blocks[selectedIdx];
    if (cur && cur.type === "paragraph") {
      updateParagraph(selectedIdx, (cur.text || "") + "<sup>1)</sup>");
      const notePara: HwpxParagraphBlock = {
        id: `footnote-${Date.now()}`,
        type: "paragraph",
        text: "1) 각주: 본 통계 및 세부 내용은 관련 규정 및 공시 자료에 따름.",
        sizePt: 8.5,
        align: "left",
        fontFamily: currentPara?.fontFamily || FONT_FAMILIES[0].value,
      };
      insertBlockAfter(blocks.length - 1, notePara);
    }
  };

  // 미주 달기
  const addEndnote = () => {
    const cur = blocks[selectedIdx];
    if (cur && cur.type === "paragraph") {
      updateParagraph(selectedIdx, (cur.text || "") + "<sup>[i]</sup>");
      const notePara: HwpxParagraphBlock = {
        id: `endnote-${Date.now()}`,
        type: "paragraph",
        text: "[i] 미주: 문서의 상세 참고 문헌 및 주석 내용입니다.",
        sizePt: 8.5,
        align: "left",
        fontFamily: currentPara?.fontFamily || FONT_FAMILIES[0].value,
      };
      insertBlockAfter(blocks.length - 1, notePara);
    }
  };

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

  // 웹 동영상 삽입 (한컴독스)
  const insertWebVideo = () => {
    const vidPara: HwpxParagraphBlock = {
      id: `vid_${Date.now()}`,
      type: "paragraph",
      text: "[웹 동영상: https://www.youtube.com/watch?v=sample]",
      sizePt: 10,
      align: "center",
      bold: true,
    };
    insertBlockAfter(selectedIdx, vidPara);
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
  const handleTableCalc = (type: "sum" | "avg" | "comma-add" | "comma-remove") => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("계산식을 적용할 표를 먼저 선택해 주세요.");
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(selectedIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;

    doc.transact(() => {
      if (type === "sum" || type === "avg") {
        let sum = 0;
        let count = 0;
        cur.rows.forEach((row) => {
          row.forEach((cell) => {
            const num = parseFloat(cell.text.replace(/,/g, "").trim());
            if (!isNaN(num)) {
              sum += num;
              count++;
            }
          });
        });
        const valStr = type === "sum" ? String(sum.toLocaleString()) : (count > 0 ? (sum / count).toFixed(2) : "0");
        const lastRow = yRows.get(yRows.length - 1);
        const lastCell = lastRow?.get((lastRow?.length || 1) - 1);
        const yCellText = lastCell?.get("text") as Y.Text;
        if (yCellText) {
          yCellText.delete(0, yCellText.length);
          yCellText.insert(0, valStr);
        }
      } else if (type === "comma-add" || type === "comma-remove") {
        cur.rows.forEach((row, rIdx) => {
          const yRow = yRows.get(rIdx);
          row.forEach((cell, cIdx) => {
            const yCell = yRow?.get(cIdx);
            const yCellText = yCell?.get("text") as Y.Text;
            if (!yCellText) return;
            const raw = cell.text.trim();
            if (type === "comma-add") {
              const num = Number(raw.replace(/,/g, ""));
              if (!isNaN(num) && raw.length > 0) {
                yCellText.delete(0, yCellText.length);
                yCellText.insert(0, num.toLocaleString());
              }
            } else {
              yCellText.delete(0, yCellText.length);
              yCellText.insert(0, raw.replace(/,/g, ""));
            }
          });
        });
      }
    });
  };

  // 표 셀 합치기 (첫 행의 두 셀 병합)
  const handleMergeTableCells = () => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("셀을 합칠 표를 먼저 선택해 주세요.");
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(selectedIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;
    if (!yRows || yRows.length < 1) return;

    doc.transact(() => {
      const row0 = yRows.get(0);
      if (row0 && row0.length > 1) {
        const cell0 = row0.get(0);
        const cell1 = row0.get(1);
        const text0 = (cell0?.get("text") as Y.Text)?.toString() || "";
        const text1 = (cell1?.get("text") as Y.Text)?.toString() || "";
        const combined = text0 + (text1 ? " " + text1 : "");
        const yText0 = cell0?.get("text") as Y.Text;
        if (yText0) {
          yText0.delete(0, yText0.length);
          yText0.insert(0, combined);
        }
        cell0?.set("colSpan", ((cell0.get("colSpan") as number) || 1) + 1);
        row0.delete(1, 1);
      }
    });
  };

  // 표 셀 나누기 (선택 행에 셀 추가)
  const handleSplitTableCell = () => {
    const cur = blocks[selectedIdx];
    if (!cur || cur.type !== "table") {
      showToast("셀을 나눌 표를 먼저 선택해 주세요.");
      return;
    }
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(selectedIdx);
    if (!yBlock) return;
    const yRows = yBlock.get("rows") as Y.Array<Y.Array<Y.Map<unknown>>>;
    if (!yRows || yRows.length < 1) return;

    doc.transact(() => {
      const row0 = yRows.get(0);
      if (row0) {
        const newCell = new Y.Map<unknown>();
        newCell.set("text", new Y.Text(""));
        row0.push([newCell]);
      }
    });
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

  // 모두 선택 (Ctrl+A)
  const handleSelectAll = () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.getAttribute("contenteditable") === "true") {
      document.execCommand("selectAll");
    } else {
      const firstEl = document.querySelector('[contenteditable="true"]') as HTMLElement | null;
      if (firstEl) {
        firstEl.focus();
        document.execCommand("selectAll");
      }
    }
  };

  // 인쇄 (Ctrl+P)
  const handlePrint = () => {
    window.print();
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
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("strikeThrough", false);
      triggerActiveBlockInput();
    }
  };

  // 형광펜 (배경색)
  const applyHighlight = (color: string) => {
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("hiliteColor", false, color);
      triggerActiveBlockInput();
    }
    setShowHighlightPalette(false);
  };

  // 특수문자(문자표) 삽입
  const insertSymbol = (sym: string) => {
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

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const anchor = sel.anchorNode;
        const parent = anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor?.parentElement;
        if (parent?.closest('[contenteditable="true"]')) {
          lastSelectionRangeRef.current = sel.getRangeAt(0).cloneRange();
        }
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

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

  // 글꼴 적용
  const applyFontFamily = (fontVal: string) => {
    restoreSelection();
    updateParagraphStyle(selectedIdx, { fontFamily: fontVal });
    if (hasActiveTextSelection()) {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("fontName", false, fontVal);
      triggerActiveBlockInput();
    }
  };

  // 글자 크기 적용
  const applyFontSize = (sizePt: number) => {
    restoreSelection();
    updateParagraphStyle(selectedIdx, { sizePt });
    if (hasActiveTextSelection()) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontSize = `${sizePt}pt`;
        span.appendChild(range.extractContents());
        range.insertNode(span);
        triggerActiveBlockInput();
      }
    }
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
  const addTable = (rows: number, cols: number, afterIdx: number) => {
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

  // 이미지 파일 삽입
  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
      const yBlock = new Y.Map<unknown>();
      yBlock.set("id", `img_${Date.now()}`);
      yBlock.set("type", "image");
      yBlock.set("src", dataUrl);
      yBlock.set("widthPercent", 75);
      yBlock.set("align", "center");
      yBlock.set("caption", imgFile.name);

      doc.transact(() => {
        yBlocks.insert(selectedIdx + 1, [yBlock]);
      });
      setSelectedIdx(selectedIdx + 1);
    };
    reader.readAsDataURL(imgFile);
    e.target.value = "";
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

  // 도형 추가
  const addShape = (
    shapeType: "rect" | "roundRect" | "ellipse" | "line",
    text: string,
    fillColor: string,
    strokeColor: string,
    widthPercent: number,
    afterIdx: number
  ) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", `shape_${Date.now()}`);
    yBlock.set("type", "shape");
    yBlock.set("shapeType", shapeType);
    yBlock.set("widthPercent", widthPercent);
    yBlock.set("heightPt", shapeType === "line" ? 2 : 60);
    yBlock.set("fillColor", fillColor);
    yBlock.set("strokeColor", strokeColor);
    yBlock.set("strokeWidth", 1.5);
    yBlock.set("text", new Y.Text(text));
    yBlock.set("align", "center");

    doc.transact(() => {
      yBlocks.insert(afterIdx + 1, [yBlock]);
    });
    setSelectedIdx(afterIdx + 1);
    setShowShapeModal(false);
    setNewShapeText("");
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
  const currentPara = isParagraph ? (currentBlock as HwpxParagraphBlock) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-5xl h-[94vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
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
                        onClick={() => { setOpenDropdown(null); handleCut(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <CutIcon className="w-4 h-4 text-neutral-600" />
                          <span>오려 두기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+X</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleCopy(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
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
                        onClick={() => { setOpenDropdown(null); deleteSelected(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
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
                            className="absolute left-full top-0 ml-0.5 z-70 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
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
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[150px] text-[12px] text-neutral-800">
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
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] text-[12px] text-neutral-800">
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
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[200px] text-[12px] text-neutral-800">
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
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] text-[12px] text-neutral-800">
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
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[140px] text-[12px] text-neutral-800">
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
                          <div className="absolute left-full top-0 ml-0 z-70 bg-white border border-neutral-300 shadow-lg rounded-[2px] py-1 min-w-[165px] text-[12px] text-neutral-800">
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

                  {/* [입력] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "insert" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTableModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <TableIcon className="w-4 h-4 text-blue-600" />
                          <span>표...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+N,T</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); imageInputRef.current?.click(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ImageIcon className="w-4 h-4 text-emerald-600" />
                          <span>그림...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+N,I</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowShapeModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ShapesIcon className="w-4 h-4 text-purple-600" />
                          <span>도형...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); openNewEquation(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <EquationIcon className="w-4 h-4 text-sky-600" />
                          <span>수식...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+N,M</span>
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
                        onClick={() => { setOpenDropdown(null); addFootnote(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <FootnoteIcon className="w-4 h-4 text-emerald-600" />
                          <span>각주</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+N,N</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); addEndnote(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <EndnoteIcon className="w-4 h-4 text-emerald-600" />
                          <span>미주</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+N,E</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowHyperlinkModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <HyperlinkIcon className="w-4 h-4 text-blue-600" />
                          <span>하이퍼링크...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+K</span>
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
                        onClick={() => { setOpenDropdown(null); setShowAutoTextModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span>📑</span>
                          <span>상용구...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+F3</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowDateModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span>📅</span>
                          <span>날짜/시간...</span>
                        </span>
                      </button>
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
                    </div>
                  )}

                  {/* [서식] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "format" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
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
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowFormatCopyModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <FormatPainterIcon className="w-4 h-4 text-blue-600" />
                          <span>모양 복사...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+C</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); applySuperscript(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SuperscriptIcon className="w-4 h-4" />
                          <span>위 첨자 (x²)</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); applySubscript(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SubscriptIcon className="w-4 h-4" />
                          <span>아래 첨자 (x₁)</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); toggleBulletList(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <BulletListIcon className="w-4 h-4" />
                          <span>글머리표</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); toggleNumberList(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <NumberListIcon className="w-4 h-4" />
                          <span>번호 목록</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTextConvertModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <TextConvertIcon className="w-4 h-4 text-indigo-600" />
                          <span>글자 바꾸기...</span>
                        </span>
                      </button>
                    </div>
                  )}

                  {/* [쪽] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "page" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); openPageSetupModal(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PageSetupIcon className="w-4 h-4 text-neutral-600" />
                          <span>편집 용지...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">F7</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowPageNumberModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PageNumberIcon className="w-4 h-4 text-blue-600" />
                          <span>쪽 번호 매기기...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Alt+N</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); insertHeaderFooter("header"); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <HeaderIcon className="w-4 h-4 text-amber-600" />
                          <span>머리말/꼬리말...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowWatermarkModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <WatermarkIcon className="w-4 h-4 text-neutral-600" />
                          <span>바탕쪽 워터마크...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setColumnCount((c) => (c === 1 ? 2 : c === 2 ? 3 : 1)); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ColumnsIcon className="w-4 h-4 text-neutral-600" />
                          <span>다단 설정...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); addParagraph(selectedIdx ?? blocks.length - 1); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PageBreakIcon className="w-4 h-4 text-neutral-600" />
                          <span>쪽 나누기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Enter</span>
                      </button>
                    </div>
                  )}

                  {/* [표] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "table" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTableModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <TableIcon className="w-4 h-4 text-blue-600" />
                          <span>표 만들기...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleMergeTableCells(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <MergeCellIcon className="w-4 h-4 text-blue-600" />
                          <span>셀 합치기</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">M</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); handleSplitTableCell(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SplitCellIcon className="w-4 h-4 text-blue-600" />
                          <span>셀 나누기...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">S</span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTableCalcModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <CalcIcon className="w-4 h-4 text-emerald-600" />
                          <span>계산식 / 쉼표...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDropdown(null);
                          if (selectedIdx !== null && blocks[selectedIdx]?.type === "table") {
                            openPropertyModal(selectedIdx);
                          } else {
                            showToast("표를 먼저 선택하세요.");
                          }
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <PageSetupIcon className="w-4 h-4 text-neutral-600" />
                          <span>표/셀 속성...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">P</span>
                      </button>
                    </div>
                  )}

                  {/* [검토] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "review" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
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
                        onClick={() => { setOpenDropdown(null); deleteMemosForBlock(selectedIdx); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="w-4 text-center text-red-500 font-bold">✕</span>
                          <span>메모 지우기</span>
                        </span>
                      </button>
                      <div className="my-1 border-t border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowSpellCheckModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SpellCheckIcon className="w-4 h-4 text-emerald-600" />
                          <span>맞춤법 교정...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); insertToc(); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <TocIcon className="w-4 h-4 text-blue-600" />
                          <span>차례 만들기...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowDocStatsModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <DocInfoIcon className="w-4 h-4 text-neutral-600" />
                          <span>문서 정보...</span>
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">Ctrl+Q+I</span>
                      </button>
                    </div>
                  )}

                  {/* [도구] 드롭다운 메뉴 */}
                  {isDropdownOpen && menu.id === "tools" && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-0.5 z-60 bg-white border border-neutral-300 shadow-2xl rounded-md py-1 min-w-[210px] text-xs text-neutral-800 animate-in fade-in duration-100"
                      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowTextConvertModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <TextConvertIcon className="w-4 h-4 text-indigo-600" />
                          <span>글자 바꾸기...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowShortcutsModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <ShortcutsIcon className="w-4 h-4 text-neutral-600" />
                          <span>단축키 안내...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowSafeFontModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <SafeFontIcon className="w-4 h-4 text-emerald-600" />
                          <span>공공안심글꼴...</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpenDropdown(null); setShowAddFontModal(true); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <span>🔤</span>
                          <span>글꼴(폰트) 추가/관리...</span>
                        </span>
                      </button>
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
                onClick={() => void runSave()}
                className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
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
                  onClick={handleCut}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="오려 두기 (Ctrl+X)"
                >
                  <CutIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">오려 두기</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
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
                  onClick={() => setShowFormatCopyModal(true)}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap min-w-fit ${copiedStyle ? "bg-blue-50 text-[#0066cc] font-bold" : "text-neutral-700 hover:text-[#0066cc]"
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
                  onClick={() => setShowSearchModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="찾기 (Ctrl+F) / 찾아 바꾸기 (Ctrl+H)"
                >
                  <SearchIcon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    찾기 <span className="text-[8px]">▾</span>
                  </span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 4. 개체 삽입 (도형 ▼, 그림 ▼, 표 ▼, 차트 ▼, 웹 동영상 ▼) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setShowShapeModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="도형 삽입"
                >
                  <ShapesIcon className="w-5 h-5 text-purple-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    도형 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="그림 삽입 (Ctrl+N, I)"
                >
                  <ImageIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    그림 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTableModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="표 만들기 (Ctrl+N, T)"
                >
                  <TableIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    표 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={insertSampleChart}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="차트 삽입"
                >
                  <ChartIcon className="w-5 h-5 text-sky-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    차트 <span className="text-[8px]">▾</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={insertWebVideo}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="웹 동영상 삽입"
                >
                  <WebVideoIcon className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 flex items-center gap-0.5 text-neutral-600 whitespace-nowrap">
                    웹 동영상 <span className="text-[8px]">▾</span>
                  </span>
                </button>
              </div>

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 5. 주석 및 참조 (각주, 미주, 하이퍼링크, 문자표) */}
              <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={addFootnote}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="각주 달기 (Ctrl+N, N)"
                >
                  <FootnoteIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">각주</span>
                </button>
                <button
                  type="button"
                  onClick={addEndnote}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="미주 달기"
                >
                  <EndnoteIcon className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">미주</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowHyperlinkModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="하이퍼링크 (Ctrl+K)"
                >
                  <HyperlinkIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">하이퍼링크</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSymbolModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
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
                  onClick={() => setShowCharShapeModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="글자 모양 (Alt+L)"
                >
                  <CharShapeIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">글자 모양</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowParaShapeModal(true)}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                  title="문단 모양 (Alt+T)"
                >
                  <ParaShapeIcon className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="text-[10px] mt-0.5 text-neutral-600 whitespace-nowrap">문단 모양</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedIdx !== null) {
                      openPropertyModal(selectedIdx);
                    } else {
                      showToast("속성을 볼 개체(도형/표/이미지/문단)를 먼저 선택하세요.");
                    }
                  }}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
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

              <div className="w-[1px] h-8 bg-neutral-300 mx-0.5 shrink-0" />

              {/* 8. 공공안심글꼴 */}
              <button
                type="button"
                onClick={() => setShowSafeFontModal(true)}
                className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-emerald-700 cursor-pointer shrink-0 whitespace-nowrap min-w-fit"
                title="상업적 무료 이용 가능한 공공안심글꼴 모음"
              >
                <SafeFontIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-[10px] mt-0.5 font-medium text-emerald-800 whitespace-nowrap">공공안심글꼴</span>
              </button>
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
                disabled={!isParagraph}
                value={currentPara?.fontFamily || editorFonts[0]?.value || FONT_FAMILIES[0].value}
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
                  disabled={!isParagraph}
                  onClick={() => applyFontSize(Math.max(6, (currentPara?.sizePt || 10) - 1))}
                  className="px-1 py-0.5 hover:bg-neutral-200 text-neutral-600 disabled:opacity-40 text-[10px]"
                  title="글자 크기 1pt 줄이기"
                >
                  ▼
                </button>
                <select
                  disabled={!isParagraph}
                  value={Math.round(currentPara?.sizePt || 10)}
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
                  disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                  disabled={!isParagraph}
                  onClick={() => setShowColorPalette(!showColorPalette)}
                  className="h-6 px-1.5 rounded flex items-center gap-1 hover:bg-neutral-100 text-neutral-800 transition cursor-pointer disabled:opacity-40"
                  title="글자 색상"
                >
                  <span className="font-bold border-b-2" style={{ borderColor: currentPara?.color || "#111827" }}>
                    가
                  </span>
                  <span className="text-[8px]">▾</span>
                </button>
                {showColorPalette && (
                  <div className="absolute top-8 left-0 z-50 bg-white border border-neutral-300 shadow-lg rounded p-2 flex items-center gap-1">
                    {FONT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          applyTextColor(c.value);
                          setShowColorPalette(false);
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
                        setShowColorPalette(false);
                      }}
                      className="w-5 h-5 rounded cursor-pointer"
                      title="사용자 지정 색상"
                    />
                  </div>
                )}
              </div>

              {/* 형광펜 (배경 하이라이트) */}
              <div className="relative">
                <button
                  type="button"
                  disabled={!isParagraph}
                  onClick={() => setShowHighlightPalette(!showHighlightPalette)}
                  className="h-6 px-1.5 rounded flex items-center gap-1 hover:bg-neutral-100 text-neutral-800 transition cursor-pointer disabled:opacity-40"
                  title="형광펜 (배경색)"
                >
                  <HighlighterIcon className="w-3.5 h-3.5" />
                  <span className="text-[8px]">▾</span>
                </button>
                {showHighlightPalette && (
                  <div className="absolute top-8 left-0 z-50 bg-white border border-neutral-300 shadow-lg rounded p-2 flex items-center gap-1">
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
                        onClick={() => applyHighlight(h.color)}
                        className="w-4 h-4 rounded border border-neutral-400 hover:scale-125 transition cursor-pointer"
                        style={{ background: h.color === "transparent" ? "#fff" : h.color }}
                        title={h.label}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 문단 정렬 4종 (양쪽맞춤, 왼, 가운데, 오른) */}
              <button
                type="button"
                disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                disabled={!isParagraph}
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
                disabled={!isParagraph}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateParagraphStyle(selectedIdx, { align: "justify" })}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${currentPara?.align === "justify" ? "hover:bg-neutral-100 text-neutral-800" : "hover:bg-neutral-100 text-neutral-800"
                  } disabled:opacity-40`}
                title="배분 정렬"
              >
                <AlignDistributeIcon className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 줄 간격 (160%) */}
              <div className="flex items-center gap-1 text-xs text-neutral-700">
                <span title="줄 간격">
                  <LineSpacingIcon className="w-3.5 h-3.5" />
                </span>
                <select
                  defaultValue="160"
                  className="bg-neutral-50 text-neutral-800 border border-neutral-300 rounded px-1 py-0.5 text-xs outline-none cursor-pointer"
                  title="줄 간격 설정"
                >
                  <option value="100">100%</option>
                  <option value="130">130%</option>
                  <option value="150">150%</option>
                  <option value="160">160%</option>
                  <option value="180">180%</option>
                  <option value="200">200%</option>
                </select>
              </div>

              <div className="w-[1px] h-4 bg-neutral-300 mx-1" />

              {/* 들여쓰기 / 내어쓰기 */}
              <button
                type="button"
                disabled={!isParagraph}
                onClick={() => handleIndent(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
                title="내어쓰기 (공백 제거)"
              >
                <IndentDecIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!isParagraph}
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
                <button
                  type="button"
                  disabled={blocks.length <= 1}
                  onClick={() => deleteBlock(selectedIdx)}
                  className="p-1 rounded text-red-600 hover:bg-red-50 text-xs transition disabled:opacity-30 cursor-pointer"
                  title="현재 블록 삭제"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 5열: 한컴독스 표준 가로 눈금자 (Ruler, Image 4 매칭) */}
          {showRuler && (
            <div className="w-full bg-[#f3f4f6] border-b border-neutral-300 py-0.5 px-4 sm:px-8 select-none overflow-x-auto shrink-0">
              <div
                style={{ width: `${Math.round(pageWidthMm * 3.78)}px` }}
                className="mx-auto h-5 bg-white border border-neutral-300 rounded-xs relative flex items-center text-[9px] text-neutral-500 font-mono shadow-2xs transition-all duration-200"
              >
                {/* 왼쪽 여백 영역 회색 음영 */}
                <div
                  style={{ width: `${Math.max(16, Math.round(pageMarginLeftMm * 3.78))}px` }}
                  className="absolute left-0 top-0 bottom-0 bg-[#e5e7eb] border-r border-neutral-300 pointer-events-none"
                />
                {/* 오른쪽 여백 영역 회색 음영 */}
                <div
                  style={{ width: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px` }}
                  className="absolute right-0 top-0 bottom-0 bg-[#e5e7eb] border-l border-neutral-300 pointer-events-none"
                />
                <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
                  {[-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((n, i) => (
                    <div key={i} className="flex flex-col items-center h-full justify-between py-0.5 z-1">
                      <span className="text-[8px] text-neutral-400 select-none font-mono">{Math.abs(n)}</span>
                      <div className="w-[1px] h-1.5 bg-neutral-300" />
                    </div>
                  ))}
                </div>
                {/* 첫 줄 들여쓰기 마커 (역삼각형) */}
                <div
                  style={{ left: `${Math.max(16, Math.round(pageMarginLeftMm * 3.78))}px` }}
                  className="absolute top-0 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-transparent border-t-neutral-700 cursor-ew-resize z-10 transition-all duration-200"
                  title="첫 줄 들여쓰기 마커"
                />
                {/* 왼쪽 여백 / 내어쓰기 마커 (모래시계형태) */}
                <div
                  style={{ left: `${Math.max(16, Math.round(pageMarginLeftMm * 3.78))}px` }}
                  className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center cursor-ew-resize z-10 transition-all duration-200"
                  title="왼쪽 여백 / 들여쓰기 마커"
                >
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-transparent border-b-neutral-700" />
                  <div className="w-2 h-1 bg-neutral-700 rounded-2xs mt-0.5" />
                </div>
                {/* 오른쪽 여백 마커 */}
                <div
                  style={{ right: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px` }}
                  className="absolute bottom-0 translate-x-1/2 flex flex-col items-center cursor-ew-resize z-10 transition-all duration-200"
                  title="오른쪽 여백 마커"
                >
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-transparent border-b-neutral-700" />
                  <div className="w-2 h-1 bg-neutral-700 rounded-2xs mt-0.5" />
                </div>
              </div>
            </div>
          )}
        </header>

        {/* 도형 삽입 팝업 모달 */}
        {showShapeModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3.5 w-80 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <ShapesIcon className="w-4 h-4 text-[#0066cc]" />
                <span>도형 만들기</span>
              </span>
              <button
                type="button"
                onClick={() => setShowShapeModal(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </h4>

            {/* 1. 도형 형태 선택 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-600">도형 종류:</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { type: "rect" as const, label: "직사각형", icon: "▭" },
                  { type: "roundRect" as const, label: "둥근 사각형", icon: "▢" },
                  { type: "ellipse" as const, label: "타원 / 원", icon: "◯" },
                  { type: "line" as const, label: "가로선", icon: "─" },
                ].map((s) => (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => setNewShapeType(s.type)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition cursor-pointer ${newShapeType === s.type
                      ? "border-[#0066cc] bg-blue-50 text-[#0066cc] font-bold shadow-xs"
                      : "border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                      }`}
                  >
                    <span className="text-lg leading-none mb-1">{s.icon}</span>
                    <span className="text-[10px] text-center">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 테마 색상 프리셋 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-600">색상 스타일:</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { name: "기본 오피스", fill: "#FFFFFF", stroke: "#1F2937" },
                  { name: "투명 배경", fill: "transparent", stroke: "#1F2937" },
                  { name: "소프트 그레이", fill: "#F1F5F9", stroke: "#64748B" },
                  { name: "한컴 블루", fill: "#EFF6FF", stroke: "#2563EB" },
                  { name: "앰버 골드", fill: "#FEF3C7", stroke: "#D97706" },
                  { name: "에메랄드", fill: "#DCFCE7", stroke: "#16A34A" },
                ].map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      setNewShapeFill(c.fill);
                      setNewShapeStroke(c.stroke);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] transition cursor-pointer ${newShapeFill === c.fill && newShapeStroke === c.stroke
                      ? "border-[#0066cc] bg-blue-50/50 font-bold"
                      : "border-neutral-200 hover:bg-neutral-50"
                      }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded border shrink-0"
                      style={{
                        background: c.fill === "transparent" ? "#ffffff" : c.fill,
                        borderColor: c.stroke,
                        borderWidth: "1.5px",
                      }}
                    />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 너비 비율 */}
            <div className="flex items-center justify-between text-xs text-neutral-700">
              <span className="text-[11px] font-semibold text-neutral-600">너비 크기:</span>
              <div className="flex items-center gap-1">
                {[25, 50, 75, 100].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setNewShapeWidth(w)}
                    className={`px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${newShapeWidth === w
                      ? "bg-[#0066cc] text-white border-[#0066cc] font-bold"
                      : "bg-neutral-50 text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                      }`}
                  >
                    {w}%
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 도형 안 글자 입력 (선이 아닐 때) */}
            {newShapeType !== "line" && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-neutral-600">글상자 텍스트 (선택):</span>
                <input
                  type="text"
                  value={newShapeText}
                  onChange={(e) => setNewShapeText(e.target.value)}
                  placeholder="도형 안에 표시할 내용을 입력하세요..."
                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#0066cc]"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowShapeModal(false)}
                className="px-3 py-1 rounded text-xs text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => addShape(newShapeType, newShapeText, newShapeFill, newShapeStroke, newShapeWidth, selectedIdx)}
                className="px-3 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
              >
                도형 만들기
              </button>
            </div>
          </div>
        )}

        {/* 표 삽입 팝업 모달 */}
        {showTableModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-64 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span>⊞ 새 표 삽입</span>
              <button type="button" onClick={() => setShowTableModal(false)} className="text-neutral-400 hover:text-neutral-700">✕</button>
            </h4>
            <div className="flex items-center justify-between text-xs text-neutral-700">
              <span>행 (가로 줄 수):</span>
              <input
                type="number"
                min={1}
                max={20}
                value={newTableRows}
                onChange={(e) => setNewTableRows(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-neutral-50 border border-neutral-300 rounded px-2 py-1 text-center text-neutral-900"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-700">
              <span>열 (세로 칸 수):</span>
              <input
                type="number"
                min={1}
                max={15}
                value={newTableCols}
                onChange={(e) => setNewTableCols(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-neutral-50 border border-neutral-300 rounded px-2 py-1 text-center text-neutral-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="px-3 py-1 rounded text-xs text-neutral-600 hover:bg-neutral-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => addTable(newTableRows, newTableCols, selectedIdx)}
                className="px-3 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa]"
              >
                삽입하기
              </button>
            </div>
          </div>
        )}

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
            <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs select-none">
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
        {showSymbolModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-96 text-neutral-800 max-h-[420px] overflow-y-auto">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <span>※</span>
                <span>문자표 (특수문자 입력)</span>
              </span>
              <button type="button" onClick={() => setShowSymbolModal(false)} className="text-neutral-400 hover:text-neutral-700">✕</button>
            </h4>
            <div>
              <div className="text-[11px] font-semibold text-neutral-600 mb-1.5">자주 쓰는 기호</div>
              <div className="grid grid-cols-8 gap-1 text-sm text-center">
                {["●", "○", "■", "□", "▲", "▼", "★", "☆", "※", "◆", "◇", "▶", "◀", "▷", "◁", "☎"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => insertSymbol(s)}
                    className="p-1.5 rounded hover:bg-blue-50 hover:text-[#0066cc] border border-neutral-200 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-neutral-600 mb-1.5">수학 및 연산자</div>
              <div className="grid grid-cols-8 gap-1 text-sm text-center">
                {["±", "×", "÷", "≠", "≤", "≥", "≒", "∞", "∑", "√", "∫", "∂", "∈", "∩", "∪", "⊂"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => insertSymbol(s)}
                    className="p-1.5 rounded hover:bg-blue-50 hover:text-[#0066cc] border border-neutral-200 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-neutral-600 mb-1.5">화살표 및 단위</div>
              <div className="grid grid-cols-8 gap-1 text-sm text-center">
                {["→", "←", "↑", "↓", "↔", "℃", "℉", "㈜", "™", "©", "®", "§", "¶", "①", "②", "③"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => insertSymbol(s)}
                    className="p-1.5 rounded hover:bg-blue-50 hover:text-[#0066cc] border border-neutral-200 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
              if (targetBlockId) {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    const pEl = document.querySelector<HTMLElement>(`[data-block-id="${targetBlockId}"] p`);
                    if (pEl) {
                      pEl.focus({ preventScroll: true });
                      pEl.scrollIntoView({ block: "nearest", inline: "nearest" });
                    }
                  });
                });
              }
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
              if (targetBlockId) {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    const pEl = document.querySelector<HTMLElement>(`[data-block-id="${targetBlockId}"] p`);
                    if (pEl) {
                      pEl.focus({ preventScroll: true });
                      pEl.scrollIntoView({ block: "nearest", inline: "nearest" });
                    }
                  });
                });
              }
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
                  onClick={() => { setContextMenu(null); setShowHyperlinkModal(true); }}
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
                  setShowHyperlinkModal(true);
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
                      { id: "border" as const, label: "테두리" },
                      { id: "background" as const, label: "배경" },
                      ...(blocks[propertyTargetIdx]?.type === "table" ? [{ id: "table" as const, label: "표" }] : []),
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

                          {/* 하단 체크박스 3개 */}
                          <div className="flex flex-col gap-1.5 mt-1 border-t border-neutral-100 pt-2 text-[11px] text-neutral-700">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={propLimitToPage}
                                onChange={(e) => setPropLimitToPage(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>쪽 영역 안으로 제한</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={propAllowOverlap}
                                onChange={(e) => setPropAllowOverlap(e.target.checked)}
                                className="accent-[#0066cc]"
                              />
                              <span>서로 겹침 허용</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={propKeepWithAnchor}
                                onChange={(e) => setPropKeepWithAnchor(e.target.checked)}
                                className="accent-[#0066cc]"
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
                                  onClick={() => setPropCaptionPos(btn.id)}
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
                            <div className="flex flex-col gap-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="w-24 text-neutral-600">크기</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={propCaptionSizeMm}
                                  onChange={(e) => setPropCaptionSizeMm(Number(e.target.value))}
                                  className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                                />
                                <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-24 text-neutral-600">개체와의 간격</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={propCaptionGapMm}
                                  onChange={(e) => setPropCaptionGapMm(Number(e.target.value))}
                                  className="w-20 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-xs"
                                />
                                <span className="text-neutral-500 font-mono text-[11px]">mm</span>
                              </div>
                              <div className="flex flex-col gap-1 mt-1 text-[11px] text-neutral-700">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={propCaptionExpandWidth}
                                    onChange={(e) => setPropCaptionExpandWidth(e.target.checked)}
                                    className="accent-[#0066cc]"
                                  />
                                  <span>여백 부분까지 너비 확대</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={propCaptionSingleLine}
                                    onChange={(e) => setPropCaptionSingleLine(e.target.checked)}
                                    className="accent-[#0066cc]"
                                  />
                                  <span>한 줄로 입력</span>
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* 캡션 텍스트 내용 */}
                          <div className="flex flex-col gap-1 border-t border-neutral-100 pt-2">
                            <span className="text-neutral-600 text-[11px]">캡션 내용 입력:</span>
                            <input
                              type="text"
                              value={propCaption}
                              onChange={(e) => setPropCaption(e.target.value)}
                              placeholder="[그림/표 캡션 입력...]"
                              className="bg-neutral-50 border border-neutral-300 rounded px-2 py-1 text-xs outline-none focus:border-[#0066cc]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* [3. 테두리 탭 - 첨부 4번 이미지 100% 매칭] */}
                    {propActiveTab === "border" && (
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

        {/* 에러 바 */}
        {error && (
          <div className="px-5 py-2 text-xs bg-red-500/15 text-red-400 border-b border-red-500/20">
            {error}
          </div>
        )}

        {/* 메인 문서 편집 영역 (한글 A4 용지 스타일 / 쪽 윤곽 끔 시 연속 편집 모드) */}
        <main
          ref={canvasScrollRef}
          className={`flex-1 overflow-auto ${showPageOutline ? "p-4 sm:p-8 bg-[#edf0f5]" : "p-0 bg-white"}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && blocks.length > 0) {
              const lastIdx = blocks.length - 1;
              setSelectedIdx(lastIdx);
              const lastBlock = blocks[lastIdx];
              if (lastBlock.type === "paragraph") {
                pendingCaretRef.current = { mode: "offset", blockId: lastBlock.id, offset: lastBlock.text.length };
              }
            }
          }}
        >
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
              onMouseDown={(e) => {
                if (e.button !== 0) return;
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
              className={
                !showPageOutline
                  ? "w-full flex flex-col items-stretch gap-0"
                  : `w-max ${pageViewColumns === 3
                    ? "grid grid-cols-[repeat(3,max-content)] gap-6 justify-items-center"
                    : pageViewColumns === 2
                      ? "grid grid-cols-[repeat(2,max-content)] gap-6 justify-items-center"
                      : `flex flex-col items-center gap-6 ${memos.length > 0 && showAllMemos ? "pr-[170px]" : ""}`
                    }`
              }
            >
              {pages.map((pageIndices, pageIdx) => (
                <div
                  key={`page-${pageIdx}`}
                  data-page-idx={pageIdx}
                  onClick={(e) => {
                    if (e.target === e.currentTarget && pageIndices.length > 0) {
                      const lastIdx = pageIndices[pageIndices.length - 1];
                      setSelectedIdx(lastIdx);
                      const lastBlock = blocks[lastIdx];
                      if (lastBlock?.type === "paragraph") {
                        pendingCaretRef.current = { mode: "offset", blockId: lastBlock.id, offset: lastBlock.text.length };
                      }
                    }
                  }}
                  className={`h-auto bg-white text-neutral-900 shrink-0 transition-shadow duration-150 outline-none cursor-text relative ${
                    showPageOutline
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
                          paddingTop: `${Math.max(16, Math.round(pageMarginTopMm * 3.78))}px`,
                          paddingBottom: `${Math.max(16, Math.round(pageMarginBottomMm * 3.78))}px`,
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
                          top: `${Math.max(16, Math.round(pageMarginTopMm * 3.78))}px`,
                          left: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                      <div
                        className="absolute pointer-events-none border-t border-r border-neutral-400/80"
                        style={{
                          top: `${Math.max(16, Math.round(pageMarginTopMm * 3.78))}px`,
                          right: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                      <div
                        className="absolute pointer-events-none border-b border-l border-neutral-400/80"
                        style={{
                          bottom: `${Math.max(16, Math.round(pageMarginBottomMm * 3.78))}px`,
                          left: `${Math.max(16, Math.round((pageMarginLeftMm + (pageBindingType === "left" ? pageGutterMm : 0)) * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                      <div
                        className="absolute pointer-events-none border-b border-r border-neutral-400/80"
                        style={{
                          bottom: `${Math.max(16, Math.round(pageMarginBottomMm * 3.78))}px`,
                          right: `${Math.max(16, Math.round(pageMarginRightMm * 3.78))}px`,
                          width: "12px",
                          height: "12px",
                        }}
                      />
                    </>
                  )}
                  {(() => {
                    let pageCounter = pageIdx;
                    return pageIndices.map((idx) => {
                      const block = blocks[idx];
                      if (!block) return null;
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
                            key={block.id}
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
                            className="w-full relative"
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
                              return (
                                <div className={hasMemos && showAllMemos ? "relative bg-orange-50/75 border-b border-orange-300/80 rounded-[2px]" : "relative"}>
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
                                    alignClass={alignClass}
                                    fontSize={fontSize}
                                    showParaMarks={showParaMarks}
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

                                  {hasMemos && showAllMemos && (
                                    <div
                                      contentEditable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`absolute top-0 z-40 flex flex-col gap-1.5 select-none ${
                                        showPageOutline ? "left-[calc(100%+18px)]" : "right-2"
                                      }`}
                                      style={{ width: "200px" }}
                                    >
                                      {showMemoGuides && showPageOutline && (
                                        <div
                                          aria-hidden="true"
                                          className="absolute right-full top-3 h-[1px] bg-neutral-700 pointer-events-none"
                                          style={{ width: "18px" }}
                                        />
                                      )}
                                      {blockMemos.map((memo) => {
                                        const memoNumber = memos.findIndex((m) => m.id === memo.id) + 1;
                                        return (
                                          <div
                                            key={memo.id}
                                            data-memo-card={memo.id}
                                            className="border border-neutral-800 shadow-md rounded-[1px] overflow-hidden text-[11px] font-sans"
                                          >
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
                            key={block.id}
                            data-block-id={block.id}
                            data-block-idx={idx}
                            data-block-type="table"
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
                                targetEl.closest(".table-remote-control")
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
                              marginLeft: block.marginLeftMm ? `${block.marginLeftMm * 3.78}px` : "auto",
                              marginRight: block.marginRightMm ? `${block.marginRightMm * 3.78}px` : "auto",
                              width: tblWidth,
                            }}
                            className={`hwpx-resizable-box my-6 py-1 relative group/tbl cursor-default select-none ${isSelected ? "ring-1 ring-blue-500 rounded shadow-md" : ""
                              }`}
                          >
                            {renderDropIndicator()}
                            {/* 8방향 선택 조절점 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                            {isSelected && (
                              <HwpxSelectionHandles
                                onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                              />
                            )}

                            {/* 표 전용 플로팅 리모컨 (표 클릭/선택 시 우측 옆에 플로팅 리모컨 형태로 노출) */}
                            {isSelected && (
                              <div
                                contentEditable={false}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="table-remote-control absolute top-0 left-[calc(100%+14px)] z-40 flex flex-col gap-1.5 p-2.5 bg-white/95 backdrop-blur-md border border-neutral-300 shadow-2xl rounded-xl text-xs select-none w-38 animate-in fade-in zoom-in-95 duration-150"
                                style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)" }}
                              >
                                {/* 리모컨 상단 타이틀 바 */}
                                <div className="flex items-center justify-between pb-1.5 border-b border-neutral-200">
                                  <div className="flex items-center gap-1.5 font-bold text-neutral-800 text-[11px]">
                                    <span className="text-blue-600 font-bold">⊞</span>
                                    <span>표 리모컨</span>
                                    <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-1 py-0.5 rounded border border-neutral-200">
                                      {block.rows.length}×{block.rows[0]?.length || 0}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedIdx(-1);
                                    }}
                                    className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded w-4 h-4 flex items-center justify-center text-[11px] cursor-pointer"
                                    title="리모컨 닫기 (선택 해제)"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {/* 개체 속성 */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openPropertyModal(idx)}
                                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] text-neutral-700 hover:bg-neutral-100 bg-neutral-50 border border-neutral-200 font-medium cursor-pointer"
                                    title="표/셀 개체 속성 (단축키 P)"
                                  >
                                    <span>⚙</span>
                                    <span>개체 속성 (P)</span>
                                  </button>
                                </div>

                                {/* 행 / 열 편집 조작 */}
                                <div className="space-y-1">
                                  <div className="text-[10px] font-semibold text-neutral-500 px-0.5">행 / 열 편집</div>
                                  <div className="grid grid-cols-2 gap-1">
                                    <button
                                      type="button"
                                      onClick={() => addTableRow(idx, block.rows.length - 1)}
                                      className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                                      title="표 맨 아래에 행 추가"
                                    >
                                      <span>+</span>
                                      <span>행 추가</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteTableRow(idx, block.rows.length - 1)}
                                      className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                                      title="마지막 행 삭제"
                                    >
                                      <span>-</span>
                                      <span>행 삭제</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addTableCol(idx, (block.rows[0]?.length || 1) - 1)}
                                      className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                                      title="표 맨 오른쪽에 열 추가"
                                    >
                                      <span>+</span>
                                      <span>열 추가</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteTableCol(idx, (block.rows[0]?.length || 1) - 1)}
                                      className="px-1.5 py-1 bg-white border border-neutral-200 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300 text-neutral-700 text-[10px] font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                                      title="마지막 열 삭제"
                                    >
                                      <span>-</span>
                                      <span>열 삭제</span>
                                    </button>
                                  </div>
                                </div>

                                {/* 표 삭제 */}
                                <div className="pt-1 border-t border-neutral-200">
                                  <button
                                    type="button"
                                    onClick={() => deleteBlock(idx)}
                                    className="w-full py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                    title="표 전체 삭제"
                                  >
                                    <span>🗑</span>
                                    <span>표 삭제</span>
                                  </button>
                                </div>
                              </div>
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

                            <div className="w-full overflow-x-auto">
                              {(() => {
                                const effectiveBorder = hasOuterBorder
                                  ? `${bWidth} ${bStyle} ${bColor}`
                                  : showTransparentLines
                                    ? "1px dashed rgba(220, 38, 38, 0.35)"
                                    : "none";
                                return (
                                  <table
                                    data-transparent-border={!hasOuterBorder && showTransparentLines ? "true" : "false"}
                                    style={{
                                      backgroundColor: tblBg,
                                      borderCollapse: hasCellSpacing ? "separate" : "collapse",
                                      borderSpacing: cellSpacingPx,
                                      border: effectiveBorder,
                                    }}
                                    className="w-full text-xs text-neutral-900"
                                  >
                                    <tbody>
                                      {block.rows.map((row, rIdx) => {
                                        const isHeaderRow = rIdx === 0;
                                        return (
                                          <tr
                                            key={rIdx}
                                            style={{
                                              borderBottom: effectiveBorder,
                                            }}
                                            className={isHeaderRow && !tblBg ? "bg-neutral-50/60 font-semibold" : ""}
                                          >
                                            {row.map((cell, cIdx) => (
                                              <td
                                                key={cIdx}
                                                style={{
                                                  paddingTop: padTop,
                                                  paddingBottom: padBottom,
                                                  paddingLeft: padLeft,
                                                  paddingRight: padRight,
                                                  borderRight: effectiveBorder,
                                                  backgroundColor: cell.bgColor || undefined,
                                                }}
                                            className="last:border-r-0 min-w-[70px] cursor-move"
                                          >
                                            <input
                                              type="text"
                                              value={cell.text}
                                              onChange={(e) => updateTableCell(idx, rIdx, cIdx, e.target.value)}
                                              onFocus={() => setSelectedIdx(idx)}
                                              onKeyDown={(e) => {
                                                if (e.key === "ArrowUp") {
                                                  if (rIdx === 0) {
                                                    e.preventDefault();
                                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                    navigateToPrevParagraph(idx, rect.left);
                                                  } else {
                                                    const tableEl = (e.target as HTMLElement).closest("table");
                                                    const targetInput = tableEl?.querySelectorAll("tr")[rIdx - 1]?.querySelectorAll("input")[cIdx];
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
                                                    const tableEl = (e.target as HTMLElement).closest("table");
                                                    const targetInput = tableEl?.querySelectorAll("tr")[rIdx + 1]?.querySelectorAll("input")[cIdx];
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
                                                      const tableEl = inputEl.closest("table");
                                                      const prevInput = tableEl?.querySelectorAll("tr")[rIdx]?.querySelectorAll("input")[cIdx - 1];
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
                                                      const tableEl = inputEl.closest("table");
                                                      const nextInput = tableEl?.querySelectorAll("tr")[rIdx]?.querySelectorAll("input")[cIdx + 1];
                                                      if (nextInput) {
                                                        e.preventDefault();
                                                        nextInput.focus();
                                                        nextInput.setSelectionRange(0, 0);
                                                      }
                                                    }
                                                  }
                                                }
                                              }}
                                              className="w-full bg-transparent border-none outline-none px-1 py-0.5 rounded focus:bg-blue-50 text-center font-sans text-xs cursor-text"
                                            />
                                          </td>
                                        ))}
                                      </tr>
                                    );
                                      })}
                                    </tbody>
                                  </table>
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
                        const alignClass = block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center";
                        const currentWidthPct = dragResize[idx]?.widthPercent ?? block.widthPercent ?? 75;
                        const widthStyle = `${currentWidthPct}%`;
                        const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                        const isMoved = currentOffset.x !== 0 || currentOffset.y !== 0;
                        const hasImageCaption = !!((block.captionPos && block.captionPos !== "none") || (block.caption !== undefined && block.caption !== null && block.caption !== ""));
                        const isImageCaptionTop = hasImageCaption && block.captionPos?.startsWith("top");
                        const isImageCaptionBottom = hasImageCaption && !isImageCaptionTop;
                        const imageCaptionAlign = block.captionPos?.includes("left") ? "justify-start" : block.captionPos?.includes("right") ? "justify-end" : "justify-center";

                        return (
                          <div
                            key={block.id}
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
                              transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                              zIndex: isSelected ? 30 : 1,
                            }}
                            className={`my-6 flex flex-col items-center cursor-default select-none relative group/img ${alignClass}`}
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
                              className={`hwpx-resizable-box relative flex flex-col items-center cursor-move ${isSelected
                                ? "outline outline-[1.5px] outline-[#0066cc] outline-offset-1"
                                : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                                }`}
                              style={{ width: widthStyle }}
                            >
                              {/* 8방향 선택 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                              {isSelected && (
                                <HwpxSelectionHandles
                                  onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                                />
                              )}

                              {/* 부유 제어 바 (선택 시에만 노출) */}
                              {isSelected && (
                                <HwpxFloatingToolbar>
                                  <span className="flex items-center gap-1 font-bold text-[#0066cc] text-[11px] pr-1.5 border-r border-neutral-200">
                                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>그림</span>
                                  </span>

                                  {/* 개체 속성 다이얼로그 (P) */}
                                  <button
                                    type="button"
                                    onClick={() => openPropertyModal(idx)}
                                    className="px-1.5 py-0.5 rounded text-[10px] text-neutral-700 hover:bg-neutral-100 border border-neutral-300 font-medium cursor-pointer flex items-center gap-1"
                                    title="그림 개체 속성 (단축키 P)"
                                  >
                                    <span>⚙</span>
                                    <span>속성 (P)</span>
                                  </button>

                                  <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                                  <button
                                    type="button"
                                    onClick={() => deleteBlock(idx)}
                                    className="px-1.5 py-0.5 rounded text-[10px] text-red-600 hover:bg-red-50 font-bold cursor-pointer"
                                  >
                                    삭제
                                  </button>
                                </HwpxFloatingToolbar>
                              )}

                              <img
                                src={block.src}
                                alt={block.caption || "그림"}
                                className="w-full h-auto object-contain max-h-[600px] block select-none pointer-events-none"
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
                        const alignClass = block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center";
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

                        return (
                          <div
                            key={block.id}
                            data-block-id={block.id}
                            data-block-idx={idx}
                            data-block-type="shape"
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
                              transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                              zIndex: isSelected ? 30 : 1,
                            }}
                            className={`my-6 flex flex-col items-center cursor-default select-none relative group/shape ${alignClass}`}
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
                              className={`hwpx-resizable-box relative flex flex-col items-center cursor-move ${isSelected
                                ? "outline outline-[1.5px] outline-[#0066cc] outline-offset-1"
                                : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                                }`}
                              style={{ width: widthStyle }}
                            >
                              {/* 8방향 선택 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                              {isSelected && (
                                <HwpxSelectionHandles
                                  onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                                />
                              )}

                              {/* 부유 제어 바 (선택 시에만 노출) */}
                              {isSelected && (
                                <HwpxFloatingToolbar>
                                  <span className="flex items-center gap-1 font-bold text-[#0066cc] text-[11px] pr-1.5 border-r border-neutral-200">
                                    <ShapesIcon className="w-3.5 h-3.5" />
                                    <span>
                                      {block.shapeType === "rect"
                                        ? "직사각형"
                                        : block.shapeType === "roundRect"
                                          ? "둥근 사각형"
                                          : block.shapeType === "ellipse"
                                            ? "타원"
                                            : "가로선"}
                                    </span>
                                  </span>

                                  {/* 개체 속성 다이얼로그 (P) */}
                                  <button
                                    type="button"
                                    onClick={() => openPropertyModal(idx)}
                                    className="px-1.5 py-0.5 rounded text-[10px] text-neutral-700 hover:bg-neutral-100 border border-neutral-300 font-medium cursor-pointer flex items-center gap-1"
                                    title="도형 개체 속성 (단축키 P)"
                                  >
                                    <span>⚙</span>
                                    <span>속성 (P)</span>
                                  </button>

                                  <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                                  {/* 면 채우기 (선이 아닐 때) */}
                                  {!isLine && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-neutral-500">채우기:</span>
                                      {[
                                        { name: "투명", color: "transparent" },
                                        { name: "흰색", color: "#FFFFFF" },
                                        { name: "연회색", color: "#F1F5F9" },
                                        { name: "연파랑", color: "#EFF6FF" },
                                        { name: "연노랑", color: "#FEF3C7" },
                                        { name: "연초록", color: "#DCFCE7" },
                                      ].map((c) => (
                                        <button
                                          key={c.name}
                                          type="button"
                                          title={c.name}
                                          onClick={() => updateShapeBlock(idx, { fillColor: c.color })}
                                          className={`w-3.5 h-3.5 rounded-full border border-neutral-400 cursor-pointer ${fillColor === c.color ? "ring-2 ring-[#0066cc] scale-110" : "hover:scale-105"
                                            }`}
                                          style={{ background: c.color === "transparent" ? "linear-gradient(45deg, #fff 40%, #ef4444 40%, #ef4444 60%, #fff 60%)" : c.color }}
                                        />
                                      ))}
                                    </div>
                                  )}

                                  {!isLine && <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />}

                                  {/* 선 색상 */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-neutral-500">선:</span>
                                    {[
                                      { name: "검정", color: "#1F2937" },
                                      { name: "회색", color: "#94A3B8" },
                                      { name: "파랑", color: "#2563EB" },
                                      { name: "빨강", color: "#DC2626" },
                                    ].map((c) => (
                                      <button
                                        key={c.name}
                                        type="button"
                                        title={c.name}
                                        onClick={() => updateShapeBlock(idx, { strokeColor: c.color })}
                                        className={`w-3.5 h-3.5 rounded-full border border-neutral-400 cursor-pointer ${strokeColor === c.color ? "ring-2 ring-[#0066cc] scale-110" : "hover:scale-105"
                                          }`}
                                        style={{ background: c.color }}
                                      />
                                    ))}
                                  </div>

                                  <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                                  <button
                                    type="button"
                                    onClick={() => deleteBlock(idx)}
                                    className="px-1.5 py-0.5 rounded text-[10px] text-red-600 hover:bg-red-50 font-bold cursor-pointer"
                                  >
                                    삭제
                                  </button>
                                </HwpxFloatingToolbar>
                              )}

                              {/* 도형 렌더링 */}
                              {isLine ? (
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${Math.max(1, strokeWidth)}px`,
                                    backgroundColor: strokeColor,
                                  }}
                                  className="my-3"
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${currentHeightPt}px`,
                                    backgroundColor: fillColor,
                                    borderColor: strokeColor,
                                    borderWidth: `${strokeWidth}px`,
                                    borderStyle: block.strokeType === "DASH" ? "dashed" : block.strokeType === "DOT" ? "dotted" : "solid",
                                    borderRadius,
                                  }}
                            className="p-3 flex items-center justify-center relative overflow-hidden"
                          >
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
                              placeholder="도형 안 글상자 텍스트 입력..."
                              rows={Math.max(1, (block.text || "").split("\n").length)}
                              className="w-full h-full bg-transparent border-none outline-none text-center text-xs text-neutral-900 resize-none font-sans leading-relaxed"
                            />
                          </div>
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
                      key={block.id}
                      data-block-id={block.id}
                      data-block-idx={idx}
                      data-block-type="equation"
                      tabIndex={-1}
                      contentEditable={false}
                      onDragOver={handleBlockDragOver}
                      onDragLeave={handleBlockDragLeave}
                      onDrop={handleBlockDrop}
                      onClick={() => setSelectedIdx(idx)}
                      onDoubleClick={() => openEditEquation(idx)}
                      style={{
                        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                        zIndex: isSelected ? 30 : 1,
                      }}
                      className="my-5 flex flex-col items-center cursor-default select-none relative group/eq outline-none"
                    >
                      {renderDropIndicator()}
                      {showControlMarks && (
                        <span data-control-mark="equation" className="self-start mb-1 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                          [수식]
                        </span>
                      )}
                      <div
                        onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                        className={`relative inline-flex items-center justify-center px-4 py-2 rounded-xs transition-all cursor-move ${
                          isSelected
                            ? "outline outline-[1.5px] outline-[#0066cc] outline-offset-2 bg-blue-50/20"
                            : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-300"
                        }`}
                      >
                        {/* 8방향 선택 핸들 */}
                        {isSelected && <HwpxSelectionHandles />}

                        {/* 부유 제어 바 (선택 시에만 노출) */}
                        {isSelected && (
                          <HwpxFloatingToolbar>
                            <span className="flex items-center gap-1 font-bold text-[#0066cc] text-[11px] pr-1.5 border-r border-neutral-200">
                              <EquationIcon className="w-3.5 h-3.5" />
                              <span>수식</span>
                            </span>

                            <button
                              type="button"
                              onClick={() => openEditEquation(idx)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 cursor-pointer"
                            >
                              <span>✏️</span>
                              <span>수식 편집</span>
                            </button>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                            <button
                              type="button"
                              onClick={() => deleteBlock(idx)}
                              className="px-1.5 py-0.5 rounded text-[10px] text-red-600 hover:bg-red-50 font-bold cursor-pointer"
                            >
                              삭제
                            </button>
                          </HwpxFloatingToolbar>
                        )}

                        {/* 미려한 한글 MathML 수식 렌더링 */}
                        <div
                          dangerouslySetInnerHTML={{ __html: mathML }}
                          className="hwpx-rendered-equation-wrapper py-1 px-2 pointer-events-none select-none"
                        />
                      </div>
                    </div>
                  );
                }

                if (block.type === "chart") {
                  const currentOffset = dragOffsets[idx] || { x: block.offsetX || 0, y: block.offsetY || 0 };
                  const widthStyle = `${block.widthPercent || 85}%`;
                  const chartAlignClass =
                    block.align === "left"
                      ? "items-start text-left"
                      : block.align === "right"
                      ? "items-end text-right"
                      : "items-center text-center";

                  return (
                    <div
                      key={block.id}
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
                        zIndex: isSelected ? 30 : 1,
                      }}
                      className={`my-6 flex flex-col ${chartAlignClass} cursor-default select-none relative group/chart`}
                    >
                      {renderDropIndicator()}
                      {showControlMarks && (
                        <span data-control-mark="chart" className="self-start mb-1 text-[10px] font-mono text-[#c02626] bg-red-50/90 border border-red-200 px-1 rounded-[2px] select-none pointer-events-none">
                          [차트]
                        </span>
                      )}

                      <div
                        onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                        className={`hwpx-resizable-box relative flex flex-col items-center cursor-move p-2 rounded-lg bg-white border border-neutral-200 shadow-xs transition-all ${
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

                        {/* 부유 제어 바 (선택 시에만 노출) */}
                        {isSelected && (
                          <HwpxFloatingToolbar>
                            <span className="flex items-center gap-1 font-bold text-[#0066cc] text-[11px] pr-1.5 border-r border-neutral-200">
                              <ChartIcon className="w-3.5 h-3.5" />
                              <span>차트</span>
                            </span>

                            {/* 차트 유형 전환 버튼들 */}
                            <div className="flex items-center gap-0.5 bg-neutral-100 p-0.5 rounded border border-neutral-200">
                              {[
                                { id: "column" as const, label: "세로막대", icon: "📊" },
                                { id: "bar" as const, label: "가로막대", icon: "📶" },
                                { id: "line" as const, label: "꺾은선", icon: "📈" },
                                { id: "pie" as const, label: "원형", icon: "🍕" },
                              ].map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateChartType(idx, t.id);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition cursor-pointer flex items-center gap-0.5 ${
                                    block.chartType === t.id
                                      ? "bg-[#0066cc] text-white shadow-2xs font-bold"
                                      : "text-neutral-700 hover:bg-neutral-200"
                                  }`}
                                  title={`${t.label} 차트로 전환`}
                                >
                                  <span>{t.icon}</span>
                                  <span>{t.label}</span>
                                </button>
                              ))}
                            </div>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                            {/* 데이터 편집 버튼 */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditChartData(idx);
                              }}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 cursor-pointer flex items-center gap-1"
                              title="차트 데이터 및 레이블 편집"
                            >
                              <span>✏️</span>
                              <span>데이터 편집</span>
                            </button>

                            {/* 개체 속성 */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPropertyModal(idx);
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] text-neutral-700 hover:bg-neutral-100 border border-neutral-300 font-medium cursor-pointer flex items-center gap-1"
                              title="차트 개체 속성 (단축키 P)"
                            >
                              <span>⚙</span>
                              <span>속성 (P)</span>
                            </button>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBlock(idx);
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] text-red-600 hover:bg-red-50 font-bold cursor-pointer"
                            >
                              삭제
                            </button>
                          </HwpxFloatingToolbar>
                        )}

                        {/* 실제 차트 SVG 렌더링 */}
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
              });
            })()}
              </div>
            ))}
            </div>
          </div>
        </main>

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
      </div>
    </div>
  );
}
