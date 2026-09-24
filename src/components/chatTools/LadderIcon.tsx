// 사다리 아이콘(SVG). 이모지(🪜)는 구형 Windows에서 깨져서 직접 그린다. 색은 글자색(currentColor)을 따른다.
export default function LadderIcon({ className = "", size = "1em" }: { className?: string; size?: string | number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.125em" }}
    >
      <path d="M7 2v20M17 2v20M7 7h10M7 12h10M7 17h10" />
    </svg>
  )
}
