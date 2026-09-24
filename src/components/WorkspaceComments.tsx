import StillImg from "./StillImg";
import { useRef, useState } from "react";
import type { WorkspaceFile } from "../api/types";
import { useProject } from "../context/ProjectContext";

const emojis = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

export default function WorkspaceComments({ file, focusedVersionId }: { file: WorkspaceFile; focusedVersionId: number | null }) {
  const { project, team, currentMember, addFileComment, setFileCommentReaction, openMemberProfile } = useProject();
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<number | "draft" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 보기: 파일 전체 댓글 / 지금 보는 버전의 댓글만. 작성: 켜두면 지금 보는 버전에 붙는다.
  const [filter, setFilter] = useState<"all" | "version">("all");
  const [attachToVersion, setAttachToVersion] = useState(true);
  const focusedVersion = file.versions.find((v) => v.id === focusedVersionId) ?? null;
  const shown = filter === "version" ? file.comments.filter((c) => c.versionId === focusedVersionId) : file.comments;
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const locked = project.status === "done" || !currentMember;
  async function run(action: () => Promise<void>) {
    if (pending.current || locked) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError((e as { message?: string })?.message ?? "댓글을 저장하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); }
  }
  const buttonClass = "rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 transition-colors";
  return <div className="flex flex-col gap-3">
    {focusedVersion && <div className="flex gap-1.5" role="tablist" aria-label="댓글 보기 범위">
      {([["version", `이 버전만 (${focusedVersion.version})`], ["all", "파일 전체"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className="text-xs font-700 px-3 py-1.5 rounded-full" style={{ background: filter === value ? "var(--primary)" : "var(--muted)", color: filter === value ? "#fff" : "var(--foreground)" }}>{label}</button>)}
    </div>}
    {shown.map((comment) => {
      const member = team.members.find((m) => m.id === comment.memberId);
      const name = member?.name ?? comment.author;
      const reactions = comment.reactions ?? [];
      return <div key={comment.id} className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => member && openMemberProfile(member.id)}
          disabled={!member}
          title={member ? `${name} 프로필 보기` : name}
          className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-700 shrink-0"
          style={{ background: "var(--secondary)", color: member?.color ?? "var(--primary)" }}
        >
          {member?.avatarUrl ? <StillImg src={member.avatarUrl} alt={`${name} 프로필`} className="w-full h-full object-cover" /> : member?.avatar || comment.avatar || name.slice(0, 1)}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-700">{name}</span><time style={{ color: "var(--muted-foreground)" }}>{comment.date}</time>{comment.versionId !== null && <span className="px-1.5 py-0.5 rounded font-600" style={{ background: "var(--secondary)", color: "var(--primary)" }}>{file.versions.find((v) => v.id === comment.versionId)?.version ?? "이전 버전"}</span>}</div>
          <p className="text-xs mt-1 leading-relaxed px-3 py-2 rounded-xl whitespace-pre-wrap break-words" style={{ background: "var(--muted)" }}>{comment.text}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[...new Set(reactions.map((r) => r.emoji))].map((emoji) => {
              const group = reactions.filter((r) => r.emoji === emoji);
              const active = group.some((r) => r.memberId === currentMember?.id);
              return <button key={emoji} disabled={locked || busy} aria-pressed={active} aria-label={`${emoji} 반응 ${group.length}개`} title={group.map((r) => team.members.find((m) => m.id === r.memberId)?.name ?? "팀원").join(", ")} className={buttonClass} style={{ borderColor: active ? "var(--primary)" : "var(--border)", background: active ? "var(--secondary)" : "var(--card)" }} onClick={() => void run(() => setFileCommentReaction(comment.id, emoji, !active))}>{emoji} {group.length}</button>;
            })}
            {!locked && <button disabled={busy} aria-label={`${name} 댓글에 이모티콘 반응`} aria-expanded={picker === comment.id} className={buttonClass} style={{ borderColor: "var(--border)" }} onClick={() => setPicker(picker === comment.id ? null : comment.id)}>☺ 반응</button>}
          </div>
          {picker === comment.id && !locked && <div className="flex flex-wrap gap-1 mt-2 p-1 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--card-glass)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>{emojis.map((emoji) => <button key={emoji} disabled={busy} title={`${emoji} 반응`} className="w-8 h-8 rounded-lg hover:bg-[var(--secondary)]" onClick={() => void run(async () => { await setFileCommentReaction(comment.id, emoji, !reactions.some((r) => r.emoji === emoji && r.memberId === currentMember?.id)); setPicker(null); })}>{emoji}</button>)}</div>}
        </div>
      </div>;
    })}
    {!shown.length && <p className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>{filter === "version" ? "이 버전에 남긴 댓글이 아직 없어요." : "아직 댓글이 없어요. 첫 코멘트를 남겨보세요."}</p>}
    {error && <p role="alert" className="text-xs text-red-700 rounded-lg bg-red-50 p-3">{error}</p>}
    {!locked && <div>
      {picker === "draft" && <div className="flex gap-1 mb-2 p-1 rounded-xl" style={{ background: "var(--secondary)" }}>{emojis.map((emoji) => <button key={emoji} disabled={busy} title={`${emoji} 입력`} className="w-8 h-8" onClick={() => { setDraft((text) => text + emoji); setPicker(null); input.current?.focus(); }}>{emoji}</button>)}</div>}
      <form className="flex gap-2 mt-1" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void run(async () => { await addFileComment(file.id, draft, attachToVersion ? focusedVersion?.id ?? null : null); setDraft(""); setPicker(null); }); }}>
        <button type="button" disabled={busy} aria-label="댓글 이모티콘 입력" aria-expanded={picker === "draft"} className="shrink-0 w-8 h-8 rounded-full" style={{ background: "var(--secondary)" }} onClick={() => setPicker(picker === "draft" ? null : "draft")}>☺</button>
        <input ref={input} aria-label="파일 댓글" disabled={busy} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }} placeholder="이 파일에 코멘트 남기기…" className="flex-1 min-w-0 text-xs px-3 py-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" style={{ background: "var(--muted)" }} />
        <button disabled={busy || !draft.trim()} className="px-3 text-xs font-700 rounded-full shrink-0 disabled:opacity-40" style={{ background: "var(--primary)", color: "white" }}>{busy ? "저장 중" : "등록"}</button>
      </form>
      {focusedVersion && <label className="flex items-center gap-2 text-xs mt-2" style={{ color: "var(--muted-foreground)" }}><input type="checkbox" checked={attachToVersion} onChange={(e) => setAttachToVersion(e.target.checked)} />지금 보는 버전({focusedVersion.version})에 댓글 남기기</label>}
    </div>}
  </div>;
}
