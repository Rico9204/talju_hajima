import { useState } from "react";
import { useProject } from "../context/ProjectContext";
import type { CollabEditor } from "../lib/collab";
import Avatar from "./Avatar";

// 바로 수정 중인 사람들을 프로필 사진으로 보여준다. 사진을 누르면 이름이 뜬다(다시 누르면 닫힘).
export default function EditorAvatars({ editors, size = 22, max = 4 }: { editors: CollabEditor[]; size?: number; max?: number }) {
  const { team } = useProject();
  const [openId, setOpenId] = useState<string | null>(null);
  const people = [...new Map(editors.map((e) => [e.memberId, e])).values()];
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  return (
    <span className="relative inline-flex items-center">
      {shown.map((e, i) => {
        const member = team.members.find((m) => m.id === e.memberId);
        return (
          <span
            key={e.memberId}
            role="button"
            tabIndex={0}
            aria-label={`${e.name} 수정 중`}
            onClick={(ev) => { ev.stopPropagation(); toggle(e.memberId); }}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); toggle(e.memberId); } }}
            className="relative inline-flex cursor-pointer"
            style={{ marginLeft: i ? -6 : 0, borderRadius: 999, boxShadow: "0 0 0 2px var(--card)", zIndex: openId === e.memberId ? 20 : shown.length - i }}
          >
            <Avatar url={member?.avatarUrl} initial={member?.avatar ?? e.name.slice(0, 1)} color={member?.color ?? "#f59e0b"} size={size} />
            {openId === e.memberId && (
              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-xs font-600 px-2 py-1 rounded-md" style={{ background: "rgba(15,18,53,0.92)", color: "#fff" }}>{e.name}</span>
            )}
          </span>
        );
      })}
      {extra > 0 && <span className="ml-1 text-xs font-600">+{extra}</span>}
    </span>
  );
}
