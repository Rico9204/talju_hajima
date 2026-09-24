import { Fragment, useState, useRef, useEffect } from "react"

import {
  useProject,
  dmChannelId,
  type WorkspaceFile,
} from "../context/ProjectContext"

import {
  belongsToMessageGroup,
  startsNewChatDay,
  formatChatDate,
  formatChatTime,
} from "../lib/chatDate"

import SearchHighlight from "./SearchHighlight"

import ChatToolModal from "./chatTools/ChatToolModal"
import ChatToolPreviewBubble from "./chatTools/ChatToolPreviewBubble"
import ChatToolOverlayModal from "./chatTools/ChatToolOverlayModal"

import {
  encodeChatToolMessage,
  parseChatToolMessage,
  encodeChatToolAction,
  parseChatToolAction,
  applyToolAction,
  type ChatToolPayload,
  type ChatToolActionPayload,
} from "../lib/chatTools"

interface FileRef {
  id: number

  name: string

  type: string

  folderId: number | null

  folderName: string
}

const fileTypeLabel: Record<string, string> = {
  pdf: "PDF",
  doc: "DOC",
  ppt: "PPT",
  xls: "XLS",
  zip: "ZIP",
  img: "IMG",
}

const chatEmojis = ["👍", "❤️", "😂", "🎉", "👀", "✅"]

export default function TeamChat({
  initialChannel,
  onOpenFile,
}: {
  initialChannel?: string
  onOpenFile?: (fileId: number, folderId: number | null) => void
}) {
  const {
    project,
    files,
    folders,
    team,
    currentMember,

    chatMessages,
    chatUnread,
    sendChatMessage,
    toggleChatReaction,
    markChannelMessagesRead,

    openMemberProfile,
  } = useProject()

  const [input, setInput] = useState("")

  const [channelSearch, setChannelSearch] = useState("")

  const [pickerOpen, setPickerOpen] = useState(false)

  const [fileMentionSearch, setFileMentionSearch] = useState("")

  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)

  const [reactionPickerMessageId, setReactionPickerMessageId] =
    useState<number | null>(null)

  const [pendingFile, setPendingFile] = useState<FileRef | null>(null)

  const [messageSearchOpen, setMessageSearchOpen] = useState(false)

  const [messageSearch, setMessageSearch] = useState("")

  const [pendingScrollMessageId, setPendingScrollMessageId] =
    useState<number | null>(null)

  const [toolModalOpen, setToolModalOpen] = useState(false)
  const [toolModalTab, setToolModalTab] = useState<"draw" | "ladder" | "poll">("ladder")
  const [overlayToolMessageId, setOverlayToolMessageId] = useState<number | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(event.target as Node)
      ) {
        setActionMenuOpen(false)
      }
    }
    if (actionMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [actionMenuOpen])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionMenuOpen(false)
      }
    }
    if (actionMenuOpen) {
      window.addEventListener("keydown", handleKeyDown)
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [actionMenuOpen])

  const threadRef = useRef<HTMLDivElement>(null)

  const scrollStateRef = useRef({ channelId: "", messageCount: 0 })

  const messageSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (messageSearchOpen) messageSearchInputRef.current?.focus()
  }, [messageSearchOpen])

  const otherMembers = team.members.filter((m) => m.id !== currentMember?.id)

  // 개인 채팅(팀 채팅 제외)은 최근에 대화한 순서대로 정렬 — 아직 대화가 없는 상대는 뒤로 밀린다.

  const dmChannels = currentMember
    ? otherMembers

        .map((m) => ({
          id: dmChannelId(currentMember.id, m.id),

          type: "dm" as const,

          name: m.name,

          avatar: m.avatar,

          avatarUrl: m.avatarUrl,

          color: m.color,

          online: m.online,

          role: m.role,

          memberId: m.id,
        }))

        .sort((a, b) => {
          const aMsgs = chatMessages[a.id]

          const bMsgs = chatMessages[b.id]

          const aLast =
            aMsgs && aMsgs.length ? aMsgs[aMsgs.length - 1].createdAt : null

          const bLast =
            bMsgs && bMsgs.length ? bMsgs[bMsgs.length - 1].createdAt : null

          if (aLast && bLast) return bLast.localeCompare(aLast)

          if (aLast) return -1

          if (bLast) return 1

          return 0
        })
    : []

  const channels = currentMember
    ? [
        {
          id: "all",
          type: "group" as const,
          name: "팀 채팅",
          avatar: "⬡",
          avatarUrl: null as string | null,
          color: "var(--primary)",
          online: undefined as boolean | undefined,
          role: undefined as string | undefined,
          memberId: undefined as string | undefined,
        },

        ...dmChannels,
      ]
    : []

  const channelSearchTrimmed = channelSearch.trim().toLowerCase()

  const filteredChannels = channelSearchTrimmed
    ? channels.filter((c) =>
        c.name.toLowerCase().includes(channelSearchTrimmed),
      )
    : channels

  const fileMentionSearchTrimmed = fileMentionSearch.trim().toLowerCase()

  const filteredMentionFiles = fileMentionSearchTrimmed
    ? files.filter((f) =>
        f.name.toLowerCase().includes(fileMentionSearchTrimmed),
      )
    : files

  const initialChannelId =
    currentMember && initialChannel
      ? dmChannelId(currentMember.id, initialChannel)
      : "all"

  const [active, setActive] = useState<string>(initialChannelId)

  // Below md there's only room for one pane at a time — picking a channel

  // shows its thread and hides the list; "뒤로" goes back to the list. At md

  // and up both panes are always shown side by side and this is unused.

  const [mobileShowThread, setMobileShowThread] = useState(false)

  function selectChannel(channelId: string) {
    setActive(channelId)

    setMobileShowThread(true)

    markChannelMessagesRead(channelId)
  }

  useEffect(() => {
    const exists = channels.some((c) => c.id === active)

    const channelId = exists ? active : initialChannelId

    setActive(channelId)

    markChannelMessagesRead(channelId)

    setPendingFile(null)

    setPickerOpen(false)

    setFileMentionSearch("")

    setEmojiPickerOpen(false)

    setReactionPickerMessageId(null)

    setMessageSearchOpen(false)

    setMessageSearch("")

    setActionMenuOpen(false)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, initialChannel, currentMember?.id])

  // Do not use the whole chatMessages object here: a reaction or read receipt

  // replaces that object too, but must not pull someone reading older messages

  // back to the bottom. Only a channel change or an actual new message scrolls.

  useEffect(() => {
    const el = threadRef.current

    const previous = scrollStateRef.current

    const messageCount = chatMessages[active]?.length ?? 0

    const channelChanged = previous.channelId !== active

    const receivedNewMessage =
      !channelChanged && messageCount > previous.messageCount

    if (el && (channelChanged || receivedNewMessage))
      el.scrollTop = el.scrollHeight

    scrollStateRef.current = { channelId: active, messageCount }
  }, [active, chatMessages[active]?.length])

  // 검색 결과에서 메시지를 클릭하면 검색을 닫고(원래 스레드 뷰로 돌아가고)

  // 그 메시지로 스크롤한다 — 검색 뷰에는 실제 메시지 DOM이 없어서 뷰가

  // 다시 그려진 다음에 스크롤해야 한다.

  useEffect(() => {
    if (pendingScrollMessageId === null || messageSearch) return

    const el = document.getElementById(`chat-message-${pendingScrollMessageId}`)

    el?.scrollIntoView({ block: "center", behavior: "smooth" })

    setPendingScrollMessageId(null)
  }, [pendingScrollMessageId, messageSearch])

  // Selecting a channel marks its current messages as read, but a message

  // received while that channel is already open must be read as well.

  // Watching the message count avoids treating reaction updates as messages.

  useEffect(() => {
    if (!currentMember) return

    void markChannelMessagesRead(active)

    // markChannelMessagesRead is recreated with context state; only run this

    // when the viewed channel or its actual message count changes.

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentMember?.id, chatMessages[active]?.length])

  if (!currentMember) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-5">
          <div
            className="text-xs font-600 uppercase tracking-widest mb-1"
            style={{
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-jetbrains)",
            }}
          >
            팀 채팅
          </div>
          <h1 className="text-2xl font-700">Team Chat</h1>
        </div>
        <div
          className="p-8 border text-center"
          style={{
            borderColor: "var(--border)",
            borderStyle: "dashed",
            borderRadius: "var(--radius)",
            color: "var(--muted-foreground)",
          }}
        >
          <div className="text-3xl mb-3">◐</div>
          <div className="text-sm font-600">
            이 프로젝트에 참여한 팀원만 채팅할 수 있어요
          </div>
        </div>
      </div>
    )
  }

  const chan = channels.find((c) => c.id === active) || channels[0]

  const thread = chatMessages[active] || []

  // 도구 액션 메시지 집계

  const actionsByMessageId = new Map<number, ChatToolActionPayload[]>()

  for (const m of thread) {
    if (m.text) {
      const act = parseChatToolAction(m.text)

      if (act) {
        const list = actionsByMessageId.get(act.targetMessageId) || []

        list.push(act)

        actionsByMessageId.set(act.targetMessageId, list)
      }
    }
  }

  // 액션 메시지는 스레드 말풍선 목록에서 제외
  const visibleThread = thread.filter((m) => !parseChatToolAction(m.text))

  const latestMessageId = visibleThread[visibleThread.length - 1]?.id

  // 활성화된 오버레이 도구 데이터 실시간 계산
  let activeOverlayPayload: ChatToolPayload | null = null
  if (overlayToolMessageId !== null) {
    const targetMsg = visibleThread.find((m) => m.id === overlayToolMessageId)
    if (targetMsg) {
      const initialTool = parseChatToolMessage(targetMsg.text)
      if (initialTool) {
        activeOverlayPayload = initialTool
        const actions = actionsByMessageId.get(targetMsg.id) || []
        for (const act of actions) {
          activeOverlayPayload = applyToolAction(activeOverlayPayload, act)
        }
      }
    }
  }

  function memberFor(id: string) {
    return team.members.find((m) => m.id === id)
  }

  const messageSearchTrimmed = messageSearch.trim()

  const messageSearchResults = messageSearchTrimmed
    ? visibleThread.filter((m) => {
        const tool = parseChatToolMessage(m.text)

        if (tool) {
          const searchIn =
            tool.type === "draw"
              ? `제비뽑기 ${tool.data.title}`
              : tool.type === "ladder"
                ? `사다리타기 ${tool.data.title}`
                : tool.type === "roulette"
                  ? `돌림판 ${tool.data.title} ${tool.data.options.map((o) => o.text).join(" ")}`
                  : `투표 ${tool.data.question} ${tool.data.options.map((o) => o.text).join(" ")}`

          return searchIn
            .toLowerCase()
            .includes(messageSearchTrimmed.toLowerCase())
        }

        return m.text
          ?.toLowerCase()
          .includes(messageSearchTrimmed.toLowerCase())
      })
    : []

  function folderNameOf(folderId: number | null) {
    return folderId === null
      ? "루트"
      : folders.find((f) => f.id === folderId)?.name || "폴더"
  }

  function fileRefFor(fileId: number | null): FileRef | undefined {
    if (fileId === null) return undefined

    const f = files.find((x) => x.id === fileId)

    if (!f) return undefined

    return {
      id: f.id,
      name: f.name,
      type: f.type,
      folderId: f.folderId,
      folderName: folderNameOf(f.folderId),
    }
  }

  function pickFile(f: WorkspaceFile) {
    setPendingFile({
      id: f.id,
      name: f.name,
      type: f.type,
      folderId: f.folderId,
      folderName: folderNameOf(f.folderId),
    })

    setPickerOpen(false)

    setFileMentionSearch("")
  }

  function send() {
    if (!input.trim() && !pendingFile) return

    sendChatMessage(active, input, pendingFile?.id)

    setInput("")

    setPendingFile(null)
  }

  function handleSendTool(payload: ChatToolPayload) {
    void sendChatMessage(active, encodeChatToolMessage(payload))
  }

  function handleSendAction(action: ChatToolActionPayload) {
    void sendChatMessage(active, encodeChatToolAction(action))
  }

  function appendEmoji(emoji: string) {
    setInput((value) => value + emoji)

    setEmojiPickerOpen(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col h-full md:block md:h-auto">
      <div className="hidden md:block mb-5 shrink-0">
        <div
          className="text-xs font-600 uppercase tracking-widest mb-1"
          style={{
            color: "var(--muted-foreground)",
            fontFamily: "var(--font-jetbrains)",
          }}
        >
          채팅
        </div>
        <h1 className="text-2xl font-700">Team Chat</h1>
        <p
          className="text-sm mt-0.5"
          style={{ color: "var(--muted-foreground)" }}
        >
          {project.name} · 팀 채팅과 1:1 대화
          {project.status === "done" && " · 종료된 프로젝트 대화 기록"}
        </p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-5 gap-0 overflow-hidden flex-1 min-h-0 md:flex-none md:h-[560px]"
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        {/* Channel list */}
        <div
          className={`${
            mobileShowThread ? "hidden" : "flex"
          } md:flex md:col-span-2 min-h-0 flex-col`}
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div
            className="px-4 py-2 flex items-center justify-between gap-2"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div
              className="text-xs font-600 uppercase tracking-widest shrink-0"
              style={{ color: "var(--muted-foreground)" }}
            >
              채널
            </div>
            <input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="채널 검색"
              className="w-28 min-w-0 text-xs px-3 py-1.5 border outline-none"
              style={{
                borderColor: "var(--border)",
                borderRadius: "20px",
                background: "var(--background)",
                fontFamily: "var(--font-outfit)",
              }}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {filteredChannels.map((c) => {
              const isActive = active === c.id

              const unread = chatUnread[c.id] ?? 0

              return (
                <button
                  key={c.id}
                  onClick={() => selectChannel(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                  style={{
                    background: isActive ? "var(--secondary)" : "transparent",
                    borderLeft: isActive
                      ? "3px solid var(--primary)"
                      : "3px solid transparent",
                  }}
                >
                  <div className="w-9 h-9 relative shrink-0">
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-sm font-700 overflow-hidden"
                      style={{
                        background: c.avatarUrl
                          ? "var(--card)"
                          : `${c.color}18`,
                        color: c.color,
                      }}
                    >
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt={c.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        c.avatar
                      )}
                    </div>
                    {c.type === "dm" && c.online && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                        style={{
                          background: "#22c55e",
                          border: "2px solid var(--card)",
                        }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-700 truncate"
                      style={{
                        color: isActive
                          ? "var(--primary)"
                          : "var(--foreground)",
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {c.type === "group"
                        ? `전체 ${otherMembers.length + 1}명`
                        : c.role}
                    </div>
                  </div>
                  {unread > 0 && (
                    <span
                      className="text-xs font-700 min-w-5 h-5 px-1 flex items-center justify-center shrink-0"
                      style={{
                        background: "var(--accent)",
                        color: "#fff",
                        borderRadius: "20px",
                      }}
                    >
                      {unread}
                    </span>
                  )}
                </button>
              )
            })}
            {filteredChannels.length === 0 && (
              <div
                className="text-xs text-center py-4"
                style={{ color: "var(--muted-foreground)" }}
              >
                검색 결과가 없어요
              </div>
            )}
          </div>
        </div>

        {/* Thread */}
        <div
          className={`${
            mobileShowThread ? "flex" : "hidden"
          } md:flex md:col-span-3 min-h-0 min-w-0 flex-col`}
        >
          <div
            className="flex items-center justify-between gap-2.5 px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setMobileShowThread(false)}
                className="md:hidden w-8 h-8 flex items-center justify-center text-base shrink-0"
                style={{
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                  borderRadius: "8px",
                }}
                aria-label="채널 목록으로"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() =>
                  chan.memberId && openMemberProfile(chan.memberId)
                }
                disabled={!chan.memberId}
                className="w-8 h-8 relative shrink-0"
                title={
                  chan.type === "dm" ? `${chan.name} 프로필 보기` : undefined
                }
              >
                <div
                  className="w-full h-full rounded-full flex items-center justify-center text-xs font-700 overflow-hidden"
                  style={{
                    background: chan.avatarUrl
                      ? "var(--card)"
                      : `${chan.color}18`,
                    color: chan.color,
                  }}
                >
                  {chan.avatarUrl ? (
                    <img
                      src={chan.avatarUrl}
                      alt={chan.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    chan.avatar
                  )}
                </div>
                {chan.type === "dm" && chan.online && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                    style={{
                      background: "#22c55e",
                      border: "2px solid var(--card)",
                    }}
                  />
                )}
              </button>
              <div
                className={`min-w-0 transition-all duration-200 ${
                  messageSearchOpen
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100"
                }`}
              >
                <div className="text-sm font-700 truncate">{chan.name}</div>
                <div
                  className="text-xs truncate"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {chan.type === "group"
                    ? `전체 ${otherMembers.length + 1}명`
                    : chan.role}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                ref={messageSearchInputRef}
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                placeholder="대화 내용 검색"
                className={`text-sm py-1.5 border outline-none transition-all duration-200 ${
                  messageSearchOpen
                    ? "w-28 sm:w-36 px-3 opacity-100"
                    : "w-0 px-0 border-0 opacity-0 pointer-events-none"
                }`}
                style={{
                  borderColor: "var(--border)",
                  borderRadius: "20px",
                  background: "var(--background)",
                  fontFamily: "var(--font-outfit)",
                }}
              />
              <button
                onClick={() => {
                  setMessageSearchOpen((v) => !v)

                  if (messageSearchOpen) setMessageSearch("")
                }}
                title="대화 내용 검색"
                aria-label="대화 내용 검색"
                className="w-8 h-8 flex items-center justify-center text-sm shrink-0 transition-all"
                style={{
                  background: messageSearchOpen
                    ? "var(--primary)"
                    : "var(--muted)",
                  color: messageSearchOpen ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "50%",
                }}
              >
                🔍
              </button>
            </div>
          </div>

          {messageSearchTrimmed ? (
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {messageSearchResults.map((m) => {
                const sender = memberFor(m.senderId)

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPendingScrollMessageId(m.id)
                      setMessageSearch("")
                      setMessageSearchOpen(false)
                    }}
                    className="text-left p-3 transition-all"
                    style={{ background: "var(--muted)", borderRadius: "10px" }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-700">
                        {sender?.name ?? "알 수 없음"}
                      </span>
                      <span
                        className="text-xs"
                        style={{
                          color: "var(--muted-foreground)",
                          fontFamily: "var(--font-jetbrains)",
                        }}
                      >
                        {formatChatTime(m.createdAt)}
                      </span>
                    </div>
                    <div
                      className="text-sm break-words"
                      style={{ color: "var(--foreground)" }}
                    >
                      {(() => {
                        const tool = parseChatToolMessage(m.text)

                        if (tool) {
                          const summary =
                            tool.type === "draw"
                              ? `[제비뽑기] ${tool.data.title}`
                              : tool.type === "ladder"
                                ? `[사다리타기] ${tool.data.title}`
                                : `[투표] ${tool.data.question}`

                          return (
                            <SearchHighlight
                              text={summary}
                              query={messageSearch}
                            />
                          )
                        }

                        return (
                          <SearchHighlight
                            text={m.text}
                            query={messageSearch}
                          />
                        )
                      })()}
                    </div>
                  </button>
                )
              })}
              {messageSearchResults.length === 0 && (
                <div
                  className="text-xs text-center py-4"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  검색 결과가 없어요
                </div>
              )}
            </div>
          ) : (
            <div
              ref={threadRef}
              className="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4 flex flex-col gap-1"
            >
              {visibleThread.map((m, index) => {
                const mine = m.senderId === currentMember.id

                const sender = memberFor(m.senderId)

                // Receipts can outlive the locally loaded membership list.

                // Only show identifiable teammates, excluding the sender.

                const readers = [...new Set(m.readBy)]

                  .filter((id) => id !== m.senderId)

                  .flatMap((id) => {
                    const member = memberFor(id)

                    return member ? [member] : []
                  })

                const fileRef = fileRefFor(m.fileId)

                const joinsPrevious = belongsToMessageGroup(
                  visibleThread[index - 1],
                  m,
                )

                const joinsNext = belongsToMessageGroup(
                  m,
                  visibleThread[index + 1],
                )

                const bubbleRadius = mine
                  ? joinsPrevious
                    ? joinsNext
                      ? "14px 2px 2px 14px"
                      : "14px 2px 14px 14px"
                    : "14px 14px 2px 14px"
                  : joinsPrevious
                    ? joinsNext
                      ? "2px 14px 14px 2px"
                      : "2px 14px 14px 14px"
                    : "14px 14px 14px 2px"

                let toolPayload: ChatToolPayload | null = null

                const initialTool = parseChatToolMessage(m.text)

                if (initialTool) {
                  toolPayload = initialTool

                  const actions = actionsByMessageId.get(m.id) || []

                  for (const act of actions) {
                    toolPayload = applyToolAction(toolPayload, act)
                  }
                }

                return (
                  <Fragment key={m.id}>
                    {startsNewChatDay(visibleThread[index - 1], m) && (
                      <div className="flex justify-center w-full mt-4 mb-2">
                        <time
                          dateTime={m.createdAt}
                          className="px-3 py-1 text-xs rounded-full"
                          style={{
                            background: "var(--muted)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          {formatChatDate(m.createdAt)}
                        </time>
                      </div>
                    )}
                    <div
                      id={`chat-message-${m.id}`}
                      className={`group/message flex w-full min-w-0 items-start gap-2 ${
                        joinsPrevious ? "mt-0.5" : "mt-3"
                      }`}
                      style={{
                        justifyContent: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      {!mine && (
                        <button
                          type="button"
                          onClick={() => sender && openMemberProfile(sender.id)}
                          disabled={!sender}
                          className={`w-7 h-7 rounded-full overflow-hidden shrink-0 ${
                            joinsPrevious ? "invisible" : ""
                          }`}
                          title={
                            sender ? `${sender.name} 프로필 보기` : undefined
                          }
                        >
                          <div
                            className="w-full h-full flex items-center justify-center text-[11px] font-700"
                            style={{
                              background: sender?.avatarUrl
                                ? "var(--card)"
                                : `${sender?.color ?? "#94a3b8"}18`,
                              color: sender?.color ?? "var(--muted-foreground)",
                            }}
                          >
                            {sender?.avatarUrl ? (
                              <img
                                src={sender.avatarUrl}
                                alt={sender.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (sender?.avatar ?? "?")
                            )}
                          </div>
                        </button>
                      )}
                      <div
                        className="flex flex-col min-w-0 max-w-[75%]"
                        style={{ alignItems: mine ? "flex-end" : "flex-start" }}
                      >
                        {!mine && !joinsPrevious && (
                          <span
                            className="text-xs font-600 mb-1 px-1"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {sender?.name ?? "알 수 없음"}
                          </span>
                        )}
                        <div
                          className="relative flex flex-col min-w-0"
                          style={{
                            alignItems: mine ? "flex-end" : "flex-start",
                          }}
                        >
                          {toolPayload ? (
                            <ChatToolPreviewBubble
                              payload={toolPayload}
                              onOpenOverlay={() => setOverlayToolMessageId(m.id)}
                            />
                          ) : (
                            m.text && (
                              <div
                                className="px-3.5 py-2.5 text-sm max-w-none leading-relaxed break-words"
                                style={{
                                  background: mine
                                    ? "var(--primary)"
                                    : "var(--muted)",
                                  color: mine ? "#fff" : "var(--foreground)",
                                  borderRadius: bubbleRadius,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {m.text}
                              </div>
                            )
                          )}
                          {fileRef && (
                            <button
                              onClick={() =>
                                onOpenFile?.(fileRef.id, fileRef.folderId)
                              }
                              className="flex items-center gap-2.5 px-3 py-2.5 max-w-none text-left transition-all"
                              style={{
                                background: "var(--card-glass)",

                                border: "1.5px solid var(--border)",

                                borderRadius: "12px",

                                marginTop: m.text ? 6 : 0,

                                backdropFilter: "var(--panel-blur)",

                                WebkitBackdropFilter: "var(--panel-blur)",
                              }}
                            >
                              <span
                                className="text-xs font-700 px-2 py-1 shrink-0"
                                style={{
                                  background: "var(--secondary)",
                                  color: "var(--primary)",
                                  borderRadius: "6px",
                                }}
                              >
                                {fileTypeLabel[fileRef.type] || "FILE"}
                              </span>
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-700 truncate"
                                  style={{ color: "var(--foreground)" }}
                                >
                                  {fileRef.name}
                                </div>
                                <div
                                  className="text-xs"
                                  style={{ color: "var(--primary)" }}
                                >
                                  {fileRef.folderName} · 워크스페이스에서 보기 →
                                </div>
                              </div>
                            </button>
                          )}
                          <div
                            className={`absolute top-1 ${
                              mine ? "right-full mr-2" : "left-full ml-2"
                            } opacity-0 pointer-events-none group-hover/message:opacity-100 group-hover/message:pointer-events-auto group-focus-within/message:opacity-100 group-focus-within/message:pointer-events-auto transition-opacity z-10`}
                          >
                            <button
                              onClick={() =>
                                setReactionPickerMessageId((id) =>
                                  id === m.id ? null : m.id,
                                )
                              }
                              className="w-8 h-8 flex items-center justify-center text-sm"
                              style={{
                                background: "var(--card)",
                                border: "1px solid var(--border)",
                                borderRadius: "50%",
                                boxShadow: "var(--shadow-card)",
                              }}
                              title="반응하기"
                              aria-label="반응하기"
                            >
                              😊
                            </button>
                            {reactionPickerMessageId === m.id && (
                              <div
                                className={`absolute top-0 ${
                                  mine ? "right-full mr-1" : "left-full ml-1"
                                } flex items-center gap-0.5 p-1`}
                                style={{
                                  background: "var(--card-glass)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "14px",
                                  boxShadow: "var(--shadow-card)",
                                  backdropFilter: "var(--panel-blur)",
                                  WebkitBackdropFilter: "var(--panel-blur)",
                                  animation:
                                    "reaction-picker-in 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                                }}
                              >
                                {chatEmojis.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      void toggleChatReaction(m.id, emoji)
                                      setReactionPickerMessageId(null)
                                    }}
                                    className="w-7 h-7 text-sm transition-transform hover:scale-110"
                                    title={`${emoji} 반응`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {m.reactions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1.5 px-0.5">
                            {[
                              ...new Set(
                                m.reactions.map((reaction) => reaction.emoji),
                              ),
                            ].map((emoji) => {
                              const reactions = m.reactions.filter(
                                (reaction) => reaction.emoji === emoji,
                              )

                              const reactedByMe = reactions.some(
                                (reaction) =>
                                  reaction.memberId === currentMember.id,
                              )

                              return (
                                <button
                                  key={emoji}
                                  onClick={() =>
                                    void toggleChatReaction(m.id, emoji)
                                  }
                                  className="h-6 px-1.5 flex items-center gap-1 text-xs transition-all"
                                  style={{
                                    background: reactedByMe
                                      ? "var(--secondary)"
                                      : "var(--muted)",

                                    color: "var(--foreground)",

                                    border: reactedByMe
                                      ? "1px solid var(--primary)"
                                      : "1px solid transparent",

                                    borderRadius: "12px",

                                    animation:
                                      "reaction-pop 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                                  }}
                                  title={`${reactions.map((reaction) => memberFor(reaction.memberId)?.name ?? "팀원").join(", ")} 반응`}
                                >
                                  <span>{emoji}</span>
                                  <span className="font-600">
                                    {reactions.length}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {!joinsNext && (
                          <div className="flex items-center gap-1.5 mt-1 px-1">
                            {m.id === latestMessageId &&
                              chan.type === "dm" &&
                              readers.length > 0 && (
                                <span
                                  className="text-xs font-600"
                                  style={{ color: "var(--primary)" }}
                                >
                                  읽음
                                </span>
                              )}
                            {m.id === latestMessageId &&
                              chan.type === "group" &&
                              readers.length > 0 && (
                                <div
                                  className="flex items-center -space-x-1.5"
                                  title={`읽음: ${readers.map((reader) => reader.name).join(", ")}`}
                                >
                                  {readers.map((reader) => {
                                    return (
                                      <div
                                        key={reader.id}
                                        title={`${reader.name} 읽음`}
                                        className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-700 overflow-hidden"
                                        style={{
                                          background: reader.avatarUrl
                                            ? "var(--card)"
                                            : reader.color ||
                                              "var(--muted-foreground)",

                                          color: "#fff",

                                          border: "1.5px solid var(--card)",
                                        }}
                                      >
                                        {reader.avatarUrl ? (
                                          <img
                                            src={reader.avatarUrl}
                                            alt={reader.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          (reader.avatar.trim() &&
                                          reader.avatar !== "?"
                                            ? reader.avatar
                                            : reader.name.trim().slice(0, 1)) ||
                                          "팀"
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            <time
                              dateTime={m.createdAt}
                              className="text-xs"
                              style={{
                                color: "var(--muted-foreground)",
                                fontFamily: "var(--font-jetbrains)",
                              }}
                            >
                              {formatChatTime(m.createdAt)}
                            </time>
                          </div>
                        )}
                      </div>
                    </div>
                  </Fragment>
                )
              })}
              {visibleThread.length === 0 && (
                <div
                  className="flex-1 flex items-center justify-center text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  아직 대화가 없어요
                </div>
              )}
            </div>
          )}

          <div
            className="shrink-0 relative"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {emojiPickerOpen && (
              <div
                className="absolute bottom-full left-14 mb-2 flex items-center gap-1 p-1.5 z-20"
                style={{
                  background: "var(--card-glass)",
                  border: "1px solid var(--border)",
                  borderRadius: "14px",
                  boxShadow: "0 16px 40px rgba(15,18,53,0.18)",
                  backdropFilter: "var(--panel-blur)",
                  WebkitBackdropFilter: "var(--panel-blur)",
                }}
              >
                {chatEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => appendEmoji(emoji)}
                    className="w-8 h-8 text-base transition-transform hover:scale-110"
                    title={`${emoji} 입력`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {pickerOpen && (
              <div
                className="absolute bottom-full left-4 right-4 mb-2 max-h-64 overflow-y-auto p-1.5 z-20"
                style={{
                  background: "var(--card-glass)",
                  borderRadius: "12px",
                  boxShadow: "0 16px 40px rgba(15,18,53,0.18)",
                  backdropFilter: "var(--panel-blur)",
                  WebkitBackdropFilter: "var(--panel-blur)",
                }}
              >
                <div
                  className="text-xs font-600 uppercase tracking-widest px-2.5 pt-1.5 pb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  워크스페이스 파일 언급하기
                </div>
                <input
                  value={fileMentionSearch}
                  onChange={(e) => setFileMentionSearch(e.target.value)}
                  placeholder="파일 검색"
                  autoFocus
                  className="w-full text-xs px-3 py-1.5 border outline-none mb-1.5"
                  style={{
                    borderColor: "var(--border)",
                    borderRadius: "20px",
                    background: "var(--background)",
                    fontFamily: "var(--font-outfit)",
                  }}
                />
                {filteredMentionFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => pickFile(f)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-all"
                    style={{ borderRadius: "8px" }}
                  >
                    <span
                      className="text-xs font-700 px-2 py-1 shrink-0"
                      style={{
                        background: "var(--secondary)",
                        color: "var(--primary)",
                        borderRadius: "6px",
                      }}
                    >
                      {fileTypeLabel[f.type] || "FILE"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-700 truncate">{f.name}</div>
                      <div
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {folderNameOf(f.folderId)}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredMentionFiles.length === 0 && (
                  <div
                    className="text-xs text-center py-4"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {files.length === 0
                      ? "워크스페이스에 업로드된 파일이 없어요"
                      : "검색 결과가 없어요"}
                  </div>
                )}
              </div>
            )}

            {pendingFile && (
              <div
                className="flex items-center gap-2.5 mx-4 mt-3 px-3 py-2"
                style={{ background: "var(--muted)", borderRadius: "10px" }}
              >
                <span
                  className="text-xs font-700 px-2 py-1 shrink-0"
                  style={{
                    background: "var(--card)",
                    color: "var(--primary)",
                    borderRadius: "6px",
                  }}
                >
                  {fileTypeLabel[pendingFile.type] || "FILE"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-700 truncate">
                    {pendingFile.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {pendingFile.folderName}에서 공유
                  </div>
                </div>
                <button
                  onClick={() => setPendingFile(null)}
                  className="text-xs font-700 px-2 shrink-0"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* 카카오톡 스타일 + 메뉴 팝오버 */}
            {actionMenuOpen && (
              <div
                ref={actionMenuRef}
                className="absolute bottom-full left-4 mb-2 w-80 max-w-[calc(100vw-32px)] p-3 rounded-2xl border z-30 shadow-2xl animate-fadeIn"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  boxShadow: "0 16px 40px rgba(15, 18, 53, 0.16)",
                  backdropFilter: "var(--panel-blur)",
                  WebkitBackdropFilter: "var(--panel-blur)",
                }}
              >
                {/* 상단 헤더 */}
                <div
                  className="flex items-center justify-between pb-2 mb-2 border-b text-xs font-bold"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>✨</span>
                    <span>채팅 도구 및 첨부</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionMenuOpen(false)}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2">
                  {/* 1. 미니게임 (클릭 시 미니게임 오버레이 모달 오픈) */}
                  <button
                    type="button"
                    onClick={() => {
                      setToolModalTab("ladder")
                      setToolModalOpen(true)
                      setActionMenuOpen(false)
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all hover:bg-[var(--muted)] border border-[var(--border)] hover:border-[var(--primary)] group"
                    style={{ background: "var(--card)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-xs shrink-0 group-hover:scale-105 transition-transform"
                        style={{
                          background:
                            "linear-gradient(135deg, #f43f5e, #fb923c)",
                          color: "#ffffff",
                        }}
                      >
                        🎮
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-bold"
                            style={{ color: "var(--foreground)" }}
                          >
                            미니게임
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{
                              background: "rgba(244, 63, 94, 0.12)",
                              color: "#e11d48",
                            }}
                          >
                            3종
                          </span>
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          사다리타기 · 제비뽑기 · 돌림판
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                      style={{
                        background: "rgba(244, 63, 94, 0.1)",
                        color: "#e11d48",
                      }}
                    >
                      게임 선택 ›
                    </span>
                  </button>

                  {/* 2. 투표 */}
                  <button
                    type="button"
                    onClick={() => {
                      setToolModalTab("poll")
                      setToolModalOpen(true)
                      setActionMenuOpen(false)
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all hover:bg-[var(--muted)] border border-[var(--border)] hover:border-[var(--primary)] group"
                    style={{ background: "var(--card)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-xs shrink-0 group-hover:scale-105 transition-transform"
                        style={{
                          background:
                            "linear-gradient(135deg, #6366f1, #a855f7)",
                          color: "#ffffff",
                        }}
                      >
                        📊
                      </div>
                      <div>
                        <div
                          className="text-xs font-bold"
                          style={{ color: "var(--foreground)" }}
                        >
                          투표
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          시간 마감 타이머 · 복수 선택 투표
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                      style={{
                        background: "var(--secondary)",
                        color: "var(--primary)",
                      }}
                    >
                      만들기
                    </span>
                  </button>

                  {/* 3. 워크스페이스 파일 언급 */}
                  <button
                    type="button"
                    onClick={() => {
                      setPickerOpen(true)
                      setActionMenuOpen(false)
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all hover:bg-[var(--muted)] border border-[var(--border)] hover:border-[var(--primary)] group"
                    style={{ background: "var(--card)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-xs shrink-0 group-hover:scale-105 transition-transform"
                        style={{
                          background:
                            "linear-gradient(135deg, #0284c7, #2563eb)",
                          color: "#ffffff",
                        }}
                      >
                        📁
                      </div>
                      <div>
                        <div
                          className="text-xs font-bold"
                          style={{ color: "var(--foreground)" }}
                        >
                          워크스페이스 파일 언급
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          프로젝트 파일 첨부 및 대화에 링크
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                      style={{
                        background: "var(--muted)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      첨부
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 py-3 flex items-center gap-2">
              {/* 카카오톡 스타일 + 메뉴 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setActionMenuOpen((v) => !v)
                  setEmojiPickerOpen(false)
                  setPickerOpen(false)
                }}
                className={`w-9 h-9 flex items-center justify-center text-xl font-bold shrink-0 transition-all ${
                  actionMenuOpen
                    ? "rotate-45 scale-105"
                    : "hover:scale-105"
                }`}
                style={{
                  background: actionMenuOpen ? "var(--primary)" : "var(--muted)",
                  color: actionMenuOpen ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "50%",
                }}
                title="도구 및 파일 추가 (+)"
                aria-label="채팅 도구 및 첨부 메뉴"
              >
                +
              </button>

              {/* 이모지 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setEmojiPickerOpen((value) => !value)
                  setActionMenuOpen(false)
                }}
                className="w-9 h-9 flex items-center justify-center text-sm shrink-0 transition-all hover:scale-105"
                style={{
                  background: emojiPickerOpen
                    ? "var(--primary)"
                    : "var(--muted)",
                  color: emojiPickerOpen ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "50%",
                }}
                title="이모지 입력"
              >
                😊
              </button>

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={
                  pendingFile
                    ? "메시지 추가 (선택)..."
                    : `${chan.name}에게 메시지 보내기...`
                }
                className="flex-1 text-sm px-3.5 py-2.5 outline-none"
                style={{
                  background: "var(--muted)",
                  borderRadius: "20px",
                  fontFamily: "var(--font-outfit)",
                }}
              />
              <button
                onClick={send}
                className="w-9 h-9 flex items-center justify-center text-sm font-700 shrink-0 transition-all"
                style={{
                  background:
                    input.trim() || pendingFile
                      ? "var(--primary)"
                      : "var(--muted)",

                  color:
                    input.trim() || pendingFile
                      ? "#fff"
                      : "var(--muted-foreground)",

                  borderRadius: "50%",
                }}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      <ChatToolModal
        open={toolModalOpen}
        initialTab={toolModalTab}
        onClose={() => setToolModalOpen(false)}
        teamMembers={team.members}
        currentMemberId={currentMember.id}
        currentMemberName={currentMember.name}
        onSendTool={handleSendTool}
      />

      <ChatToolOverlayModal
        isOpen={overlayToolMessageId !== null && activeOverlayPayload !== null}
        onClose={() => setOverlayToolMessageId(null)}
        toolPayload={activeOverlayPayload}
        messageId={overlayToolMessageId}
        currentMemberId={currentMember.id}
        currentMemberName={currentMember.name}
        onSendAction={handleSendAction}
      />
    </div>
  )
}
