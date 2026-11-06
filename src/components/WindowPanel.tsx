import { useState, type CSSProperties, type ReactNode } from "react";

// 패널을 "별개의 창"처럼 보이게 하는 틀. 위쪽 막대에 점 세 개와 제목이 있고,
// 가운데(노랑) 점만 진짜 버튼이다 — 누르면 본문이 접히고 다시 누르면 펼쳐진다.
// 점은 평소 회색, 막대에 마우스를 올리면 빨강·노랑·초록으로 바뀐다. 접힘 상태는 이 브라우저에만 저장한다.
const STORAGE_KEY = "collabpeer.panel-collapsed";

function loadCollapsed(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function saveCollapsed(ids: string[]) {
  // 저장이 막힌 환경(사생활 보호 모드 등)에서는 이번 방문 동안만 유지된다.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

export default function WindowPanel({ id, title, children, style, className = "", bodyClassName = "", dark = false, collapsible = false, lit = true, headerRight }: {
  id: string;
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  bodyClassName?: string;
  dark?: boolean;
  lit?: boolean; // true면 점이 평소에도 빨강·노랑·초록으로 켜져 있다(기본은 회색, 막대에 올리면 켜짐)
  collapsible?: boolean; // false면 노랑 점도 장식(접기 없음) — 채팅처럼 화면 전체를 감싸는 창에 쓴다
  headerRight?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => collapsible && loadCollapsed().includes(id));
  function toggle() {
    const rest = loadCollapsed().filter((x) => x !== id);
    saveCollapsed(collapsed ? rest : [...rest, id]);
    setCollapsed(!collapsed);
  }
  const gray = dark ? "bg-white/30" : "bg-[#c4c9dc]";
  const dot = `w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${lit ? "" : gray}`;
  // lit이면 회색 대신 처음부터 색을 쓴다. 아니면 막대에 올렸을 때만 색이 켜진다.
  const red = lit ? "bg-[#ff5f57]" : "group-hover/win:bg-[#ff5f57]";
  const yellow = lit ? "bg-[#febc2e]" : "group-hover/win:bg-[#febc2e]";
  const green = lit ? "bg-[#28c840]" : "group-hover/win:bg-[#28c840]";
  return (
    <section aria-label={title} className={`overflow-hidden ${className}`} style={style}>
      <div
        className="group/win flex items-center gap-2 px-3.5 py-2.5"
        style={{
          background: dark ? "rgba(255,255,255,0.06)" : "rgba(15,18,53,0.025)",
          borderBottom: collapsed ? "none" : `1px solid ${dark ? "rgba(255,255,255,0.12)" : "var(--border)"}`,
        }}
      >
        <span aria-hidden="true" className={`${dot} ${red}`} />
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={`${title} ${collapsed ? "펼치기" : "접기"}`}
            title={collapsed ? "펼치기" : "접기"}
            className={`${dot} ${yellow} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`}
          />
        ) : (
          <span aria-hidden="true" className={`${dot} ${yellow}`} />
        )}
        <span aria-hidden="true" className={`${dot} ${green}`} />
        <h2 className="flex-1 text-center text-[11px] font-800 select-none" style={{ color: dark ? "rgba(255,255,255,0.95)" : "var(--foreground)", marginRight: headerRight ? 0 : 38 }}>{title}</h2>
        {headerRight}
      </div>
      <div className={bodyClassName} style={collapsed ? { display: "none" } : undefined}>{children}</div>
    </section>
  );
}
