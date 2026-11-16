import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
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
} from "./HwpxIcons";
import AddFontModal from "./AddFontModal";
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

function ContentEditableParagraph({
  block,
  idx,
  alignClass,
  fontSize,
  showParaMarks,
  onSelect,
  onChangeText,
  onSplit,
  onMergePrevious,
  onNavigatePrev,
  onNavigateNext,
  onIndent,
}: {
  block: HwpxParagraphBlock;
  idx: number;
  alignClass: string;
  fontSize: string;
  showParaMarks: boolean;
  onSelect: () => void;
  onChangeText: (text: string) => void;
  onSplit: (before: string, after: string) => void;
  onMergePrevious: () => void;
  onNavigatePrev: (clientX: number) => void;
  onNavigateNext: (clientX: number) => void;
  onIndent: (increase: boolean) => void;
}) {
  const pRef = useRef<HTMLParagraphElement>(null);
  const isComposingRef = useRef(false);

  // 외부(Yjs 동기화 또는 서식 변경 등)에서 텍스트가 갱신되었을 때 DOM 동기화
  useLayoutEffect(() => {
    const el = pRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (!block.text) {
      el.innerHTML = "<br>";
    } else if (el.innerText !== block.text) {
      el.innerText = block.text;
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
    <div className="w-full group my-0.5 relative">
      <p
        ref={pRef}
        contentEditable={true}
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
        className={`w-full p-0 leading-relaxed outline-none min-h-[1.5em] whitespace-pre-wrap break-words cursor-text ${alignClass} ${
          showParaMarks ? "after:content-['↵'] after:text-blue-400 after:text-[10px] after:opacity-60 after:ml-1 after:select-none after:pointer-events-none" : ""
        }`}
        style={{
          fontSize,
          fontWeight: block.bold ? "bold" : "normal",
          fontStyle: block.italic ? "italic" : "normal",
          textDecoration: block.underline ? "underline" : "none",
          color: block.color || "#111827",
          fontFamily: block.fontFamily || "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif",
          lineHeight: 1.65,
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
  const handleDirectDownload = async () => {
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
      link.download = file.name.endsWith(".hwpx") ? file.name : `${file.name}.hwpx`;
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  type PendingCaret =
    | { mode: "offset"; blockId: string; offset: number }
    | { mode: "point"; blockId: string; x: number; toEnd: boolean };
  const pendingCaretRef = useRef<PendingCaret | null>(null);
  const lastDeletedIdxRef = useRef<number | null>(null);

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
    };
    doc.on("update", onUpdate);
    return () => { doc.off("update", onUpdate); };
  }, [doc]);

  // 블록 추가/삭제/분할 후 지정된 문단 및 오프셋/위치로 커서 복원
  useLayoutEffect(() => {
    if (!pendingCaretRef.current) return;
    const target = pendingCaretRef.current;
    pendingCaretRef.current = null;
    const pEl = document.querySelector<HTMLElement>(`[data-block-id="${target.blockId}"] p[contenteditable="true"]`);
    if (pEl) {
      if (target.mode === "point") {
        setCaretAtPointOrEdge(pEl, target.x, target.toEnd);
      } else {
        pEl.focus();
        setCaretOffset(pEl, target.offset);
      }
    }
  }, [blocks]);

  // 위 문단으로 자연스러운 이동
  const navigateToPrevParagraph = (currentIdx: number, clientX: number) => {
    if (currentIdx <= 0) return;
    const prevBlock = blocks[currentIdx - 1];
    setSelectedIdx(currentIdx - 1);
    if (prevBlock.type === "paragraph") {
      const prevEl = document.querySelector<HTMLElement>(`[data-block-id="${prevBlock.id}"] p[contenteditable="true"]`);
      if (prevEl) {
        setCaretAtPointOrEdge(prevEl, clientX, true);
      } else {
        pendingCaretRef.current = { mode: "point", blockId: prevBlock.id, x: clientX, toEnd: true };
      }
    }
  };

  // 아래 문단으로 자연스러운 이동
  const navigateToNextParagraph = (currentIdx: number, clientX: number) => {
    if (currentIdx >= blocks.length - 1) return;
    const nextBlock = blocks[currentIdx + 1];
    setSelectedIdx(currentIdx + 1);
    if (nextBlock.type === "paragraph") {
      const nextEl = document.querySelector<HTMLElement>(`[data-block-id="${nextBlock.id}"] p[contenteditable="true"]`);
      if (nextEl) {
        setCaretAtPointOrEdge(nextEl, clientX, false);
      } else {
        pendingCaretRef.current = { mode: "point", blockId: nextBlock.id, x: clientX, toEnd: false };
      }
    }
  };

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

    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = Math.max(0.2, zoomPercent / 100);

    const handleEl = e.currentTarget as HTMLElement;
    const blockEl = (handleEl.closest("[data-block-id]") as HTMLElement) || handleEl.parentElement;
    const startRect = blockEl ? blockEl.getBoundingClientRect() : null;

    const canvasEl = canvasRef.current;
    const contentWidth = canvasEl ? Math.max(200, canvasEl.clientWidth - 80) : 680;

    const blockWidthPct = "widthPercent" in block ? (block as { widthPercent?: number }).widthPercent : undefined;
    const blockHeightPt = "heightPt" in block ? (block as { heightPt?: number }).heightPt : undefined;

    const startWidthPx = startRect ? startRect.width / zoom : (contentWidth * ((blockWidthPct || (block.type === "table" ? 100 : 75)) / 100));
    const startHeightPx = startRect ? startRect.height / zoom : (blockHeightPt || 60);

    let currentWidthPct = blockWidthPct ?? (block.type === "table" ? 100 : 75);
    let currentHeightPt = blockHeightPt ?? (block.type === "shape" ? 60 : 30);

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startX) / zoom;
      const dy = (moveEvt.clientY - startY) / zoom;

      let newWidthPx = startWidthPx;
      let newHeightPx = startHeightPx;

      if (dir.includes("e")) {
        newWidthPx = startWidthPx + dx;
      } else if (dir.includes("w")) {
        newWidthPx = startWidthPx - dx;
      }

      if (dir.includes("s")) {
        newHeightPx = startHeightPx + dy;
      } else if (dir.includes("n")) {
        newHeightPx = startHeightPx - dy;
      }

      currentWidthPct = Math.max(10, Math.min(100, Math.round((newWidthPx / contentWidth) * 100)));
      currentHeightPt = Math.max(5, Math.min(1200, Math.round(newHeightPx)));

      setDragResize((prev) => ({
        ...prev,
        [blockIdx]: {
          widthPercent: currentWidthPct,
          heightPt: currentHeightPt,
        },
      }));
    };

    const onPointerUp = () => {
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

  // 문단 텍스트 변경 (Yjs 실시간 반영)
  const updateParagraph = (index: number, newText: string) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(index);
    if (!yBlock) return;
    const yText = yBlock.get("text") as Y.Text | undefined;
    if (yText) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, newText);
      });
    }
  };

  // 문단 서식 변경 (폰트, 크기, 굵기, 기울임, 밑줄, 색상, 정렬)
  const updateParagraphStyle = (index: number, patch: Partial<HwpxParagraphBlock>) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(index);
    if (!yBlock) return;
    doc.transact(() => {
      if (patch.bold !== undefined) yBlock.set("bold", patch.bold);
      if (patch.italic !== undefined) yBlock.set("italic", patch.italic);
      if (patch.underline !== undefined) yBlock.set("underline", patch.underline);
      if (patch.sizePt !== undefined) yBlock.set("sizePt", patch.sizePt);
      if (patch.align !== undefined) yBlock.set("align", patch.align);
      if (patch.color !== undefined) yBlock.set("color", patch.color);
      if (patch.fontFamily !== undefined) {
        yBlock.set("fontFamily", patch.fontFamily);
        yBlock.set("fontEdited", true); // 저장할 때 원본 문단 XML에도 새 글꼴을 반영
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
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceKeyword, setReplaceKeyword] = useState("");
  const [replaceMsg, setReplaceMsg] = useState("");
  const [showDocStatsModal, setShowDocStatsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showPageSetupModal, setShowPageSetupModal] = useState(false);
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

  // ── 개체(표, 그림, 도형) 우클릭 컨텍스트 메뉴 상태 ──
  interface ObjectContextMenuState {
    x: number;
    y: number;
    blockIdx: number;
    blockType: "table" | "image" | "shape";
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

  // 자동 캡션 번호 생성기 ([표 1], [그림 1], [도형 1])
  const getAutoCaptionText = (blockIdx: number, type: "table" | "image" | "shape") => {
    let count = 1;
    for (let i = 0; i < blockIdx; i++) {
      if (blocks[i]?.type === type) count++;
    }
    if (type === "table") return `표 ${count}`;
    if (type === "image") return `그림 ${count}`;
    return `도형 ${count}`;
  };

  const openPropertyModal = (idx: number) => {
    const block = blocks[idx];
    if (!block || (block.type !== "table" && block.type !== "image" && block.type !== "shape")) return;

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

  // 단축키 (Ctrl+S / Cmd+S: 클라우드 저장, Ctrl+Z: 실행 취소, Ctrl+Y / Ctrl+Shift+Z: 다시 실행, P: 선택된 개체 속성 다이얼로그, Delete/Backspace: 선택된 개체 삭제)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runSave, blocks, selectedIdx, undoManager]);

  // 컨텍스트 메뉴 닫기 핸들러
  useEffect(() => {
    const handleCloseCtxMenu = () => setContextMenu(null);
    window.addEventListener("click", handleCloseCtxMenu);
    return () => window.removeEventListener("click", handleCloseCtxMenu);
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

  // 클립보드 오려두기 / 복사
  const handleCut = () => {
    restoreSelection();
    document.execCommand("cut");
    triggerActiveBlockInput();
  };
  const handleCopy = () => {
    restoreSelection();
    document.execCommand("copy");
  };

  // 실행 취소 / 다시 실행
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
      }
    } else {
      document.execCommand("undo");
    }
  };
  const handleRedo = () => {
    if (undoManager.canRedo()) {
      undoManager.redo();
      const currentBlocks = extractBlocksFromYDoc(doc);
      setBlocks(currentBlocks);
    } else {
      document.execCommand("redo");
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
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", `eq_${Date.now()}`);
    yBlock.set("type", "equation");
    yBlock.set("script", new Y.Text(script || "E = mc^2"));
    doc.transact(() => {
      yBlocks.insert(afterIdx + 1, [yBlock]);
    });
    setSelectedIdx(afterIdx + 1);
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

  // 단어 찾기
  const handleSearchNext = () => {
    if (!searchKeyword.trim()) return;
    const foundIdx = blocks.findIndex((b, i) => i > selectedIdx && (b.type === "paragraph" && b.text.includes(searchKeyword)));
    if (foundIdx !== -1) {
      setSelectedIdx(foundIdx);
    } else {
      const firstFound = blocks.findIndex((b) => b.type === "paragraph" && b.text.includes(searchKeyword));
      if (firstFound !== -1) setSelectedIdx(firstFound);
    }
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
    if (hasActiveTextSelection()) {
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
    if (hasActiveTextSelection()) {
      document.execCommand("bold", false);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { bold: !currentPara?.bold });
    }
  };

  // 부분 기울임 적용
  const applyItalic = () => {
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("italic", false);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { italic: !currentPara?.italic });
    }
  };

  // 부분 밑줄 적용
  const applyUnderline = () => {
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("underline", false);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { underline: !currentPara?.underline });
    }
  };

  // 글꼴 적용
  const applyFontFamily = (fontVal: string) => {
    restoreSelection();
    if (hasActiveTextSelection()) {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("fontName", false, fontVal);
      triggerActiveBlockInput();
    } else {
      updateParagraphStyle(selectedIdx, { fontFamily: fontVal });
    }
  };

  // 글자 크기 적용
  const applyFontSize = (sizePt: number) => {
    restoreSelection();
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
    } else {
      updateParagraphStyle(selectedIdx, { sizePt });
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
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", `tbl_${Date.now()}`);
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

    doc.transact(() => {
      yBlocks.insert(afterIdx + 1, [yBlock]);
    });
    setSelectedIdx(afterIdx + 1);
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
        yText.delete(0, yText.length);
        yText.insert(0, patch.text);
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
        yText.delete(0, yText.length);
        yText.insert(0, newText);
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
        yScript.delete(0, yScript.length);
        yScript.insert(0, newScript);
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
          {/* 1열: 한컴 로고, 문서 제목, 상단 빠른 메뉴 */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-200 bg-[#fbfcfd]">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* 한컴 한글 H 로고 아이콘 */}
              <div className="w-7 h-7 rounded bg-[#0066cc] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                한
              </div>
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-800 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${dirty ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"}`}>
                  {status === "saving" ? "저장 중…" : dirty ? "수정됨" : "저장됨"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <EditorAvatars editors={roomEditors} />

              <button
                type="button"
                onClick={() => void runSave()}
                disabled={status === "saving" || !dirty}
                className="px-2.5 py-1 rounded text-xs font-semibold bg-[#0066cc] hover:bg-[#0055aa] text-white disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5"
                title="클라우드 저장 (Ctrl+S)"
              >
                <SaveIcon className="w-3.5 h-3.5" />
                <span>{status === "saving" ? "저장 중" : "저장"}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDirectDownload()}
                className="px-2.5 py-1 rounded text-xs font-medium border border-neutral-300 hover:bg-neutral-100 text-neutral-700 transition cursor-pointer flex items-center gap-1"
                title="데스크톱에서 편집하기 위해 HWPX 원본 다운로드"
              >
                <span>데스크톱에서 편집</span>
              </button>

              <button
                type="button"
                onClick={() => requestClose(onClose)}
                className="p-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600 transition cursor-pointer"
                title="편집기 닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 2열: 메뉴 탭 바 (파일, 편집, 보기, 입력, 서식, 쪽, 표, 검토, 도구) 및 리본 접기/펼치기 */}
          <div className="flex items-center justify-between px-2 bg-white text-xs border-b border-neutral-200">
            <div className="flex items-center gap-0.5">
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
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (ribbonCollapsed) setRibbonCollapsed(false);
                    }}
                    className={`px-3 py-1 font-medium transition cursor-pointer border-b-2 ${
                      isActive
                        ? "border-[#0066cc] text-[#0066cc] font-bold"
                        : "border-transparent text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* 메뉴 툴바 접기/펼치기 버튼 (한컴 표준: 탭 바 우측 끝에 배치) */}
            <button
              type="button"
              onClick={() => setRibbonCollapsed(!ribbonCollapsed)}
              className="p-1 mr-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition cursor-pointer flex items-center justify-center"
              title={ribbonCollapsed ? "메뉴 툴바 펼치기 (리본 메뉴 표시)" : "메뉴 툴바 접기 (리본 메뉴 숨김)"}
              aria-label={ribbonCollapsed ? "메뉴 툴바 펼치기" : "메뉴 툴바 접기"}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${ribbonCollapsed ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>

          {/* 3열: 한글 대형 리본 툴바 (선택된 탭에 따라 해당 기능 즉시 표시) */}
          {!ribbonCollapsed && (
            <div className="flex items-stretch gap-1 px-3 py-1.5 bg-[#f8f9fa] border-b border-neutral-200 overflow-x-auto text-[11px] min-h-[58px]">
              {/* [파일 탭] */}
              {activeTab === "file" && (
                <>
                  <button
                    type="button"
                    onClick={() => void runSave()}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer min-w-[48px]"
                    title="문서 저장 (Ctrl+S)"
                  >
                    <SaveIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">저장하기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDirectDownload}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer min-w-[56px]"
                    title="수정된 문서를 .hwpx 파일로 다운로드"
                  >
                    <SaveIcon className="w-5 h-5 text-emerald-600" />
                    <span className="text-[10px] mt-0.5">다운로드</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer min-w-[48px]"
                    title="인쇄 및 PDF로 저장 (Ctrl+P)"
                  >
                    <PrintIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">인쇄</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setShowPageSetupModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="편집 용지 정보 확인 (F7)"
                  >
                    <PageSetupIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">편집 용지</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDocStatsModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="글자 수 및 문서 통계 확인"
                  >
                    <DocInfoIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문서 정보</span>
                  </button>
                </>
              )}

              {/* [편집 탭] */}
              {activeTab === "edit" && (
                <>
                  <button
                    type="button"
                    onClick={handleUndo}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded transition min-w-[44px] cursor-pointer ${
                      canUndo ? "hover:bg-white hover:shadow-xs text-neutral-800" : "text-neutral-400 hover:bg-neutral-100/50"
                    }`}
                    title="실행 취소 (Ctrl+Z)"
                  >
                    <UndoIcon className="w-5 h-5 text-current" />
                    <span className="text-[10px] mt-0.5">되돌리기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded transition min-w-[44px] cursor-pointer ${
                      canRedo ? "hover:bg-white hover:shadow-xs text-neutral-800" : "text-neutral-400 hover:bg-neutral-100/50"
                    }`}
                    title="다시 실행 (Ctrl+Y)"
                  >
                    <RedoIcon className="w-5 h-5 text-current" />
                    <span className="text-[10px] mt-0.5">다시 실행</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={handleCut}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[44px]"
                    title="오려두기 (Ctrl+X)"
                  >
                    <CutIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">오려두기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[44px]"
                    title="복사하기 (Ctrl+C)"
                  >
                    <CopyIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">복사하기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteFormat}
                    disabled={!copiedStyle}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer min-w-[44px] ${
                      copiedStyle ? "text-[#0066cc]" : "text-neutral-400 opacity-60"
                    }`}
                    title="복사한 모양 적용하기"
                  >
                    <PasteIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">붙이기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyFormat}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer min-w-[48px] ${
                      copiedStyle ? "bg-blue-50 text-[#0066cc] font-bold" : "text-neutral-700"
                    }`}
                    title="모양 복사 (Alt+C)"
                  >
                    <FormatPainterIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">모양 복사</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="모두 선택 (Ctrl+A)"
                  >
                    <SelectAllIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">모두 선택</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSearchModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[40px]"
                    title="찾기 (Ctrl+F)"
                  >
                    <SearchIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">찾기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReplaceModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="찾아 바꾸기 (Ctrl+H)"
                  >
                    <ReplaceIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">바꾸기</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => deleteBlock(selectedIdx)}
                    disabled={blocks.length <= 1}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-red-600 disabled:opacity-40 cursor-pointer min-w-[40px]"
                    title="현재 선택 블록 지우기"
                  >
                    <TrashIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">지우기</span>
                  </button>
                </>
              )}

              {/* [보기 탭] */}
              {activeTab === "view" && (
                <>
                  <button
                    type="button"
                    onClick={() => setZoomPercent((z) => Math.min(150, z + 10))}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[44px]"
                    title="화면 확대 (+10%)"
                  >
                    <ZoomInIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">확대</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomPercent((z) => Math.max(60, z - 10))}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[44px]"
                    title="화면 축소 (-10%)"
                  >
                    <ZoomOutIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">축소</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomPercent(100)}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer min-w-[48px] ${
                      zoomPercent === 100 ? "text-[#0066cc] font-bold" : "text-neutral-700"
                    }`}
                    title="100% 원본 크기"
                  >
                    <span className="text-sm font-bold leading-5">100%</span>
                    <span className="text-[10px] mt-0.5">기본 크기</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setShowParaMarks(!showParaMarks)}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer min-w-[48px] ${
                      showParaMarks ? "bg-blue-50 text-[#0066cc] font-bold" : "text-neutral-700"
                    }`}
                    title="문단 끝 기호(↵) 보이기 / 숨기기"
                  >
                    <ParaMarkIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문단 부호</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGrid(!showGrid)}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer min-w-[48px] ${
                      showGrid ? "bg-blue-50 text-[#0066cc] font-bold" : "text-neutral-700"
                    }`}
                    title="모눈 격자 보이기 / 숨기기"
                  >
                    <GridIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">격자 보기</span>
                  </button>
                </>
              )}

              {/* [입력 탭] */}
              {activeTab === "insert" && (
                <>
                  <input
                    type="file"
                    ref={imageInputRef}
                    onChange={handleImageFileSelect}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowShapeModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[40px]"
                    title="도형 삽입 (직사각형, 둥근 사각형, 타원, 가로선)"
                  >
                    <ShapesIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">도형</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[40px]"
                    title="이미지 그림 삽입"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">그림</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTableModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[40px]"
                    title="표 만들기 (Ctrl+N, T)"
                  >
                    <TableIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">표</span>
                  </button>
                  <button
                    type="button"
                    onClick={openNewEquation}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[40px]"
                    title="수식 편집기 (Ctrl+N, M)"
                  >
                    <EquationIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">수식</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSymbolModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[40px]"
                    title="문자표 특수기호 (Ctrl+F10)"
                  >
                    <SymbolIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문자표</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => addParagraph(selectedIdx)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer min-w-[56px]"
                    title="현재 위치 뒤에 새 문단 삽입"
                  >
                    <ParaMarkIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문단 추가</span>
                  </button>
                </>
              )}

              {/* [서식 탭] */}
              {activeTab === "format" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCharShapeModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="글자 모양 설정 (Alt+L)"
                  >
                    <CharShapeIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">글자 모양</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowParaShapeModal(true)}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="문단 모양 설정 (Alt+T)"
                  >
                    <ParaShapeIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문단 모양</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={handleCopyFormat}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition cursor-pointer min-w-[48px] ${
                      copiedStyle ? "bg-blue-50 text-[#0066cc] font-bold" : "text-neutral-700"
                    }`}
                    title="모양 복사 (스포이드)"
                  >
                    <FormatPainterIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">모양 복사</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteFormat}
                    disabled={!copiedStyle}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 disabled:opacity-40 cursor-pointer min-w-[44px]"
                    title="복사한 서식 붙이기"
                  >
                    <PasteIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">붙이기</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => insertSymbol("• ")}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="글머리표 (•) 삽입"
                  >
                    <BulletListIcon className="w-5 h-5 text-neutral-600" />
                    <span className="text-[10px] mt-0.5">글머리표</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSymbol("1. ")}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="번호 매기기 (1.) 삽입"
                  >
                    <NumberListIcon className="w-5 h-5 text-neutral-600" />
                    <span className="text-[10px] mt-0.5">번호 모양</span>
                  </button>
                </>
              )}

              {/* [쪽 탭] */}
              {activeTab === "page" && (
                <>
                  <button
                    type="button"
                    onClick={handleTogglePageBreak}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 hover:text-[#0066cc] cursor-pointer min-w-[56px]"
                    title="현재 위치에서 쪽 나누기 (Ctrl+Enter)"
                  >
                    <PageBreakIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">쪽 나누기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPageSetupModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="용지 크기 및 여백 설정 (F7)"
                  >
                    <PageSetupIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">편집 용지</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="머리말 영역 이동"
                  >
                    <HeaderIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">머리말</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.querySelector("main");
                      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                    }}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="꼬리말 영역 이동"
                  >
                    <FooterIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">꼬리말</span>
                  </button>
                </>
              )}

              {/* [표 탭] */}
              {activeTab === "table" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTableModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="새 표 만들기 (Ctrl+N, T)"
                  >
                    <TableIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">표 만들기</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => {
                      const tbl = blocks[selectedIdx];
                      if (tbl && tbl.type === "table") {
                        addTableRow(selectedIdx, tbl.rows.length - 1);
                      }
                    }}
                    disabled={blocks[selectedIdx]?.type !== "table"}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 disabled:opacity-40 cursor-pointer min-w-[52px]"
                    title="선택된 표 아래에 행(줄) 추가"
                  >
                    <AddRowIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">줄 추가</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tbl = blocks[selectedIdx];
                      if (tbl && tbl.type === "table") {
                        deleteTableRow(selectedIdx, tbl.rows.length - 1);
                      }
                    }}
                    disabled={blocks[selectedIdx]?.type !== "table"}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 disabled:opacity-40 cursor-pointer min-w-[52px]"
                    title="선택된 표 마지막 행(줄) 삭제"
                  >
                    <DeleteRowColIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">줄 삭제</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tbl = blocks[selectedIdx];
                      if (tbl && tbl.type === "table") {
                        addTableCol(selectedIdx, (tbl.rows[0]?.length || 1) - 1);
                      }
                    }}
                    disabled={blocks[selectedIdx]?.type !== "table"}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 disabled:opacity-40 cursor-pointer min-w-[52px]"
                    title="선택된 표 오른쪽에 열(칸) 추가"
                  >
                    <AddColIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">칸 추가</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tbl = blocks[selectedIdx];
                      if (tbl && tbl.type === "table") {
                        deleteTableCol(selectedIdx, (tbl.rows[0]?.length || 1) - 1);
                      }
                    }}
                    disabled={blocks[selectedIdx]?.type !== "table"}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 disabled:opacity-40 cursor-pointer min-w-[52px]"
                    title="선택된 표 마지막 열(칸) 삭제"
                  >
                    <DeleteRowColIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">칸 삭제</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => deleteBlock(selectedIdx)}
                    disabled={blocks[selectedIdx]?.type !== "table"}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-red-600 disabled:opacity-40 cursor-pointer min-w-[48px]"
                    title="선택된 표 전체 삭제"
                  >
                    <TrashIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">표 지우기</span>
                  </button>
                </>
              )}

              {/* [검토 탭] */}
              {activeTab === "review" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDocStatsModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="문서 글자 수, 단어 수 세기"
                  >
                    <DocInfoIcon className="w-5 h-5 text-indigo-600" />
                    <span className="text-[10px] mt-0.5">글자 수 세기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => alert("현재 문서에 맞춤법 검사 기능이 활성화되어 있으며, 오탈자는 빨간 밑줄로 표시됩니다.")}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="맞춤법 검사 안내"
                  >
                    <SpellCheckIcon className="w-5 h-5 text-emerald-600" />
                    <span className="text-[10px] mt-0.5">맞춤법 검사</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setShowReplaceModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="찾아 바꾸기"
                  >
                    <ReplaceIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">단어 치환</span>
                  </button>
                </>
              )}

              {/* [도구 탭] */}
              {activeTab === "tools" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowShortcutsModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="한컴오피스 단축키 일람 (단축키 안내)"
                  >
                    <ShortcutsIcon className="w-5 h-5 text-blue-600" />
                    <span className="text-[10px] mt-0.5">단축키 일람</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDocStatsModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="문서 통계 정보"
                  >
                    <DocInfoIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문서 통계</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSymbolModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[48px]"
                    title="문자표 (Ctrl+F10)"
                  >
                    <SymbolIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">문자표</span>
                  </button>
                  <div className="w-[1px] bg-neutral-200 my-1 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setShowPageSetupModal(true)}
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded hover:bg-white hover:shadow-xs transition text-neutral-700 cursor-pointer min-w-[56px]"
                    title="환경 설정 (편집 용지 규격)"
                  >
                    <PageSetupIcon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5">환경 설정</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* 4열: 한컴 표준 빠른 서식 툴바 (2단 툴바) */}
          <div className="flex flex-wrap items-center gap-1 px-3 py-1 bg-white border-b border-neutral-300 text-xs">
            {/* 실행 취소 / 다시 실행 */}
            <button
              type="button"
              onClick={handleUndo}
              className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${
                canUndo ? "text-neutral-800 hover:bg-neutral-100" : "text-neutral-300 hover:bg-neutral-50"
              }`}
              title="실행 취소 (Ctrl+Z)"
            >
              <UndoIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${
                canRedo ? "text-neutral-800 hover:bg-neutral-100" : "text-neutral-300 hover:bg-neutral-50"
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
              className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs transition cursor-pointer ${
                currentPara?.bold ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
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
              className={`w-6 h-6 rounded flex items-center justify-center italic font-serif text-xs transition cursor-pointer ${
                currentPara?.italic ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
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
              className={`w-6 h-6 rounded flex items-center justify-center underline text-xs transition cursor-pointer ${
                currentPara?.underline ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
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
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                currentPara?.align === "justify" ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
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
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                currentPara?.align === "left" || !currentPara?.align ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
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
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                currentPara?.align === "center" ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
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
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                currentPara?.align === "right" ? "bg-[#0066cc] text-white" : "hover:bg-neutral-100 text-neutral-800"
              } disabled:opacity-40`}
              title="오른쪽 정렬"
            >
              <AlignRightIcon className="w-3.5 h-3.5" />
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
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition cursor-pointer ${
                      newShapeType === s.type
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
                    className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] transition cursor-pointer ${
                      newShapeFill === c.fill && newShapeStroke === c.stroke
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
                    className={`px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                      newShapeWidth === w
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

        {/* 단어 찾기 모달 */}
        {showSearchModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-80 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <SearchIcon className="w-4 h-4 text-[#0066cc]" />
                <span>문서 내 단어 찾기</span>
              </span>
              <button type="button" onClick={() => setShowSearchModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchNext()}
                placeholder="찾을 단어를 입력하세요..."
                className="flex-1 bg-neutral-50 border border-neutral-300 rounded px-2 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#0066cc]"
              />
              <button
                type="button"
                onClick={handleSearchNext}
                className="px-3 py-1.5 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] shrink-0"
              >
                다음 찾기
              </button>
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

        {/* 글자 모양 모달 */}
        {showCharShapeModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-80 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <CharShapeIcon className="w-4 h-4" />
                <span>글자 모양 (Alt+L)</span>
              </span>
              <button type="button" onClick={() => setShowCharShapeModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span>글꼴:</span>
                <select
                  value={currentPara?.fontFamily || editorFonts[0]?.value || FONT_FAMILIES[0].value}
                  onChange={(e) => {
                    if (e.target.value === "__ADD_FONT__") {
                      setShowAddFontModal(true);
                      return;
                    }
                    applyFontFamily(e.target.value);
                  }}
                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-1 w-44"
                >
                  {editorFonts.map((f) => (
                    <option key={f.id || f.value} value={f.value}>{f.label}</option>
                  ))}
                  <option value="__ADD_FONT__">➕ 폰트 추가 / 관리...</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span>글자 크기:</span>
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={Math.round(currentPara?.sizePt || 10)}
                  onChange={(e) => applyFontSize(Number(e.target.value))}
                  className="bg-neutral-50 border border-neutral-300 rounded px-2 py-1 w-20 text-center"
                />
              </div>
              <div className="flex items-center justify-between">
                <span>글자 속성:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={applyBold}
                    className={`px-2 py-1 rounded border text-xs font-bold ${currentPara?.bold ? "bg-[#0066cc] text-white" : "bg-neutral-50"}`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={applyItalic}
                    className={`px-2 py-1 rounded border text-xs italic ${currentPara?.italic ? "bg-[#0066cc] text-white" : "bg-neutral-50"}`}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={applyUnderline}
                    className={`px-2 py-1 rounded border text-xs underline ${currentPara?.underline ? "bg-[#0066cc] text-white" : "bg-neutral-50"}`}
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onClick={applyStrikethrough}
                    className="px-2 py-1 rounded border text-xs line-through bg-neutral-50"
                  >
                    S
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowCharShapeModal(false)}
                className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa]"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* 문단 모양 모달 */}
        {showParaShapeModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-80 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <ParaShapeIcon className="w-4 h-4" />
                <span>문단 모양 (Alt+T)</span>
              </span>
              <button type="button" onClick={() => setShowParaShapeModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span>정렬 방식:</span>
                <div className="flex items-center gap-1">
                  {[
                    { align: "justify" as const, label: "양쪽" },
                    { align: "left" as const, label: "왼쪽" },
                    { align: "center" as const, label: "가운데" },
                    { align: "right" as const, label: "오른쪽" },
                  ].map((a) => (
                    <button
                      key={a.align}
                      type="button"
                      onClick={() => updateParagraphStyle(selectedIdx, { align: a.align })}
                      className={`px-2 py-1 rounded border text-xs ${
                        (currentPara?.align || "justify") === a.align ? "bg-[#0066cc] text-white font-bold" : "bg-neutral-50"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>들여쓰기:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleIndent(false)}
                    className="px-2 py-1 rounded border bg-neutral-50 hover:bg-neutral-100"
                  >
                    내어쓰기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIndent(true)}
                    className="px-2 py-1 rounded border bg-neutral-50 hover:bg-neutral-100"
                  >
                    들여쓰기
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowParaShapeModal(false)}
                className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa]"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* 찾아 바꾸기 모달 */}
        {showReplaceModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-88 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <ReplaceIcon className="w-4 h-4 text-[#0066cc]" />
                <span>찾아 바꾸기 (Ctrl+H)</span>
              </span>
              <button type="button" onClick={() => setShowReplaceModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex flex-col gap-2.5 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-600 font-medium">찾을 단어:</span>
                <input
                  type="text"
                  autoFocus
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="바꿀 단어를 입력하세요"
                  className="bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#0066cc]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-600 font-medium">바꿀 단어:</span>
                <input
                  type="text"
                  value={replaceKeyword}
                  onChange={(e) => setReplaceKeyword(e.target.value)}
                  placeholder="새로운 단어로 바꿉니다"
                  className="bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#0066cc]"
                />
              </div>
              {replaceMsg && (
                <div className="text-[11px] text-[#0066cc] font-medium bg-blue-50 px-2 py-1 rounded">
                  {replaceMsg}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowReplaceModal(false)}
                className="px-3 py-1 rounded text-xs text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleReplaceAll}
                className="px-3 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
              >
                모두 바꾸기
              </button>
            </div>
          </div>
        )}

        {/* 문서 정보 (통계) 모달 */}
        {showDocStatsModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3.5 w-84 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <DocInfoIcon className="w-4 h-4 text-[#0066cc]" />
                <span>문서 정보 및 통계</span>
              </span>
              <button type="button" onClick={() => setShowDocStatsModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex flex-col gap-2 text-xs divide-y divide-neutral-100">
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">글자 수 (공백 포함):</span>
                <span className="font-bold text-neutral-900">{docStats.charCountWithSpace.toLocaleString()} 자</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">글자 수 (공백 제외):</span>
                <span className="font-bold text-neutral-900">{docStats.charCountNoSpace.toLocaleString()} 자</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">단어 수 (어절):</span>
                <span className="font-bold text-neutral-900">{docStats.wordCount.toLocaleString()} 개</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">문단 수:</span>
                <span className="font-bold text-neutral-900">{docStats.paraCount.toLocaleString()} 줄</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">삽입된 표 / 수식:</span>
                <span className="font-bold text-neutral-900">{docStats.tableCount} 개 / {docStats.equationCount} 개</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">삽입된 도형 / 그림:</span>
                <span className="font-bold text-neutral-900">{docStats.shapeCount} 개 / {docStats.imageCount} 개</span>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowDocStatsModal(false)}
                className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
              >
                확인
              </button>
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

        {/* 편집 용지 정보 모달 */}
        {showPageSetupModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-white border border-neutral-300 shadow-2xl p-4 rounded-xl flex flex-col gap-3.5 w-80 text-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <PageSetupIcon className="w-4 h-4 text-[#0066cc]" />
                <span>편집 용지 설정 (F7)</span>
              </span>
              <button type="button" onClick={() => setShowPageSetupModal(false)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
            </h4>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-600">용지 종류:</span>
                <span className="font-bold text-neutral-900">A4 (210 × 297 mm)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-600">용지 방향:</span>
                <span className="font-bold text-neutral-900">세로 (Portrait)</span>
              </div>
              <div className="flex flex-col gap-1 py-1">
                <span className="font-semibold text-neutral-700">여백 설정 (표준):</span>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded">
                  <span>위쪽: 20.0 mm</span>
                  <span>아래쪽: 15.0 mm</span>
                  <span>왼쪽: 30.0 mm</span>
                  <span>오른쪽: 30.0 mm</span>
                  <span>머리말: 15.0 mm</span>
                  <span>꼬리말: 15.0 mm</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowPageSetupModal(false)}
                className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa] cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* ── 한컴오피스 / 한컴독스 표준 개체 우클릭 컨텍스트 메뉴 (첨부 1번 이미지 100% 매칭) ── */}
        {contextMenu && (() => {
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
                  if (hasCaption) return;
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
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left ${
                  hasCaption
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
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left pl-9 ${
                  hasCaption
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
                    const currText = (targetBlock as HwpxShapeBlock).text || "";
                    const nextText = window.prompt("도형 안 글자 텍스트 입력:", currText);
                    if (nextText !== null) {
                      updateShapeBlock(contextMenu.blockIdx, { text: nextText });
                    }
                  }
                  setContextMenu(null);
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left ${
                  isShape
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
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left pl-9 ${
                  shapeHasText
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
                  const currentLink = ("hyperlink" in (targetBlock || {}) && (targetBlock as any).hyperlink) ? (targetBlock as any).hyperlink : "https://";
                  const nextLink = window.prompt("하이퍼링크 URL을 입력하세요:", currentLink);
                  if (nextLink !== null) {
                    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
                    const yBlock = yBlocks.get(contextMenu.blockIdx);
                    if (yBlock) {
                      doc.transact(() => {
                        if (nextLink.trim()) yBlock.set("hyperlink", nextLink.trim());
                        else yBlock.delete("hyperlink");
                      });
                    }
                  }
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
                        className={`px-3 py-1 font-medium transition cursor-pointer border-b-2 text-xs ${
                          propActiveTab === tab.id
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
                                  className={`px-3 py-1.5 rounded border flex items-center gap-1 text-xs cursor-pointer transition ${
                                    propTextWrap === item.id
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
                                  className={`w-9 h-8 rounded text-[10px] font-mono flex items-center justify-center border cursor-pointer transition ${
                                    propCaptionPos === btn.id
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
                                    className={`w-4 h-4 rounded-full border border-neutral-300 cursor-pointer ${
                                      propBorderColor === c ? "ring-2 ring-blue-500" : ""
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
                                className={`w-10 h-10 rounded border flex flex-col items-center justify-center text-xs cursor-pointer transition ${
                                  propBorderTarget === pos.id
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
                                      className={`w-5 h-5 rounded border border-neutral-300 cursor-pointer ${
                                        propFillColor === c ? "ring-2 ring-blue-500" : ""
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
                                  className={`px-3 py-1.5 rounded border text-xs cursor-pointer flex items-center gap-1.5 transition ${
                                    propTablePageBreak === item.id
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

        {/* 메인 문서 편집 영역 (한글 A4 용지 스타일) */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center bg-[#181825]/90"
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
            ref={canvasRef}
            spellCheck={false}
            onClick={(e) => {
              if (e.target === canvasRef.current && blocks.length > 0) {
                const lastIdx = blocks.length - 1;
                setSelectedIdx(lastIdx);
                const lastBlock = blocks[lastIdx];
                if (lastBlock.type === "paragraph") {
                  pendingCaretRef.current = { mode: "offset", blockId: lastBlock.id, offset: lastBlock.text.length };
                }
              }
            }}
            className={`w-full max-w-[820px] h-auto my-4 px-10 sm:px-16 py-12 sm:py-20 bg-white text-neutral-900 shadow-2xl rounded-sm border border-neutral-200 shrink-0 transition-transform outline-none cursor-text ${
              showGrid ? "bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]" : ""
            }`}
            style={{
              fontFamily: "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif",
              boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
              transform: `scale(${zoomPercent / 100})`,
              transformOrigin: "top center",
            }}
          >
            {(() => {
              let pageCounter = 1;
              return blocks.map((block, idx) => {
                const isSelected = selectedIdx === idx;
                const showPageBreak = block.type === "paragraph" && block.pageBreak && idx > 0;

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
                      className="w-full relative"
                    >
                      {showPageBreak && (
                        <div
                          data-page-break-line="true"
                          className="my-10 -mx-10 sm:-mx-16 flex items-center justify-center gap-3 py-2 bg-neutral-100 border-y border-neutral-300 select-none cursor-default"
                        >
                          <div className="h-[1px] flex-1 bg-neutral-300" />
                          <span className="text-[11px] font-bold text-neutral-600 tracking-wider">
                            ── {++pageCounter} 쪽 ──
                          </span>
                          <div className="h-[1px] flex-1 bg-neutral-300" />
                        </div>
                      )}

                      <ContentEditableParagraph
                        block={block}
                        idx={idx}
                        alignClass={alignClass}
                        fontSize={fontSize}
                        showParaMarks={showParaMarks}
                        onSelect={() => setSelectedIdx(idx)}
                        onChangeText={(newText) => updateParagraph(idx, newText)}
                        onSplit={(before, after) => splitParagraph(idx, before, after)}
                        onMergePrevious={() => mergeParagraphWithPrevious(idx)}
                        onNavigatePrev={(clientX) => navigateToPrevParagraph(idx, clientX)}
                        onNavigateNext={(clientX) => navigateToNextParagraph(idx, clientX)}
                        onIndent={(inc) => handleIndent(inc)}
                      />
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
                      className={`my-6 py-1 relative group/tbl cursor-default select-none transition-shadow ${
                        isSelected ? "ring-1 ring-blue-500 rounded shadow-md" : ""
                      }`}
                    >
                      {/* 8방향 선택 조절점 핸들 (끝부분 잡고 드래그하여 크기 조절) */}
                      {isSelected && (
                        <HwpxSelectionHandles
                          onResizeStart={(e, dir) => handleObjectResizeStart(e, idx, dir)}
                        />
                      )}

                      {/* 표 잡고 직접 이동 핸들 바 (표 선택 시 상단 좌측에 노출) */}
                      {isSelected && (
                        <div
                          onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                          className="absolute -top-7 left-0 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-move shadow-md select-none transition-colors"
                          title="표를 잡고 원하는 위치로 드래그하여 이동하세요"
                        >
                          <span className="text-xs">✥</span>
                          <span>표 잡고 이동</span>
                          {isMoved && (
                            <span className="text-[10px] font-mono text-blue-100 font-normal">
                              ({currentOffset.x}, {currentOffset.y})
                            </span>
                          )}
                        </div>
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
                        <table
                          style={{
                            backgroundColor: tblBg,
                            borderCollapse: hasCellSpacing ? "separate" : "collapse",
                            borderSpacing: cellSpacingPx,
                            border: hasOuterBorder ? `${bWidth} ${bStyle} ${bColor}` : "none",
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
                                    borderBottom: `${bWidth} ${bStyle} ${bColor}`,
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
                                        borderRight: `${bWidth} ${bStyle} ${bColor}`,
                                        backgroundColor: cell.bgColor || undefined,
                                      }}
                                      className="last:border-r-0 min-w-[70px] cursor-move"
                                    >
                                      <input
                                        type="text"
                                        value={cell.text}
                                        onChange={(e) => updateTableCell(idx, rIdx, cIdx, e.target.value)}
                                        onFocus={() => setSelectedIdx(idx)}
                                        className="w-full bg-transparent border-none outline-none px-1 py-0.5 rounded focus:bg-blue-50 text-center font-sans text-xs cursor-text"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
                        className={`relative flex flex-col items-center transition-all cursor-move ${
                          isSelected
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

                            {/* 자유 이동 핸들 */}
                            <div
                              onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 cursor-move border border-neutral-300 select-none font-medium"
                              title="드래그하여 원하는 위치로 자유롭게 이동"
                            >
                              <span className="text-xs">✥</span>
                              <span>이동</span>
                              {isMoved && (
                                <span className="text-[9px] text-neutral-400 font-mono">
                                  ({currentOffset.x > 0 ? `+${currentOffset.x}` : currentOffset.x}, {currentOffset.y > 0 ? `+${currentOffset.y}` : currentOffset.y})
                                </span>
                              )}
                            </div>

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

                            {/* 크기 버튼 */}
                            <div className="flex items-center gap-0.5">
                              {[25, 50, 75, 100].map((w) => (
                                <button
                                  key={w}
                                  type="button"
                                  onClick={() => updateImageBlock(idx, { widthPercent: w })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition ${
                                    block.widthPercent === w || (!block.widthPercent && w === 75)
                                      ? "bg-[#0066cc] text-white font-bold"
                                      : "hover:bg-neutral-100 text-neutral-700"
                                  }`}
                                >
                                  {w}%
                                </button>
                              ))}
                            </div>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                            {/* 정렬 버튼 */}
                            <div className="flex items-center gap-0.5">
                              {(["left", "center", "right"] as const).map((a) => (
                                <button
                                  key={a}
                                  type="button"
                                  onClick={() => updateImageBlock(idx, { align: a })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition ${
                                    block.align === a || (!block.align && a === "center")
                                      ? "bg-[#0066cc] text-white font-bold"
                                      : "hover:bg-neutral-100 text-neutral-700"
                                  }`}
                                >
                                  {a === "left" ? "좌" : a === "center" ? "중" : "우"}
                                </button>
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
                        className={`relative flex flex-col items-center transition-all cursor-move ${
                          isSelected
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

                            {/* 자유 이동 핸들 */}
                            <div
                              onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 cursor-move border border-neutral-300 select-none font-medium"
                              title="드래그하여 원하는 위치로 자유롭게 이동"
                            >
                              <span className="text-xs">✥</span>
                              <span>이동</span>
                              {isMoved && (
                                <span className="text-[9px] text-neutral-400 font-mono">
                                  ({currentOffset.x > 0 ? `+${currentOffset.x}` : currentOffset.x}, {currentOffset.y > 0 ? `+${currentOffset.y}` : currentOffset.y})
                                </span>
                              )}
                            </div>

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
                                    className={`w-3.5 h-3.5 rounded-full border border-neutral-400 cursor-pointer ${
                                      fillColor === c.color ? "ring-2 ring-[#0066cc] scale-110" : "hover:scale-105"
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
                                  className={`w-3.5 h-3.5 rounded-full border border-neutral-400 cursor-pointer ${
                                    strokeColor === c.color ? "ring-2 ring-[#0066cc] scale-110" : "hover:scale-105"
                                  }`}
                                  style={{ background: c.color }}
                                />
                              ))}
                            </div>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                            {/* 크기 버튼 */}
                            <div className="flex items-center gap-0.5">
                              {[25, 50, 75, 100].map((w) => (
                                <button
                                  key={w}
                                  type="button"
                                  onClick={() => updateShapeBlock(idx, { widthPercent: w })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition ${
                                    block.widthPercent === w || (!block.widthPercent && w === 75)
                                      ? "bg-[#0066cc] text-white font-bold"
                                      : "hover:bg-neutral-100 text-neutral-700"
                                  }`}
                                >
                                  {w}%
                                </button>
                              ))}
                            </div>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

                            {/* 정렬 버튼 */}
                            <div className="flex items-center gap-0.5">
                              {(["left", "center", "right"] as const).map((a) => (
                                <button
                                  key={a}
                                  type="button"
                                  onClick={() => updateShapeBlock(idx, { align: a })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition ${
                                    block.align === a || (!block.align && a === "center")
                                      ? "bg-[#0066cc] text-white font-bold"
                                      : "hover:bg-neutral-100 text-neutral-700"
                                  }`}
                                >
                                  {a === "left" ? "좌" : a === "center" ? "중" : "우"}
                                </button>
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
                            className="my-3 transition-all"
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              minHeight: `${currentHeightPt}px`,
                              backgroundColor: fillColor,
                              borderColor: strokeColor,
                              borderWidth: `${strokeWidth}px`,
                              borderStyle: block.strokeType === "DASH" ? "dashed" : block.strokeType === "DOT" ? "dotted" : "solid",
                              borderRadius,
                            }}
                            className="p-3 flex items-center justify-center transition-all relative overflow-hidden"
                          >
                            <textarea
                              value={block.text || ""}
                              onChange={(e) => updateShapeBlock(idx, { text: e.target.value })}
                              onFocus={() => setSelectedIdx(idx)}
                              placeholder="도형 안 글상자 텍스트 입력..."
                              rows={Math.max(1, (block.text || "").split("\n").length)}
                              className="w-full bg-transparent border-none outline-none text-center text-xs text-neutral-900 resize-none font-sans leading-relaxed"
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
                      contentEditable={false}
                      onClick={() => setSelectedIdx(idx)}
                      onDoubleClick={() => openEditEquation(idx)}
                      style={{
                        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
                        zIndex: isSelected ? 30 : 1,
                      }}
                      className="my-5 flex flex-col items-center cursor-default select-none relative group/eq"
                    >
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

                            {/* 자유 이동 핸들 */}
                            <div
                              onPointerDown={(e) => handleObjectDragStart(e, idx, currentOffset.x, currentOffset.y)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 cursor-move border border-neutral-300 select-none font-medium"
                              title="드래그하여 원하는 위치로 자유롭게 이동"
                            >
                              <span className="text-xs">✥</span>
                              <span>이동</span>
                              {isMoved && (
                                <span className="text-[9px] text-neutral-400 font-mono">
                                  ({currentOffset.x > 0 ? `+${currentOffset.x}` : currentOffset.x}, {currentOffset.y > 0 ? `+${currentOffset.y}` : currentOffset.y})
                                </span>
                              )}
                            </div>

                            <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />

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

                return null;
              });
            })()}

          </div>
        </main>

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
      </div>
    </div>
  );
}
