import { useEffect, useState } from "react";
import { useProject, type Task, type TaskStatus, type TaskPriority, type Member } from "../context/ProjectContext";
import { memberInfo } from "./TaskBoard";
import Avatar from "./Avatar";

const commentEmojis = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

interface Props {
  task: Task;
  members: Member[];
  columns: { id: TaskStatus; label: string; color: string; bg: string }[];
  priorityLabel: Record<TaskPriority, { label: string; color: string }>;
  currentMember: Member | null;
  isLeader: boolean;
  isAssignee: boolean;
  canChangeStatus: boolean;
  locked: boolean;
  onClose: () => void;
  onUpdateDetails: (patch: Partial<{ title: string; assigneeIds: string[]; priority: TaskPriority; due: string; tags: string[] }>) => void;
  onChangeStatus: (status: TaskStatus) => void;
  onDelete: () => void;
  onToggleChecklist: (itemId: number, done: boolean) => void;
  onAddChecklistItem: (text: string) => void;
  onAddComment: (text: string) => void;
  onToggleCommentReaction: (commentId: number, emoji: string) => void;
  onToggleTeamSchedule: (checked: boolean) => void;
  onTogglePersonalSchedule: (checked: boolean) => void;
}

export default function TaskDetailPanel({
  task,
  members,
  columns,
  priorityLabel,
  currentMember,
  isLeader,
  isAssignee,
  canChangeStatus,
  locked,
  onClose,
  onUpdateDetails,
  onChangeStatus,
  onDelete,
  onToggleChecklist,
  onAddChecklistItem,
  onAddComment,
  onToggleCommentReaction,
  onToggleTeamSchedule,
  onTogglePersonalSchedule,
}: Props) {
  const { openMemberProfile } = useProject();
  const [assigneeSearch, setAssigneeSearch] = useState("");
  useEffect(() => { setAssigneeSearch(""); }, [task.id]);
  const [tagDraft, setTagDraft] = useState("");
  const [checklistDraft, setChecklistDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentEmojiPickerOpen, setCommentEmojiPickerOpen] = useState(false);
  const [reactionPickerCommentId, setReactionPickerCommentId] = useState<number | null>(null);

  const doneCount = task.checklist.filter((c) => c.done).length;
  const canEditFields = isLeader && !locked;
  const showAssigneeSearch = members.length > 8;
  const assigneeSearchTrimmed = assigneeSearch.trim().toLowerCase();
  const visibleAssigneeMembers = assigneeSearchTrimmed
    ? members.filter((m) => m.name.toLowerCase().includes(assigneeSearchTrimmed))
    : members;

  function addTag() {
    const value = tagDraft.trim();
    if (!value || task.tags.includes(value)) return;
    onUpdateDetails({ tags: [...task.tags, value] });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    onUpdateDetails({ tags: task.tags.filter((t) => t !== tag) });
  }

  function toggleAssignee(id: string) {
    const next = task.assigneeIds.includes(id) ? task.assigneeIds.filter((n) => n !== id) : [...task.assigneeIds, id];
    if (next.length === 0) return;
    onUpdateDetails({ assigneeIds: next });
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40" style={{ background: "rgba(15,23,42,0.4)" }} />
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{ width: "420px", maxWidth: "92vw", background: "var(--card-glass)", boxShadow: "-8px 0 24px rgba(0,0,0,0.16)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            과제 상세
          </span>
          <button onClick={onClose} className="text-sm px-2 py-1" style={{ color: "var(--muted-foreground)" }}>
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {canEditFields ? (
            <input
              value={task.title}
              onChange={(e) => onUpdateDetails({ title: e.target.value })}
              className="w-full text-base font-700 px-0 py-1 mb-3 outline-none border-0 border-b bg-transparent"
              style={{ borderColor: "var(--border)" }}
            />
          ) : (
            <h3 className="text-base font-700 mb-3 leading-snug">{task.title}</h3>
          )}

          <div className="mb-4">
            <div className="text-xs font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>담당자</div>
            {canEditFields ? (
              <div>
                {showAssigneeSearch && (
                  <input
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    placeholder="담당자 검색"
                    className="w-full text-xs px-3 py-1.5 border outline-none mb-2"
                    style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
                  />
                )}
                <div className="flex items-center gap-2 flex-wrap max-h-40 overflow-y-auto pr-1">
                  {visibleAssigneeMembers.map((m) => {
                    const checked = task.assigneeIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleAssignee(m.id)}
                        aria-pressed={checked}
                        className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 text-xs font-600 shrink-0 transition-all"
                        style={{
                          background: checked ? `${m.color}18` : "var(--muted)",
                          color: checked ? m.color : "var(--muted-foreground)",
                          borderRadius: "20px",
                          opacity: checked ? 1 : 0.5,
                        }}
                      >
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-700 shrink-0 overflow-hidden"
                          style={{ background: m.avatarUrl ? "var(--card)" : checked ? `${m.color}30` : "var(--border)", color: checked ? m.color : "var(--muted-foreground)" }}
                        >
                          {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : m.avatar}
                        </span>
                        {m.name}
                      </button>
                    );
                  })}
                  {visibleAssigneeMembers.length === 0 && (
                    <div className="text-xs py-1" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {task.assigneeIds.map((id) => {
                  const info = memberInfo(members, id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 text-xs font-600 shrink-0"
                      style={{ background: `${info.color}18`, color: info.color, borderRadius: "20px" }}
                    >
                      <button
                        type="button"
                        onClick={() => openMemberProfile(id)}
                        title={`${info.name} 프로필 보기`}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-700 shrink-0 overflow-hidden"
                        style={{ background: info.avatarUrl ? "var(--card)" : `${info.color}30`, color: info.color }}
                      >
                        {info.avatarUrl ? <img src={info.avatarUrl} alt={info.name} className="w-full h-full object-cover" /> : info.avatar}
                      </button>
                      {info.name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>우선순위</div>
              {canEditFields ? (
                <select
                  value={task.priority}
                  onChange={(e) => onUpdateDetails({ priority: e.target.value as TaskPriority })}
                  className="w-full text-xs px-2 py-1.5 border outline-none"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)" }}
                >
                  {(Object.keys(priorityLabel) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>{priorityLabel[p].label}</option>
                  ))}
                </select>
              ) : (
                <span
                  className="text-xs font-600 px-2 py-0.5 inline-block"
                  style={{ background: `${priorityLabel[task.priority].color}15`, color: priorityLabel[task.priority].color, borderRadius: "20px" }}
                >
                  {priorityLabel[task.priority].label}
                </span>
              )}
            </div>

            <div>
              <div className="text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>마감일</div>
              {canEditFields ? (
                <input
                  type="date"
                  value={task.due}
                  onChange={(e) => onUpdateDetails({ due: e.target.value })}
                  className="w-full text-xs px-2 py-1.5 border outline-none"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-jetbrains)" }}
                />
              ) : (
                <span className="text-xs" style={{ fontFamily: "var(--font-jetbrains)" }}>{task.due || "미정"}</span>
              )}
            </div>

            <div>
              <div className="text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>상태</div>
              <select
                value={task.status}
                disabled={!canChangeStatus || locked}
                onChange={(e) => onChangeStatus(e.target.value as TaskStatus)}
                className="w-full text-xs px-2 py-1.5 border outline-none"
                style={{
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: canChangeStatus && !locked ? "var(--background)" : "var(--muted)",
                  color: canChangeStatus && !locked ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>태그</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {task.tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 flex items-center gap-1" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                  {tag}
                  {canEditFields && (
                    <button onClick={() => removeTag(tag)} style={{ color: "var(--primary)" }}>✕</button>
                  )}
                </span>
              ))}
              {canEditFields && (
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="+ 태그"
                  className="text-xs px-2 py-1 outline-none w-16"
                  style={{ background: "var(--muted)", borderRadius: "20px" }}
                />
              )}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>일정에 추가</div>
            {!task.due ? (
              <div className="text-xs text-center py-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "8px" }}>
                마감일을 먼저 설정하면 일정에 추가할 수 있어요
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  className="flex items-center gap-2 text-xs px-2.5 py-1.5"
                  style={{ background: "var(--muted)", borderRadius: "8px", opacity: isLeader && !locked ? 1 : 0.6 }}
                >
                  <input
                    type="checkbox"
                    checked={!!task.teamScheduleEventId}
                    disabled={!isLeader || locked}
                    onChange={(e) => onToggleTeamSchedule(e.target.checked)}
                  />
                  팀 일정에 추가
                  {!isLeader && <span className="ml-auto" style={{ color: "var(--muted-foreground)" }}>팀장만 가능</span>}
                </label>
                <label
                  className="flex items-center gap-2 text-xs px-2.5 py-1.5"
                  style={{ background: "var(--muted)", borderRadius: "8px", opacity: isAssignee && !locked ? 1 : 0.6 }}
                >
                  <input
                    type="checkbox"
                    checked={!!task.personalScheduleEventId}
                    disabled={!isAssignee || locked}
                    onChange={(e) => onTogglePersonalSchedule(e.target.checked)}
                  />
                  내 개인 일정에 추가
                  {!isAssignee && <span className="ml-auto" style={{ color: "var(--muted-foreground)" }}>담당자만 가능</span>}
                </label>
              </div>
            )}
          </div>

          <div className="h-px mb-4" style={{ background: "var(--border)" }} />

          {/* Checklist */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-700">체크리스트</span>
              <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
                {doneCount}/{task.checklist.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 mb-2">
              {task.checklist.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-xs px-2.5 py-1.5" style={{ background: "var(--muted)", borderRadius: "8px" }}>
                  <input type="checkbox" checked={item.done} disabled={locked || !isAssignee} onChange={(e) => onToggleChecklist(item.id, e.target.checked)} />
                  <span style={{ textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--muted-foreground)" : "var(--foreground)" }}>
                    {item.text}
                  </span>
                </label>
              ))}
              {task.checklist.length === 0 && (
                <div className="text-xs text-center py-2" style={{ color: "var(--muted-foreground)" }}>
                  아직 체크리스트 항목이 없어요.
                </div>
              )}
            </div>
            {!isAssignee && (
              <div className="text-xs text-center py-2 mb-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "8px" }}>
                이 과제의 담당자만 체크리스트를 변경할 수 있어요
              </div>
            )}
            {!locked && isAssignee && (
              <div className="flex gap-2">
                <input
                  value={checklistDraft}
                  onChange={(e) => setChecklistDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (onAddChecklistItem(checklistDraft), setChecklistDraft(""))}
                  placeholder="항목 추가..."
                  className="flex-1 text-xs px-3 py-1.5 outline-none"
                  style={{ background: "var(--muted)", borderRadius: "20px" }}
                />
                <button
                  onClick={() => { onAddChecklistItem(checklistDraft); setChecklistDraft(""); }}
                  className="px-3 text-xs font-700 shrink-0 transition-all"
                  style={{
                    background: checklistDraft.trim() ? "var(--primary)" : "var(--muted)",
                    color: checklistDraft.trim() ? "#fff" : "var(--muted-foreground)",
                    borderRadius: "20px",
                  }}
                >
                  추가
                </button>
              </div>
            )}
          </div>

          <div className="h-px mb-4" style={{ background: "var(--border)" }} />

          {/* Comments */}
          <div>
            <span className="text-xs font-700 block mb-2">댓글 ({task.comments.length})</span>
            <div className="flex flex-col gap-3 mb-3">
              {task.comments.map((c) => {
                const liveMember = c.memberId ? members.find((m) => m.id === c.memberId) : undefined;
                return (
                <div key={c.id} className="group/comment flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => liveMember && openMemberProfile(liveMember.id)}
                    disabled={!liveMember}
                    title={liveMember ? `${liveMember.name} 프로필 보기` : undefined}
                    className="shrink-0"
                  >
                    <Avatar
                      url={liveMember?.avatarUrl ?? null}
                      initial={liveMember?.avatar ?? c.avatar}
                      color={liveMember?.color ?? "#2563eb"}
                      size={28}
                    />
                  </button>
                  <div className="relative flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-700">{c.author}</span>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{c.date}</span>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--foreground)" }}>
                      {c.text}
                    </p>
                    <div className="absolute right-0 top-0 opacity-0 pointer-events-none group-hover/comment:opacity-100 group-hover/comment:pointer-events-auto group-focus-within/comment:opacity-100 group-focus-within/comment:pointer-events-auto transition-opacity z-10">
                      <button
                        onClick={() => setReactionPickerCommentId((id) => id === c.id ? null : c.id)}
                        className="w-7 h-7 flex items-center justify-center text-xs"
                        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "50%", boxShadow: "var(--shadow-card)" }}
                        title="반응하기"
                        aria-label="반응하기"
                      >
                        😊
                      </button>
                      {reactionPickerCommentId === c.id && (
                        <div className="absolute top-0 right-full mr-1 flex items-center gap-0.5 p-1" style={{ background: "var(--card-glass)", border: "1px solid var(--border)", borderRadius: "14px", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)", animation: "reaction-picker-in 180ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                          {commentEmojis.map((emoji) => (
                            <button key={emoji} onClick={() => { onToggleCommentReaction(c.id, emoji); setReactionPickerCommentId(null); }} className="w-7 h-7 text-sm transition-transform hover:scale-110" title={`${emoji} 반응`}>
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {c.reactions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {[...new Set(c.reactions.map((reaction) => reaction.emoji))].map((emoji) => {
                          const reactions = c.reactions.filter((reaction) => reaction.emoji === emoji);
                          const reactedByMe = reactions.some((reaction) => reaction.memberId === currentMember?.id);
                          return (
                            <button
                              key={emoji}
                              onClick={() => onToggleCommentReaction(c.id, emoji)}
                              className="h-6 px-1.5 flex items-center gap-1 text-xs transition-all"
                              style={{ background: reactedByMe ? "var(--secondary)" : "var(--muted)", color: "var(--foreground)", border: reactedByMe ? "1px solid var(--primary)" : "1px solid transparent", borderRadius: "12px", animation: "reaction-pop 280ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                              title={`${reactions.map((reaction) => members.find((m) => m.id === reaction.memberId)?.name ?? "팀원").join(", ")} 반응`}
                            >
                              <span>{emoji}</span><span className="font-600">{reactions.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
              {task.comments.length === 0 && (
                <div className="text-xs text-center py-2" style={{ color: "var(--muted-foreground)" }}>
                  아직 댓글이 없어요.
                </div>
              )}
            </div>
            {!locked && (
              <div className="relative flex gap-2">
                <button
                  onClick={() => setCommentEmojiPickerOpen((open) => !open)}
                  className="w-8 h-8 shrink-0 text-sm"
                  style={{ background: "var(--muted)", borderRadius: "50%" }}
                  title="이모지 추가"
                  aria-label="이모지 추가"
                >
                  😊
                </button>
                {commentEmojiPickerOpen && (
                  <div className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 p-1 z-20" style={{ background: "var(--card-glass)", border: "1px solid var(--border)", borderRadius: "14px", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)", animation: "reaction-picker-in 180ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                    {commentEmojis.map((emoji) => (
                      <button key={emoji} onClick={() => { setCommentDraft((draft) => `${draft}${emoji}`); setCommentEmojiPickerOpen(false); }} className="w-7 h-7 text-sm transition-transform hover:scale-110" title={emoji}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (onAddComment(commentDraft), setCommentDraft(""))}
                  placeholder="댓글 남기기..."
                  className="flex-1 text-xs px-3 py-2 outline-none"
                  style={{ background: "var(--muted)", borderRadius: "20px" }}
                />
                <button
                  onClick={() => { onAddComment(commentDraft); setCommentDraft(""); }}
                  className="px-3 text-xs font-700 shrink-0 transition-all"
                  style={{
                    background: commentDraft.trim() ? "var(--primary)" : "var(--muted)",
                    color: commentDraft.trim() ? "#fff" : "var(--muted-foreground)",
                    borderRadius: "20px",
                  }}
                >
                  등록
                </button>
              </div>
            )}
          </div>
        </div>

        {isLeader && !locked && (
          <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={onDelete}
              className="w-full text-xs font-700 py-2 transition-all"
              style={{ background: "#ef444415", color: "#ef4444", borderRadius: "var(--radius-sm)" }}
            >
              과제 삭제
            </button>
          </div>
        )}
      </div>
    </>
  );
}
