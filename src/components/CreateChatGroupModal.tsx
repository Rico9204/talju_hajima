import { useState } from "react";
import { useProject } from "../context/ProjectContext";
import type { ChatGroup } from "../api/types";
import Avatar from "./Avatar";

// 팀장·부팀장이 팀원을 골라 단체 채팅방을 만들거나(group 없음), 이미 있는 방에 팀원을 추가한다(group 있음).
// 서버(create_chat_group / add_chat_group_members)가 권한·인원·이름을 다시 검사한다.
export default function CreateChatGroupModal({ group, onClose, onDone }: {
  group?: ChatGroup;
  onClose: () => void;
  onDone: (channelId: string) => void;
}) {
  const { team, currentMember, createChatGroup, addChatGroupMembers } = useProject();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inviting = !!group;
  const [query, setQuery] = useState("");
  const others = team.members.filter((m) => m.id !== currentMember?.id && !group?.memberIds.includes(m.id));
  // 팀 화면(TeamView)과 같은 기준: 고를 사람이 6명을 넘으면 이름·역할 검색. 골라 둔 사람은 검색에 안 걸려도 선택이 유지된다.
  const showSearch = others.length > 6;
  const q = query.trim().toLowerCase();
  const shown = showSearch && q ? others.filter((m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)) : others;
  const ready = inviting ? picked.size >= 1 : name.trim().length > 0 && picked.size >= 2;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true); setError("");
    try {
      if (group) {
        await addChatGroupMembers(group.id, Array.from(picked));
        onDone(`grp:${group.id}`);
      } else {
        onDone(await createChatGroup(name.trim(), Array.from(picked)));
      }
    } catch (e) {
      setError((e as { message?: string })?.message ?? (inviting ? "초대하지 못했습니다." : "채팅방을 만들지 못했습니다."));
      setBusy(false);
    }
  }

  const title = inviting ? `“${group.name}”에 팀원 초대` : "단체 채팅방 만들기";
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-96 max-w-full p-6 flex flex-col"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", maxHeight: "calc(100dvh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <h3 className="font-700 mb-1 truncate">{title}</h3>
        <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
          {inviting ? "초대한 팀원은 이 방의 지난 대화도 볼 수 있어요." : "나를 포함해 선택한 팀원만 보고 대화할 수 있어요. 2명 이상 골라 주세요."}
        </p>
        {!inviting && (
          <input
            autoFocus
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit(); }}
            placeholder="채팅방 이름 (예: 발표 준비)"
            aria-label="채팅방 이름"
            className="w-full text-sm px-3 py-2 border outline-none mb-3"
            style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-opaque)" }}
          />
        )}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="text-xs font-700 shrink-0" style={{ color: "var(--muted-foreground)" }}>팀원 선택 · {picked.size}명</div>
          {showSearch && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·역할 검색"
              aria-label="팀원 검색"
              className="w-36 min-w-0 text-xs px-3 py-1.5 border outline-none"
              style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--surface-opaque)" }}
            />
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-2 mb-4" style={{ maxHeight: 280 }}>
          {showSearch && q && shown.length === 0 && <p className="px-2 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</p>}
          {shown.map((m) => (
            <label key={m.id} className="flex items-center gap-3 px-2 py-2 cursor-pointer rounded-lg hover:bg-[var(--muted)]">
              <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} className="shrink-0" />
              <Avatar url={m.avatarUrl} initial={m.avatar} color={m.color} size={28} />
              <span className="min-w-0">
                <span className="block text-sm font-600 truncate">{m.name}{m.isLeader ? " · 팀장" : m.isViceLeader ? " · 부팀장" : ""}</span>
                <span className="block text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{m.role}</span>
              </span>
            </label>
          ))}
          {inviting && others.length === 0 && <p className="px-2 text-xs" style={{ color: "var(--muted-foreground)" }}>팀원이 모두 이 방에 참여하고 있어요.</p>}
          {!inviting && others.length < 2 && <p className="px-2 text-xs" style={{ color: "var(--muted-foreground)" }}>단체방을 만들려면 나 말고 팀원이 2명 이상 있어야 해요.</p>}
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>취소</button>
          <button
            disabled={!ready || busy}
            onClick={() => void submit()}
            className="flex-1 py-2.5 text-sm font-700 disabled:opacity-50"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px" }}
          >
            {busy ? (inviting ? "초대 중…" : "만드는 중…") : inviting ? "초대하기" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
