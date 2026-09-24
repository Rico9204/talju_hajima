import { useState, useEffect } from "react"
import LadderIcon from "./LadderIcon"
import type { Member } from "../../api/types"
import {
  type ChatToolPayload,
  createLuckyDrawData,
  createLadderData,
  createChatPollData,
  createRouletteData,
} from "../../lib/chatTools"

type ToolTab = "draw" | "ladder" | "poll" | "roulette"

export default function ChatToolModal({
  open,
  initialTab = "draw",
  onClose,
  teamMembers,
  currentMemberId,
  currentMemberName,
  onSendTool,
}: {
  open: boolean
  initialTab?: ToolTab
  onClose: () => void
  teamMembers: Member[]
  currentMemberId: string
  currentMemberName: string
  onSendTool: (payload: ChatToolPayload) => void
}) {
  const [tab, setTab] = useState<ToolTab>(initialTab)

  useEffect(() => {
    if (open) {
      setTab(initialTab)
    }
  }, [open, initialTab])

  // --- 제비뽑기 State ---
  const [drawTitle, setDrawTitle] = useState("오늘의 역할 / 당첨 제비뽑기")
  const [drawTotalCount, setDrawTotalCount] = useState(
    Math.max(teamMembers.length, 2),
  )
  const [drawWinnerCount, setDrawWinnerCount] = useState(1)
  const [useCustomDrawItems, setUseCustomDrawItems] = useState(false)
  const [customDrawItems, setCustomDrawItems] = useState<string[]>([
    "당첨 🎉",
    "꽝 💨",
  ])

  // --- 사다리타기 State ---
  const [ladderTitle, setLadderTitle] = useState("역할 분담 사다리타기")
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    teamMembers.map((m) => m.id),
  )
  const [ladderResults, setLadderResults] = useState<string[]>(
    teamMembers.map((_, i) =>
      i === 0
        ? "발표자 🎤"
        : i === 1
          ? "자료조사 📚"
          : i === 2
            ? "PPT 제작 💻"
            : `역할 ${i + 1}`,
    ),
  )

  // --- 돌림판 State ---
  const [rouletteTitle, setRouletteTitle] = useState("오늘의 역할 / 간식 내기 돌림판")
  const [rouletteOptions, setRouletteOptions] = useState<string[]>([
    "커피 쏘기 ☕",
    "간식 사기 🍪",
    "면제 🎉",
    "다음 기회에 ✨",
  ])

  // --- 투표 State ---
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false)
  const [pollIsAnonymous, setPollIsAnonymous] = useState(false)
  const [pollDeadlinePreset, setPollDeadlinePreset] = useState<string>("none")
  const [pollCustomDeadline, setPollCustomDeadline] = useState<string>("")

  if (!open) return null

  // --- Submit Handlers ---
  function handleCreateDraw() {
    if (useCustomDrawItems) {
      const valid = customDrawItems.map((s) => s.trim()).filter(Boolean)
      if (valid.length < 2) {
        alert("최소 2개 이상의 제비 항목을 입력해주세요.")
        return
      }
      const data = createLuckyDrawData({
        title: drawTitle,
        creatorId: currentMemberId,
        creatorName: currentMemberName,
        totalCount: valid.length,
        winnerCount: 1,
        customItems: valid.map((label, idx) => ({
          label,
          isWinner: idx === 0,
        })),
      })
      onSendTool({ type: "draw", data })
    } else {
      const data = createLuckyDrawData({
        title: drawTitle,
        creatorId: currentMemberId,
        creatorName: currentMemberName,
        totalCount: drawTotalCount,
        winnerCount: drawWinnerCount,
      })
      onSendTool({ type: "draw", data })
    }
    onClose()
  }

  function handleCreateRoulette() {
    const valid = rouletteOptions.map((t) => t.trim()).filter(Boolean)
    if (valid.length < 2) {
      alert("돌림판 항목을 최소 2개 이상 입력해주세요.")
      return
    }
    const data = createRouletteData(
      rouletteTitle,
      valid,
      currentMemberId,
      currentMemberName,
    )
    onSendTool({ type: "roulette", data })
    onClose()
  }

  function handleCreateLadder() {
    const participants = teamMembers
      .filter((m) => selectedMemberIds.includes(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        color: m.color || "#3b82f6",
      }))

    if (participants.length < 2) {
      alert("사다리타기는 최소 2명 이상의 참가자가 필요합니다.")
      return
    }

    const trimmedResults = ladderResults
      .slice(0, participants.length)
      .map((r, i) => r.trim() || `결과 ${i + 1}`)

    const data = createLadderData({
      title: ladderTitle,
      creatorId: currentMemberId,
      creatorName: currentMemberName,
      participants,
      results: trimmedResults,
    })
    onSendTool({ type: "ladder", data })
    onClose()
  }

  function handleCreatePoll() {
    if (!pollQuestion.trim()) {
      alert("투표 질문을 입력해주세요.")
      return
    }
    const valid = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (valid.length < 2) {
      alert("최소 2개 이상의 투표 항목을 입력해주세요.")
      return
    }

    let expiresAt: string | null = null
    const now = Date.now()
    if (pollDeadlinePreset === "10m") expiresAt = new Date(now + 10 * 60 * 1000).toISOString()
    else if (pollDeadlinePreset === "30m") expiresAt = new Date(now + 30 * 60 * 1000).toISOString()
    else if (pollDeadlinePreset === "1h") expiresAt = new Date(now + 60 * 60 * 1000).toISOString()
    else if (pollDeadlinePreset === "3h") expiresAt = new Date(now + 3 * 60 * 60 * 1000).toISOString()
    else if (pollDeadlinePreset === "24h") expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString()
    else if (pollDeadlinePreset === "custom" && pollCustomDeadline) {
      const parsed = new Date(pollCustomDeadline)
      if (!isNaN(parsed.getTime())) {
        if (parsed.getTime() <= now) {
          alert("마감 시간은 현재 시간 이후로 설정해주세요.")
          return
        }
        expiresAt = parsed.toISOString()
      }
    }

    const data = createChatPollData({
      question: pollQuestion,
      creatorId: currentMemberId,
      creatorName: currentMemberName,
      options: valid,
      allowMultiple: pollAllowMultiple,
      isAnonymous: pollIsAnonymous,
      expiresAt,
    })
    onSendTool({ type: "poll", data })
    onClose()
  }

  function toggleMemberForLadder(memberId: string) {
    setSelectedMemberIds((prev) => {
      const next = prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
      // Keep results length in sync
      if (next.length > ladderResults.length) {
        setLadderResults((r) => [...r, `역할 ${next.length}`])
      }
      return next
    })
  }

  const isPollMode = initialTab === "poll"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 md:p-6 rounded-3xl border shadow-2xl transition-all"
        style={{
          background: "var(--card-glass)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        {/* 헤더 (투표 모드와 미니게임 모드 완전 분리) */}
        <div
          className="flex items-center justify-between pb-4 border-b mb-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{isPollMode ? "📊" : "🎮"}</span>
            <h3
              className="text-base font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {isPollMode ? "채팅 투표 만들기" : "미니게임"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold hover:bg-[var(--muted)]"
            style={{ color: "var(--muted-foreground)" }}
          >
            ✕
          </button>
        </div>

        {/* 미니게임 모드: 오버레이 상단에서 3가지 미니게임(사다리타기, 제비뽑기, 돌림판) 선택 */}
        {!isPollMode && (
          <div className="mb-5">
            <div
              className="text-[11px] font-bold mb-2 flex items-center justify-between"
              style={{ color: "var(--muted-foreground)" }}
            >
              <span>🎮 플레이할 미니게임을 선택하세요</span>
              <span className="text-[10px] font-normal">탭하여 게임 변경</span>
            </div>
            <div
              className="grid grid-cols-3 gap-2 p-1 rounded-2xl"
              style={{ background: "var(--muted)" }}
            >
              <button
                type="button"
                onClick={() => setTab("ladder")}
                className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${tab === "ladder"
                    ? "bg-[var(--card)] shadow-md border-blue-500 scale-[1.01]"
                    : "border-transparent hover:bg-[var(--card)]/50 opacity-70 hover:opacity-100"
                  }`}
              >
                <div className="flex items-center gap-1">
                  <LadderIcon className="text-lg" size="1.125rem" />
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: tab === "ladder" ? "#2563eb" : "var(--foreground)",
                    }}
                  >
                    사다리타기
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground truncate">
                  역할·순서 정하기
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTab("draw")}
                className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${tab === "draw"
                    ? "bg-[var(--card)] shadow-md border-amber-500 scale-[1.01]"
                    : "border-transparent hover:bg-[var(--card)]/50 opacity-70 hover:opacity-100"
                  }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-lg">🎯</span>
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: tab === "draw" ? "#d97706" : "var(--foreground)",
                    }}
                  >
                    제비뽑기
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground truncate">
                  당첨·벌칙 추첨
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTab("roulette")}
                className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${tab === "roulette"
                    ? "bg-[var(--card)] shadow-md border-orange-500 scale-[1.01]"
                    : "border-transparent hover:bg-[var(--card)]/50 opacity-70 hover:opacity-100"
                  }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-lg">🎡</span>
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: tab === "roulette" ? "#ea580c" : "var(--foreground)",
                    }}
                  >
                    돌림판
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground truncate">
                  행운의 룰렛
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 1. 제비뽑기 패널 */}
        {tab === "draw" && (
          <div className="space-y-4 text-xs">
            <div>
              <label
                className="block font-bold mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                뽑기 주제
              </label>
              <input
                value={drawTitle}
                onChange={(e) => setDrawTitle(e.target.value)}
                placeholder="예: 오늘 발표자 1명 뽑기, 커피 쏠 사람"
                className="w-full px-3.5 py-2.5 rounded-xl border outline-none text-xs md:text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="customDrawCheck"
                checked={useCustomDrawItems}
                onChange={(e) => setUseCustomDrawItems(e.target.checked)}
                className="rounded"
              />
              <label
                htmlFor="customDrawCheck"
                className="cursor-pointer font-medium"
                style={{ color: "var(--foreground)" }}
              >
                직접 제비 항목 입력하기 (미선택 시 당첨/꽝 자동 생성)
              </label>
            </div>

            {useCustomDrawItems ? (
              <div
                className="space-y-2 p-3 rounded-xl border"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-center justify-between font-bold mb-1">
                  <span>제비 목록</span>
                  {customDrawItems.length < 10 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCustomDrawItems([...customDrawItems, ""])
                      }
                      className="text-amber-500 hover:underline"
                    >
                      + 항목 추가
                    </button>
                  )}
                </div>
                {customDrawItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className="w-5 text-center font-bold"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {idx + 1}
                    </span>
                    <input
                      value={item}
                      onChange={(e) => {
                        const next = [...customDrawItems]
                        next[idx] = e.target.value
                        setCustomDrawItems(next)
                      }}
                      placeholder={`제비 ${idx + 1}`}
                      className="flex-1 px-3 py-1.5 rounded-lg border outline-none"
                      style={{
                        background: "var(--muted)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    />
                    {customDrawItems.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCustomDrawItems(
                            customDrawItems.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-red-500 font-bold px-1.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid grid-cols-2 gap-3 p-3 rounded-xl border"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div>
                  <label
                    className="block font-bold mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    총 제비 개수
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={drawTotalCount}
                    onChange={(e) =>
                      setDrawTotalCount(Math.max(2, Number(e.target.value)))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border outline-none"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block font-bold mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    당첨 개수
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={drawTotalCount - 1}
                    value={drawWinnerCount}
                    onChange={(e) =>
                      setDrawWinnerCount(
                        Math.min(
                          drawTotalCount - 1,
                          Math.max(1, Number(e.target.value)),
                        ),
                      )
                    }
                    className="w-full px-3 py-1.5 rounded-lg border outline-none"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleCreateDraw}
              className="w-full py-2.5 rounded-xl font-bold text-white transition-all shadow-md mt-2"
              style={{
                background: "linear-gradient(135deg, #eab308, #f97316)",
              }}
            >
              제비뽑기 채팅에 보내기
            </button>
          </div>
        )}

        {/* 2. 사다리타기 패널 */}
        {tab === "ladder" && (
          <div className="space-y-4 text-xs">
            <div>
              <label
                className="block font-bold mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                사다리 주제
              </label>
              <input
                value={ladderTitle}
                onChange={(e) => setLadderTitle(e.target.value)}
                placeholder="예: 역할 분담 사다리타기, 점심 쏘기"
                className="w-full px-3.5 py-2.5 rounded-xl border outline-none text-xs md:text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            {/* 참가자 선택 */}
            <div>
              <label
                className="block font-bold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                참가 팀원 선택 ({selectedMemberIds.length}명 선택됨)
              </label>
              <div className="flex flex-wrap gap-2">
                {teamMembers.map((m) => {
                  const selected = selectedMemberIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMemberForLadder(m.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
                      style={{
                        background: selected
                          ? "rgba(59, 130, 246, 0.15)"
                          : "var(--card)",
                        borderColor: selected ? "#3b82f6" : "var(--border)",
                        color: selected ? "#3b82f6" : "var(--foreground)",
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ background: m.color || "#3b82f6" }}
                      >
                        {m.avatar || m.name[0]}
                      </span>
                      <span className="font-semibold">{m.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 결과 입력란 */}
            <div
              className="p-3 rounded-xl border space-y-2"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="font-bold mb-1"
                style={{ color: "var(--foreground)" }}
              >
                하단 결과 항목 ({selectedMemberIds.length}개 필요)
              </div>
              {Array.from({ length: selectedMemberIds.length }).map(
                (_, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className="w-16 text-center font-medium truncate"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      결과 {idx + 1}
                    </span>
                    <input
                      value={ladderResults[idx] || ""}
                      onChange={(e) => {
                        const next = [...ladderResults]
                        next[idx] = e.target.value
                        setLadderResults(next)
                      }}
                      placeholder={`예: 역할 ${idx + 1}`}
                      className="flex-1 px-3 py-1.5 rounded-lg border outline-none"
                      style={{
                        background: "var(--muted)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    />
                  </div>
                ),
              )}
            </div>

            <button
              onClick={handleCreateLadder}
              className="w-full py-2.5 rounded-xl font-bold text-white transition-all shadow-md mt-2"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              }}
            >
              사다리타기 채팅에 보내기
            </button>
          </div>
        )}

        {/* 3. 돌림판 패널 */}
        {tab === "roulette" && (
          <div className="space-y-4 text-xs">
            <div>
              <label
                className="block font-bold mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                돌림판 제목
              </label>
              <input
                value={rouletteTitle}
                onChange={(e) => setRouletteTitle(e.target.value)}
                placeholder="예: 오늘의 간식 내기 돌림판"
                className="w-full px-3.5 py-2.5 rounded-xl border outline-none text-xs md:text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            {/* 빠른 추천 프리셋 */}
            <div className="space-y-1.5">
              <label
                className="block font-bold"
                style={{ color: "var(--foreground)" }}
              >
                빠른 프리셋 적용
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setRouletteOptions(teamMembers.map((m) => m.name))
                  }
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-[var(--muted)] cursor-pointer"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  👥 팀원 이름 채우기 ({teamMembers.length}명)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRouletteOptions([
                      "커피 쏘기 ☕",
                      "간식 사기 🍪",
                      "면제 🎉",
                      "다음 기회에 ✨",
                    ])
                  }
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-[var(--muted)] cursor-pointer"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  ☕ 커피 / 간식 내기
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRouletteOptions([
                      "발표자 🎤",
                      "PPT 제작 💻",
                      "자료조사 📚",
                      "회의록 작성 ✍️",
                    ])
                  }
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-[var(--muted)] cursor-pointer"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  🎤 역할 / 발표 분담
                </button>
              </div>
            </div>

            {/* 항목 입력 목록 */}
            <div
              className="p-3 rounded-xl border space-y-2"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between font-bold mb-1">
                <span>돌림판 슬라이스 항목 (최소 2개, 최대 10개)</span>
                {rouletteOptions.length < 10 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRouletteOptions([
                        ...rouletteOptions,
                        `항목 ${rouletteOptions.length + 1}`,
                      ])
                    }
                    className="text-orange-500 hover:underline cursor-pointer"
                  >
                    + 항목 추가
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {rouletteOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0"
                      style={{
                        background: [
                          "#ef4444",
                          "#f97316",
                          "#f59e0b",
                          "#10b981",
                          "#06b6d4",
                          "#3b82f6",
                          "#6366f1",
                          "#8b5cf6",
                          "#ec4899",
                          "#14b8a6",
                        ][idx % 10],
                      }}
                    >
                      {idx + 1}
                    </span>
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...rouletteOptions]
                        next[idx] = e.target.value
                        setRouletteOptions(next)
                      }}
                      placeholder={`항목 ${idx + 1}`}
                      className="flex-1 px-3 py-1.5 rounded-lg border outline-none"
                      style={{
                        background: "var(--muted)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    />
                    {rouletteOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRouletteOptions(
                            rouletteOptions.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-red-500 text-xs px-1 hover:opacity-80 cursor-pointer"
                        title="삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateRoulette}
              className="w-full py-2.5 rounded-xl font-bold text-white transition-all shadow-md mt-2 cursor-pointer hover:opacity-95"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #ea580c)",
              }}
            >
              돌림판 채팅에 보내기
            </button>
          </div>
        )}

        {/* 3. 투표 패널 */}
        {tab === "poll" && (
          <div className="space-y-4 text-xs">
            <div>
              <label
                className="block font-bold mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                투표 질문
              </label>
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="예: 오늘 회의 시간 언제가 좋으신가요?"
                className="w-full px-3.5 py-2.5 rounded-xl border outline-none text-xs md:text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            {/* 보기 항목 */}
            <div
              className="p-3 rounded-xl border space-y-2"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between font-bold mb-1">
                <span>보기 항목 (최소 2개)</span>
                {pollOptions.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    className="text-purple-500 hover:underline"
                  >
                    + 항목 추가
                  </button>
                )}
              </div>
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span
                    className="w-5 text-center font-bold"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {idx + 1}
                  </span>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions]
                      next[idx] = e.target.value
                      setPollOptions(next)
                    }}
                    placeholder={`항목 ${idx + 1}`}
                    className="flex-1 px-3 py-1.5 rounded-lg border outline-none"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPollOptions(pollOptions.filter((_, i) => i !== idx))
                      }
                      className="text-red-500 font-bold px-1.5"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* 설정 */}
            <div className="flex items-center gap-4">
              <label
                className="flex items-center gap-2 cursor-pointer font-medium"
                style={{ color: "var(--foreground)" }}
              >
                <input
                  type="checkbox"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                  className="rounded"
                />
                <span>복수 선택 허용</span>
              </label>
              <label
                className="flex items-center gap-2 cursor-pointer font-medium"
                style={{ color: "var(--foreground)" }}
              >
                <input
                  type="checkbox"
                  checked={pollIsAnonymous}
                  onChange={(e) => setPollIsAnonymous(e.target.checked)}
                  className="rounded"
                />
                <span>익명 투표</span>
              </label>
            </div>

            {/* 마감 시간 설정 */}
            <div
              className="p-3 rounded-xl border space-y-2.5"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <span>⏰</span>
                  <span>시간 마감 설정</span>
                </span>
                <span
                  className="text-[11px] font-normal"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {pollDeadlinePreset === "none"
                    ? "수동 마감 전까지 유지"
                    : "지정된 시간에 자동 마감"}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { id: "none", label: "제한 없음" },
                  { id: "10m", label: "10분" },
                  { id: "30m", label: "30분" },
                  { id: "1h", label: "1시간" },
                  { id: "3h", label: "3시간" },
                  { id: "24h", label: "24시간" },
                ].map((preset) => {
                  const isSelected = pollDeadlinePreset === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPollDeadlinePreset(preset.id)}
                      className="py-1.5 px-2 rounded-lg border text-xs font-semibold transition-all text-center"
                      style={{
                        background: isSelected
                          ? "rgba(168, 85, 247, 0.15)"
                          : "var(--muted)",
                        borderColor: isSelected ? "#a855f7" : "transparent",
                        color: isSelected ? "#a855f7" : "var(--foreground)",
                      }}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setPollDeadlinePreset(
                      pollDeadlinePreset === "custom" ? "none" : "custom",
                    )
                  }
                  className="text-[11px] underline"
                  style={{
                    color:
                      pollDeadlinePreset === "custom"
                        ? "#a855f7"
                        : "var(--muted-foreground)",
                  }}
                >
                  {pollDeadlinePreset === "custom"
                    ? "직접 지정 취소"
                    : "직접 날짜/시간 지정하기..."}
                </button>
                {pollDeadlinePreset === "custom" && (
                  <input
                    type="datetime-local"
                    value={pollCustomDeadline}
                    onChange={(e) => setPollCustomDeadline(e.target.value)}
                    className="px-2 py-1 text-xs rounded border outline-none ml-auto"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                )}
              </div>
            </div>

            <button
              onClick={handleCreatePoll}
              className="w-full py-2.5 rounded-xl font-bold text-white transition-all shadow-md mt-2"
              style={{
                background: "linear-gradient(135deg, #a855f7, #6366f1)",
              }}
            >
              투표 채팅에 보내기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
