import { useRef, type MouseEvent, type PointerEvent } from "react";

interface DraggableScrollOptions {
  direction?: "x" | "y" | "both";
  threshold?: number;
}

/**
 * 특정 스크롤 컨테이너에 모바일 터치 및 데스크탑 포인터 드래그 스크롤을 부여하는 훅
 * - 카드, 링크, 텍스트 위 어디서나 1:1로 손끝을 따라 스크롤
 * - 드래그 후 클릭(링크 이동 등) 자동 방지
 */
export function useDraggableScroll<T extends HTMLElement = HTMLDivElement>(
  options: DraggableScrollOptions = {}
) {
  const { direction = "y", threshold = 4 } = options;
  const ref = useRef<T>(null);
  const dragRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    hasMoved: false,
  });

  const onPointerDown = (e: PointerEvent<T>) => {
    // 마우스 좌클릭 또는 터치만
    if (e.button !== 0) return;
    const container = ref.current;
    if (!container) return;

    dragRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      hasMoved: false,
    };
  };

  const onPointerMove = (e: PointerEvent<T>) => {
    if (!dragRef.current.isDown) return;
    const container = ref.current;
    if (!container) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const dist =
      direction === "x"
        ? Math.abs(dx)
        : direction === "y"
          ? Math.abs(dy)
          : Math.hypot(dx, dy);

    if (!dragRef.current.hasMoved && dist > threshold) {
      dragRef.current.hasMoved = true;
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    if (dragRef.current.hasMoved) {
      if (direction === "x" || direction === "both") {
        container.scrollLeft = dragRef.current.scrollLeft - dx;
      }
      if (direction === "y" || direction === "both") {
        container.scrollTop = dragRef.current.scrollTop - dy;
      }
    }
  };

  const onPointerUp = (e: PointerEvent<T>) => {
    if (dragRef.current.hasMoved) {
      try {
        ref.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    dragRef.current.isDown = false;
  };

  const preventClickIfDragged = (e: MouseEvent) => {
    if (dragRef.current.hasMoved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return {
    ref,
    events: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    preventClickIfDragged,
    hasMoved: () => dragRef.current.hasMoved,
  };
}
