import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface HwpxSelectionHandlesProps {
  onResizeStart?: (e: React.PointerEvent, dir: ResizeDirection) => void;
}

/**
 * 한컴오피스 표준 스타일의 8방향 사각 선택 조절점 핸들
 * (모서리 4개 + 변 중앙 4개)
 * - 끝부분(모서리 및 변)을 잡고 드래그하여 직관적인 실시간 크기 조절 지원
 */
export function HwpxSelectionHandles({ onResizeStart }: HwpxSelectionHandlesProps = {}) {
  const isInteractive = typeof onResizeStart === "function";

  const handles: { dir: ResizeDirection; posClass: string; cursorClass: string; label: string }[] = [
    { dir: "nw", posClass: "top-0 left-0 -translate-x-1/2 -translate-y-1/2", cursorClass: "cursor-nwse-resize", label: "좌상단 조절점" },
    { dir: "n", posClass: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2", cursorClass: "cursor-ns-resize", label: "상단 조절점" },
    { dir: "ne", posClass: "top-0 right-0 translate-x-1/2 -translate-y-1/2", cursorClass: "cursor-nesw-resize", label: "우상단 조절점" },
    { dir: "e", posClass: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2", cursorClass: "cursor-ew-resize", label: "우측 조절점" },
    { dir: "se", posClass: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursorClass: "cursor-nwse-resize", label: "우하단 조절점" },
    { dir: "s", posClass: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursorClass: "cursor-ns-resize", label: "하단 조절점" },
    { dir: "sw", posClass: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursorClass: "cursor-nesw-resize", label: "좌하단 조절점" },
    { dir: "w", posClass: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2", cursorClass: "cursor-ew-resize", label: "좌측 조절점" },
  ];

  return (
    <>
      {handles.map(({ dir, posClass, cursorClass, label }) => (
        <span
          key={dir}
          data-resize-dir={dir}
          title={isInteractive ? `${label} (드래그하여 크기 조절)` : undefined}
          onPointerDown={
            isInteractive
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onResizeStart(e, dir);
                }
              : undefined
          }
          className={`hwpx-resize-handle absolute z-30 w-2.5 h-2.5 bg-white border border-[#0066cc] rounded-[1px] shadow-xs select-none before:absolute before:-inset-2 before:content-[''] ${
            isInteractive
              ? `${cursorClass} pointer-events-auto hover:bg-[#0066cc] hover:border-[#004499] active:bg-[#004499]`
              : "pointer-events-none"
          } ${posClass}`}
        />
      ))}
    </>
  );
}

export interface HwpxFloatingToolbarProps {
  icon?: ReactNode;
  title?: string;
  badge?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}

/**
 * 선택된 개체(표, 그림, 도형, 수식, 차트) 우측 빈 공간에 노출되는 플로팅 리모콘
 */
export function HwpxFloatingToolbar({ icon, title, badge, onClose, children }: HwpxFloatingToolbarProps) {
  const remoteSlot = typeof document !== "undefined" ? document.getElementById("hwpx-remote-slot") : null;
  const card = (
    <div
      contentEditable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`hwpx-floating-toolbar pointer-events-auto ${
        remoteSlot ? "relative" : "absolute top-0 left-[calc(100%+14px)]"
      } z-40 flex flex-col gap-1.5 p-2.5 bg-white/95 backdrop-blur-md border border-neutral-300 shadow-2xl rounded-xl text-xs text-neutral-800 select-none w-44 animate-in fade-in zoom-in-95 duration-150`}
      style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)" }}
    >
      {(title || onClose) && (
        <div className="flex items-center justify-between pb-1.5 border-b border-neutral-200">
          <div className="flex items-center gap-1.5 font-bold text-neutral-800 text-[11px] min-w-0">
            {icon}
            {title && <span className="truncate">{title}</span>}
            {badge}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded w-4 h-4 flex items-center justify-center text-[11px] cursor-pointer shrink-0"
              title="리모컨 닫기 (선택 해제)"
            >
              ✕
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );

  return remoteSlot ? createPortal(card, remoteSlot) : card;
}

export interface HwpxRemoteSizeControlsProps {
  widthPercent: number;
  heightPt?: number;
  contentWidthMm?: number;
  onChangeWidth: (widthPercent: number) => void;
  onChangeHeight: (heightPt: number) => void;
}

const PT_TO_MM = 25.4 / 72;

/**
 * 리모콘 내부의 너비(mm) / 높이(mm) 직접 입력 컨트롤 (개체 속성 창과 동일 단위)
 */
export function HwpxRemoteSizeControls({
  widthPercent,
  heightPt,
  contentWidthMm = 150,
  onChangeWidth,
  onChangeHeight,
}: HwpxRemoteSizeControlsProps) {
  const safeContentMm = Math.max(50, contentWidthMm);
  const computedWidthMm = Number(((widthPercent / 100) * safeContentMm).toFixed(2));
  const computedHeightMm = heightPt !== undefined ? Number((heightPt * PT_TO_MM).toFixed(2)) : undefined;

  const [widthDraft, setWidthDraft] = useState(String(computedWidthMm));
  const [heightDraft, setHeightDraft] = useState(computedHeightMm !== undefined ? String(computedHeightMm) : "");

  useEffect(() => {
    setWidthDraft(String(computedWidthMm));
  }, [computedWidthMm]);

  useEffect(() => {
    setHeightDraft(computedHeightMm !== undefined ? String(computedHeightMm) : "");
  }, [computedHeightMm]);

  const commitWidth = () => {
    const v = Number(widthDraft);
    if (Number.isFinite(v) && v >= 1) {
      const pct = Math.max(0.5, Math.min(100, (v / safeContentMm) * 100));
      onChangeWidth(pct);
    } else {
      setWidthDraft(String(computedWidthMm));
    }
  };

  const commitHeight = () => {
    if (heightDraft.trim() === "") {
      setHeightDraft(computedHeightMm !== undefined ? String(computedHeightMm) : "");
      return;
    }
    const v = Number(heightDraft);
    if (Number.isFinite(v) && v >= 1) {
      onChangeHeight(Math.max(2, v / PT_TO_MM));
    } else {
      setHeightDraft(computedHeightMm !== undefined ? String(computedHeightMm) : "");
    }
  };

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold text-neutral-500 px-0.5">크기 (mm)</div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center justify-between gap-2 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-[11px] text-neutral-600">
          <span>너비</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min={1}
              max={Math.round(safeContentMm)}
              value={widthDraft}
              onChange={(e) => setWidthDraft(e.target.value)}
              onBlur={commitWidth}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitWidth();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-[11px] font-mono text-neutral-800 outline-none focus:border-[#0066cc]"
            />
            <span className="text-[10px] text-neutral-400">mm</span>
          </span>
        </label>
        <label className="flex items-center justify-between gap-2 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-[11px] text-neutral-600">
          <span>높이</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min={1}
              max={350}
              value={heightDraft}
              placeholder="자동"
              onChange={(e) => setHeightDraft(e.target.value)}
              onBlur={commitHeight}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHeight();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-right text-[11px] font-mono text-neutral-800 outline-none focus:border-[#0066cc] placeholder:text-[10px]"
            />
            <span className="text-[10px] text-neutral-400">mm</span>
          </span>
        </label>
      </div>
    </div>
  );
}

export interface HwpxRemoteColorPickerProps {
  label: string;
  color: string;
  allowTransparent?: boolean;
  onChange: (color: string) => void;
}

/**
 * 리모콘 내부의 단일 색상 버튼 (클릭 시 브라우저 기본 컬러 피커 팝업 오픈)
 */
export function HwpxRemoteColorPicker({
  label,
  color,
  allowTransparent = false,
  onChange,
}: HwpxRemoteColorPickerProps) {
  const isTransparent = color === "transparent";
  const pickerValue = isTransparent || !color.startsWith("#") ? "#ffffff" : color;

  return (
    <div className="flex items-center justify-between gap-1.5 px-0.5">
      <span className="text-[10px] font-semibold text-neutral-500">{label}</span>
      <div className="flex items-center gap-1">
        {allowTransparent && (
          <button
            type="button"
            onClick={() => onChange(isTransparent ? "#FFFFFF" : "transparent")}
            className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer transition-colors ${
              isTransparent
                ? "bg-[#0066cc] text-white border-[#0066cc] font-bold"
                : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-100"
            }`}
            title="채우기 없음(투명) 전환"
          >
            투명
          </button>
        )}
        <label
          className="relative w-7 h-5 rounded border border-neutral-300 shadow-2xs cursor-pointer overflow-hidden flex items-center justify-center hover:border-[#0066cc]"
          title={`${label} 선택`}
          style={{
            background: isTransparent
              ? "linear-gradient(45deg, #fff 40%, #ef4444 40%, #ef4444 60%, #fff 60%)"
              : pickerValue,
          }}
        >
          <input
            type="color"
            value={pickerValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}

