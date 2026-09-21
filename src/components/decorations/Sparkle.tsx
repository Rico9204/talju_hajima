import type { CSSProperties } from "react";

// A twinkling four-point star, positioned by its center in px. Styles are
// .deco-sparkle in index.css.
export default function Sparkle({ x, y, size = 12, color, delay = 0, dur = 2.6 }: { x: number | string; y: number | string; size?: number; color?: string; delay?: number; dur?: number }) {
  return (
    <span
      className="deco-sparkle"
      style={{ left: x, top: y, "--s": `${size}px`, "--sc": color, "--d": `${dur}s`, "--dl": `${-delay}s` } as CSSProperties}
    />
  );
}
