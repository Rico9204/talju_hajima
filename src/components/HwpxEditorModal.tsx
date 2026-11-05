import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { WorkspaceFile } from "../api/types";
import EditorAvatars from "./EditorAvatars";
import type { CollabEditor, CollabMode, CollabPresence } from "../lib/collab";
import { useCollabFile } from "../lib/useCollabFile";
import {
  extractBlocksFromYDoc,
  HwpxCollabBlock,
  HwpxImageBlock,
  HwpxParagraphBlock,
  hwpxCollabKey,
  hwpxCollabText,
  initHwpxYDoc,
  parseHwpxXmlToBlocks,
  serializeBlocksToHwpxXml,
} from "../lib/hwpxCollab";
import { readZipEntries, writeZipEntries } from "../lib/hwpx";

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

        const blocks = parseHwpxXmlToBlocks(xml, headerXml);
        if (active) {
          setZipEntries(entries);
          setOriginalXml(xml);
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
    <HwpxEditorModalInner
      projectId={projectId}
      file={file}
      room={room}
      mode={mode}
      zipEntries={zipEntries}
      originalXml={originalXml}
      initialBlocks={initialBlocks}
      presence={presence}
      editors={editors}
      save={save}
      onClose={onClose}
    />
  );
}

// 자동 높이 조절 텍스트 영역 (스크롤바 없이 워드프로세서처럼 줄바꿈 확장)
function AutoResizeTextarea({
  value,
  onChange,
  onFocus,
  className,
  style,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onFocus={onFocus}
      rows={1}
      placeholder={placeholder}
      className={`${className ?? ""} overflow-hidden resize-none whitespace-pre-wrap break-words block`}
      style={{
        ...style,
        boxSizing: "border-box",
        fieldSizing: "content" as unknown as undefined,
      }}
    />
  );
}

function HwpxEditorModalInner({
  projectId,
  file,
  room,
  mode,
  zipEntries,
  originalXml,
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
      // Y.Doc의 최신 블록 트리로부터 OWPML XML을 재직렬화하여 HWPX ZIP 생성
      const currentBlocks = extractBlocksFromYDoc(doc);
      const newSectionXml = serializeBlocksToHwpxXml(currentBlocks, originalXml);

      const newEntries = new Map(zipEntries);
      const secKey = Array.from(newEntries.keys()).find((k) => /^Contents\/section0\.xml$/i.test(k)) ?? "Contents/section0.xml";
      newEntries.set(secKey, new TextEncoder().encode(newSectionXml));

      const updatedHwpxBytes = await writeZipEntries(newEntries);
      return save(updatedHwpxBytes, text, baseVersionId, auto);
    },
  });

  // 로컬 렌더링용 블록 상태 (Y.Doc의 변경에 실시간 반응)
  const [blocks, setBlocks] = useState<HwpxCollabBlock[]>(() => extractBlocksFromYDoc(doc));
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [showTableModal, setShowTableModal] = useState(false);
  const [newTableRows, setNewTableRows] = useState(3);
  const [newTableCols, setNewTableCols] = useState(3);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onUpdate = () => {
      setBlocks(extractBlocksFromYDoc(doc));
    };
    doc.on("update", onUpdate);
    return () => { doc.off("update", onUpdate); };
  }, [doc]);

  const roomEditors = editors.filter((e) => e.fileId === file.id && e.room === room && e.mode === mode);

  // 단축키 (Ctrl+S / Cmd+S)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void runSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runSave]);

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
      if (patch.fontFamily !== undefined) yBlock.set("fontFamily", patch.fontFamily);
    });
  };

  // 새 문단 추가
  const addParagraph = (afterIdx: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = new Y.Map<unknown>();
    yBlock.set("id", `p_${Date.now()}`);
    yBlock.set("type", "paragraph");
    yBlock.set("text", new Y.Text(""));
    yBlock.set("align", "left");
    yBlock.set("sizePt", 10);
    doc.transact(() => {
      yBlocks.insert(afterIdx + 1, [yBlock]);
    });
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
    });
  };

  // 블록 삭제
  const deleteBlock = (index: number) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    if (yBlocks.length <= 1) return;
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
        {/* 상단 타이틀바 / 상태바 */}
        <header className="flex items-center justify-between px-5 py-2.5 border-b shrink-0" style={{ borderColor: "var(--card-border, #313244)", background: "rgba(0,0,0,0.3)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">📄</span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate flex items-center gap-2">
                <span>{file.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(138,173,244,0.2)", color: "#8aadf4" }}>
                  한글 동시편집
                </span>
              </h2>
              <div className="text-[11px] flex items-center gap-2 opacity-75">
                <span>{statusText || (dirty ? "변경사항 있음" : "모든 변경사항 저장됨")}</span>
                <span>·</span>
                <span>Ctrl+S로 저장</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <EditorAvatars editors={roomEditors} />

            <button
              type="button"
              disabled={status === "saving" || !dirty}
              onClick={() => void runSave()}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-40"
              style={{ background: dirty ? "var(--primary, #8aadf4)" : "rgba(255,255,255,0.1)", color: dirty ? "#181926" : "inherit" }}
            >
              {status === "saving" ? "저장 중…" : "저장"}
            </button>

            <button
              type="button"
              onClick={() => requestClose(onClose)}
              className="p-1.5 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
              title="닫기"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ── 한글 포맷 툴바 (리본 스타일) ── */}
        <div
          className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b shrink-0 text-xs select-none"
          style={{
            borderColor: "var(--card-border, #313244)",
            background: "rgba(24,24,37,0.95)",
          }}
        >
          {/* 글꼴 선택 */}
          <select
            disabled={!isParagraph}
            value={currentPara?.fontFamily || FONT_FAMILIES[0].value}
            onChange={(e) => updateParagraphStyle(selectedIdx, { fontFamily: e.target.value })}
            className="bg-neutral-800/80 text-neutral-200 border border-neutral-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 disabled:opacity-40 max-w-[130px]"
            title="글꼴 변경"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* 글자 크기 */}
          <select
            disabled={!isParagraph}
            value={currentPara?.sizePt || 10}
            onChange={(e) => updateParagraphStyle(selectedIdx, { sizePt: Number(e.target.value) })}
            className="bg-neutral-800/80 text-neutral-200 border border-neutral-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 disabled:opacity-40 w-16 text-center"
            title="글자 크기 (pt)"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} pt
              </option>
            ))}
          </select>

          {/* 구분선 */}
          <div className="w-[1px] h-5 bg-neutral-700 mx-1" />

          {/* B (굵게) */}
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { bold: !currentPara?.bold })}
            className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs transition ${
              currentPara?.bold ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="굵게 (Bold)"
          >
            B
          </button>

          {/* I (기울임) */}
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { italic: !currentPara?.italic })}
            className={`w-7 h-7 rounded flex items-center justify-center italic font-serif text-xs transition ${
              currentPara?.italic ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="기울임 (Italic)"
          >
            I
          </button>

          {/* U (밑줄) */}
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { underline: !currentPara?.underline })}
            className={`w-7 h-7 rounded flex items-center justify-center underline text-xs transition ${
              currentPara?.underline ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="밑줄 (Underline)"
          >
            U
          </button>

          {/* 글자 색상 선택 */}
          <div className="flex items-center gap-1 px-1 bg-neutral-800/60 rounded border border-neutral-700/60 py-0.5">
            {FONT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={!isParagraph}
                onClick={() => updateParagraphStyle(selectedIdx, { color: c.value })}
                className="w-4 h-4 rounded-full border border-black/30 hover:scale-125 transition disabled:opacity-40"
                style={{ background: c.value }}
                title={`${c.label} 색상`}
              />
            ))}
          </div>

          {/* 구분선 */}
          <div className="w-[1px] h-5 bg-neutral-700 mx-1" />

          {/* 정렬 버튼 4종 */}
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { align: "left" })}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition ${
              currentPara?.align === "left" || !currentPara?.align ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="왼쪽 정렬"
          >
            ☰
          </button>
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { align: "center" })}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition ${
              currentPara?.align === "center" ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="가운데 정렬"
          >
            ☷
          </button>
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { align: "right" })}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition ${
              currentPara?.align === "right" ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="오른쪽 정렬"
          >
            ☵
          </button>
          <button
            type="button"
            disabled={!isParagraph}
            onClick={() => updateParagraphStyle(selectedIdx, { align: "justify" })}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition ${
              currentPara?.align === "justify" ? "bg-blue-600 text-white" : "hover:bg-neutral-800 text-neutral-300"
            } disabled:opacity-40`}
            title="양쪽 맞춤"
          >
            ☶
          </button>

          {/* 구분선 */}
          <div className="w-[1px] h-5 bg-neutral-700 mx-1" />

          {/* 표 삽입 버튼 */}
          <button
            type="button"
            onClick={() => setShowTableModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
            title="새 표 삽입"
          >
            <span>⊞</span>
            <span>표 삽입</span>
          </button>

          {/* 이미지 삽입 버튼 */}
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleImageFileSelect}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
            title="이미지 파일 삽입"
          >
            <span>🖼️</span>
            <span>이미지 삽입</span>
          </button>

          {/* 문단 추가 버튼 */}
          <button
            type="button"
            onClick={() => addParagraph(selectedIdx)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
            title="현재 위치 아래에 새 문단 추가"
          >
            <span>↵</span>
            <span>문단 추가</span>
          </button>

          {/* 블록 삭제 버튼 */}
          <button
            type="button"
            disabled={blocks.length <= 1}
            onClick={() => deleteBlock(selectedIdx)}
            className="p-1 rounded text-red-400 hover:bg-red-500/20 transition disabled:opacity-30 ml-auto"
            title="현재 선택된 블록 삭제"
          >
            🗑️ 삭제
          </button>
        </div>

        {/* 표 삽입 팝업 모달 */}
        {showTableModal && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 bg-neutral-900 border border-neutral-700 shadow-2xl p-4 rounded-xl flex flex-col gap-3 w-64">
            <h4 className="text-xs font-bold text-white flex items-center justify-between">
              <span>⊞ 새 표 삽입</span>
              <button type="button" onClick={() => setShowTableModal(false)} className="text-neutral-400 hover:text-white">✕</button>
            </h4>
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span>행 (가로 줄 수):</span>
              <input
                type="number"
                min={1}
                max={20}
                value={newTableRows}
                onChange={(e) => setNewTableRows(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-center text-white"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span>열 (세로 칸 수):</span>
              <input
                type="number"
                min={1}
                max={15}
                value={newTableCols}
                onChange={(e) => setNewTableCols(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-center text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="px-3 py-1 rounded text-xs text-neutral-400 hover:text-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => addTable(newTableRows, newTableCols, selectedIdx)}
                className="px-3 py-1 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500"
              >
                삽입하기
              </button>
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
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center bg-[#181825]/90">
          <div
            className="w-full max-w-[820px] h-auto my-4 px-10 sm:px-16 py-12 sm:py-20 bg-white text-neutral-900 shadow-2xl rounded-sm border border-neutral-200 shrink-0"
            style={{
              fontFamily: "'Nanum Myeongjo', 'Batang', 'Noto Serif KR', serif",
              boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
            }}
          >
            {(() => {
              let pageCounter = 1;
              return blocks.map((block, idx) => {
                const isSelected = selectedIdx === idx;
                const showPageBreak = block.type === "paragraph" && block.pageBreak && idx > 0;

                if (block.type === "paragraph") {
                  const isTitle = (block.sizePt && block.sizePt >= 15) || (block.bold && idx < 5) || (block.text.includes("고밀도") && block.text.includes("하이브리드 필터"));
                  const isHeading = block.sizePt && block.sizePt >= 11 && block.sizePt < 15;
                  const alignClass = isTitle || block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : block.align === "justify" ? "text-justify" : "text-left";
                  const fontSize = block.sizePt ? `${block.sizePt}pt` : isTitle ? "16pt" : "10pt";

                  return (
                    <div
                      key={`${block.id}_${idx}`}
                      onClick={() => setSelectedIdx(idx)}
                      className={`w-full relative transition-all rounded ${isSelected ? "ring-1 ring-blue-400/40 bg-blue-50/20" : ""}`}
                    >
                      {showPageBreak && (
                        <div className="my-10 -mx-10 sm:-mx-16 flex items-center justify-center gap-3 py-2 bg-neutral-100 border-y border-neutral-300 select-none">
                          <div className="h-[1px] flex-1 bg-neutral-300" />
                          <span className="text-[11px] font-bold text-neutral-600 tracking-wider">
                            ── {++pageCounter} 쪽 ──
                          </span>
                          <div className="h-[1px] flex-1 bg-neutral-300" />
                        </div>
                      )}

                      {!block.text ? (
                        <div
                          onClick={() => updateParagraph(idx, " ")}
                          className="h-6 w-full cursor-text hover:bg-blue-50/30 rounded transition"
                          title="클릭하여 내용 입력"
                        />
                      ) : (
                        <div className={`w-full group ${isTitle ? "my-3" : isHeading ? "my-1.5" : "my-0.5"}`}>
                          <AutoResizeTextarea
                            value={block.text}
                            onChange={(val) => updateParagraph(idx, val)}
                            onFocus={() => setSelectedIdx(idx)}
                            className={`w-full border-none outline-none bg-transparent p-0 transition leading-relaxed ${alignClass}`}
                            style={{
                              fontSize,
                              fontWeight: block.bold || isTitle ? "bold" : "normal",
                              fontStyle: block.italic ? "italic" : "normal",
                              textDecoration: block.underline ? "underline" : "none",
                              color: block.color || "#111827",
                              fontFamily: block.fontFamily || undefined,
                              lineHeight: isTitle ? 1.45 : 1.65,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.type === "table") {
                  return (
                    <div
                      key={`${block.id}_${idx}`}
                      onClick={() => setSelectedIdx(idx)}
                      className={`my-6 overflow-x-auto border-t-2 border-b-2 border-neutral-900 py-1 bg-white relative group/tbl ${
                        isSelected ? "ring-1 ring-blue-500 rounded" : ""
                      }`}
                    >
                      {/* 표 제어 툴바 (hover 시 노출) */}
                      <div className="mb-2 flex items-center justify-between text-[11px] bg-neutral-100 p-1.5 rounded border border-neutral-300">
                        <span className="font-bold text-neutral-600 flex items-center gap-1">
                          ⊞ 표 ({block.rows.length}행 × {block.rows[0]?.length || 0}열)
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => addTableRow(idx, block.rows.length - 1)}
                            className="px-2 py-0.5 bg-white border border-neutral-300 rounded hover:bg-neutral-50 text-neutral-700 font-medium"
                            title="표 맨 아래에 행 추가"
                          >
                            + 행 추가
                          </button>
                          <button
                            type="button"
                            onClick={() => addTableCol(idx, (block.rows[0]?.length || 1) - 1)}
                            className="px-2 py-0.5 bg-white border border-neutral-300 rounded hover:bg-neutral-50 text-neutral-700 font-medium"
                            title="표 맨 오른쪽에 열 추가"
                          >
                            + 열 추가
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTableRow(idx, block.rows.length - 1)}
                            className="px-2 py-0.5 bg-white border border-neutral-300 rounded hover:bg-neutral-50 text-red-600"
                            title="마지막 행 삭제"
                          >
                            - 행 삭제
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTableCol(idx, (block.rows[0]?.length || 1) - 1)}
                            className="px-2 py-0.5 bg-white border border-neutral-300 rounded hover:bg-neutral-50 text-red-600"
                            title="마지막 열 삭제"
                          >
                            - 열 삭제
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBlock(idx)}
                            className="px-2 py-0.5 bg-red-50 border border-red-200 rounded hover:bg-red-100 text-red-600 font-bold ml-1"
                            title="표 전체 삭제"
                          >
                            표 삭제
                          </button>
                        </div>
                      </div>

                      <table className="w-full border-collapse border-b border-neutral-800 text-xs text-neutral-900 bg-white">
                        <tbody>
                          {block.rows.map((row, rIdx) => {
                            const isHeaderRow = rIdx === 0;
                            return (
                              <tr key={rIdx} className={isHeaderRow ? "border-b border-neutral-800 bg-neutral-50/60 font-semibold" : "border-b border-neutral-200"}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="border-r border-neutral-200 last:border-r-0 p-1.5 min-w-[70px]">
                                    <input
                                      type="text"
                                      value={cell.text}
                                      onChange={(e) => updateTableCell(idx, rIdx, cIdx, e.target.value)}
                                      onFocus={() => setSelectedIdx(idx)}
                                      className="w-full bg-transparent border-none outline-none px-1 py-0.5 rounded focus:bg-blue-50 text-center font-sans text-xs"
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                if (block.type === "image") {
                  const alignClass = block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center";
                  const widthStyle = `${block.widthPercent || 75}%`;

                  return (
                    <div
                      key={`${block.id}_${idx}`}
                      onClick={() => setSelectedIdx(idx)}
                      className={`my-6 flex flex-col items-center group/img rounded p-2 transition ${
                        isSelected ? "ring-2 ring-blue-500 bg-blue-50/10" : ""
                      }`}
                    >
                      {/* 이미지 제어 바 (hover 시 노출) */}
                      <div className="mb-2 flex items-center justify-between text-[11px] bg-neutral-100 px-3 py-1 rounded-md border border-neutral-300 w-full max-w-lg">
                        <span className="font-semibold text-neutral-600">🖼️ 이미지</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { widthPercent: 25 })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.widthPercent === 25 ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            25%
                          </button>
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { widthPercent: 50 })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.widthPercent === 50 ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            50%
                          </button>
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { widthPercent: 75 })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.widthPercent === 75 || !block.widthPercent ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            75%
                          </button>
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { widthPercent: 100 })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.widthPercent === 100 ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            100%
                          </button>
                          <div className="w-[1px] h-3.5 bg-neutral-300 mx-1" />
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { align: "left" })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.align === "left" ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            좌
                          </button>
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { align: "center" })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.align === "center" || !block.align ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            중
                          </button>
                          <button
                            type="button"
                            onClick={() => updateImageBlock(idx, { align: "right" })}
                            className={`px-1.5 py-0.5 rounded border text-[10px] ${block.align === "right" ? "bg-blue-600 text-white" : "bg-white text-neutral-700"}`}
                          >
                            우
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBlock(idx)}
                            className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold ml-1 text-[10px]"
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      <div className={`w-full flex ${alignClass}`}>
                        <img
                          src={block.src}
                          alt={block.caption || "이미지"}
                          className="rounded border border-neutral-300 shadow-sm max-h-[500px] object-contain"
                          style={{ width: widthStyle }}
                        />
                      </div>

                      <input
                        type="text"
                        value={block.caption || ""}
                        onChange={(e) => updateImageBlock(idx, { caption: e.target.value })}
                        placeholder="그림 캡션 입력..."
                        className="mt-2 text-center text-xs text-neutral-600 bg-transparent border-b border-transparent focus:border-neutral-400 outline-none w-1/2 font-sans"
                      />
                    </div>
                  );
                }

                if (block.type === "equation") {
                  return (
                    <div
                      key={`${block.id}_${idx}`}
                      onClick={() => setSelectedIdx(idx)}
                      className={`my-4 p-2.5 rounded border border-neutral-300 bg-neutral-50 flex items-center gap-3 ${
                        isSelected ? "ring-1 ring-blue-500" : ""
                      }`}
                    >
                      <span className="text-xs font-bold text-neutral-500 select-none">∑ 수식</span>
                      <input
                        type="text"
                        value={block.script}
                        onChange={(e) => updateEquation(idx, e.target.value)}
                        onFocus={() => setSelectedIdx(idx)}
                        className="flex-1 bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-800 outline-none focus:border-blue-500 font-mono"
                        placeholder="수식 스크립트..."
                      />
                      <button
                        type="button"
                        onClick={() => deleteBlock(idx)}
                        className="text-red-500 hover:text-red-700 text-xs px-1"
                        title="수식 삭제"
                      >
                        ✕
                      </button>
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

      </div>
    </div>
  );
}
