import { useState } from "react"
import type { LuckyDrawData } from "../../lib/chatTools"

export default function ChatLuckyDrawCard({
  data,
  currentMemberId,
  currentMemberName,
  onPick,
  onRevealAll,
}: {
  data: LuckyDrawData
  currentMemberId: string
  currentMemberName: string
  onPick: (itemId: number) => void
  onRevealAll: () => void
}) {
  const [copied, setCopied] = useState(false)

  const items = data.items || []
  const total = (data as any)?.total ?? items.length
  const openedCount = items.filter(
    (it) => it.openedByMemberId || data.allRevealed,
  ).length
  const winnersCount = (data as any)?.winnerCount ?? items.filter((it) => it.isWinner).length
  const isFinished = Boolean(data.allRevealed || (total > 0 && openedCount === total))

  function copyResults() {
    const summary = [
      `🎯 [제비뽑기] ${data.title}`,
      `총 ${total}명 (당첨 ${winnersCount}명)`,
      "-------------------------",
      ...items.map((it, idx) => {
        const picker = it.openedByMemberName
          ? ` (${it.openedByMemberName})`
          : ""
        return `${idx + 1}번: ${it.label}${picker}`
      }),
    ].join("\n")

    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="p-4 md:p-5 my-1.5 rounded-2xl border transition-all text-left max-w-xl w-full"
      style={{
        background: "var(--card-glass)",
        borderColor: "rgba(234, 179, 8, 0.35)",
        boxShadow: "0 8px 30px rgba(234, 179, 8, 0.08)",
        backdropFilter: "var(--panel-blur)",
        WebkitBackdropFilter: "var(--panel-blur)",
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap pr-10">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: "rgba(234, 179, 8, 0.15)", color: "#eab308" }}
          >
            <span>🎯</span>
            <span>제비뽑기</span>
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            개설자: {data.creatorName}
          </span>
        </div>
        <div
          className="text-xs font-semibold"
          style={{ color: "var(--muted-foreground)" }}
        >
          {openedCount} / {total}개 확인됨
        </div>
      </div>

      {/* 제목 */}
      <h4
        className="text-base font-bold mb-3.5"
        style={{ color: "var(--foreground)" }}
      >
        {data.title}
      </h4>

      {/* 제비 카드 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mb-4">
        {items.map((item, idx) => {
          const isOpened = !!item.openedByMemberId || data.allRevealed
          const isMyPick = item.openedByMemberId === currentMemberId

          if (isOpened) {
            return (
              <div
                key={item.id}
                className="p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all animate-fadeIn"
                style={{
                  background: item.isWinner
                    ? "linear-gradient(135deg, rgba(234, 179, 8, 0.18), rgba(249, 115, 22, 0.18))"
                    : "var(--card)",
                  borderColor: item.isWinner
                    ? "rgba(234, 179, 8, 0.5)"
                    : "var(--border)",
                }}
              >
                <span className="text-lg mb-1">
                  {item.isWinner ? "🎉" : "💨"}
                </span>
                <span
                  className={`text-xs font-bold ${
                    item.isWinner ? "text-amber-500" : ""
                  }`}
                  style={{
                    color: item.isWinner ? "#f59e0b" : "var(--foreground)",
                  }}
                >
                  {item.label}
                </span>
                {item.openedByMemberName && (
                  <span
                    className="text-[10px] mt-1.5 px-1.5 py-0.5 rounded font-medium truncate max-w-full"
                    style={{
                      background: isMyMyPick(
                        item.openedByMemberId,
                        currentMemberId,
                      )
                        ? "rgba(59, 130, 246, 0.15)"
                        : "var(--muted)",
                      color: isMyMyPick(item.openedByMemberId, currentMemberId)
                        ? "#3b82f6"
                        : "var(--muted-foreground)",
                    }}
                  >
                    {isMyPick ? "나의 선택" : item.openedByMemberName}
                  </span>
                )}
              </div>
            )
          }

          return (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              className="p-3.5 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:scale-105 active:scale-95 group"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
              title="클릭하여 제비 확인"
            >
              <span className="text-lg mb-1 group-hover:rotate-12 transition-transform">
                🎁
              </span>
              <span
                className="text-xs font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {idx + 1}번 제비
              </span>
              <span
                className="text-[10px] mt-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                클릭해서 열기
              </span>
            </button>
          )
        })}
      </div>

      {/* 하단 액션 바 */}
      <div
        className="flex items-center justify-between gap-2 pt-3 border-t flex-wrap"
        style={{ borderColor: "var(--border)" }}
      >
        <button
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

        {!isFinished && (
          <button
            onClick={onRevealAll}
            className="text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-sm hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #eab308, #f97316)",
              color: "#ffffff",
            }}
          >
            전체 결과 한 번에 공개
          </button>
        )}
      </div>
    </div>
  )
}

function isMyMyPick(id?: string, currentId?: string) {
  return !!id && id === currentId
}
