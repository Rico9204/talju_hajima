import { useState, useMemo, useRef, useEffect } from "react";
import LadderIcon from "./LadderIcon"
import type { LadderData } from "../../lib/chatTools";

export default function ChatLadderCard({
  data,
  onReveal,
}: {
  data: LadderData;
  onReveal: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedCol, setSelectedCol] = useState<number | null>(
    data.revealed ? 0 : null
  );

  const numCols = data.participants.length;
  const numSteps = data.numSteps;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  // 선택된 참가자가 화면 밖으로 벗어났을 때 부드럽게 스크롤 중앙으로 이동
  useEffect(() => {
    if (selectedCol === null) return;
    const el = scrollRef.current;
    if (!el) return;
    const targetX = (selectedCol + 1) * (Math.max(numCols * 90, 280) / (numCols + 1));
    const centerOffset = targetX - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, centerOffset), behavior: "smooth" });
  }, [selectedCol, numCols]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const distance = direction === "left" ? -220 : 220;
    el.scrollBy({ left: distance, behavior: "smooth" });
  }

  function copyResults() {
    const summary = [
      `🔀 [사다리타기] ${data.title}`,
      "-------------------------",
      ...data.matches.map((m) => `${m.participantName} → ${m.resultText}`),
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

  // 사다리 가로선을 따라 이동하는 경로(Zigzag path) 계산 함수
  const activePath = useMemo(() => {
    if (selectedCol === null || selectedCol < 0 || selectedCol >= numCols) {
      return null;
    }

    const points: { x: number; y: number }[] = [];
    let currentCol = selectedCol;

    // 시작점 (상단)
    const startX = (currentCol + 1) * colSpacing;
    points.push({ x: startX, y: 10 });

    // 스텝별로 내려가며 가로선 만나면 꺾이기
    for (let step = 0; step < numSteps; step++) {
      const rungY = 25 + (step + 1) * stepSpacing;
      const curX = (currentCol + 1) * colSpacing;

      // 1. 해당 발판 높이까지 수직 하강
      points.push({ x: curX, y: rungY });

      // 2. 오른쪽으로 가는 선 확인 (currentCol -> currentCol + 1)
      const rightLine = data.lines.find(
        (l) => l.step === step && l.fromCol === currentCol
      );
      if (rightLine) {
        currentCol += 1;
        const nextX = (currentCol + 1) * colSpacing;
        points.push({ x: nextX, y: rungY });
        continue;
      }

      // 3. 왼쪽으로 가는 선 확인 (currentCol - 1 -> currentCol)
      const leftLine = data.lines.find(
        (l) => l.step === step && l.fromCol === currentCol - 1
      );
      if (leftLine) {
        currentCol -= 1;
        const nextX = (currentCol + 1) * colSpacing;
        points.push({ x: nextX, y: rungY });
        continue;
      }
    }

    // 4. 마지막 결과 바닥까지 수직 하강
    const finalX = (currentCol + 1) * colSpacing;
    points.push({ x: finalX, y: svgHeight - 10 });

    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    return { points, endCol: currentCol, d };
  }, [selectedCol, numCols, numSteps, data.lines, colSpacing, stepSpacing, svgHeight]);

  const selectedParticipant =
    selectedCol !== null ? data.participants[selectedCol] : null;
  const participantColor = selectedParticipant?.color || "#3b82f6";

  function handleStartLadder() {
    onReveal();
    if (selectedCol === null) {
      setSelectedCol(0);
    }
  }

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
        @keyframes ladder-draw-path {
          from {
            stroke-dashoffset: 1400;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}
          >
            <LadderIcon />
            <span>사다리타기</span>
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            개설자: {data.creatorName}
          </span>
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: data.revealed
              ? "var(--muted)"
              : "rgba(34, 197, 94, 0.15)",
            color: data.revealed ? "var(--muted-foreground)" : "#22c55e",
          }}
        >
          {data.revealed ? "결과 발표 완료" : "준비 완료"}
        </span>
      </div>

      {/* 제목 */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4
          className="text-base font-bold"
          style={{ color: "var(--foreground)" }}
        >
          {data.title}
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {data.revealed ? "팀원을 클릭해 경로를 확인하세요" : "팀원 클릭 시 경로 미리보기"}
        </span>
      </div>

      {/* 실시간 경로 추적 알림 바 */}
      {activePath && selectedParticipant && (
        <div
          className="mb-3 px-3 py-2 rounded-xl text-xs flex items-center justify-between font-semibold transition-all animate-fadeIn"
          style={{
            background: `${participantColor}14`,
            border: `1px solid ${participantColor}35`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0"
              style={{ background: participantColor }}
            >
              {selectedParticipant.avatar || selectedParticipant.name[0]}
            </span>
            <span className="truncate">
              <strong>{selectedParticipant.name}</strong> 님이 사다리를 타고{" "}
              <span className="font-bold underline" style={{ color: participantColor }}>
                [{data.results[activePath.endCol]}]
              </span>{" "}
              도착!
            </span>
          </div>
          <span
            className="text-[11px] font-bold shrink-0 ml-2 px-1.5 py-0.5 rounded"
            style={{ background: `${participantColor}20`, color: participantColor }}
          >
            경로 표시 중 ✨
          </span>
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
            {/* 상단 참가자 목록 (클릭 시 사다리 타기 경로 애니메이션) */}
            <div className="flex justify-around w-full px-2 mb-2 gap-2">
              {data.participants.map((p, idx) => {
                const isSelected = selectedCol === idx;
                const pColor = p.color || "#3b82f6";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedCol(isSelected ? null : idx)}
                    className="flex flex-col items-center min-w-16 px-1.5 py-1.5 rounded-xl transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: isSelected ? `${pColor}20` : "var(--muted)",
                      border: isSelected ? `2px solid ${pColor}` : "1px solid var(--border)",
                      boxShadow: isSelected ? `0 4px 12px ${pColor}30` : "none",
                    }}
                    title={`${p.name} 사다리 타기`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white mb-1 shadow-sm"
                      style={{ background: pColor }}
                    >
                      {p.avatar || p.name[0]}
                    </div>
                    <span
                      className="text-xs font-bold truncate max-w-16"
                      style={{ color: isSelected ? pColor : "var(--foreground)" }}
                    >
                      {p.name}
                    </span>
                  </button>
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
              {data.participants.map((_, col) => {
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
              {data.lines.map((line, idx) => {
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

              {/* 활성화된 참가자의 줄 따라가기(Zigzag) 경로 오버레이 */}
              {activePath && (
                <g key={`path-${selectedCol}`}>
                  {/* 외곽 글로우 효과 */}
                  <path
                    d={activePath.d}
                    fill="none"
                    stroke={participantColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.25"
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
                      strokeDasharray: 1400,
                      strokeDashoffset: 0,
                      animation: "ladder-draw-path 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
                    }}
                  />
                  {/* 도착 지점 원형 마커 */}
                  <circle
                    cx={(activePath.endCol + 1) * colSpacing}
                    cy={svgHeight - 10}
                    r="7"
                    fill={participantColor}
                    className="animate-ping opacity-75"
                  />
                  <circle
                    cx={(activePath.endCol + 1) * colSpacing}
                    cy={svgHeight - 10}
                    r="5.5"
                    fill={participantColor}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>

            {/* 하단 결과 목록 */}
            <div className="flex justify-around w-full px-2 mt-1 gap-2">
              {data.results.map((r, idx) => {
                const isDestination = activePath?.endCol === idx;
                return (
                  <div
                    key={idx}
                    className="min-w-16 px-2 py-1.5 rounded-xl border text-center text-xs font-bold truncate max-w-20 transition-all"
                    style={{
                      background: isDestination
                        ? `${participantColor}25`
                        : data.revealed
                        ? "rgba(168, 85, 247, 0.12)"
                        : "var(--muted)",
                      borderColor: isDestination
                        ? participantColor
                        : data.revealed
                        ? "rgba(168, 85, 247, 0.3)"
                        : "var(--border)",
                      color: isDestination
                        ? participantColor
                        : data.revealed
                        ? "#a855f7"
                        : "var(--muted-foreground)",
                      transform: isDestination ? "scale(1.08)" : "scale(1)",
                      boxShadow: isDestination
                        ? `0 4px 12px ${participantColor}35`
                        : "none",
                    }}
                  >
                    {isDestination && <span className="mr-0.5">🎯</span>}
                    {r}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 결과 매칭 표 (결과 공개 후 표시) */}
      {data.revealed && (
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
              팀원을 클릭해 이동 선을 확인해보세요
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {data.matches.map((m) => {
              const pIndex = data.participants.findIndex((p) => p.id === m.participantId);
              const isSelected = selectedCol === pIndex;
              const pObj = data.participants[pIndex];
              const pColor = pObj?.color || "#3b82f6";
              return (
                <button
                  key={m.participantId}
                  type="button"
                  onClick={() => setSelectedCol(pIndex)}
                  className="flex items-center justify-between p-2 rounded-lg text-left transition-all hover:scale-[1.02]"
                  style={{
                    background: isSelected ? `${pColor}18` : "var(--muted)",
                    border: isSelected ? `1.5px solid ${pColor}` : "1px solid transparent",
                  }}
                >
                  <span
                    className="font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: "var(--foreground)" }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold shrink-0"
                      style={{ background: pColor }}
                    >
                      {pObj?.avatar || m.participantName[0]}
                    </span>
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
          className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:bg-[var(--muted)]"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        >
          {copied ? "✓ 복사 완료!" : "📋 결과 복사"}
        </button>

        {!data.revealed ? (
          <button
            type="button"
            onClick={handleStartLadder}
            className="text-xs px-4 py-1.5 rounded-lg font-bold transition-all shadow-sm hover:opacity-90 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "#ffffff",
            }}
          >
            사다리 타기 시작!
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSelectedCol((prev) => ((prev ?? -1) + 1) % numCols)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:bg-[var(--muted)]"
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
  );
}
