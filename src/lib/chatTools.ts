import type { ChatToolEvent } from "../api/types"

export type ChatToolType = "draw" | "ladder" | "poll" | "roulette"

export interface LuckyDrawItem {
  id: number
  label: string
  isWinner: boolean
  openedByMemberId?: string
  openedByMemberName?: string
  openedAt?: string
}

export interface CustomDrawItem {
  label: string;
  isWinner: boolean;
}

export interface LuckyDrawData {
  title: string
  creatorId: string
  creatorName: string
  items: LuckyDrawItem[]
  allRevealed: boolean
  winnerCount?: number // 서버 처리 도구: 정답을 모르는 화면에서도 당첨 개수는 보여준다
}

export interface LadderParticipant {
  id: string
  name: string
  avatar: string
  color: string
}

export interface LadderLine {
  step: number // 0 ~ numSteps - 1
  fromCol: number // connects fromCol to fromCol + 1
}

export interface LadderMatch {
  participantId: string
  participantName: string
  resultText: string
}

export interface LadderData {
  title: string
  creatorId: string
  creatorName: string
  participants: LadderParticipant[]
  results: string[]
  lines: LadderLine[]
  numSteps: number
  matches: LadderMatch[]
  revealed: boolean
}

export interface ChatPollOption {
  id: number
  text: string
  votesCount: number
  voterMemberIds: string[]
  voterNames: string[]
}

export interface ChatPollData {
  question: string
  creatorId: string
  creatorName: string
  allowMultiple: boolean
  isAnonymous: boolean
  closed: boolean
  expiresAt?: string | null
  options: ChatPollOption[]
  totalVotes: number
}

export interface RouletteOption {
  id: string
  text: string
  color: string
}

export interface RouletteData {
  title: string
  creatorId: string
  creatorName: string
  options: RouletteOption[]
  winnerOptionId: string | null
  spinned: boolean
  spinnedByMemberId?: string
  spinnedByMemberName?: string
  spinnedAt?: string
  targetAngle?: number
}

export type ChatToolPayload =
  | {
      type: "draw";
      server?: boolean;
      data: LuckyDrawData;
    }
  | {
      type: "ladder";
      server?: boolean;
      data: LadderData;
    }
  | {
      type: "poll";
      server?: boolean;
      data: ChatPollData;
    }
  | {
      type: "roulette";
      server?: boolean;
      data: RouletteData;
    };

export const TOOL_MESSAGE_PREFIX = "[TALJU_CHAT_TOOL]:"
export const TOOL_ACTION_PREFIX = "[TALJU_CHAT_TOOL_ACTION]:"

export interface ChatToolActionPayload {
  targetMessageId: number
  action:
    | "draw_pick"
    | "draw_reveal_all"
    | "ladder_reveal"
    | "poll_vote"
    | "poll_close"
    | "roulette_spin"
  memberId: string
  memberName: string
  itemId?: number // for draw_pick
  optionIds?: number[] // for poll_vote
  winnerOptionId?: string // for roulette_spin
  targetAngle?: number // for roulette_spin
}

/**
 * 도구 페이로드를 채팅 메시지 문자열로 인코딩합니다.
 */
export function encodeChatToolMessage(payload: ChatToolPayload): string {
  return `${TOOL_MESSAGE_PREFIX}${JSON.stringify(payload)}`
}

/**
 * 도구 액션 페이로드를 채팅 메시지 문자열로 인코딩합니다.
 */
export function encodeChatToolAction(action: ChatToolActionPayload): string {
  return `${TOOL_ACTION_PREFIX}${JSON.stringify(action)}`
}

/**
 * 채팅 메시지가 도구 메시지인지 파싱합니다.
 */
export function parseChatToolMessage(text: string): ChatToolPayload | null {
  if (!text || !text.startsWith(TOOL_MESSAGE_PREFIX)) return null
  try {
    const raw = text.slice(TOOL_MESSAGE_PREFIX.length)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 채팅 메시지가 도구 액션 메시지인지 파싱합니다.
 */
export function parseChatToolAction(
  text: string,
): ChatToolActionPayload | null {
  if (!text || !text.startsWith(TOOL_ACTION_PREFIX)) return null
  try {
    const raw = text.slice(TOOL_ACTION_PREFIX.length)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 배열을 무작위로 섞습니다 (Fisher-Yates)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * 제비뽑기 생성
 */
export function createLuckyDrawData({
  title,
  creatorId,
  creatorName,
  totalCount,
  winnerCount,
  customItems,
}: {
  title: string
  creatorId: string
  creatorName: string
  totalCount: number
  winnerCount: number
  customItems?: CustomDrawItem[];
}): LuckyDrawData {
  let labels: CustomDrawItem[] = [];

  if (customItems && customItems.length > 0) {
    labels = [...customItems]
  } else {
    for (let i = 0; i < totalCount; i++) {
      const isWinner = i < winnerCount
      labels.push({
        label: isWinner ? `당첨 🎉 (${i + 1}등)` : "꽝 💨",
        isWinner,
      })
    }
  }

  const shuffled = shuffleArray(labels)
  const items: LuckyDrawItem[] = shuffled.map((item, idx) => ({
    id: idx + 1,
    label: item.label,
    isWinner: item.isWinner,
  }))

  return {
    title: title.trim() || "제비뽑기",
    creatorId,
    creatorName,
    items,
    allRevealed: false,
  }
}

/**
 * 사다리타기 사다리 선 및 최종 매칭 생성
 */
export function createLadderData({
  title,
  creatorId,
  creatorName,
  participants,
  results,
  numSteps,
}: {
  title: string;
  creatorId: string;
  creatorName: string;
  participants: LadderParticipant[];
  results: string[];
  numSteps?: number;
}): LadderData {
  const n = participants.length;
  const totalSteps = numSteps ?? Math.max(n * 2 + 2, 8);

  // 사다리 가로선 생성 및 매칭 계산 (직선 낙하 방지 및 충실한 이동 보장)
  let finalLines: LadderLine[] = [];
  let finalMatches: LadderMatch[] = [];

  for (let attempt = 0; attempt < 100; attempt++) {
    const lines: LadderLine[] = [];
    const colCount = new Array(n - 1).fill(0);

    for (let step = 0; step < totalSteps; step++) {
      for (let col = 0; col < n - 1; col++) {
        // 바로 왼쪽 열에 같은 스텝의 선이 있으면 건너뜀 (3갈래 교차로 방지)
        const hasLeftLine = lines.some(
          (l) => l.step === step && l.fromCol === col - 1
        );
        // 바로 이전 스텝에 같은 열의 선이 있으면 건너뜀 (즉시 제자리 복귀 방지)
        const hadSamePrev = lines.some(
          (l) => l.step === step - 1 && l.fromCol === col
        );
        if (hasLeftLine || hadSamePrev) continue;

        // 선이 적은 경계에 가중치 부여
        const prob = colCount[col] < 2 ? 0.75 : 0.4;
        if (Math.random() < prob) {
          lines.push({ step, fromCol: col });
          colCount[col]++;
        }
      }
    }

    // 2인 이상 시 모든 경계에 가로선 1개 이상 존재하도록 (2인일 때는 홀수 개로 필수 교차)
    if (n === 2) {
      if (lines.length % 2 === 0) continue;
    } else {
      if (!colCount.every((c) => c >= 1)) continue;
    }

    // 매칭 계산
    const matches: LadderMatch[] = participants.map((p, startCol) => {
      let currentCol = startCol;
      for (let step = 0; step < totalSteps; step++) {
        const rightLine = lines.find(
          (l) => l.step === step && l.fromCol === currentCol
        );
        if (rightLine) {
          currentCol += 1;
          continue;
        }
        const leftLine = lines.find(
          (l) => l.step === step && l.fromCol === currentCol - 1
        );
        if (leftLine) {
          currentCol -= 1;
        }
      }
      return {
        participantId: p.id,
        participantName: p.name,
        resultText: results[currentCol] || `결과 ${currentCol + 1}`,
      };
    });

    // 모든 참가자가 자기 자리에 일직선으로 떨어지는 경우 방지
    const straightCount = matches.filter(
      (m, idx) => m.resultText === results[idx]
    ).length;
    if (straightCount < n) {
      finalLines = lines;
      finalMatches = matches;
      break;
    }
    finalLines = lines;
    finalMatches = matches;
  }

  // 만약 100번 시도에도 안 걸러졌을 경우를 위한 안전한 기본값
  if (finalLines.length === 0 && n >= 2) {
    for (let c = 0; c < n - 1; c++) {
      finalLines.push({ step: c * 2, fromCol: c });
    }
    finalMatches = participants.map((p, startCol) => {
      let currentCol = startCol;
      for (let step = 0; step < totalSteps; step++) {
        const rightLine = finalLines.find(
          (l) => l.step === step && l.fromCol === currentCol
        );
        if (rightLine) {
          currentCol += 1;
          continue;
        }
        const leftLine = finalLines.find(
          (l) => l.step === step && l.fromCol === currentCol - 1
        );
        if (leftLine) {
          currentCol -= 1;
        }
      }
      return {
        participantId: p.id,
        participantName: p.name,
        resultText: results[currentCol] || `결과 ${currentCol + 1}`,
      };
    });
  }

  return {
    title: title.trim() || "사다리타기",
    creatorId,
    creatorName,
    participants,
    results,
    lines: finalLines,
    numSteps: totalSteps,
    matches: finalMatches,
    revealed: false,
  };
}

/**
 * 투표 데이터 생성
 */
export function createChatPollData({
  question,
  creatorId,
  creatorName,
  options,
  allowMultiple = false,
  isAnonymous = false,
  expiresAt = null,
}: {
  question: string
  creatorId: string
  creatorName: string
  options: string[]
  allowMultiple?: boolean
  isAnonymous?: boolean
  expiresAt?: string | null
}): ChatPollData {
  return {
    question: question.trim(),
    creatorId,
    creatorName,
    allowMultiple,
    isAnonymous,
    closed: false,
    expiresAt: expiresAt || null,
    options: options
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, idx) => ({
        id: idx + 1,
        text,
        votesCount: 0,
        voterMemberIds: [],
        voterNames: [],
      })),
    totalVotes: 0,
  }
}

/**
 * 돌림판(룰렛) 데이터를 생성합니다.
 */
export function createRouletteData(
  title: string,
  rawOptions: string[],
  creatorId: string,
  creatorName: string,
): RouletteData {
  const defaultColors = [
    "#ef4444", // rose
    "#f97316", // orange
    "#f59e0b", // amber
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#14b8a6", // teal
  ]

  const validOptions = rawOptions.map((t) => t.trim()).filter(Boolean)
  const finalOptions = validOptions.length >= 2 ? validOptions : ["항목 1", "항목 2"]

  const options: RouletteOption[] = finalOptions.map((text, idx) => ({
    id: `opt-${idx + 1}`,
    text,
    color: defaultColors[idx % defaultColors.length],
  }))

  return {
    title: title.trim() || "행운의 돌림판 룰렛",
    creatorId,
    creatorName,
    options,
    winnerOptionId: null,
    spinned: false,
  }
}

/**
 * 도구 상태에 액션을 적용한 새로운 도구 상태를 반환합니다.
 */
export function applyToolAction(
  current: ChatToolPayload,
  action: ChatToolActionPayload,
  // 행동 메시지가 올라온 시각. 마감·공개 시각을 "지금"이 아니라 이 시각으로 판단해야
  // 나중에 채팅을 열어도 결과가 바뀌지 않는다.
  at: string = new Date().toISOString(),
): ChatToolPayload {
  if (
    current.type === "draw" &&
    (action.action === "draw_pick" || action.action === "draw_reveal_all")
  ) {
    const draw = { ...current.data }
    if (action.action === "draw_reveal_all") {
      if (action.memberId !== draw.creatorId) return current
      return {
        type: "draw",
        data: {
          ...draw,
          allRevealed: true,
          items: draw.items.map((it) => ({
            ...it,
            openedByMemberName: it.openedByMemberName || "공개됨",
          })),
        },
      }
    }
    if (action.action === "draw_pick" && action.itemId) {
      const items = draw.items.map((it) => {
        if (it.id === action.itemId && !it.openedByMemberId) {
          return {
            ...it,
            openedByMemberId: action.memberId,
            openedByMemberName: action.memberName,
            openedAt: at,
          }
        }
        return it
      })
      const allOpened = items.every((it) => !!it.openedByMemberId)
      return {
        type: "draw",
        data: { ...draw, items, allRevealed: draw.allRevealed || allOpened },
      }
    }
  }

  if (current.type === "ladder" && action.action === "ladder_reveal") {
    return {
      type: "ladder",
      data: { ...current.data, revealed: true },
    }
  }

  if (
    current.type === "poll" &&
    (action.action === "poll_vote" || action.action === "poll_close")
  ) {
    const poll = { ...current.data }
    const isExpired = Boolean(
      poll.expiresAt && new Date(poll.expiresAt).getTime() <= new Date(at).getTime(),
    )

    if (action.action === "poll_close") {
      if (action.memberId !== poll.creatorId) return current
      return { type: "poll", data: { ...poll, closed: true } }
    }
    if (
      action.action === "poll_vote" &&
      action.optionIds &&
      !poll.closed &&
      !isExpired
    ) {
      const validIds = action.optionIds.filter((id) =>
        poll.options.some((opt) => opt.id === id),
      )
      const selected = new Set(
        poll.allowMultiple ? validIds : validIds.slice(0, 1),
      )
      // 기존 투표 제거 후 새로 집계
      const options = poll.options.map((opt) => {
        const remainingVoterIds = opt.voterMemberIds.filter(
          (id) => id !== action.memberId,
        )
        const remainingNames = opt.voterNames.filter(
          (_, idx) => opt.voterMemberIds[idx] !== action.memberId,
        )
        const isNowSelected = selected.has(opt.id)
        const voterMemberIds = isNowSelected
          ? [...remainingVoterIds, action.memberId]
          : remainingVoterIds
        const voterNames = isNowSelected
          ? [...remainingNames, action.memberName]
          : remainingNames
        return {
          ...opt,
          votesCount: voterMemberIds.length,
          voterMemberIds,
          voterNames: poll.isAnonymous ? [] : voterNames,
        }
      })

      const uniqueVoters = new Set<string>()
      options.forEach((opt) =>
        opt.voterMemberIds.forEach((id) => uniqueVoters.add(id)),
      )

      return {
        type: "poll",
        data: {
          ...poll,
          options,
          totalVotes: uniqueVoters.size,
        },
      }
    }
  }

  if (
    current.type === "roulette" &&
    action.action === "roulette_spin" &&
    action.winnerOptionId &&
    !current.data.spinned &&
    current.data.options.some((opt) => opt.id === action.winnerOptionId)
  ) {
    return {
      type: "roulette",
      data: {
        ...current.data,
        spinned: true,
        winnerOptionId: action.winnerOptionId,
        spinnedByMemberId: action.memberId,
        spinnedByMemberName: action.memberName,
        spinnedAt: at,
        targetAngle: action.targetAngle,
      },
    }
  }

  return current
}

export interface ToolActionEvent {
  action: ChatToolActionPayload
  senderId: string // 행동 메시지를 실제로 보낸 사람(서버가 찍은 값) — 페이로드의 memberId는 믿지 않는다
  at: string
}

/** 채팅 메시지들에서 도구 행동을 대상 메시지별로 모읍니다. */
export function collectToolActions(
  messages: { text: string; senderId: string; createdAt: string }[],
): Map<number, ToolActionEvent[]> {
  const map = new Map<number, ToolActionEvent[]>()
  for (const m of messages) {
    const action = m.text ? parseChatToolAction(m.text) : null
    if (!action) continue
    const list = map.get(action.targetMessageId) ?? []
    list.push({ action, senderId: m.senderId, at: m.createdAt })
    map.set(action.targetMessageId, list)
  }
  return map
}

/**
 * 도구 메시지의 최종 상태. 만든 사람과 각 행동의 주체는 페이로드가 아니라 실제 메시지 발신자로 정하고,
 * 각 행동은 그 메시지가 올라온 시각 기준으로 적용한다.
 */
export function resolveToolState(
  initial: ChatToolPayload,
  creatorId: string,
  events: ToolActionEvent[],
  nameOf: (memberId: string) => string,
): ChatToolPayload {
  let current: ChatToolPayload = {
    ...initial,
    data: { ...initial.data, creatorId, creatorName: nameOf(creatorId) },
  } as ChatToolPayload
  for (const e of events) {
    current = applyToolAction(
      current,
      { ...e.action, memberId: e.senderId, memberName: nameOf(e.senderId) },
      e.at,
    )
  }
  return current
}

// ---------------------------------------------------------------------------
// 서버 처리 도구(제비뽑기·사다리·룰렛): 메시지에는 공개 정보만 담고("server": true),
// 정답·사다리 선·룰렛 당첨은 서버가 chat_tool_events로 알려준다. 투표는 기존 방식 그대로.
// ---------------------------------------------------------------------------

/** 만들기 화면이 만든 도구를 서버 처리용 메시지 본문 + 준비(config)로 나눈다. 투표는 null. */
export function toServerToolPayload(
  p: ChatToolPayload,
): { payload: ChatToolPayload; config: Record<string, unknown> } | null {
  if (p.type === "draw") {
    const { title, items } = p.data
    return {
      payload: {
        type: "draw",
        server: true,
        data: { title, total: items.length, winnerCount: items.filter((i) => i.isWinner).length },
      } as unknown as ChatToolPayload,
      config: { items: items.map((i) => ({ label: i.label, isWinner: i.isWinner })) },
    }
  }
  if (p.type === "ladder") {
    const { title, participants, results } = p.data
    return {
      payload: { type: "ladder", server: true, data: { title, participants, results } } as unknown as ChatToolPayload,
      config: {},
    }
  }
  if (p.type === "roulette") {
    const { title, options } = p.data
    return {
      payload: { type: "roulette", server: true, data: { title, options } } as unknown as ChatToolPayload,
      config: {},
    }
  }
  return null
}

/** 서버 이벤트로 도구의 현재 상태를 만든다. 만든 사람·행동한 사람은 서버가 확인한 값이다. */
export function resolveServerToolState(
  initial: ChatToolPayload,
  creatorId: string,
  events: ChatToolEvent[],
  nameOf: (memberId: string) => string,
): ChatToolPayload {
  const creator = { creatorId, creatorName: nameOf(creatorId) }
  const init = events.find((e) => e.event === "init")
  const who = (e: ChatToolEvent) => ({ id: e.actorMemberId ?? "", name: e.actorMemberId ? nameOf(e.actorMemberId) : "알 수 없음" })

  if (initial.type === "draw") {
    const pub = initial.data as unknown as { title: string; total: number; winnerCount: number }
    const total = init?.data?.total ?? pub.total ?? 0
    let items: LuckyDrawItem[] = Array.from({ length: total }, (_, i) => ({ id: i + 1, label: "", isWinner: false }))
    let allRevealed = false
    for (const e of events) {
      if (e.event === "draw_pick") {
        const a = who(e)
        items = items.map((it) =>
          it.id === e.data.itemId
            ? { ...it, label: e.data.label, isWinner: !!e.data.isWinner, openedByMemberId: a.id, openedByMemberName: a.name, openedAt: e.createdAt }
            : it,
        )
      } else if (e.event === "draw_reveal_all") {
        allRevealed = true
        const all = (e.data.items ?? []) as { id: number; label: string; isWinner: boolean }[]
        items = all.map((full) => {
          const cur = items.find((it) => it.id === full.id)
          return cur?.openedByMemberId ? cur : { id: full.id, label: full.label, isWinner: !!full.isWinner, openedByMemberName: "공개됨" }
        })
      }
    }
    return {
      type: "draw",
      server: true,
      data: { title: pub.title || "제비뽑기", ...creator, items, allRevealed: allRevealed || (items.length > 0 && items.every((i) => !!i.openedByMemberId)), winnerCount: init?.data?.winnerCount ?? pub.winnerCount },
    }
  }

  if (initial.type === "ladder") {
    const pub = initial.data
    return {
      type: "ladder",
      server: true,
      data: {
        title: pub.title || "사다리타기",
        ...creator,
        participants: pub.participants,
        results: pub.results,
        lines: init?.data?.lines ?? [],
        numSteps: init?.data?.numSteps ?? Math.max(pub.participants.length * 2 + 2, 8),
        matches: init?.data?.matches ?? [],
        revealed: events.some((e) => e.event === "ladder_reveal"),
      },
    }
  }

  if (initial.type === "roulette") {
    const pub = initial.data
    const spin = events.find((e) => e.event === "roulette_spin")
    const a = spin ? who(spin) : null
    return {
      type: "roulette",
      server: true,
      data: {
        title: pub.title || "행운의 돌림판 룰렛",
        ...creator,
        options: pub.options,
        winnerOptionId: spin?.data?.winnerOptionId ?? null,
        spinned: !!spin,
        spinnedByMemberId: a?.id,
        spinnedByMemberName: a?.name,
        spinnedAt: spin?.createdAt,
      },
    }
  }

  return initial
}

/** 메시지 종류에 맞게 도구 상태를 계산한다(서버 처리 도구 / 기존 메시지 기반 도구). */
export function resolveAnyToolState(
  initial: ChatToolPayload,
  creatorId: string,
  actions: ToolActionEvent[],
  serverEvents: ChatToolEvent[],
  nameOf: (memberId: string) => string,
): ChatToolPayload {
  if (initial.server) return resolveServerToolState(initial, creatorId, serverEvents, nameOf)
  return resolveToolState(initial, creatorId, actions, nameOf)
}
