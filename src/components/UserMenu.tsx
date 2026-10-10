import { useEffect, useState } from "react";
import { useProject, type ProfileSection } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import AvatarFrame from "./AvatarFrame";
import MedalIcon from "./MedalIcon";
import { useMyProfileTheme } from "../lib/useMyProfileTheme";

// 왼쪽 아래 내 카드. 누르면 디스코드처럼 위로 메뉴가 열리고, 고른 항목의 편집 화면을 바로 연다.
const EDIT_ITEMS: { section: ProfileSection; icon: string; label: string }[] = [
  { section: "info", icon: "👤", label: "기본 정보" },
  { section: "photo", icon: "📷", label: "사진 · 배너" },
  { section: "links", icon: "🔗", label: "링크" },
  { section: "theme", icon: "🎨", label: "배경 · UI 테마" },
  { section: "effect", icon: "✨", label: "카드 효과" },
];

export default function UserMenu({ subtitle, onOpenSettings }: { subtitle: string; onOpenSettings: () => void }) {
  const { currentMember, openMemberProfile } = useProject();
  const { signOut } = useAuth();
  const { myTier, avatarFrame, cardC1, cardC2 } = useMyProfileTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openSection(section?: ProfileSection) {
    setOpen(false);
    if (currentMember) openMemberProfile(currentMember.id, section);
  }

  const avatar = <Avatar url={currentMember?.avatarUrl} initial={currentMember?.avatar ?? "?"} color={currentMember?.color ?? "#f59e0b"} size={36}
    badge={myTier && <span title={myTier.label} className="flex items-center justify-center w-full h-full"><MedalIcon shape={myTier.shape} colors={myTier.colors} size={18} /></span>} />;
  const itemClass = "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--muted)]";

  return (
    <div className="relative z-30 mt-4">
      {open && <>
        <div className="fixed inset-0" onClick={() => setOpen(false)} />
        <div role="menu" aria-label="내 계정 메뉴" className="absolute bottom-full left-0 right-0 mb-2 py-2"
          style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 12px 32px rgba(15,18,53,0.22)" }}>
          <button type="button" role="menuitem" onClick={() => openSection()} className={itemClass + " font-700"}>
            <span aria-hidden="true">🪪</span>내 프로필 보기
          </button>
          <div className="h-px my-1.5 mx-3" style={{ background: "var(--border)" }} />
          <div className="px-3 pb-1 text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>프로필 편집</div>
          {EDIT_ITEMS.map((item) => (
            <button key={item.section} type="button" role="menuitem" onClick={() => openSection(item.section)} className={itemClass}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
          <div className="h-px my-1.5 mx-3" style={{ background: "var(--border)" }} />
          <div className="px-3 pb-1 text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>계정</div>
          <button type="button" role="menuitem" onClick={() => openSection("password")} className={itemClass}>
            <span aria-hidden="true">🔒</span>비밀번호 변경
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenSettings(); }} className={itemClass}>
            <span aria-hidden="true">⚙️</span>설정
          </button>
          <button type="button" role="menuitem" onClick={signOut} className={itemClass} style={{ color: "#ef4444" }}>
            <span aria-hidden="true">↪</span>로그아웃
          </button>
        </div>
      </>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="내 계정 메뉴"
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        <span className="shrink-0">{avatarFrame ? <AvatarFrame kind={avatarFrame} size={36} c1={cardC1} c2={cardC2}>{avatar}</AvatarFrame> : avatar}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-700">{currentMember?.name ?? "참여자"}</span>
          <span className="block text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{subtitle}</span>
        </span>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22c55e" }} />
        <span aria-hidden="true" className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{open ? "▾" : "▴"}</span>
      </button>
    </div>
  );
}
