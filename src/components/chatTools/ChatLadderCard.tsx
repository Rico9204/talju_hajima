import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Avatar from "../Avatar";
import {
  createLadderData,
  type LadderData,
  type LadderLine,
  type LadderMatch,
} from "../../lib/chatTools";

export default function ChatLadderCard({
  data,
  onReveal,
}: {
  data: LadderData;
  onReveal: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const participants = data?.participants || [];
  const results = data?.results || [];

  // 사다리 가로선(좌우 연결선) 및 매칭 복원: lines가 비어있을 경우 자동 생성
  const { lines, matches, numSteps } = useMemo(() => {
    if (data?.lines && data.lines.length > 0) {
      return {
        lines: data.lines,
        matches: data.matches && data.matches.length > 0 ? data.matches : [],
        numSteps: data.numSteps || Math.max(participants.length * 2 + 2, 8),
      };
    }
    if (participants.length >= 2) {
      const generated = createLadderData({
        title: data?.title || "사다리타기",
        creatorId: data?.creatorId || "",
        creatorName: data?.creatorName || "",
        participants,
        results:
          results.length >= participants.length
            ? results
            : participants.map((_, i) => results[i] || `결과 ${i + 1}`),
        numSteps: data?.numSteps,
        shuffleResults: false,
      });
      return {
        lines: generated.lines,
        matches: generated.matches,
        numSteps: generated.numSteps,
      };
    }
    return {
      lines: [] as LadderLine[],
      matches: [] as LadderMatch[],
      numSteps: 8,
    };
  }, [
    data?.lines,
    data?.matches,
    data?.numSteps,
    data?.title,
    data?.creatorId,
    data?.creatorName,
    participants,
    results,
  ]);

  const numCols = participants.length;

  type TargetSelection = { type: "top" | "bottom"; col: number };

  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(
    data.revealed && numCols > 0 ? { type: "top", col: 0 } : null
  );
  const [showAllPaths, setShowAllPaths] = useState(false);
  const [isInstant, setIsInstant] = useState(data.revealed ? true : false);
  const [isCompleted, setIsCompleted] = useState(data.revealed ? true : false);
  const [animKey, setAnimKey] = useState(0);

  const isRevealed = data.revealed || showAllPaths;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const lastClickRef = useRef<{ type: "top" | "bottom"; col: number; time: number }>({
    type: "top",
    col: -1,
    time: 0,
  });

  function checkScrollability() {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }

  useEffect(() => {
    checkScrollability();
    const el = scrollRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => checkScrollability());
    observer.observe(el);

    return () => observer.disconnect();
  }, [numCols]);

  // 선택된 대상이 화면 밖으로 벗어났을 때 부드럽게 스크롤 중앙으로 이동
  useEffect(() => {
    if (!selectedTarget) return;
    const el = scrollRef.current;
    if (!el) return;
    const svgW = Math.max(numCols * 90, 280);
    const targetX = (selectedTarget.col + 1) * (svgW / (numCols + 1));
    const centerOffset = targetX - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, centerOffset), behavior: "smooth" });
  }, [selectedTarget, numCols]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const distance = direction === "left" ? -220 : 220;
    el.scrollBy({ left: distance, behavior: "smooth" });
  }

  function copyResults() {
    const summary = [
      `🪜 [사다리타기] ${data.title}`,
      "-------------------------",
      ...matches.map((m) => `${m.participantName} → ${m.resultText}`),
    ].join("\n");

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // 사다리 좌표 계산용
  const svgWidth = Math.max(numCols * 90, 280);
  const svgHeight = 240;
  const colSpacing = svgWidth / (numCols + 1);
  const stepSpacing = (svgHeight - 50) / (numSteps + 1);

  // 사다리 경로 계산 공통 함수
  const computeLadderPath = useCallback(
    (startCol: number, direction: "down" | "up") => {
      const points: { x: number; y: number }[] = [];
      let currentCol = startCol;

      if (direction === "down") {
        const startX = (currentCol + 1) * colSpacing;
        points.push({ x: startX, y: 10 });

        for (let step = 0; step < numSteps; step++) {
          const rungY = 25 + (step + 1) * stepSpacing;
          const curX = (currentCol + 1) * colSpacing;
          points.push({ x: curX, y: rungY });

          const rightLine = lines.find((l) => l.step === step && l.fromCol === currentCol);
          if (rightLine) {
            currentCol += 1;
            const nextX = (currentCol + 1) * colSpacing;
            points.push({ x: nextX, y: rungY });
            continue;
          }

          const leftLine = lines.find((l) => l.step === step && l.fromCol === currentCol - 1);
          if (leftLine) {
            currentCol -= 1;
            const nextX = (currentCol + 1) * colSpacing;
            points.push({ x: nextX, y: rungY });
            continue;
          }
        }

        const finalX = (currentCol + 1) * colSpacing;
        points.push({ x: finalX, y: svgHeight - 10 });
      } else {
        const startX = (currentCol + 1) * colSpacing;
        points.push({ x: startX, y: svgHeight - 10 });

        for (let step = numSteps - 1; step >= 0; step--) {
          const rungY = 25 + (step + 1) * stepSpacing;
          const curX = (currentCol + 1) * colSpacing;
          points.push({ x: curX, y: rungY });

          const rightLine = lines.find((l) => l.step === step && l.fromCol === currentCol);
          if (rightLine) {
            currentCol += 1;
            const nextX = (currentCol + 1) * colSpacing;
            points.push({ x: nextX, y: rungY });
            continue;
          }

          const leftLine = lines.find((l) => l.step === step && l.fromCol === currentCol - 1);
          if (leftLine) {
            currentCol -= 1;
            const nextX = (currentCol + 1) * colSpacing;
            points.push({ x: nextX, y: rungY });
            continue;
          }
        }

        const finalX = (currentCol + 1) * colSpacing;
        points.push({ x: finalX, y: 10 });
      }

      let totalLength = 0;
      for (let i = 0; i < points.length - 1; i++) {
        totalLength += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      }
      const d = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");

      return {
        direction,
        startCol,
        endCol: currentCol,
        points,
        d,
        totalLength,
      };
    },
    [colSpacing, lines, numSteps, stepSpacing, svgHeight]
  );

  // 모든 참가자의 전체 사다리 경로 목록
  const allParticipantPaths = useMemo(() => {
    return participants.map((p, col) => {
      const path = computeLadderPath(col, "down");
      return {
        ...path,
        color: p.color || "#3b82f6",
        participant: p,
      };
    });
  }, [computeLadderPath, participants]);

  // 개별 활성 경로 (상단 팀원 또는 하단 결과 클릭 시)
  const activePath = useMemo(() => {
    if (!selectedTarget || selectedTarget.col < 0 || selectedTarget.col >= numCols) {
      return null;
    }
    return computeLadderPath(selectedTarget.col, selectedTarget.type === "top" ? "down" : "up");
  }, [selectedTarget, numCols, computeLadderPath]);

  const participantColor = useMemo(() => {
    if (!activePath) return "#3b82f6";
    if (activePath.direction === "down") {
      return participants[activePath.startCol]?.color || "#3b82f6";
    } else {
      return participants[activePath.endCol]?.color || "#a855f7";
    }
  }, [activePath, participants]);

  const selectTarget = useCallback((target: TargetSelection, forceInstant: boolean = false) => {
    setShowAllPaths(false);
    setSelectedTarget(target);
    setIsInstant(forceInstant);
    setIsCompleted(forceInstant);
    setAnimKey((k) => k + 1);
  }, []);

  // 전체 결과 즉시보기 핸들러
  const handleShowAllResults = useCallback(() => {
    onReveal();
    setShowAllPaths(true);
    setSelectedTarget(null);
    setIsInstant(true);
    setIsCompleted(true);
  }, [onReveal]);

  // 전체 결과 보기 토글 핸들러
  const handleToggleAllResults = useCallback(() => {
    if (showAllPaths) {
      setShowAllPaths(false);
      selectTarget({ type: "top", col: 0 }, true);
    } else {
      handleShowAllResults();
    }
  }, [showAllPaths, handleShowAllResults, selectTarget]);

  // 상단 팀원 클릭 핸들러
  const handleTopClick = (idx: number) => {
    const now = Date.now();
    const isFastClick =
      lastClickRef.current.type === "top" &&
      lastClickRef.current.col === idx &&
      now - lastClickRef.current.time < 350;

    if (isFastClick) {
      lastClickRef.current = { type: "top", col: -1, time: 0 };
      selectTarget({ type: "top", col: idx }, true);
    } else {
      lastClickRef.current = { type: "top", col: idx, time: now };
      selectTarget({ type: "top", col: idx }, false);
    }
  };

  const handleTopDoubleClick = (idx: number) => {
    lastClickRef.current = { type: "top", col: -1, time: 0 };
    selectTarget({ type: "top", col: idx }, true);
  };

  // 하단 결과 클릭 핸들러 (밑에서부터 선이 거꾸로 올라감!)
  const handleBottomClick = (idx: number) => {
    const now = Date.now();
    const isFastClick =
      lastClickRef.current.type === "bottom" &&
      lastClickRef.current.col === idx &&
      now - lastClickRef.current.time < 350;

    if (isFastClick) {
      lastClickRef.current = { type: "bottom", col: -1, time: 0 };
      selectTarget({ type: "bottom", col: idx }, true);
    } else {
      lastClickRef.current = { type: "bottom", col: idx, time: now };
      selectTarget({ type: "bottom", col: idx }, false);
    }
  };

  const handleBottomDoubleClick = (idx: number) => {
    lastClickRef.current = { type: "bottom", col: -1, time: 0 };
    selectTarget({ type: "bottom", col: idx }, true);
  };

  function handleStartLadder() {
    onReveal();
    selectTarget({ type: "top", col: 0 }, false);
  }

  function handleNextParticipant() {
    const curCol = selectedTarget?.type === "top" ? selectedTarget.col : -1;
    const nextCol = (curCol + 1) % (numCols || 1);
    selectTarget({ type: "top", col: nextCol }, false);
  }

  const pathLen = Math.ceil(activePath?.totalLength || 1000);
  const durationSec = Math.min(Math.max(pathLen / 450, 0.8), 1.5);

  return (
    <div
      className="p-4 md:p-5 my-1.5 rounded-2xl border transition-all text-left max-w-xl w-full"
      style={{
        background: "var(--card-glass)",
        borderColor: "rgba(59, 130, 246, 0.35)",
        boxShadow: "0 8px 30px rgba(59, 130, 246, 0.08)",
        backdropFilter: "var(--panel-blur)",
        WebkitBackdropFilter: "var(--panel-blur)",
      }}
    >
      <style>{`
        @keyframes ladder-draw-line {
          from {
            stroke-dashoffset: var(--ladder-path-length, 1000);
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap pr-10">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}
          >
            <span>🪜</span>
            <span>사다리타기</span>
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            개설자: {data.creatorName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleToggleAllResults}
            className="text-xs font-bold px-2.5 py-1 rounded-full border transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm"
            style={{
              background: showAllPaths
                ? "linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(245, 158, 11, 0.25))"
                : "rgba(245, 158, 11, 0.12)",
              borderColor: showAllPaths ? "#f59e0b" : "rgba(245, 158, 11, 0.4)",
              color: "#d97706",
            }}
            title="모든 사다리 결과를 즉시 한눈에 확인합니다"
          >
            <span>⚡</span>
            <span>{showAllPaths ? "개별 보기" : "전체 결과 즉시보기"}</span>
          </button>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: isRevealed
                ? "var(--muted)"
                : "rgba(34, 197, 94, 0.15)",
              color: isRevealed ? "var(--muted-foreground)" : "#22c55e",
            }}
          >
            {isRevealed ? "결과 발표 완료" : "준비 완료"}
          </span>
        </div>
      </div>

      {/* 제목 및 조작 가이드 */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h4
          className="text-base font-bold"
          style={{ color: "var(--foreground)" }}
        >
          {data.title}
        </h4>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span>팀원/결과 클릭 시 선 이동 · 더블클릭 시 즉시 확인</span>
        </span>
      </div>

      {/* 전체 결과 즉시보기 모드 알림 바 */}
      {showAllPaths && (
        <div
          className="mb-3 px-3 py-2 rounded-xl text-xs flex items-center justify-between font-semibold transition-all animate-fadeIn"
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(168, 85, 247, 0.15))",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            color: "var(--foreground)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">⚡</span>
            <span className="truncate">
              <strong>전체 결과가 공개되었습니다!</strong> 모든 팀원의 사다리 경로가 표시됩니다.
            </span>
          </div>
          <button
            type="button"
            onClick={() => selectTarget({ type: "top", col: 0 }, false)}
            className="text-[11px] font-bold shrink-0 ml-2 px-2.5 py-1 rounded transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
            style={{
              background: "linear-gradient(135deg, #2563eb, #3b82f6)",
              color: "#ffffff",
            }}
          >
            한 명씩 타보기 ➔
          </button>
        </div>
      )}

      {/* 실시간 경로 추적 알림 바 (개별 선택 시) */}
      {!showAllPaths && activePath && (
        <div
          className="mb-3 px-3 py-2 rounded-xl text-xs flex items-center justify-between font-semibold transition-all animate-fadeIn"
          style={{
            background: `${participantColor}14`,
            border: `1px solid ${participantColor}35`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {activePath.direction === "down" ? (
              <Avatar
                url={
                  participants[activePath.startCol]?.avatarUrl ||
                  (participants[activePath.startCol]?.avatar?.startsWith("http") ||
                  participants[activePath.startCol]?.avatar?.startsWith("data:") ||
                  participants[activePath.startCol]?.avatar?.startsWith("/")
                    ? participants[activePath.startCol]?.avatar
                    : undefined)
                }
                initial={
                  participants[activePath.startCol]?.avatar &&
                  participants[activePath.startCol]?.avatar.length <= 2
                    ? participants[activePath.startCol]?.avatar
                    : participants[activePath.startCol]?.name.slice(0, 1) || "?"
                }
                color={participantColor}
                size={22}
                className="rounded-full shrink-0"
              />
            ) : (
              <span className="text-base shrink-0">🎯</span>
            )}
            <span className="truncate">
              {activePath.direction === "down" ? (
                isCompleted ? (
                  <>
                    <strong>{participants[activePath.startCol]?.name}</strong> 님이 사다리를 타고{" "}
                    <span className="font-bold underline" style={{ color: participantColor }}>
                      [{results[activePath.endCol] || "결과"}]
                    </span>{" "}
                    도착!
                  </>
                ) : (
                  <>
                    <strong>{participants[activePath.startCol]?.name}</strong> 님이 사다리를 타고 내려가는 중...
                  </>
                )
              ) : (
                isCompleted ? (
                  <>
                    [{results[activePath.startCol] || "결과"}]의 주인공은 바로{" "}
                    <span className="font-bold underline" style={{ color: participantColor }}>
                      <strong>{participants[activePath.endCol]?.name}</strong>
                    </span>{" "}
                    님! 🎉
                  </>
                ) : (
                  <>
                    [{results[activePath.startCol] || "결과"}]의 주인공을 찾는 중... (밑에서 올라가는 중 🏃‍♂️)
                  </>
                )
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => selectTarget(selectedTarget!, true)}
            className="text-[11px] font-bold shrink-0 ml-2 px-2 py-0.5 rounded transition-all hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              background: isCompleted ? `${participantColor}20` : `${participantColor}30`,
              color: participantColor,
              border: isCompleted ? "none" : `1px solid ${participantColor}50`,
            }}
            title={isCompleted ? undefined : "클릭하여 즉시 확인"}
          >
            {isCompleted ? "도착 완료 ✨" : "즉시 보기 ⏩"}
          </button>
        </div>
      )}

      {/* 사다리 시각화 영역 (양 끝 좌우 이동 버튼 지원) */}
      <div className="relative mb-3 group/ladder">
        {/* 좌측 이동 버튼 */}
        <button
          type="button"
          onClick={() => scroll("left")}
          disabled={!canScrollLeft}
          className={`absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            canScrollLeft
              ? "opacity-95 hover:opacity-100 hover:scale-110 active:scale-95 cursor-pointer shadow-lg"
              : "opacity-0 pointer-events-none"
          }`}
          style={{
            background: "var(--card)",
            border: "1.5px solid var(--border)",
            color: "var(--foreground)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",
          }}
          aria-label="왼쪽으로 사다리판 이동"
          title="왼쪽으로 이동"
        >
          ◀
        </button>

        {/* 우측 이동 버튼 */}
        <button
          type="button"
          onClick={() => scroll("right")}
          disabled={!canScrollRight}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            canScrollRight
              ? "opacity-95 hover:opacity-100 hover:scale-110 active:scale-95 cursor-pointer shadow-lg"
              : "opacity-0 pointer-events-none"
          }`}
          style={{
            background: "var(--card)",
            border: "1.5px solid var(--border)",
            color: "var(--foreground)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",
          }}
          aria-label="오른쪽으로 사다리판 이동"
          title="오른쪽으로 이동"
        >
          ▶
        </button>

        {/* 스크롤 컨테이너 */}
        <div
          ref={scrollRef}
          onScroll={checkScrollability}
          className="overflow-x-auto pb-2 scroll-smooth"
        >
          <div className="min-w-fit flex flex-col items-center px-4">
            {/* 상단 참가자 목록 (프로필 사진으로 통일, 텍스트 제거로 줄밀림 방지, 사다리 기둥과 1:1 수직 정렬) */}
            <div
              className="relative h-14 select-none mb-1 shrink-0"
              style={{ width: `${svgWidth}px`, minWidth: `${svgWidth}px` }}
            >
              {participants.map((p, idx) => {
                const isStart = selectedTarget?.type === "top" && selectedTarget.col === idx;
                const isDestArrived =
                  activePath?.direction === "up" && activePath.endCol === idx && isCompleted;
                const isSelected = isStart || isDestArrived;
                const pColor = p.color || "#3b82f6";
                const posX = (idx + 1) * colSpacing;

                return (
                  <div
                    key={p.id}
                    className="absolute top-0 -translate-x-1/2 flex flex-col items-center group/member"
                    style={{ left: `${posX}px` }}
                  >
                    {/* 마우스 호버 시 참가자 이름 툴팁 */}
                    <div
                      className="absolute -top-7 px-2 py-0.5 rounded-md text-[11px] font-bold text-white bg-black/85 backdrop-blur-sm pointer-events-none opacity-0 group-hover/member:opacity-100 transition-opacity duration-150 whitespace-nowrap z-30 shadow-md"
                      style={{ border: `1px solid ${pColor}60` }}
                    >
                      {p.name}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTopClick(idx)}
                      onDoubleClick={() => handleTopDoubleClick(idx)}
                      className={`relative rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center ${
                        isSelected
                          ? "scale-115 -translate-y-0.5"
                          : "hover:scale-105 opacity-85 hover:opacity-100"
                      }`}
                      style={{
                        padding: "3px",
                        background: isSelected
                          ? `linear-gradient(135deg, ${pColor}, #ffffff)`
                          : "transparent",
                        boxShadow: isSelected
                          ? `0 0 0 2px ${pColor}, 0 6px 14px ${pColor}50`
                          : "0 2px 6px rgba(0,0,0,0.12)",
                      }}
                      title={`${p.name} (클릭: 내려가기 / 더블클릭: 즉시 확인)`}
                      aria-label={`${p.name} 사다리 타기`}
                    >
                      <Avatar
                        url={
                          p.avatarUrl ||
                          (p.avatar?.startsWith("http") ||
                          p.avatar?.startsWith("data:") ||
                          p.avatar?.startsWith("/")
                            ? p.avatar
                            : undefined)
                        }
                        initial={
                          p.avatar && p.avatar.length <= 2
                            ? p.avatar
                            : p.name.slice(0, 1)
                        }
                        color={pColor}
                        size={38}
                        className="rounded-full shadow-inner"
                      />

                      {/* 상단에서 출발할 때 아래 화살표 인디케이터 */}
                      {isStart && (
                        <div
                          className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 pointer-events-none"
                          style={{ borderTopColor: pColor }}
                        />
                      )}

                      {/* 하단에서 올라와서 도착했을 때 상단 핑 인디케이터 */}
                      {isDestArrived && (
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-[10px] text-white flex items-center justify-center font-bold shadow-md animate-bounce">
                          ✓
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* SVG 사다리 */}
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full max-h-60 select-none my-1"
              style={{ minWidth: `${svgWidth}px` }}
            >
              {/* 기본 세로 기둥들 */}
              {participants.map((_, col) => {
                const x = (col + 1) * colSpacing;
                return (
                  <line
                    key={`v-${col}`}
                    x1={x}
                    y1={10}
                    x2={x}
                    y2={svgHeight - 10}
                    stroke="#000000"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                );
              })}

              {/* 기본 가로 사다리 발판들 */}
              {lines.map((line, idx) => {
                const x1 = (line.fromCol + 1) * colSpacing;
                const x2 = (line.fromCol + 2) * colSpacing;
                const y = 25 + (line.step + 1) * stepSpacing;
                return (
                  <line
                    key={`h-${idx}`}
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    stroke="#000000"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                );
              })}

              {/* 전체 결과 즉시보기 모드: 모든 참가자의 사다리 경로가 일제히 표시됨 */}
              {showAllPaths && (
                <g key="all-participant-paths">
                  {allParticipantPaths.map((pPath, i) => (
                    <g key={`all-p-${i}`}>
                      {/* 은은한 배경 선 */}
                      <path
                        d={pPath.d}
                        fill="none"
                        stroke={pPath.color}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.25"
                      />
                      {/* 메인 경로 선 */}
                      <path
                        d={pPath.d}
                        fill="none"
                        stroke={pPath.color}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.9"
                      />
                      {/* 하단 도착 지점 원형 마커 */}
                      <circle
                        cx={(pPath.endCol + 1) * colSpacing}
                        cy={svgHeight - 10}
                        r="6"
                        fill={pPath.color}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  ))}
                </g>
              )}

              {/* 활성화된 참가자의 줄 따라가기(Zigzag) 경로 오버레이 */}
              {!showAllPaths && activePath && (
                <g key={`path-${selectedTarget?.type}-${selectedTarget?.col}-${animKey}`}>
                  {/* 외곽 글로우 효과 (선 진행에 맞춰 함께 이동) */}
                  <path
                    d={activePath.d}
                    fill="none"
                    stroke={participantColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.25"
                    style={{
                      strokeDasharray: pathLen,
                      strokeDashoffset: isInstant ? 0 : undefined,
                      animation: isInstant
                        ? "none"
                        : `ladder-draw-line ${durationSec}s linear forwards`,
                      ["--ladder-path-length" as string]: `${pathLen}`,
                    }}
                  />
                  {/* 실제 사다리 경로 선 (애니메이션 탑승) */}
                  <path
                    d={activePath.d}
                    fill="none"
                    stroke={participantColor}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: pathLen,
                      strokeDashoffset: isInstant ? 0 : undefined,
                      animation: isInstant
                        ? "none"
                        : `ladder-draw-line ${durationSec}s linear forwards`,
                      ["--ladder-path-length" as string]: `${pathLen}`,
                    }}
                    onAnimationEnd={() => setIsCompleted(true)}
                  />
                  {/* 도착 지점 원형 마커 - 선이 끝에 도달했을 때(isCompleted)만 등장 */}
                  {isCompleted && (
                    <g>
                      <circle
                        cx={(activePath.endCol + 1) * colSpacing}
                        cy={activePath.direction === "down" ? svgHeight - 10 : 10}
                        r="8"
                        fill={participantColor}
                        className="animate-ping opacity-75"
                      />
                      <circle
                        cx={(activePath.endCol + 1) * colSpacing}
                        cy={activePath.direction === "down" ? svgHeight - 10 : 10}
                        r="6"
                        fill={participantColor}
                        stroke="#ffffff"
                        strokeWidth="2.5"
                      />
                    </g>
                  )}
                </g>
              )}
            </svg>

            {/* 하단 결과 목록 (사다리 기둥과 1:1 수직 정렬, 클릭 시 아래에서 위로 선 역추적) */}
            <div
              className="relative h-11 select-none mt-1 shrink-0"
              style={{ width: `${svgWidth}px`, minWidth: `${svgWidth}px` }}
            >
              {results.map((r, idx) => {
                const isStart = selectedTarget?.type === "bottom" && selectedTarget.col === idx;
                const isDestArrived =
                  activePath?.direction === "down" && activePath.endCol === idx && isCompleted;
                const isHighlight = isStart || isDestArrived;
                const posX = (idx + 1) * colSpacing;
                const itemWidth = Math.min(Math.max(colSpacing - 12, 54), 86);

                return (
                  <div
                    key={idx}
                    className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${posX}px` }}
                  >
                    <button
                      type="button"
                      onClick={() => handleBottomClick(idx)}
                      onDoubleClick={() => handleBottomDoubleClick(idx)}
                      className={`relative px-2 py-1 rounded-xl border text-center text-xs font-bold truncate transition-all duration-200 cursor-pointer ${
                        isHighlight ? "scale-110 shadow-lg -translate-y-0.5" : "hover:scale-105"
                      }`}
                      style={{
                        width: `${itemWidth}px`,
                        background: isHighlight
                          ? `${participantColor}25`
                          : isRevealed
                          ? "rgba(168, 85, 247, 0.12)"
                          : "var(--muted)",
                        borderColor: isHighlight
                          ? participantColor
                          : isRevealed
                          ? "rgba(168, 85, 247, 0.3)"
                          : "var(--border)",
                        color: isHighlight
                          ? participantColor
                          : isRevealed
                          ? "#a855f7"
                          : "var(--muted-foreground)",
                        boxShadow: isHighlight
                          ? `0 4px 14px ${participantColor}45`
                          : "none",
                      }}
                      title={`${r} (클릭: 밑에서 거꾸로 타기 / 더블클릭: 즉시 확인)`}
                      aria-label={`${r} 사다리 거꾸로 타기`}
                    >
                      {/* 아래에서 출발할 때 상향 화살표 인디케이터 */}
                      {isStart && (
                        <div
                          className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 pointer-events-none"
                          style={{ borderBottomColor: participantColor }}
                        />
                      )}
                      {isDestArrived && <span className="mr-0.5">🎯</span>}
                      {r}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 결과 매칭 표 (결과 공개 후 표시) */}
      {isRevealed && (
        <div
          className="p-3 mb-3 rounded-xl border space-y-1.5 animate-fadeIn"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div
            className="text-xs font-bold mb-2 flex items-center justify-between"
            style={{ color: "var(--foreground)" }}
          >
            <div className="flex items-center gap-1.5">
              <span>🎉</span>
              <span>최종 매칭 결과</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-normal">
              팀원/결과 클릭: 선 그리기 · 더블 클릭: 즉시 확인
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {matches.map((m) => {
              const pIndex = participants.findIndex((p) => p.id === m.participantId);
              const isSelected =
                (selectedTarget?.type === "top" && selectedTarget.col === pIndex) ||
                (activePath?.direction === "up" && activePath.endCol === pIndex);
              const pObj = participants[pIndex];
              const pColor = pObj?.color || "#3b82f6";
              return (
                <button
                  key={m.participantId}
                  type="button"
                  onClick={() => handleTopClick(pIndex)}
                  onDoubleClick={() => handleTopDoubleClick(pIndex)}
                  className="flex items-center justify-between p-2 rounded-lg text-left transition-all hover:scale-[1.02] cursor-pointer"
                  style={{
                    background: isSelected ? `${pColor}18` : "var(--muted)",
                    border: isSelected ? `1.5px solid ${pColor}` : "1px solid var(--border)",
                  }}
                >
                  <span
                    className="font-semibold flex items-center gap-2 truncate"
                    style={{ color: "var(--foreground)" }}
                  >
                    <Avatar
                      url={
                        pObj?.avatarUrl ||
                        (pObj?.avatar?.startsWith("http") ||
                        pObj?.avatar?.startsWith("data:") ||
                        pObj?.avatar?.startsWith("/")
                          ? pObj.avatar
                          : undefined)
                      }
                      initial={
                        pObj?.avatar && pObj.avatar.length <= 2
                          ? pObj.avatar
                          : m.participantName[0]
                      }
                      color={pColor}
                      size={20}
                      className="rounded-full shrink-0"
                    />
                    <span className="truncate">{m.participantName}</span>
                  </span>
                  <span className="font-bold shrink-0 ml-1" style={{ color: pColor }}>
                    → {m.resultText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div
        className="flex items-center justify-between gap-2 pt-3 border-t flex-wrap"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={copyResults}
          className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:bg-[var(--muted)] cursor-pointer"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        >
          {copied ? "✓ 복사 완료!" : "📋 결과 복사"}
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 전체 결과 즉시보기 버튼 */}
          <button
            type="button"
            onClick={handleToggleAllResults}
            className="text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer flex items-center gap-1.5"
            style={{
              background: showAllPaths
                ? "linear-gradient(135deg, #4b5563, #374151)"
                : "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#ffffff",
              boxShadow: "0 2px 10px rgba(245, 158, 11, 0.3)",
            }}
          >
            <span>⚡</span>
            <span>{showAllPaths ? "개별 사다리 보기" : "전체 결과 즉시보기"}</span>
          </button>

          {!isRevealed ? (
            <button
              type="button"
              onClick={handleStartLadder}
              className="text-xs px-4 py-1.5 rounded-lg font-bold transition-all shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "#ffffff",
              }}
            >
              사다리 타기 시작! ▶
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextParticipant}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:bg-[var(--muted)] cursor-pointer"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            >
              다음 팀원 보기 ➔
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

