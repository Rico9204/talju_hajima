import type { ReactNode } from "react";

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
          className={`hwpx-resize-handle absolute z-30 w-2.5 h-2.5 bg-white border border-[#0066cc] shadow-xs select-none transition-transform before:absolute before:-inset-1.5 before:content-[''] ${
            isInteractive
              ? `${cursorClass} pointer-events-auto hover:bg-[#0066cc] hover:scale-125`
              : "pointer-events-none"
          } ${posClass}`}
        />
      ))}
    </>
  );
}

/**
 * 선택된 개체(수식, 그림, 도형) 바로 위에 우아하게 부유하는 인라인 오브젝트 제어 바
 */
export function HwpxFloatingToolbar({ children }: { children: ReactNode }) {
  return (
    <div
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute -top-11 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-white/95 backdrop-blur-xs border border-neutral-300 shadow-lg rounded-md px-2.5 py-1 text-xs text-neutral-800 select-none whitespace-nowrap"
      style={{ boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)" }}
    >
      {children}
    </div>
  );
}

