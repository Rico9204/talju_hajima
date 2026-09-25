import { useEffect, useRef } from "react";

/**
 * 전역 마우스 드래그 스크롤(Drag-to-Scroll) 훅
 * - 인터랙티브 요소(버튼, 링크, 입력창 등) 및 텍스트 선택 영역을 침범하지 않음
 * - 5px 이상 드래그 시 활성화되며, 드래그 후 튕기면 부드러운 관성 스크롤(Momentum scrolling) 제공
 */
export function useGlobalDragScroll() {
  const momentumRafRef = useRef<number | null>(null);

  useEffect(() => {
    let activeContainer: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let initialScrollLeft = 0;
    let initialScrollTop = 0;
    let isDragging = false;
    let hasMovedBeyondThreshold = false;
    let originalScrollBehavior = "";

    // 속도 계산용 (관성 스크롤)
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocityX = 0;
    let velocityY = 0;

    function cancelMomentum() {
      if (momentumRafRef.current !== null) {
        cancelAnimationFrame(momentumRafRef.current);
        momentumRafRef.current = null;
      }
    }

    // 드래그 스크롤에서 제외할 요소인지 판별
    function isInteractiveOrEditable(target: HTMLElement | null): boolean {
      if (!target) return false;

      // 1. 입력 및 폼 요소
      if (target.closest("input, textarea, select, option, label")) return true;

      // 2. 버튼 및 클릭 링크 등 인터랙티브 요소
      if (target.closest("button, a, [role='button'], [role='link'], [role='tab'], summary")) return true;

      // 3. 드래그 앤 드롭 및 에디터
      if (target.closest("[draggable='true'], [contenteditable='true'], .no-drag-scroll")) return true;

      // 4. 비디오 / 오디오
      if (target.closest("video, audio")) return true;

      // 5. 채팅 메시지 말풍선 내부에서만 텍스트 복사를 허용
      // 말풍선 바깥의 빈 공간, 시간, 닉네임, 날짜 배너, 메시지 간 여백 등은 모두 드래그 스크롤 동작!
      if (target.closest("[data-chat-bubble='true'], .chat-bubble")) {
        return true;
      }

      // 6. 명시적 코드 블록 및 텍스트 선택 전용 영역
      if (target.closest("pre, code, [data-selectable='true']")) {
        return true;
      }

      return false;
    }

    // 스크롤 가능한 상위 컨테이너 탐색
    function findScrollableContainer(target: HTMLElement | null): HTMLElement | null {
      let curr = target;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const style = window.getComputedStyle(curr);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;

        const canScrollX =
          (overflowX === "auto" || overflowX === "scroll") &&
          curr.scrollWidth > curr.clientWidth + 1;
        const canScrollY =
          (overflowY === "auto" || overflowY === "scroll") &&
          curr.scrollHeight > curr.clientHeight + 1;

        if (canScrollX || canScrollY) {
          return curr;
        }
        curr = curr.parentElement;
      }

      // 최상위 윈도우 스크롤 가능 여부 확인
      if (
        document.documentElement.scrollHeight > window.innerHeight + 1 ||
        document.documentElement.scrollWidth > window.innerWidth + 1
      ) {
        return document.documentElement;
      }

      return null;
    }

    function cleanupDrag() {
      if (activeContainer) {
        activeContainer.style.scrollBehavior = originalScrollBehavior;
      }
      if (isDragging) {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
      activeContainer = null;
      isDragging = false;
      hasMovedBeyondThreshold = false;
      window.removeEventListener("mousemove", onMouseMove);
    }

    function onMouseDown(e: MouseEvent) {
      // 마우스 좌클릭만 허용 (우클릭, 휠클릭 제외)
      if (e.button !== 0) return;

      cancelMomentum();

      const target = e.target as HTMLElement | null;
      if (isInteractiveOrEditable(target)) {
        return;
      }

      const container = findScrollableContainer(target);
      if (!container) return;

      activeContainer = container;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      velocityX = 0;
      velocityY = 0;
      initialScrollLeft = container.scrollLeft;
      initialScrollTop = container.scrollTop;
      isDragging = false;
      hasMovedBeyondThreshold = false;

      // smooth scroll이 켜져있으면 드래그 시 버벅이므로 auto로 임시 변경
      originalScrollBehavior = container.style.scrollBehavior;

      window.addEventListener("mousemove", onMouseMove, { passive: false });
      window.addEventListener("mouseup", onMouseUp, { once: true });
    }

    function onMouseMove(e: MouseEvent) {
      if (!activeContainer) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const distance = Math.hypot(deltaX, deltaY);

      // 6px 이상 이동했을 때 드래그 스크롤 활성화
      if (!hasMovedBeyondThreshold && distance > 6) {
        hasMovedBeyondThreshold = true;
        isDragging = true;
        activeContainer.style.scrollBehavior = "auto";
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";

        // 드래그 시작 시 우발적으로 발생한 텍스트 선택 클리어
        window.getSelection()?.removeAllRanges();
      }

      if (isDragging) {
        // 실제 스크롤 이동
        activeContainer.scrollLeft = initialScrollLeft - deltaX;
        activeContainer.scrollTop = initialScrollTop - deltaY;

        // 속도 계산 (최근 100ms 기준)
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 8) {
          velocityX = (e.clientX - lastX) / dt;
          velocityY = (e.clientY - lastY) / dt;
          lastX = e.clientX;
          lastY = e.clientY;
          lastTime = now;
        }

        // 드래그 스크롤 중일 때만 기본 동작(이미지 고스트 드래그 등) 방지
        e.preventDefault();
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);

      if (isDragging) {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        // 드래그 직후 발생하는 클릭 이벤트 1회 방지
        const captureClick = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
        };
        window.addEventListener("click", captureClick, { capture: true, once: true });

        // 관성 스크롤(Momentum scrolling) 시작
        if (activeContainer && (Math.abs(velocityX) > 0.15 || Math.abs(velocityY) > 0.15)) {
          const container = activeContainer;
          let vx = velocityX * 16; // px per frame
          let vy = velocityY * 16;

          function step() {
            if (!container) return;
            vx *= 0.92; // 감속 계수
            vy *= 0.92;

            container.scrollLeft -= vx;
            container.scrollTop -= vy;

            if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) {
              momentumRafRef.current = requestAnimationFrame(step);
            } else {
              container.style.scrollBehavior = originalScrollBehavior;
              momentumRafRef.current = null;
            }
          }
          momentumRafRef.current = requestAnimationFrame(step);
        } else if (activeContainer) {
          activeContainer.style.scrollBehavior = originalScrollBehavior;
        }
      }

      activeContainer = null;
      isDragging = false;
      hasMovedBeyondThreshold = false;
    }

    // 마우스 휠 조작 시 진행 중이던 관성 스크롤 취소
    function onWheel() {
      cancelMomentum();
    }

    // 브라우저의 기본 이미지/링크 고스트 드래그가 mousemove를 차단하는 현상 원천 방지
    function onDragStart(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("[draggable='true']")) {
        e.preventDefault();
      }
    }

    window.addEventListener("mousedown", onMouseDown, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("dragstart", onDragStart);

    return () => {
      cancelMomentum();
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);
}
