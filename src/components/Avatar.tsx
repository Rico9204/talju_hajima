import type { ReactNode } from "react";
import StillImg from "./StillImg";

// Renders a member's uploaded photo when they have one, falling back to the
// existing colored-initial badge everywhere else in the app already uses.
export default function Avatar({
  url, initial, color, size = 36, className = "", badge, animate,
}: {
  url?: string | null;
  initial: string;
  color: string;
  size?: number;
  className?: string;
  // Small overlay (e.g. a tier medal) pinned to the bottom-right corner.
  // Only when set does Avatar grow an extra wrapping element — every other
  // call site keeps rendering the bare <img>/<div> it always has.
  badge?: ReactNode;
  // Let a GIF play under 애니메이션 최소화 (profile view only).
  animate?: boolean;
}) {
  const image = url ? (
    <StillImg animate={animate} src={url} alt={initial} className={`rounded-full object-cover shrink-0 ${badge ? "" : className}`} style={{ width: size, height: size }} />
  ) : (
    <div
      className={`rounded-full flex items-center justify-center font-700 shrink-0 ${badge ? "" : className}`}
      style={{ width: size, height: size, background: `${color}18`, color, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
  if (!badge) return image;
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {image}
      <span className="absolute flex items-center justify-center" style={{ right: -size * 0.08, bottom: -size * 0.08, width: size * 0.48, height: size * 0.48 }}>
        {badge}
      </span>
    </span>
  );
}
