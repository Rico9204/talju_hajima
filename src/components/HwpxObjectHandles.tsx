import type { ReactNode } from "react";

/**
 * 한컴오피스 표준 스타일의 8방향 사각 선택 조절점 핸들
 * (모서리 4개 + 변 중앙 4개)
 */
export function HwpxSelectionHandles() {
  const handleClass =
    "absolute w-2 h-2 bg-white border border-[#0066cc] shadow-xs pointer-events-none z-30";
  return (
    <>
      {/* 4 모서리 핸들 */}
      <span className={`${handleClass} top-0 left-0 -translate-x-1/2 -translate-y-1/2`} />
      <span className={`${handleClass} top-0 right-0 translate-x-1/2 -translate-y-1/2`} />
      <span className={`${handleClass} bottom-0 left-0 -translate-x-1/2 translate-y-1/2`} />
      <span className={`${handleClass} bottom-0 right-0 translate-x-1/2 translate-y-1/2`} />

      {/* 4 변 중앙 핸들 */}
      <span className={`${handleClass} top-0 left-1/2 -translate-x-1/2 -translate-y-1/2`} />
      <span className={`${handleClass} bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2`} />
      <span className={`${handleClass} top-1/2 left-0 -translate-x-1/2 -translate-y-1/2`} />
      <span className={`${handleClass} top-1/2 right-0 translate-x-1/2 -translate-y-1/2`} />
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

