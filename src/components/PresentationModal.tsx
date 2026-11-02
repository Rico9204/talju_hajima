import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceFile } from "../api/types";
import { useProject } from "../context/ProjectContext";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import * as Y from "yjs";
import { SLIDES_FIELD, slideElements, type YMapAny } from "../lib/slidesDoc";

export interface PresentationModalProps {
  file: WorkspaceFile;
  onClose: () => void;
}

export function isPresentationFile(fileName: string): boolean {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return ["pdf", "ppt", "pptx", "slides"].includes(ext);
}

interface ParsedSlide {
  index: number;
  title: string;
  html?: string;
  text?: string;
  note?: string;
  yElements?: YMapAny[];
}

export default function PresentationModal({ file, onClose }: PresentationModalProps) {
  const { downloadFileVersion } = useProject();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"pdf" | "pptx" | "slides" | "text">("pdf");

  // Slides data
  const [slides, setSlides] = useState<ParsedSlide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);

  // PDF specific proxy
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Presentation tool states
  const [laserMode, setLaserMode] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(false);

  const hudTimerRef = useRef<number | undefined>(undefined);

  // 1. Initial file loading and parsing
  useEffect(() => {
    let cancelled = false;

    async function loadPresentation() {
      setLoading(true);
      setError(null);
      try {
        const cur = file.versions.find((v) => v.current) ?? file.versions[0];
        if (!cur) throw new Error("파일 버전을 찾을 수 없습니다.");

        const blob = await downloadFileVersion(cur.id);
        if (cancelled) return;

        const ext = (file.name.split(".").pop() || "").toLowerCase();

        if (ext === "pdf") {
          setFileType("pdf");
          const { getDocument } = await import("../lib/pdfEngine");
          const arrayBuffer = await blob.arrayBuffer();
          if (cancelled) return;

          const task = getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await task.promise;
          if (cancelled) {
            void task.destroy();
            return;
          }

          pdfRef.current = pdf;
          setTotalSlides(pdf.numPages);
          setCurrentSlide(0);

          const initialSlides: ParsedSlide[] = Array.from({ length: pdf.numPages }, (_, i) => ({
            index: i,
            title: `${i + 1} 페이지`,
          }));
          setSlides(initialSlides);
        } else if (ext === "pptx" || ext === "ppt") {
          setFileType("pptx");
          try {
            const { parseOffice } = await import("officeparser");
            const parserFile = new File([blob], file.name, { type: cur.mimeType });
            const doc = await parseOffice(parserFile, { includeRawContent: false });
            const html = (await doc.to("html")).value;
            if (cancelled) return;

            const domParser = new DOMParser();
            const parsedDom = domParser.parseFromString(html, "text/html");
            const slideElements = Array.from(parsedDom.querySelectorAll("section.slide"));

            if (slideElements.length > 0) {
              const parsed: ParsedSlide[] = slideElements.map((el, i) => {
                const title = el.querySelector("h1, h2, h3, p, span")?.textContent?.trim() || `슬라이드 ${i + 1}`;
                const noteEl = el.nextElementSibling?.classList.contains("slide-note") ? el.nextElementSibling : null;
                return {
                  index: i,
                  title: title.slice(0, 50),
                  html: el.innerHTML,
                  note: noteEl?.textContent?.trim() || "",
                };
              });
              setSlides(parsed);
              setTotalSlides(parsed.length);
              setCurrentSlide(0);
            } else {
              // Fallback if no sections
              const fallbackText = (await doc.to("text")).value || cur.searchText || "";
              const lines = fallbackText.split("\n\n").filter(Boolean);
              const parsed: ParsedSlide[] = (lines.length > 0 ? lines : [fallbackText]).map((text, i) => ({
                index: i,
                title: text.slice(0, 40) || `슬라이드 ${i + 1}`,
                text,
              }));
              setSlides(parsed);
              setTotalSlides(parsed.length);
              setCurrentSlide(0);
            }
          } catch (officeErr) {
            console.error("PPTX parse error:", officeErr);
            // Fallback to plain text if officeparser fails
            const text = cur.searchText || "프레젠테이션 내용을 읽지 못했습니다.";
            setSlides([{ index: 0, title: file.name, text }]);
            setTotalSlides(1);
            setCurrentSlide(0);
          }
        } else if (ext === "slides") {
          setFileType("slides");
          const ydoc = new Y.Doc();
          const arrayBuffer = await blob.arrayBuffer();
          Y.applyUpdate(ydoc, new Uint8Array(arrayBuffer));
          const yslides = ydoc.getArray<YMapAny>(SLIDES_FIELD).toArray();

          const parsed: ParsedSlide[] = yslides.map((s, i) => ({
            index: i,
            title: `슬라이드 ${i + 1}`,
            yElements: slideElements(s).toArray(),
          }));
          setSlides(parsed.length > 0 ? parsed : [{ index: 0, title: "빈 슬라이드", yElements: [] }]);
          setTotalSlides(parsed.length || 1);
          setCurrentSlide(0);
        } else {
          // General text / fallback
          setFileType("text");
          const text = await blob.text();
          setSlides([{ index: 0, title: file.name, text }]);
          setTotalSlides(1);
          setCurrentSlide(0);
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "발표 자료를 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    }

    void loadPresentation();

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        try {
          pdfRef.current.cleanup();
        } catch {}
        pdfRef.current = null;
      }
    };
  }, [file, downloadFileVersion]);

  // 2. Fullscreen handling
  useEffect(() => {
    async function enterFs() {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Fullscreen not permitted or user cancelled, continue in windowed modal
      }
    }
    void enterFs();

    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore error
    }
  }, []);


  // 4. Auto-hiding HUD: only reveal when mouse cursor is near the bottom
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (laserMode) {
        setLaserPos({ x: e.clientX, y: e.clientY });
      }

      // Check if mouse cursor is within 90px from the bottom edge
      const isNearBottom = e.clientY >= window.innerHeight - 90;
      if (isNearBottom) {
        setHudVisible(true);
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = window.setTimeout(() => {
          setHudVisible(false);
        }, 3000);
      } else {
        window.clearTimeout(hudTimerRef.current);
        setHudVisible(false);
      }
    },
    [laserMode]
  );

  // 5. Slide Navigation helpers
  const goToSlide = useCallback(
    (index: number) => {
      if (totalSlides <= 0) return;
      const nextIndex = Math.max(0, Math.min(index, totalSlides - 1));
      setCurrentSlide(nextIndex);
      setBlackout(false);
      setShowGrid(false);
    },
    [totalSlides]
  );

  const nextSlide = useCallback(() => {
    goToSlide(currentSlide + 1);
  }, [goToSlide, currentSlide]);

  const prevSlide = useCallback(() => {
    goToSlide(currentSlide - 1);
  }, [goToSlide, currentSlide]);

  // 6. Keyboard events
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        if (showGrid) {
          setShowGrid(false);
          return;
        }
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        if (blackout) {
          setBlackout(false);
          return;
        }
        onClose();
        return;
      }

      if (blackout) {
        setBlackout(false);
        return;
      }

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          e.preventDefault();
          nextSlide();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          prevSlide();
          break;
        case "Home":
          e.preventDefault();
          goToSlide(0);
          break;
        case "End":
          e.preventDefault();
          goToSlide(totalSlides - 1);
          break;
        case "l":
        case "L":
          setLaserMode((m) => !m);
          break;
        case "b":
        case "B":
          setBlackout((b) => !b);
          break;
        case "g":
        case "G":
        case "Tab":
          e.preventDefault();
          setShowGrid((g) => !g);
          break;
        case "n":
        case "N":
          setShowNotes((n) => !n);
          break;
        case "f":
        case "F":
          void toggleFullscreen();
          break;
        case "?":
          setShowHelp((h) => !h);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide, goToSlide, totalSlides, blackout, showGrid, showHelp, onClose, toggleFullscreen]);

  // 7. Render PDF page to canvas
  useLayoutEffect(() => {
    if (fileType !== "pdf" || !pdfRef.current || !canvasRef.current || !containerRef.current) return;

    let cancelled = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    async function renderPage() {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }

      const page = await pdfRef.current!.getPage(currentSlide + 1);
      if (cancelled) return;

      const unscaled = page.getViewport({ scale: 1 });
      const availableW = Math.max(200, container.clientWidth);
      const availableH = Math.max(200, container.clientHeight);

      const scale = Math.min(availableW / unscaled.width, availableH / unscaled.height);
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      const task = page.render({ canvas, viewport });
      renderTaskRef.current = task;
      await task.promise;
    }

    void renderPage();

    let rAF: number | undefined;
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      window.cancelAnimationFrame(rAF!);
      rAF = window.requestAnimationFrame(() => {
        void renderPage();
      });
    });
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rAF!);
      resizeObserver.disconnect();
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [fileType, currentSlide, totalSlides]);

  const activeSlide = slides[currentSlide];

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center select-none ${
        laserMode ? "cursor-none" : ""
      }`}
      style={{
        background: "#08090e",
        color: "#ffffff",
      }}
      onMouseMove={handleMouseMove}
      onClick={(e) => {
        // If clicking on left or right third of the screen outside controls, navigate
        if ((e.target as HTMLElement).closest("button, [data-hud], [data-modal]")) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX > rect.width * 0.7) {
          nextSlide();
        } else if (clickX < rect.width * 0.3) {
          prevSlide();
        }
      }}
      role="dialog"
      aria-label={`${file.name} 발표 모드`}
    >
      {/* Laser Pointer Dot */}
      {laserMode && laserPos && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none rounded-full"
          style={{
            left: laserPos.x - 7,
            top: laserPos.y - 7,
            width: 14,
            height: 14,
            background: "#ef4444",
            boxShadow: "0 0 16px 5px rgba(239, 68, 68, 0.85), 0 0 4px 1px #ffffff",
            zIndex: 9999,
          }}
        />
      )}


      {/* Top Header Information (Title & Close) */}
      <div
        className="absolute top-4 left-6 right-6 flex items-center justify-between z-20 opacity-30 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      >
        <div className="text-xs text-white/70 max-w-sm truncate hidden sm:block pointer-events-auto">
          {file.name}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {laserMode && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1 font-600">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              레이저 포인터 켜짐
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-sm"
            title="발표 종료 (ESC)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Slide Content Area */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center p-0 overflow-hidden relative"
      >
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-white/80 font-600">발표 슬라이드를 준비하는 중…</div>
          </div>
        )}

        {error && (
          <div className="max-w-md p-6 rounded-2xl bg-red-900/30 border border-red-700/50 text-center">
            <div className="text-2xl mb-2">⚠️</div>
            <div className="text-sm font-700 text-red-200 mb-2">슬라이드를 표시할 수 없습니다</div>
            <div className="text-xs text-red-300 mb-4">{error}</div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-600 text-white"
            >
              닫기
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* PDF Viewport */}
            {fileType === "pdf" && (
              <div className="flex items-center justify-center shadow-2xl overflow-hidden bg-white">
                <canvas ref={canvasRef} className="block" />
              </div>
            )}

            {/* PPTX Viewport */}
            {fileType === "pptx" && activeSlide && (
              <div
                className="overflow-hidden shadow-2xl bg-white text-slate-900 flex flex-col relative transition-all"
                style={{
                  aspectRatio: "16/9",
                  width: "min(100vw, calc(100vh * 16 / 9))",
                  height: "min(100vh, calc(100vw * 9 / 16))",
                }}
              >
                {activeSlide.html ? (
                  <div
                    className="w-full h-full p-8 md:p-14 overflow-y-auto flex flex-col justify-center text-left"
                    style={{
                      fontFamily: "var(--font-outfit), sans-serif",
                    }}
                    dangerouslySetInnerHTML={{ __html: activeSlide.html }}
                  />
                ) : (
                  <div className="w-full h-full p-12 flex flex-col justify-center items-center text-center">
                    <h2 className="text-2xl md:text-4xl font-800 text-slate-800 mb-6">
                      {activeSlide.title}
                    </h2>
                    <p className="text-base md:text-xl text-slate-600 max-w-2xl whitespace-pre-line leading-relaxed">
                      {activeSlide.text}
                    </p>
                  </div>
                )}
                {/* Slide number watermark */}
                <div className="absolute bottom-4 right-6 text-xs font-700 text-slate-400">
                  {currentSlide + 1} / {totalSlides}
                </div>
              </div>
            )}

            {/* Native Slackerspace .slides Viewport */}
            {fileType === "slides" && activeSlide && (
              <div
                className="overflow-hidden shadow-2xl bg-white text-slate-900 relative"
                style={{
                  aspectRatio: "16/9",
                  width: "min(100vw, calc(100vh * 16 / 9))",
                  height: "min(100vh, calc(100vw * 9 / 16))",
                }}
              >
                {activeSlide.yElements?.map((el) => {
                  const x = (el.get("x") as number) ?? 0;
                  const y = (el.get("y") as number) ?? 0;
                  const w = (el.get("w") as number) ?? 40;
                  const h = (el.get("h") as number) ?? 20;
                  const type = (el.get("type") as string) ?? "text";

                  if (type === "text") {
                    const text = (el.get("text") as Y.Text | undefined)?.toString() || "";
                    return (
                      <div
                        key={String(el.get("id"))}
                        className="absolute p-2 whitespace-pre-wrap leading-normal"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          width: `${w}%`,
                          height: `${h}%`,
                          fontSize: `calc(12px + ${w * 0.22}px)`,
                          color: "#111827",
                        }}
                      >
                        {text}
                      </div>
                    );
                  }
                  return null;
                })}
                <div className="absolute bottom-4 right-6 text-xs font-700 text-slate-400">
                  {currentSlide + 1} / {totalSlides}
                </div>
              </div>
            )}

            {/* General Text Viewport */}
            {fileType === "text" && activeSlide && (
              <div
                className="w-full max-w-4xl rounded-xl p-8 bg-slate-900 border border-white/10 text-slate-100 shadow-2xl overflow-auto"
                style={{ maxHeight: "80vh" }}
              >
                <h2 className="text-xl font-700 mb-4 text-blue-400">{activeSlide.title}</h2>
                <pre className="text-sm whitespace-pre-wrap leading-relaxed font-mono">
                  {activeSlide.text}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Screen Blackout Overlay (B key) */}
      {blackout && (
        <div
          className="fixed inset-0 z-40 bg-black flex flex-col items-center justify-center cursor-pointer"
          onClick={() => setBlackout(false)}
        >
          <div className="text-xs text-white/40 tracking-wider">
            화면 가림 모드 · 아무 키나 누르거나 클릭하면 복귀합니다
          </div>
        </div>
      )}

      {/* Slide Notes Drawer/Card (N key) */}
      {showNotes && activeSlide?.note && (
        <div
          data-modal
          className="absolute bottom-24 right-8 w-80 max-h-64 p-4 rounded-xl bg-slate-900/90 backdrop-blur-md border border-white/15 text-white shadow-2xl z-30 overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="text-xs font-700 text-amber-400 flex items-center gap-1.5">
              <span>📝</span> 발표자 노트
            </span>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="text-xs text-white/50 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">
            {activeSlide.note}
          </div>
        </div>
      )}

      {/* Slide Grid Overview Overlay (G key / ▦ button) */}
      {showGrid && (
        <div
          data-modal
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg p-8 flex flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGrid(false);
          }}
        >
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div className="font-700 text-base text-white flex items-center gap-2">
              <span>▦</span> 전체 슬라이드 모아보기 ({slides.length}장)
            </div>
            <button
              type="button"
              onClick={() => setShowGrid(false)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-600 text-white"
            >
              닫기 (ESC)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-2 items-start">
            {slides.map((slide, idx) => (
              <button
                key={slide.index}
                type="button"
                onClick={() => goToSlide(idx)}
                className={`h-fit flex flex-col text-left rounded-xl overflow-hidden border-2 transition-all p-1 cursor-pointer group ${
                  idx === currentSlide
                    ? "border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/20 scale-[1.02]"
                    : "border-white/10 hover:border-white/40 bg-white/5"
                }`}
              >
                <div
                  className="w-full bg-slate-800 rounded-lg flex items-center justify-center p-3 text-center overflow-hidden"
                  style={{ aspectRatio: "16/9" }}
                >
                  <span className="text-xs text-slate-300 font-600 line-clamp-3">
                    {slide.title}
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 mt-1">
                  <span
                    className={`text-[11px] font-700 ${
                      idx === currentSlide ? "text-blue-400" : "text-white/60"
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  {idx === currentSlide && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500 text-white font-700">
                      현재
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Dialog (? key) */}
      {showHelp && (
        <div
          data-modal
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHelp(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <h3 className="font-700 text-sm flex items-center gap-2">
                <span>⌨️</span> 발표 모드 단축키
              </h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">다음 슬라이드</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">
                  → / Space / Enter
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">이전 슬라이드</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">
                  ← / Backspace
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">처음 / 마지막</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">
                  Home / End
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">전체 슬라이드 보기</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">
                  G 또는 Tab
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">레이저 포인터</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">L</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">화면 일시 가리기 (Blackout)</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">B</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/70">전체화면 전환</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">F</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-white/70">발표 종료</span>
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-blue-300">ESC</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-600 text-xs"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Invisible bottom trigger strip: only reveals HUD when cursor reaches bottom edge */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-16 z-20 pointer-events-auto"
        onMouseEnter={() => {
          setHudVisible(true);
          window.clearTimeout(hudTimerRef.current);
          hudTimerRef.current = window.setTimeout(() => {
            setHudVisible(false);
          }, 3000);
        }}
      />

      {/* Floating Bottom HUD Dock */}
      <div
        data-hud
        onMouseEnter={() => {
          window.clearTimeout(hudTimerRef.current);
          setHudVisible(true);
        }}
        onMouseLeave={() => {
          hudTimerRef.current = window.setTimeout(() => {
            setHudVisible(false);
          }, 1000);
        }}
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ${
          hudVisible
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900/85 backdrop-blur-xl border border-white/15 shadow-2xl text-white text-xs">
          {/* Previous Slide */}
          <button
            type="button"
            onClick={prevSlide}
            disabled={currentSlide <= 0}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="이전 슬라이드 (←)"
          >
            ◀
          </button>

          {/* Slide Indicator & Jump Trigger */}
          <button
            type="button"
            onClick={() => setShowGrid(true)}
            className="px-2.5 py-1 rounded-md hover:bg-white/15 font-700 tracking-wider text-xs transition-colors flex items-center gap-1"
            title="전체 슬라이드 보기 (G)"
          >
            <span>{currentSlide + 1}</span>
            <span className="text-white/40">/</span>
            <span className="text-white/70">{totalSlides || 1}</span>
          </button>

          {/* Next Slide */}
          <button
            type="button"
            onClick={nextSlide}
            disabled={currentSlide >= totalSlides - 1}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="다음 슬라이드 (→)"
          >
            ▶
          </button>

          <div className="w-px h-4 bg-white/20 mx-1" />

          {/* Grid Overview Button */}
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              showGrid ? "bg-blue-600 text-white" : "hover:bg-white/15 text-white/80"
            }`}
            title="모든 슬라이드 모아보기 (G)"
          >
            ▦
          </button>

          {/* Laser Pointer Toggle */}
          <button
            type="button"
            onClick={() => setLaserMode((m) => !m)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              laserMode ? "bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.7)]" : "hover:bg-white/15 text-white/80"
            }`}
            title="레이저 포인터 (L)"
          >
            🔴
          </button>

          {/* Blackout Button */}
          <button
            type="button"
            onClick={() => setBlackout(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white/80 transition-colors cursor-pointer text-xs"
            title="화면 일시 가리기 (B)"
          >
            ⬛
          </button>

          {/* Notes Toggle (if available) */}
          {activeSlide?.note && (
            <button
              type="button"
              onClick={() => setShowNotes((n) => !n)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                showNotes ? "bg-amber-500 text-white" : "hover:bg-white/15 text-white/80"
              }`}
              title="발표자 노트 (N)"
            >
              📝
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white/80 transition-colors cursor-pointer text-xs"
            title="전체화면 전환 (F)"
          >
            {isFullscreen ? "🗗" : "⛶"}
          </button>

          {/* Help Button */}
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white/80 transition-colors cursor-pointer text-xs"
            title="단축키 안내 (?)"
          >
            ?
          </button>

          <div className="w-px h-4 bg-white/20 mx-1" />

          {/* Exit Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white transition-colors cursor-pointer text-xs font-700"
            title="발표 종료 (ESC)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
