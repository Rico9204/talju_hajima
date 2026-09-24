import { useState, useRef, useEffect } from "react";
import type { RouletteData } from "../../lib/chatTools";

export default function ChatRouletteCard({
  data,
  currentMemberId,
  currentMemberName,
  onSpin,
}: {
  data: RouletteData;
  currentMemberId: string;
  currentMemberName: string;
  onSpin: (winnerOptionId: string, targetAngle: number) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(data.targetAngle || 0);
  const [copied, setCopied] = useState(false);
  const [localWinnerId, setLocalWinnerId] = useState<string | null>(
    data.winnerOptionId || null
  );

  const numOptions = data.options.length;
  const sliceAngle = 360 / numOptions;
  const wheelRef = useRef<HTMLDivElement>(null);

  // Sync if another member already spun
  useEffect(() => {
    if (data.spinned && data.targetAngle !== undefined) {
      setRotation(data.targetAngle);
      setLocalWinnerId(data.winnerOptionId);
    }
  }, [data.spinned, data.targetAngle, data.winnerOptionId]);

  function handleSpin() {
    if (spinning || data.spinned) return;

    setSpinning(true);

    // 1. 당첨자 랜덤 선정
    const winnerIdx = Math.floor(Math.random() * numOptions);
    const winnerOption = data.options[winnerIdx];

    // 2. 바퀴가 멈췄을 때 12시 방향(상단 270도 혹은 0도)에 당첨 슬라이스가 위치하도록 회전 각도 계산
    // 슬라이스 i의 중심각도: (i + 0.5) * sliceAngle (12시 방향 기준)
    const centerSliceAngle = (winnerIdx + 0.5) * sliceAngle;
    // 슬라이스 중심이 12시(0도)에 오도록 회전해야 하는 각도 = (360 - centerSliceAngle)
    const normalizedTarget = (360 - centerSliceAngle + 360) % 360;

    // 약간의 랜덤 오프셋 (정중앙에서 ±25% 이내 살짝 비껴가게)
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.5);

    // 최소 5바퀴 ~ 8바퀴 돌리기
    const extraSpins = (5 + Math.floor(Math.random() * 3)) * 360;
    const currentBase = Math.floor(rotation / 360) * 360;
    const finalAngle = currentBase + extraSpins + normalizedTarget + jitter;

    setRotation(finalAngle);

    // 회전 애니메이션 종료(4초) 후 결과 확정
    setTimeout(() => {
      setSpinning(false);
      setLocalWinnerId(winnerOption.id);
      onSpin(winnerOption.id, finalAngle);
    }, 4100);
  }

  const activeWinner = data.options.find(
    (o) => o.id === (data.winnerOptionId || localWinnerId)
  );

  function copyResults() {
    if (!activeWinner) return;
    const summary = [
      `🎡 [돌림판] ${data.title}`,
      "-------------------------",
      `🎉 당첨: ${activeWinner.text}`,
      `진행: ${data.spinnedByMemberName || currentMemberName}`,
    ].join("\n");

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // SVG 원형 부채꼴 경로(Path) 생성 함수 (중심 150, 150, 반지름 140)
  const size = 300;
  const center = size / 2;
  const radius = 135;

  return (
    <div
      className="p-4 md:p-6 my-1.5 rounded-2xl border transition-all text-left max-w-xl w-full"
      style={{
        background: "var(--card-glass)",
        borderColor: "rgba(245, 158, 11, 0.35)",
        boxShadow: "0 8px 30px rgba(245, 158, 11, 0.08)",
        backdropFilter: "var(--panel-blur)",
        WebkitBackdropFilter: "var(--panel-blur)",
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
            style={{
              background: "rgba(245, 158, 11, 0.15)",
              color: "#d97706",
            }}
          >
            <span>🎡</span>
            <span>돌림판 룰렛</span>
          </span>
          <span className="text-xs text-muted-foreground">
            생성자: {data.creatorName}
          </span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: data.spinned || localWinnerId
              ? "var(--muted)"
              : "rgba(34, 197, 94, 0.15)",
            color: data.spinned || localWinnerId
              ? "var(--muted-foreground)"
              : "#22c55e",
          }}
        >
          {data.spinned || localWinnerId ? "결과 발표 완료" : "준비 완료"}
        </span>
      </div>

      {/* 제목 */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <h4
          className="text-base font-bold"
          style={{ color: "var(--foreground)" }}
        >
          {data.title}
        </h4>
        <span className="text-xs text-muted-foreground">
          총 {numOptions}개 항목
        </span>
      </div>

      {/* 당첨 결과 알림 배너 */}
      {activeWinner && !spinning && (
        <div
          className="mb-4 p-3.5 rounded-2xl text-center font-bold border transition-all animate-bounce"
          style={{
            background: `${activeWinner.color}15`,
            borderColor: `${activeWinner.color}50`,
          }}
        >
          <div className="text-xs text-muted-foreground mb-0.5">
            🎉 축하합니다! 당첨 결과:
          </div>
          <div
            className="text-lg md:text-xl font-extrabold"
            style={{ color: activeWinner.color }}
          >
            [{activeWinner.text}]
          </div>
          {data.spinnedByMemberName && (
            <div className="text-[11px] text-muted-foreground mt-1">
              돌린 팀원: {data.spinnedByMemberName}
            </div>
          )}
        </div>
      )}

      {/* 룰렛 휠 시각화 영역 */}
      <div className="relative flex flex-col items-center justify-center my-3 select-none">
        {/* 상단 화살표 핀 (Pointer Pin) */}
        <div
          className="absolute -top-3 z-30 flex flex-col items-center pointer-events-none drop-shadow-md"
          style={{ transform: "translateY(2px)" }}
        >
          <div
            className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px]"
            style={{ borderTopColor: "#ef4444" }}
          />
          <div className="w-2.5 h-2.5 rounded-full bg-red-600 -mt-1 shadow-sm" />
        </div>

        {/* 회전하는 돌림판 원형 본체 */}
        <div
          ref={wheelRef}
          className="relative rounded-full shadow-xl overflow-hidden"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4s cubic-bezier(0.12, 0.85, 0.18, 1)"
              : "none",
          }}
        >
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-full h-full"
            style={{ transform: "rotate(-90deg)" }} // 0도를 12시 방향(상단)으로 정렬
          >
            {data.options.map((opt, idx) => {
              const startAngle = (idx * sliceAngle * Math.PI) / 180;
              const endAngle = ((idx + 1) * sliceAngle * Math.PI) / 180;
              const x1 = center + radius * Math.cos(startAngle);
              const y1 = center + radius * Math.sin(startAngle);
              const x2 = center + radius * Math.cos(endAngle);
              const y2 = center + radius * Math.sin(endAngle);
              const largeArcFlag = sliceAngle > 180 ? 1 : 0;

              const pathData = [
                `M ${center} ${center}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                "Z",
              ].join(" ");

              // 텍스트 위치 계산 (중심과 외곽 사이 65% 지점)
              const midAngle = startAngle + (endAngle - startAngle) / 2;
              const textR = radius * 0.65;
              const textX = center + textR * Math.cos(midAngle);
              const textY = center + textR * Math.sin(midAngle);
              const textRotate = (midAngle * 180) / Math.PI + 90;

              return (
                <g key={opt.id}>
                  {/* 부채꼴 조각 */}
                  <path
                    d={pathData}
                    fill={opt.color}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                  {/* 조각 텍스트 */}
                  <text
                    x={textX}
                    y={textY}
                    fill="#ffffff"
                    fontSize={numOptions > 8 ? "11" : "13"}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${textRotate}, ${textX}, ${textY})`}
                    style={{
                      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                    }}
                  >
                    {opt.text.length > 7
                      ? `${opt.text.slice(0, 6)}…`
                      : opt.text}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* 중앙 허브 장식 캡 */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-white"
            style={{
              background: "var(--card)",
              color: "var(--foreground)",
            }}
          >
            <span className="text-base font-extrabold">🎡</span>
          </div>
        </div>
      </div>

      {/* 컨트롤 버튼부 */}
      <div className="mt-5 space-y-2">
        {!data.spinned && !localWinnerId ? (
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning}
            className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
              spinning ? "opacity-75 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]"
            }`}
            style={{
              background: "linear-gradient(135deg, #f59e0b, #ea580c)",
            }}
          >
            <span>🎡</span>
            <span>{spinning ? "돌림판 회전 중... 💨" : "돌림판 힘차게 돌리기!"}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyResults}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[var(--muted)]"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <span>{copied ? "✓ 복사 완료!" : "📋 결과 복사하기"}</span>
            </button>
          </div>
        )}
      </div>

      {/* 항목 목록 배지 */}
      <div className="mt-4 pt-3 border-t border-[var(--border)]">
        <div className="text-[11px] font-bold text-muted-foreground mb-1.5">
          등록된 항목 ({numOptions}개)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.options.map((opt) => {
            const isWinner = opt.id === (data.winnerOptionId || localWinnerId);
            return (
              <span
                key={opt.id}
                className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 border transition-all"
                style={{
                  background: isWinner ? `${opt.color}25` : "var(--muted)",
                  borderColor: isWinner ? opt.color : "transparent",
                  color: isWinner ? opt.color : "var(--foreground)",
                  fontWeight: isWinner ? "bold" : "normal",
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: opt.color }}
                />
                <span>{opt.text}</span>
                {isWinner && <span className="text-[10px]">👑</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
