import type { FileEditStatus } from "../lib/workspaceFiles";

// 원작자가 아닌 팀원이 저장한 파일·버전일 때 편집기 위쪽에 보여 주는 안내 줄과 표시 켜기/끄기 스위치.
// detail: 이 편집기에서 무엇이 어떻게 표시되는지(편집기마다 다르다).
export default function OtherEditNotice({ status, on, onToggle, detail, className = "" }: {
  status: FileEditStatus;
  on: boolean;
  onToggle: () => void;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={`px-3 py-1.5 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2 border ${className}`}
      style={{ background: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.35)", color: "var(--foreground)" }}
    >
      <span className="min-w-0">
        ✏️ 원작자 <strong>{status.originalAuthor}</strong> 님이 아닌 <strong>{status.editor}</strong> 님이 수정했어요.
        {on && detail && <span style={{ color: "var(--muted-foreground)" }}> {detail}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        title="다른 팀원이 고친 내용 표시를 켜거나 끕니다"
        className="shrink-0 px-2.5 py-0.5 rounded-full font-600 flex items-center gap-1.5 border"
        style={{ background: on ? "rgba(245, 158, 11, 0.18)" : "var(--muted)", borderColor: on ? "rgba(245, 158, 11, 0.45)" : "var(--border)", color: "var(--foreground)" }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: on ? "#ea580c" : "var(--muted-foreground)" }} />
        수정 표시 {on ? "켜짐" : "꺼짐"}
      </button>
    </div>
  );
}
