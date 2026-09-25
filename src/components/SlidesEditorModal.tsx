import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { applyTextareaDelta } from "../lib/quickEdit";
import { useCollabSession } from "../lib/useCollabSession";
import { exportSlidesAsPptx, captureSlideAsImage, buildSlidesPdf, type ExportSlide } from "../lib/exportSlides";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

type YMapAny = Y.Map<unknown>;

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createTextElement(x = 10, y = 40, w = 80, h = 20): YMapAny {
  const el = new Y.Map();
  el.set("id", newId());
  el.set("type", "text");
  el.set("x", x);
  el.set("y", y);
  el.set("w", w);
  el.set("h", h);
  el.set("text", new Y.Text("텍스트를 입력하세요"));
  return el;
}

function createImageElement(src: string, x = 20, y = 20, w = 60, h = 40): YMapAny {
  const el = new Y.Map();
  el.set("id", newId());
  el.set("type", "image");
  el.set("x", x);
  el.set("y", y);
  el.set("w", w);
  el.set("h", h);
  el.set("src", src);
  return el;
}

function createSlide(): YMapAny {
  const slide = new Y.Map();
  slide.set("id", newId());
  slide.set("elements", new Y.Array());
  return slide;
}

function num(m: YMapAny, key: string): number {
  return (m.get(key) as number) ?? 0;
}
function str(m: YMapAny, key: string): string {
  return (m.get(key) as string) ?? "";
}

// "이 앱 자체 슬라이드 편집기" — 진짜 .pptx 형식이 아니라, 텍스트박스/이미지를 자유롭게 배치하는
// 이 앱만의 슬라이드 구조를 Yjs로 실시간 공동편집한다(도형 x/y/w/h는 슬라이드 크기의 %로 저장해서
// 화면 크기와 무관하게 항상 같은 위치에 보이게 함). QuickEditModal/DocEditorModal과 같은
// collab 웹소켓(useCollabSession)을 그대로 재사용.
export default function SlidesEditorModal({
  projectId,
  fileId,
  filePath,
  pinId,
  pinLabel,
  myUserId,
  myName,
  onClose,
}: {
  projectId: string;
  fileId: string;
  filePath: string;
  pinId?: string;
  pinLabel?: string;
  myUserId: string;
  myName: string;
  onClose: () => void;
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const { status, peers, synced } = useCollabSession(ydoc, { projectId, fileId, pinId, myUserId, myName });
  const slidesArray = useMemo(() => ydoc.getArray<YMapAny>("slides"), [ydoc]);
  const [, setTick] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const slideCaptureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pptx" | "pdf" | null>(null);
  const baseName = (filePath.split("/").pop() ?? "슬라이드").replace(/\.slides$/i, "");

  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    slidesArray.observeDeep(rerender);
    return () => {
      slidesArray.unobserveDeep(rerender);
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slidesArray]);

  // 처음 연결됐는데(=시드 복원이 끝났는데) 슬라이드가 하나도 없으면(새로 만든 빈 덱) 빈 슬라이드
  // 하나를 만들어준다. 서버와 첫 동기화(synced)가 끝나기 전에 하면, 서버가 곧 채워줄 기존
  // 슬라이드 내용과 경합해서 불필요한 빈 슬라이드가 하나 더 생길 수 있다.
  useEffect(() => {
    if (!synced) return;
    if (slidesArray.length === 0) {
      ydoc.transact(() => slidesArray.push([createSlide()]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced]);

  const slides = slidesArray.toArray();
  const clampedIndex = Math.min(activeSlideIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[clampedIndex];

  function addSlide() {
    ydoc.transact(() => slidesArray.push([createSlide()]));
    setActiveSlideIndex(slides.length);
  }

  function deleteSlide(index: number) {
    if (slides.length <= 1) return;
    ydoc.transact(() => slidesArray.delete(index, 1));
    setActiveSlideIndex((i) => Math.max(0, Math.min(i, slides.length - 2)));
  }

  function addTextBox() {
    if (!activeSlide) return;
    const el = createTextElement();
    (activeSlide.get("elements") as Y.Array<YMapAny>).push([el]);
    setSelectedElementId(str(el, "id"));
  }

  function addImage(file: File) {
    if (!activeSlide) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el = createImageElement(reader.result as string);
      (activeSlide.get("elements") as Y.Array<YMapAny>).push([el]);
      setSelectedElementId(str(el, "id"));
    };
    reader.readAsDataURL(file);
  }

  function deleteElement(id: string) {
    if (!activeSlide) return;
    const elements = activeSlide.get("elements") as Y.Array<YMapAny>;
    const idx = elements.toArray().findIndex((e) => str(e, "id") === id);
    if (idx >= 0) elements.delete(idx, 1);
    setSelectedElementId(null);
  }

  function slideToPlain(slide: YMapAny): ExportSlide {
    const elements = (slide.get("elements") as Y.Array<YMapAny>).toArray().map((el) => ({
      id: str(el, "id"),
      type: str(el, "type") as "text" | "image",
      x: num(el, "x"),
      y: num(el, "y"),
      w: num(el, "w"),
      h: num(el, "h"),
      text: (el.get("text") as Y.Text | undefined)?.toString(),
      src: str(el, "src") || undefined,
    }));
    return { id: str(slide, "id"), elements };
  }

  async function handleExportPptx() {
    if (exporting) return;
    setExporting("pptx");
    try {
      await exportSlidesAsPptx(slides.map(slideToPlain), `${baseName}.pptx`);
    } catch {
      window.alert("PPT 파일로 내보내는 중 오류가 발생했어요.");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    if (exporting || slides.length === 0) return;
    setExporting("pdf");
    const originalIndex = activeSlideIndex;
    const originalSelected = selectedElementId;
    const originalEditing = editingElementId;
    setSelectedElementId(null);
    setEditingElementId(null);
    try {
      const images: { dataUrl: string; width: number; height: number }[] = [];
      for (let i = 0; i < slides.length; i++) {
        setActiveSlideIndex(i);
        await nextFrame();
        await nextFrame();
        if (!slideCaptureRef.current) continue;
        images.push(await captureSlideAsImage(slideCaptureRef.current));
      }
      await buildSlidesPdf(images, `${baseName}.pdf`);
    } catch {
      window.alert("PDF로 내보내는 중 오류가 발생했어요.");
    } finally {
      setActiveSlideIndex(originalIndex);
      setSelectedElementId(originalSelected);
      setEditingElementId(originalEditing);
      setExporting(null);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div
        className="w-full max-w-6xl h-[88vh] flex flex-col"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <div className="text-sm font-700 truncate">
              🖼️ {filePath}
              {pinLabel && <span style={{ color: "#8b5cf6" }}> · 📌 {pinLabel}</span>}
            </div>
            {peers.map((p) => (
              <span key={p.userId} className="px-1.5 py-0.5 text-[10px] font-700 rounded-full shrink-0" style={{ background: `${p.color}20`, color: p.color }}>
                ✏️ {p.name}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleExportPptx}
              disabled={exporting !== null}
              className="text-xs font-700 px-3 py-1.5"
              style={{ borderRadius: "20px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent", opacity: exporting !== null ? 0.6 : 1 }}
            >
              {exporting === "pptx" ? "내보내는 중..." : "PPT로 내보내기"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting !== null}
              className="text-xs font-700 px-3 py-1.5"
              style={{ borderRadius: "20px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent", opacity: exporting !== null ? 0.6 : 1 }}
            >
              {exporting === "pdf" ? `내보내는 중... (${activeSlideIndex + 1}/${slides.length})` : "PDF로 내보내기"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-lg shrink-0"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pt-2 gap-3 flex-wrap">
          <div className="text-xs flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status === "connected" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444" }} />
            {status === "connected" ? "실시간 연결됨" : status === "connecting" ? "연결 중..." : "연결 끊김 — 재연결 시도 중"}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={addTextBox} className="text-xs font-700 px-3 py-1.5 rounded-full" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
              + 텍스트
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              className="text-xs font-700 px-3 py-1.5 rounded-full"
              style={{ background: "var(--muted)", color: "var(--foreground)" }}
            >
              + 이미지
            </button>
            {selectedElementId && (
              <button
                onClick={() => deleteElement(selectedElementId)}
                className="text-xs font-700 px-3 py-1.5 rounded-full"
                style={{ background: "#ef444418", color: "#ef4444" }}
              >
                선택 삭제
              </button>
            )}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addImage(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex-1 min-h-0 flex gap-4 p-4">
          {/* 슬라이드 목록 */}
          <div className="w-40 shrink-0 overflow-y-auto flex flex-col gap-2 pr-1">
            {slides.map((slide, i) => (
              <SlideThumbnail
                key={str(slide, "id")}
                slide={slide}
                index={i}
                active={i === clampedIndex}
                onClick={() => {
                  setActiveSlideIndex(i);
                  setSelectedElementId(null);
                }}
                onDelete={slides.length > 1 ? () => deleteSlide(i) : undefined}
              />
            ))}
            <button
              onClick={addSlide}
              className="text-xs font-700 py-2 rounded-lg border-2 border-dashed"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
            >
              + 슬라이드
            </button>
          </div>

          {/* 캔버스 */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            {activeSlide ? (
              <div ref={slideCaptureRef} className="w-full" style={{ maxWidth: 900 }}>
                <SlideCanvas
                  ydoc={ydoc}
                  slide={activeSlide}
                  selectedElementId={selectedElementId}
                  editingElementId={editingElementId}
                  onSelect={setSelectedElementId}
                  onStartEdit={setEditingElementId}
                  onStopEdit={() => setEditingElementId(null)}
                  onDelete={deleteElement}
                />
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                불러오는 중...
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
          텍스트 상자는 더블클릭해서 편집하고, 드래그로 이동·모서리로 크기 조절할 수 있어요. 타이핑을 멈추면 자동으로 새 버전이 저장돼요.
          {pinLabel && ` (파일의 현재 버전이 아니라 "${pinLabel}" 핀에 이어붙어요)`}
        </div>
      </div>
    </div>
  );
}

function SlideThumbnail({
  slide,
  index,
  active,
  onClick,
  onDelete,
}: {
  slide: YMapAny;
  index: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const elements = (slide.get("elements") as Y.Array<YMapAny>).toArray();
  return (
    <div className="relative">
      <button onClick={onClick} className="w-full text-left">
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "16/9", background: "#fff", borderRadius: 6, border: active ? "2px solid var(--primary)" : "1px solid var(--border)" }}
        >
          {elements.map((el) => {
            const type = str(el, "type");
            const x = num(el, "x"), y = num(el, "y"), w = num(el, "w"), h = num(el, "h");
            return (
              <div key={str(el, "id")} className="absolute overflow-hidden" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}>
                {type === "image" ? (
                  <img src={str(el, "src")} className="w-full h-full object-contain" />
                ) : (
                  <div style={{ fontSize: 4, lineHeight: 1.2, color: "#111" }}>{(el.get("text") as Y.Text | undefined)?.toString()}</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-center mt-1" style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}>
          {index + 1}
        </div>
      </button>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="슬라이드 삭제"
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] flex items-center justify-center"
          style={{ background: "#ef4444", color: "#fff" }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function SlideCanvas({
  ydoc,
  slide,
  selectedElementId,
  editingElementId,
  onSelect,
  onStartEdit,
  onStopEdit,
  onDelete,
}: {
  ydoc: Y.Doc;
  slide: YMapAny;
  selectedElementId: string | null;
  editingElementId: string | null;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
  onDelete: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const elementsArray = slide.get("elements") as Y.Array<YMapAny>;
  const elements = elementsArray.toArray();

  function updateRect(el: YMapAny, patch: Partial<{ x: number; y: number; w: number; h: number }>) {
    ydoc.transact(() => {
      for (const [k, v] of Object.entries(patch)) el.set(k, v);
    }, "local-drag");
  }

  function startDrag(e: React.MouseEvent, el: YMapAny) {
    e.stopPropagation();
    onSelect(str(el, "id"));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = num(el, "x");
    const origY = num(el, "y");
    const w = num(el, "w");
    const h = num(el, "h");
    function onMove(ev: MouseEvent) {
      const dxPct = ((ev.clientX - startX) / rect!.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect!.height) * 100;
      updateRect(el, {
        x: Math.max(0, Math.min(100 - w, origX + dxPct)),
        y: Math.max(0, Math.min(100 - h, origY + dyPct)),
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startResize(e: React.MouseEvent, el: YMapAny) {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = num(el, "w");
    const origH = num(el, "h");
    function onMove(ev: MouseEvent) {
      const dwPct = ((ev.clientX - startX) / rect!.width) * 100;
      const dhPct = ((ev.clientY - startY) / rect!.height) * 100;
      updateRect(el, { w: Math.max(6, origW + dwPct), h: Math.max(4, origH + dhPct) });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      ref={canvasRef}
      onClick={() => onSelect(null)}
      className="relative w-full"
      style={{ aspectRatio: "16/9", background: "#fff", borderRadius: 8, boxShadow: "0 2px 16px rgba(15,18,53,0.12)", overflow: "hidden" }}
    >
      {elements.map((el) => {
        const id = str(el, "id");
        const type = str(el, "type");
        const x = num(el, "x"), y = num(el, "y"), w = num(el, "w"), h = num(el, "h");
        const selected = selectedElementId === id;
        const editing = editingElementId === id;
        return (
          <div
            key={id}
            onMouseDown={(e) => startDrag(e, el)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (type === "text") onStartEdit(id);
            }}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${w}%`,
              height: `${h}%`,
              cursor: editing ? "text" : "move",
              outline: selected ? "2px solid var(--primary)" : "1px dashed transparent",
            }}
          >
            {type === "image" ? (
              <img src={str(el, "src")} className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
            ) : editing ? (
              <TextElementEditor ytext={el.get("text") as Y.Text} onBlur={onStopEdit} />
            ) : (
              <div className="w-full h-full p-1 overflow-hidden select-none" style={{ fontSize: Math.max(10, w * 0.16), lineHeight: 1.3, whiteSpace: "pre-wrap" }}>
                {(el.get("text") as Y.Text | undefined)?.toString()}
              </div>
            )}
            {selected && !editing && (
              <>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(id);
                  }}
                  className="absolute -top-3 -right-3 w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                  style={{ background: "#ef4444", color: "#fff" }}
                >
                  ×
                </button>
                <div
                  onMouseDown={(e) => startResize(e, el)}
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full"
                  style={{ background: "var(--primary)", cursor: "nwse-resize" }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TextElementEditor({ ytext, onBlur }: { ytext: Y.Text; onBlur: () => void }) {
  const [value, setValue] = useState(ytext.toString());

  useEffect(() => {
    const obs = () => setValue(ytext.toString());
    ytext.observe(obs);
    return () => ytext.unobserve(obs);
  }, [ytext]);

  return (
    <textarea
      autoFocus
      value={value}
      onChange={(e) => {
        applyTextareaDelta(ytext, value, e.target.value);
        setValue(e.target.value);
      }}
      onBlur={onBlur}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="w-full h-full p-1 outline-none resize-none"
      style={{ fontSize: 13, background: "rgba(37,99,235,0.06)" }}
    />
  );
}
