import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { WorkspaceFile } from "../api/types";
import EditorAvatars from "./EditorAvatars";
import type { CollabEditor, CollabMode, CollabPresence } from "../lib/collab";
import { applyTextEdit } from "../lib/collabCore";
import { useCollabFile } from "../lib/useCollabFile";
import { createSlide, createTextElement, slideElements, slidesKey, slidesText, SLIDES_FIELD, type YMapAny } from "../lib/slidesDoc";
import { buildSlidesPdf, captureSlideAsImage, exportSlidesAsPptx, type ExportSlide } from "../lib/exportSlides";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const num = (m: YMapAny, key: string) => (m.get(key) as number) ?? 0;
const str = (m: YMapAny, key: string) => (m.get(key) as string) ?? "";

// 워크스페이스 "슬라이드"(.slides) 편집기: 글상자를 자유롭게 배치하는 발표 자료를 여러 명이 함께 만든다.
// 저장·동시 편집 흐름은 문서 편집기와 같다(useCollabFile). 원본: Temporary_Merge a068d15(NestJS 웹소켓 대신
// Supabase Realtime으로 이식, 이미지 삽입은 이번 판에서 제외). 슬라이드 캔버스는 다크 모드에서도 흰 종이다.
export default function SlidesEditorModal({ projectId, file, room, mode, initialBytes, presence, editors, save, onClose }: {
  projectId: string;
  file: WorkspaceFile;
  room: number;
  mode: CollabMode;
  initialBytes: Uint8Array;
  presence: CollabPresence;
  editors: CollabEditor[];
  save: (bytes: Uint8Array, text: string, baseVersionId: number, auto: boolean) => Promise<number>;
  onClose: () => void;
}) {
  const { doc, dirty, status, statusText, error, setError, runSave, confirmClose, setConfirmClose, requestClose, saveAndClose } = useCollabFile({
    projectId, fileId: file.id, room, mode, initialBytes, presence, keyOf: slidesKey, textOf: slidesText, save,
  });
  const slidesArray = doc.getArray<YMapAny>(SLIDES_FIELD);
  const [, setTick] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pptx" | "pdf" | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const roomEditors = editors.filter((e) => e.fileId === file.id && e.room === room && e.mode === mode);
  const names = [...new Set(roomEditors.map((e) => e.name))];
  const baseName = file.name.replace(/\.slides$/i, "") || "슬라이드";

  // 누가 고치든(나·팀원) 슬라이드가 바뀌면 다시 그린다.
  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    slidesArray.observeDeep(rerender);
    return () => slidesArray.unobserveDeep(rerender);
  }, [slidesArray]);

  const slides = slidesArray.toArray();
  const current = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[current];

  function addSlide() {
    doc.transact(() => slidesArray.push([createSlide()]));
    setActiveIndex(slides.length);
    setSelectedId(null);
  }
  function deleteSlide(index: number) {
    if (slides.length <= 1) return;
    doc.transact(() => slidesArray.delete(index, 1));
    setActiveIndex((i) => Math.max(0, Math.min(i, slides.length - 2)));
  }
  function addTextBox() {
    if (!activeSlide) return;
    const el = createTextElement();
    doc.transact(() => slideElements(activeSlide).push([el]));
    setSelectedId(str(el, "id"));
  }
  function deleteElement(id: string) {
    if (!activeSlide) return;
    const elements = slideElements(activeSlide);
    const idx = elements.toArray().findIndex((e) => str(e, "id") === id);
    if (idx >= 0) doc.transact(() => elements.delete(idx, 1));
    setSelectedId(null);
  }

  const toPlain = (slide: YMapAny): ExportSlide => ({
    id: str(slide, "id"),
    elements: slideElements(slide).toArray().map((el) => ({
      id: str(el, "id"), type: "text" as const, x: num(el, "x"), y: num(el, "y"), w: num(el, "w"), h: num(el, "h"),
      text: (el.get("text") as Y.Text | undefined)?.toString(),
    })),
  });

  async function exportAs(kind: "pptx" | "pdf") {
    if (exporting || slides.length === 0) return;
    setExporting(kind);
    setError("");
    const keep = { index: activeIndex, selected: selectedId, editing: editingId };
    try {
      if (kind === "pptx") {
        await exportSlidesAsPptx(slides.map(toPlain), `${baseName}.pptx`);
      } else {
        // 선택 테두리·편집 상자 없이 한 장씩 화면에 띄워 캡처한다.
        setSelectedId(null); setEditingId(null);
        const images: { dataUrl: string; width: number; height: number }[] = [];
        for (let i = 0; i < slides.length; i++) {
          setActiveIndex(i);
          await nextFrame(); await nextFrame();
          if (captureRef.current) images.push(await captureSlideAsImage(captureRef.current));
        }
        await buildSlidesPdf(images, `${baseName}.pdf`);
      }
    } catch {
      setError(kind === "pptx" ? "PPT 파일로 내보내지 못했습니다." : "PDF로 내보내지 못했습니다.");
    } finally {
      setActiveIndex(keep.index); setSelectedId(keep.selected); setEditingId(keep.editing);
      setExporting(null);
    }
  }

  const pill = "h-8 px-3 rounded-full text-xs font-700 disabled:opacity-40";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)" }}
      onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void runSave(); } }}>
      <section className="w-[min(97vw,1150px)] h-[min(90vh,800px)] flex flex-col border" aria-label="슬라이드 편집" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 24px 70px rgba(15,18,53,0.25)", color: "var(--foreground)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0 flex-wrap" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <div className="text-xs font-700" style={{ color: "var(--primary)" }}>{mode === "pin" ? "📌 핀 버전에서 분기해 수정" : "🖼️ 슬라이드 (함께 편집)"}</div>
            <div className="text-sm font-700 truncate mt-0.5">{file.name}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: status === "error" ? "#ef4444" : "var(--muted-foreground)" }} role="status">{statusText}</span>
            <button type="button" onClick={() => void exportAs("pptx")} disabled={!!exporting} className={pill} style={{ background: "var(--muted)", color: "var(--foreground)" }}>{exporting === "pptx" ? "내보내는 중…" : "PPT로"}</button>
            <button type="button" onClick={() => void exportAs("pdf")} disabled={!!exporting} className={pill} style={{ background: "var(--muted)", color: "var(--foreground)" }}>{exporting === "pdf" ? `내보내는 중… (${current + 1}/${slides.length})` : "PDF로"}</button>
            <button type="button" onClick={() => void runSave()} disabled={!dirty || status === "saving"} title="Ctrl/⌘+S" className={pill} style={{ background: "var(--primary)", color: "#fff" }}>{status === "saving" ? "저장 중…" : "저장"}</button>
            <button type="button" onClick={() => requestClose(onClose)} className={pill} style={{ background: "var(--muted)", color: "var(--foreground)" }}>닫기</button>
          </div>
        </div>
        <div className="px-5 py-2 text-xs border-b shrink-0 flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <EditorAvatars editors={roomEditors} size={26} max={6} />
          <span className="flex-1 min-w-40">{names.length > 1 ? `지금 ${names.length}명이 함께 수정 중` : "지금은 나만 수정 중이에요."} · 글상자는 더블클릭해 편집, 끌어서 이동, 오른쪽 아래 점으로 크기 조절</span>
          <button type="button" onClick={addTextBox} className="text-xs font-700 px-3 py-1.5 rounded-full" style={{ background: "var(--muted)", color: "var(--foreground)" }}>+ 글상자</button>
          {selectedId && <button type="button" onClick={() => deleteElement(selectedId)} className="text-xs font-700 px-3 py-1.5 rounded-full" style={{ background: "#ef444418", color: "#ef4444" }}>선택 삭제</button>}
        </div>
        {confirmClose && (
          <div role="alertdialog" aria-label="저장하지 않은 변경사항" className="mx-5 mt-2 p-3 text-xs rounded-lg flex flex-wrap items-center gap-2" style={{ background: "rgba(245, 158, 11, 0.14)", color: "var(--foreground)", border: "1px solid rgba(245, 158, 11, 0.35)" }}>
            <span className="flex-1 min-w-48">저장하지 않은 변경사항이 있어요.{names.length <= 1 && " 지금 나가면 지금까지 수정한 내용이 사라질 수 있어요."}</span>
            <button type="button" onClick={() => void saveAndClose(onClose)} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--primary)", color: "#fff" }}>저장하고 닫기</button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--card)", color: "var(--foreground)" }}>저장 없이 닫기</button>
            <button type="button" onClick={() => setConfirmClose(false)} className="px-3 py-1.5 rounded-full font-700" style={{ background: "var(--card)", color: "var(--foreground)" }}>계속 수정</button>
          </div>
        )}
        {error && <p role="alert" className="mx-5 mt-2 text-xs rounded-lg bg-red-500/10 text-red-500 p-2">{error}</p>}

        <div className="flex-1 min-h-0 flex gap-4 p-4">
          <div className="w-36 shrink-0 overflow-y-auto flex flex-col gap-2 pr-1" aria-label="슬라이드 목록">
            {slides.map((slide, i) => (
              <div key={str(slide, "id")} className="relative">
                <button type="button" onClick={() => { setActiveIndex(i); setSelectedId(null); }} className="w-full text-left" aria-label={`${i + 1}번 슬라이드`} aria-current={i === current}>
                  <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9", background: "#fff", borderRadius: 6, border: i === current ? "2px solid var(--primary)" : "1px solid var(--border)" }}>
                    {slideElements(slide).toArray().map((el) => (
                      <div key={str(el, "id")} className="absolute overflow-hidden" style={{ left: `${num(el, "x")}%`, top: `${num(el, "y")}%`, width: `${num(el, "w")}%`, height: `${num(el, "h")}%`, fontSize: 4, lineHeight: 1.2, color: "#111" }}>
                        {(el.get("text") as Y.Text | undefined)?.toString()}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-center mt-1" style={{ color: i === current ? "var(--primary)" : "var(--muted-foreground)" }}>{i + 1}</div>
                </button>
                {slides.length > 1 && (
                  <button type="button" onClick={() => deleteSlide(i)} title="슬라이드 삭제" aria-label={`${i + 1}번 슬라이드 삭제`} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] flex items-center justify-center" style={{ background: "#ef4444", color: "#fff" }}>×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addSlide} className="text-xs font-700 py-2 rounded-lg border-2 border-dashed" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>+ 슬라이드</button>
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-center">
            {activeSlide && (
              <div ref={captureRef} className="w-full" style={{ maxWidth: 900 }}>
                <SlideCanvas doc={doc} slide={activeSlide} selectedId={selectedId} editingId={editingId} onSelect={setSelectedId} onStartEdit={setEditingId} onStopEdit={() => setEditingId(null)} onDelete={deleteElement} />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SlideCanvas({ doc, slide, selectedId, editingId, onSelect, onStartEdit, onStopEdit, onDelete }: {
  doc: Y.Doc;
  slide: YMapAny;
  selectedId: string | null;
  editingId: string | null;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
  onDelete: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const elements = slideElements(slide).toArray();

  // 끌기·크기 조절: 슬라이드 크기 대비 %로 바꿔 저장한다(화면 크기와 무관하게 같은 자리).
  function track(e: React.MouseEvent, el: YMapAny, kind: "move" | "resize") {
    e.stopPropagation();
    if (kind === "move") onSelect(str(el, "id"));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = { x: e.clientX, y: e.clientY, ox: num(el, "x"), oy: num(el, "y"), ow: num(el, "w"), oh: num(el, "h") };
    const onMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - start.x) / rect.width) * 100;
      const dy = ((ev.clientY - start.y) / rect.height) * 100;
      doc.transact(() => {
        if (kind === "move") {
          el.set("x", Math.max(0, Math.min(100 - start.ow, start.ox + dx)));
          el.set("y", Math.max(0, Math.min(100 - start.oh, start.oy + dy)));
        } else {
          el.set("w", Math.max(6, Math.min(100 - start.ox, start.ow + dx)));
          el.set("h", Math.max(4, Math.min(100 - start.oy, start.oh + dy)));
        }
      });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div ref={canvasRef} onClick={() => onSelect(null)} className="relative w-full" style={{ aspectRatio: "16/9", background: "#fff", color: "#111", borderRadius: 8, boxShadow: "0 2px 16px rgba(15,18,53,0.12)", overflow: "hidden" }}>
      {elements.map((el) => {
        const id = str(el, "id");
        const w = num(el, "w");
        const selected = selectedId === id;
        const editing = editingId === id;
        return (
          <div key={id} onMouseDown={(e) => { if (!editing) track(e, el, "move"); }} onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(id); }}
            className="absolute" style={{ left: `${num(el, "x")}%`, top: `${num(el, "y")}%`, width: `${w}%`, height: `${num(el, "h")}%`, cursor: editing ? "text" : "move", outline: selected ? "2px solid #2563eb" : "1px dashed transparent" }}>
            {editing ? (
              <TextBoxEditor doc={doc} ytext={el.get("text") as Y.Text} onBlur={onStopEdit} />
            ) : (
              <div className="w-full h-full p-1 overflow-hidden select-none" style={{ fontSize: Math.max(10, w * 0.16), lineHeight: 1.3, whiteSpace: "pre-wrap" }}>
                {(el.get("text") as Y.Text | undefined)?.toString()}
              </div>
            )}
            {selected && !editing && (
              <>
                <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(id); }} aria-label="글상자 삭제" className="absolute -top-3 -right-3 w-5 h-5 rounded-full text-[10px] flex items-center justify-center" style={{ background: "#ef4444", color: "#fff" }}>×</button>
                <div onMouseDown={(e) => track(e, el, "resize")} aria-label="크기 조절" className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full" style={{ background: "#2563eb", cursor: "nwse-resize" }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 글상자 편집: 입력한 변화만 Y.Text에 반영한다. 한글 조합 중에는 팀원의 변경으로 입력창을 덮어쓰지 않고,
// 조합이 끝난 뒤 합쳐진 내용으로 다시 맞춘다(조합 중 덮어쓰면 글자가 깨진다).
function TextBoxEditor({ doc, ytext, onBlur }: { doc: Y.Doc; ytext: Y.Text; onBlur: () => void }) {
  const [value, setValue] = useState(ytext.toString());
  const valueRef = useRef(value);
  const composing = useRef(false);

  useEffect(() => {
    const sync = () => { if (!composing.current) { valueRef.current = ytext.toString(); setValue(valueRef.current); } };
    ytext.observe(sync);
    return () => ytext.unobserve(sync);
  }, [ytext]);

  return (
    <textarea
      autoFocus
      aria-label="글상자 내용"
      value={value}
      onChange={(e) => {
        applyTextEdit(doc, valueRef.current, e.target.value, [], ytext);
        valueRef.current = e.target.value;
        setValue(e.target.value);
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; valueRef.current = ytext.toString(); setValue(valueRef.current); }}
      onBlur={onBlur}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="w-full h-full p-1 outline-none resize-none"
      style={{ fontSize: 13, background: "rgba(37,99,235,0.06)", color: "#111" }}
    />
  );
}
