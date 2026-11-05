import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { WorkspaceFile } from "../api/types";
import EditorAvatars from "./EditorAvatars";
import type { CollabEditor, CollabMode, CollabPresence } from "../lib/collab";
import { useCollabFile } from "../lib/useCollabFile";
import {
  extractBlocksFromYDoc,
  HwpxCollabBlock,
  hwpxCollabKey,
  hwpxCollabText,
  initHwpxYDoc,
  parseHwpxXmlToBlocks,
  serializeBlocksToHwpxXml,
} from "../lib/hwpxCollab";
import { readZipEntries, writeZipEntries } from "../lib/hwpx";

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

  // 1. HWPX 원본 파싱 및 초기 블록 추출
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const entries = await readZipEntries(rawHwpxBytes);
        const secKey = Array.from(entries.keys()).find((k) => /^Contents\/section0\.xml$/i.test(k)) ?? "Contents/section0.xml";
        const secBytes = entries.get(secKey);
        const xml = secBytes ? new TextDecoder().decode(secBytes) : "";
        const blocks = parseHwpxXmlToBlocks(xml);
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
  // Yjs 상태 바이트를 생성하여 useCollabFile에 공급
  const [seedBytes] = useState(() => {
    const seed = new Y.Doc();
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

  // 표 셀 텍스트 변경 (Yjs 실시간 반영)
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

  // 수식 스크립트 변경 (Yjs 실시간 반영)
  const updateEquation = (index: number, newScript: string) => {
    const yBlocks = doc.getArray<Y.Map<unknown>>("hwpx_blocks");
    const yBlock = yBlocks.get(index);
    if (!yBlock) return;
    const yScript = yBlock.get("script") as Y.Text | undefined;
    if (yScript) {
      doc.transact(() => {
        yScript.delete(0, yScript.length);
        yScript.insert(0, newScript);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5" style={{ background: "rgba(15,18,53,0.6)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-5xl h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-fade-in" style={{ background: "var(--card-bg, #181926)", borderColor: "var(--card-border, #363a4f)", color: "var(--primary-text, #cad3f5)" }}>
        
        {/* 상단 툴바 */}
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--card-border, #363a4f)", background: "rgba(0,0,0,0.15)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">📝</span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate flex items-center gap-2">
                <span>{file.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(138,173,244,0.2)", color: "#8aadf4" }}>
                  한글 동시편집
                </span>
              </h2>
              <div className="text-xs flex items-center gap-2 opacity-75 mt-0.5">
                <span>{statusText || (dirty ? "변경사항 있음" : "모든 변경사항 저장됨")}</span>
                <span>·</span>
                <span>Ctrl+S로 저장</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* 접속 팀원 아바타 */}
            <EditorAvatars editors={roomEditors} />

            {/* 저장 버튼 */}
            <button
              type="button"
              disabled={status === "saving" || !dirty}
              onClick={() => void runSave()}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-40"
              style={{ background: dirty ? "var(--primary, #8aadf4)" : "rgba(255,255,255,0.1)", color: dirty ? "#181926" : "inherit" }}
            >
              {status === "saving" ? "저장 중…" : "저장"}
            </button>

            {/* 닫기 버튼 */}
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

        {/* 에러 바 */}
        {error && (
          <div className="px-5 py-2 text-xs bg-red-500/15 text-red-400 border-b border-red-500/20">
            {error}
          </div>
        )}

        {/* 메인 문서 편집 영역 (한글 A4 용지 스타일) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-black/10">
          <div className="w-full max-w-3xl min-h-[800px] p-8 sm:p-12 rounded-xl shadow-lg border" style={{ background: "#ffffff", color: "#1f2937", borderColor: "#e5e7eb", fontFamily: "'Noto Serif KR', serif" }}>
            
            {blocks.map((block, idx) => {
              if (block.type === "paragraph") {
                return (
                  <div key={block.id} className="relative group mb-3">
                    <textarea
                      value={block.text}
                      onChange={(e) => updateParagraph(idx, e.target.value)}
                      placeholder="내용을 입력하세요..."
                      rows={Math.max(1, block.text.split("\n").length)}
                      className="w-full resize-none border-none outline-none p-1 rounded hover:bg-neutral-50 focus:bg-blue-50/30 transition text-sm leading-relaxed"
                      style={{ color: "#1f2937" }}
                    />
                  </div>
                );
              }

              if (block.type === "table") {
                return (
                  <div key={block.id} className="my-5 overflow-x-auto border border-neutral-300 rounded-lg p-2 bg-neutral-50/50">
                    <div className="text-[11px] font-bold text-neutral-500 mb-2 flex items-center gap-1.5">
                      <span>📊</span>
                      <span>표 (실시간 동시편집 지원)</span>
                    </div>
                    <table className="w-full border-collapse border border-neutral-400 text-xs text-neutral-900 bg-white">
                      <tbody>
                        {block.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="border border-neutral-300 p-1.5 min-w-[80px]">
                                <input
                                  type="text"
                                  value={cell.text}
                                  onChange={(e) => updateTableCell(idx, rIdx, cIdx, e.target.value)}
                                  className="w-full bg-transparent border-none outline-none px-1 py-0.5 rounded focus:bg-blue-100/50 font-sans"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              if (block.type === "equation") {
                return (
                  <div key={block.id} className="my-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50/40 text-xs font-mono">
                    <div className="text-[11px] font-bold text-indigo-700 mb-1 flex items-center gap-1.5">
                      <span>📐</span>
                      <span>한글 수식 (Equation)</span>
                    </div>
                    <input
                      type="text"
                      value={block.script}
                      onChange={(e) => updateEquation(idx, e.target.value)}
                      className="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      placeholder="수식 스크립트..."
                    />
                  </div>
                );
              }

              return null;
            })}

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
