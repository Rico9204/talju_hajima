import { Fragment, useState, useRef, useEffect } from "react";
import { useProject, dmChannelId, type WorkspaceFile } from "../context/ProjectContext";
import { belongsToMessageGroup, startsNewChatDay, formatChatDate, formatChatTime } from "../lib/chatDate";

interface FileRef {
  id: number;
  name: string;
  type: string;
  folderId: number | null;
  folderName: string;
}

const fileTypeLabel: Record<string, string> = {
  pdf: "PDF", doc: "DOC", ppt: "PPT", xls: "XLS", zip: "ZIP", img: "IMG",
};
const chatEmojis = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

export default function TeamChat({
  initialChannel, onOpenFile,
}: { initialChannel?: string; onOpenFile?: (fileId: number, folderId: number | null) => void }) {
  const {
    project, files, folders, team, currentMember,
    chatMessages, chatUnread, sendChatMessage, toggleChatReaction, markChannelMessagesRead,
    openMemberProfile,
  } = useProject();
  const [input, setInput] = useState("");
  const [channelSearch, setChannelSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileMentionSearch, setFileMentionSearch] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<FileRef | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const scrollStateRef = useRef({ channelId: "", messageCount: 0 });

  const otherMembers = team.members.filter((m) => m.id !== currentMember?.id);
  // 개인 채팅(팀 채팅 제외)은 최근에 대화한 순서대로 정렬 — 아직 대화가
  // 없는 상대는 뒤로 밀린다.
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
          const aMsgs = chatMessages[a.id];
          const bMsgs = chatMessages[b.id];
          const aLast = aMsgs && aMsgs.length ? aMsgs[aMsgs.length - 1].createdAt : null;
          const bLast = bMsgs && bMsgs.length ? bMsgs[bMsgs.length - 1].createdAt : null;
          if (aLast && bLast) return bLast.localeCompare(aLast);
          if (aLast) return -1;
          if (bLast) return 1;
          return 0;
        })
    : [];
  const channels = currentMember
    ? [
        { id: "all", type: "group" as const, name: "팀 채팅", avatar: "⬡", avatarUrl: null as string | null, color: "var(--primary)", online: undefined as boolean | undefined, role: undefined as string | undefined, memberId: undefined as string | undefined },
        ...dmChannels,
      ]
    : [];

  const channelSearchTrimmed = channelSearch.trim().toLowerCase();
  const filteredChannels = channelSearchTrimmed
    ? channels.filter((c) => c.name.toLowerCase().includes(channelSearchTrimmed))
    : channels;

  const fileMentionSearchTrimmed = fileMentionSearch.trim().toLowerCase();
  const filteredMentionFiles = fileMentionSearchTrimmed
    ? files.filter((f) => f.name.toLowerCase().includes(fileMentionSearchTrimmed))
    : files;

  const initialChannelId = currentMember && initialChannel ? dmChannelId(currentMember.id, initialChannel) : "all";
  const [active, setActive] = useState<string>(initialChannelId);
  // Below md there's only room for one pane at a time — picking a channel
  // shows its thread and hides the list; "뒤로" goes back to the list. At md
  // and up both panes are always shown side by side and this is unused.
  const [mobileShowThread, setMobileShowThread] = useState(false);

  function selectChannel(channelId: string) {
    setActive(channelId);
    setMobileShowThread(true);
    markChannelMessagesRead(channelId);
  }

  useEffect(() => {
    const exists = channels.some((c) => c.id === active);
    const channelId = exists ? active : initialChannelId;
    setActive(channelId);
    markChannelMessagesRead(channelId);
    setPendingFile(null);
    setPickerOpen(false);
    setFileMentionSearch("");
    setEmojiPickerOpen(false);
    setReactionPickerMessageId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, initialChannel, currentMember?.id]);

  // Do not use the whole chatMessages object here: a reaction or read receipt
  // replaces that object too, but must not pull someone reading older messages
  // back to the bottom. Only a channel change or an actual new message scrolls.
  useEffect(() => {
    const el = threadRef.current;
    const previous = scrollStateRef.current;
    const messageCount = chatMessages[active]?.length ?? 0;
    const channelChanged = previous.channelId !== active;
    const receivedNewMessage = !channelChanged && messageCount > previous.messageCount;

    if (el && (channelChanged || receivedNewMessage)) el.scrollTop = el.scrollHeight;

    scrollStateRef.current = { channelId: active, messageCount };
  }, [active, chatMessages[active]?.length]);

  // Selecting a channel marks its current messages as read, but a message
  // received while that channel is already open must be read as well.
  // Watching the message count avoids treating reaction updates as messages.
  useEffect(() => {
    if (!currentMember) return;
    void markChannelMessagesRead(active);
    // markChannelMessagesRead is recreated with context state; only run this
    // when the viewed channel or its actual message count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentMember?.id, chatMessages[active]?.length]);

  if (!currentMember) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-5">
          <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            팀 채팅
          </div>
          <h1 className="text-2xl font-700">Team Chat</h1>
        </div>
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
        >
          <div className="text-3xl mb-3">◐</div>
          <div className="text-sm font-600">이 프로젝트에 참여한 팀원만 채팅할 수 있어요</div>
        </div>
      </div>
    );
  }

  const chan = channels.find((c) => c.id === active) || channels[0];
  const thread = chatMessages[active] || [];
  const latestMessageId = thread[thread.length - 1]?.id;

  function memberFor(id: string) {
    return team.members.find((m) => m.id === id);
  }

  function folderNameOf(folderId: number | null) {
    return folderId === null ? "루트" : folders.find((f) => f.id === folderId)?.name || "폴더";
  }

  function fileRefFor(fileId: number | null): FileRef | undefined {
    if (fileId === null) return undefined;
    const f = files.find((x) => x.id === fileId);
    if (!f) return undefined;
    return { id: f.id, name: f.name, type: f.type, folderId: f.folderId, folderName: folderNameOf(f.folderId) };
  }

  function pickFile(f: WorkspaceFile) {
    setPendingFile({ id: f.id, name: f.name, type: f.type, folderId: f.folderId, folderName: folderNameOf(f.folderId) });
    setPickerOpen(false);
    setFileMentionSearch("");
  }

  function send() {
    if (!input.trim() && !pendingFile) return;
    sendChatMessage(active, input, pendingFile?.id);
    setInput("");
    setPendingFile(null);
  }

  function appendEmoji(emoji: string) {
    setInput((value) => value + emoji);
    setEmojiPickerOpen(false);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col h-full md:block md:h-auto">
      <div className="hidden md:block mb-5 shrink-0">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          채팅
        </div>
        <h1 className="text-2xl font-700">Team Chat</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          {project.name} · 팀 채팅과 1:1 대화{project.status === "done" && " · 종료된 프로젝트 대화 기록"}
        </p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-5 gap-0 overflow-hidden flex-1 min-h-0 md:flex-none md:h-[560px]"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
      >
        {/* Channel list */}
        <div
          className={`${mobileShowThread ? "hidden" : "flex"} md:flex md:col-span-2 min-h-0 flex-col`}
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>채널</div>
            <input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="채널 검색"
              className="w-full text-xs px-3 py-1.5 border outline-none"
              style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {filteredChannels.map((c) => {
              const isActive = active === c.id;
              const unread = chatUnread[c.id] ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => selectChannel(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                  style={{ background: isActive ? "var(--secondary)" : "transparent", borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent" }}
                >
                  <div className="w-9 h-9 relative shrink-0">
                    <div className="w-full h-full rounded-full flex items-center justify-center text-sm font-700 overflow-hidden" style={{ background: c.avatarUrl ? "var(--card)" : `${c.color}18`, color: c.color }}>
                      {c.avatarUrl ? <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover" /> : c.avatar}
                    </div>
                    {c.type === "dm" && c.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e", border: "2px solid var(--card)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-700 truncate" style={{ color: isActive ? "var(--primary)" : "var(--foreground)" }}>{c.name}</div>
                    <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                      {c.type === "group" ? `전체 ${otherMembers.length + 1}명` : c.role}
                    </div>
                  </div>
                  {unread > 0 && (
                    <span className="text-xs font-700 min-w-5 h-5 px-1 flex items-center justify-center shrink-0" style={{ background: "var(--accent)", color: "#fff", borderRadius: "20px" }}>
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredChannels.length === 0 && (
              <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</div>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`${mobileShowThread ? "flex" : "hidden"} md:flex md:col-span-3 min-h-0 min-w-0 flex-col`}>
          <div className="flex items-center gap-2.5 px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setMobileShowThread(false)}
              className="md:hidden w-8 h-8 flex items-center justify-center text-base shrink-0"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "8px" }}
              aria-label="채널 목록으로"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => chan.memberId && openMemberProfile(chan.memberId)}
              disabled={!chan.memberId}
              className="w-8 h-8 relative shrink-0"
              title={chan.type === "dm" ? `${chan.name} 프로필 보기` : undefined}
            >
              <div className="w-full h-full rounded-full flex items-center justify-center text-xs font-700 overflow-hidden" style={{ background: chan.avatarUrl ? "var(--card)" : `${chan.color}18`, color: chan.color }}>
                {chan.avatarUrl ? <img src={chan.avatarUrl} alt={chan.name} className="w-full h-full object-cover" /> : chan.avatar}
              </div>
              {chan.type === "dm" && chan.online && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e", border: "2px solid var(--card)" }} />
              )}
            </button>
            <div>
              <div className="text-sm font-700">{chan.name}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {chan.type === "group" ? `전체 ${otherMembers.length + 1}명` : chan.role}
              </div>
            </div>
          </div>

          <div ref={threadRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4 flex flex-col gap-1">
            {thread.map((m, index) => {
              const mine = m.senderId === currentMember.id;
              const sender = memberFor(m.senderId);
              // Receipts can outlive the locally loaded membership list.
              // Only show identifiable teammates, excluding the sender.
              const readers = [...new Set(m.readBy)]
                .filter((id) => id !== m.senderId)
                .flatMap((id) => {
                  const member = memberFor(id);
                  return member ? [member] : [];
                });
              const fileRef = fileRefFor(m.fileId);
              const joinsPrevious = belongsToMessageGroup(thread[index - 1], m);
              const joinsNext = belongsToMessageGroup(m, thread[index + 1]);
              const bubbleRadius = mine
                ? joinsPrevious
                  ? joinsNext ? "14px 2px 2px 14px" : "14px 2px 14px 14px"
                  : "14px 14px 2px 14px"
                : joinsPrevious
                  ? joinsNext ? "2px 14px 14px 2px" : "2px 14px 14px 14px"
                  : "14px 14px 14px 2px";
              return (
                <Fragment key={m.id}>
                  {startsNewChatDay(thread[index - 1], m) && (
                    <div className="flex justify-center w-full mt-4 mb-2">
                      <time dateTime={m.createdAt} className="px-3 py-1 text-xs rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                        {formatChatDate(m.createdAt)}
                      </time>
                    </div>
                  )}
                <div className={`group/message flex flex-col min-w-0 w-full ${joinsPrevious ? "mt-0.5" : "mt-3"}`} style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                  {!mine && !joinsPrevious && (
                    <span className="text-xs font-600 mb-1 px-1" style={{ color: "var(--muted-foreground)" }}>{sender?.name ?? "알 수 없음"}</span>
                  )}
                  <div className="relative flex flex-col min-w-0 max-w-[75%]" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                      {m.text && (
                        <div
                          className="px-3.5 py-2.5 text-sm max-w-none leading-relaxed break-words"
                          style={{
                            background: mine ? "var(--primary)" : "var(--muted)",
                            color: mine ? "#fff" : "var(--foreground)",
                            borderRadius: bubbleRadius,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {m.text}
                        </div>
                      )}
                      {fileRef && (
                        <button
                          onClick={() => onOpenFile?.(fileRef.id, fileRef.folderId)}
                          className="flex items-center gap-2.5 px-3 py-2.5 max-w-none text-left transition-all"
                          style={{
                            background: "var(--card)",
                            border: "1.5px solid var(--border)",
                            borderRadius: "12px",
                            marginTop: m.text ? 6 : 0,
                          }}
                        >
                          <span
                            className="text-xs font-700 px-2 py-1 shrink-0"
                            style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "6px" }}
                          >
                            {fileTypeLabel[fileRef.type] || "FILE"}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-700 truncate" style={{ color: "var(--foreground)" }}>{fileRef.name}</div>
                            <div className="text-xs" style={{ color: "var(--primary)" }}>{fileRef.folderName} · 워크스페이스에서 보기 →</div>
                          </div>
                        </button>
                      )}
                    <div className={`absolute top-1 ${mine ? "right-full mr-2" : "left-full ml-2"} opacity-0 pointer-events-none group-hover/message:opacity-100 group-hover/message:pointer-events-auto group-focus-within/message:opacity-100 group-focus-within/message:pointer-events-auto transition-opacity z-10`}>
                      <button
                        onClick={() => setReactionPickerMessageId((id) => id === m.id ? null : m.id)}
                        className="w-8 h-8 flex items-center justify-center text-sm"
                        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "50%", boxShadow: "var(--shadow-card)" }}
                        title="반응하기"
                        aria-label="반응하기"
                      >
                        😊
                      </button>
                      {reactionPickerMessageId === m.id && (
                        <div className={`absolute top-0 ${mine ? "right-full mr-1" : "left-full ml-1"} flex items-center gap-0.5 p-1`} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", boxShadow: "var(--shadow-card)", animation: "reaction-picker-in 180ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                          {chatEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => { void toggleChatReaction(m.id, emoji); setReactionPickerMessageId(null); }}
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
                      {[...new Set(m.reactions.map((reaction) => reaction.emoji))].map((emoji) => {
                      const reactions = m.reactions.filter((reaction) => reaction.emoji === emoji);
                      const reactedByMe = reactions.some((reaction) => reaction.memberId === currentMember.id);
                      return (
                        <button
                          key={emoji}
                          onClick={() => void toggleChatReaction(m.id, emoji)}
                          className="h-6 px-1.5 flex items-center gap-1 text-xs transition-all"
                          style={{
                            background: reactedByMe ? "var(--secondary)" : "var(--muted)",
                            color: "var(--foreground)",
                            border: reactedByMe ? "1px solid var(--primary)" : "1px solid transparent",
                            borderRadius: "12px",
                            animation: "reaction-pop 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                          title={`${reactions.map((reaction) => memberFor(reaction.memberId)?.name ?? "팀원").join(", ")} 반응`}
                        >
                          <span>{emoji}</span><span className="font-600">{reactions.length}</span>
                        </button>
                      );
                      })}
                    </div>
                  )}
                  {!joinsNext && (
                    <div className="flex items-center gap-1.5 mt-1 px-1">
                    {m.id === latestMessageId && chan.type === "dm" && readers.length > 0 && (
                      <span className="text-xs font-600" style={{ color: "var(--primary)" }}>읽음</span>
                    )}
                    {m.id === latestMessageId && chan.type === "group" && readers.length > 0 && (
                      <div className="flex items-center -space-x-1.5" title={`읽음: ${readers.map((reader) => reader.name).join(", ")}`}>
                        {readers.map((reader) => {
                          return (
                            <div
                              key={reader.id}
                              title={`${reader.name} 읽음`}
                              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-700 overflow-hidden"
                              style={{
                                background: reader.avatarUrl ? "var(--card)" : reader.color || "var(--muted-foreground)",
                                color: "#fff",
                                border: "1.5px solid var(--card)",
                              }}
                            >
                              {reader.avatarUrl ? (
                                <img src={reader.avatarUrl} alt={reader.name} className="w-full h-full object-cover" />
                              ) : (
                                (reader.avatar.trim() && reader.avatar !== "?" ? reader.avatar : reader.name.trim().slice(0, 1)) || "팀"
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                      <time dateTime={m.createdAt} className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{formatChatTime(m.createdAt)}</time>
                    </div>
                  )}
                </div>
                </Fragment>
              );
            })}
            {thread.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "var(--muted-foreground)" }}>아직 대화가 없어요</div>
            )}
          </div>

          <div className="shrink-0 relative" style={{ borderTop: "1px solid var(--border)" }}>
            {emojiPickerOpen && (
              <div className="absolute bottom-full left-14 mb-2 flex items-center gap-1 p-1.5 z-20" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", boxShadow: "0 16px 40px rgba(15,18,53,0.18)" }}>
                {chatEmojis.map((emoji) => (
                  <button key={emoji} onClick={() => appendEmoji(emoji)} className="w-8 h-8 text-base transition-transform hover:scale-110" title={`${emoji} 입력`}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {pickerOpen && (
              <div
                className="absolute bottom-full left-4 right-4 mb-2 max-h-64 overflow-y-auto p-1.5 z-20"
                style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "0 16px 40px rgba(15,18,53,0.18)" }}
              >
                <div className="text-xs font-600 uppercase tracking-widest px-2.5 pt-1.5 pb-2" style={{ color: "var(--muted-foreground)" }}>
                  워크스페이스 파일 언급하기
                </div>
                <input
                  value={fileMentionSearch}
                  onChange={(e) => setFileMentionSearch(e.target.value)}
                  placeholder="파일 검색"
                  autoFocus
                  className="w-full text-xs px-3 py-1.5 border outline-none mb-1.5"
                  style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
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
                      style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "6px" }}
                    >
                      {fileTypeLabel[f.type] || "FILE"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-700 truncate">{f.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{folderNameOf(f.folderId)}</div>
                    </div>
                  </button>
                ))}
                {filteredMentionFiles.length === 0 && (
                  <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>
                    {files.length === 0 ? "워크스페이스에 업로드된 파일이 없어요" : "검색 결과가 없어요"}
                  </div>
                )}
              </div>
            )}

            {pendingFile && (
              <div className="flex items-center gap-2.5 mx-4 mt-3 px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                <span
                  className="text-xs font-700 px-2 py-1 shrink-0"
                  style={{ background: "var(--card)", color: "var(--primary)", borderRadius: "6px" }}
                >
                  {fileTypeLabel[pendingFile.type] || "FILE"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-700 truncate">{pendingFile.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{pendingFile.folderName}에서 공유</div>
                </div>
                <button onClick={() => setPendingFile(null)} className="text-xs font-700 px-2 shrink-0" style={{ color: "var(--muted-foreground)" }}>
                  ✕
                </button>
              </div>
            )}

            <div className="px-4 py-3 flex items-center gap-2">
              <button
                onClick={() => setEmojiPickerOpen((value) => !value)}
                className="w-9 h-9 flex items-center justify-center text-sm shrink-0 transition-all"
                style={{ background: emojiPickerOpen ? "var(--primary)" : "var(--muted)", color: emojiPickerOpen ? "#fff" : "var(--muted-foreground)", borderRadius: "50%" }}
                title="이모지 입력"
              >
                😊
              </button>
              <button
                onClick={() => { setPickerOpen((v) => !v); setEmojiPickerOpen(false); }}
                className="w-9 h-9 flex items-center justify-center text-sm shrink-0 transition-all"
                style={{ background: pickerOpen ? "var(--primary)" : "var(--muted)", color: pickerOpen ? "#fff" : "var(--muted-foreground)", borderRadius: "50%" }}
                title="워크스페이스 파일 언급"
              >
                📎
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={pendingFile ? "메시지 추가 (선택)..." : `${chan.name}에게 메시지 보내기...`}
                className="flex-1 text-sm px-3.5 py-2.5 outline-none"
                style={{ background: "var(--muted)", borderRadius: "20px", fontFamily: "var(--font-outfit)" }}
              />
              <button
                onClick={send}
                className="w-9 h-9 flex items-center justify-center text-sm font-700 shrink-0 transition-all"
                style={{
                  background: input.trim() || pendingFile ? "var(--primary)" : "var(--muted)",
                  color: input.trim() || pendingFile ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "50%",
                }}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
