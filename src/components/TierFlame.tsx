// Flame border for gold and platinum, drawn *behind* the profile card so it
// can lick outward past the card edge (the card itself is overflow-hidden).
// A glowing ring is warped by an animated feTurbulence displacement map, which
// is what turns the smooth glow into flickering flame tongues. Gold burns
// warm; platinum burns blue and harder. Styles live in .tier-flame-* in
// index.css.
import type { CSSProperties } from "react";

type FlameTier = "gold" | "platinum";

const FLAMES: Record<FlameTier, { scale: number; colors: [string, string, string] }> = {
  gold: { scale: 16, colors: ["#fff3b0", "#ffb020", "#ff5a1f"] },
  platinum: { scale: 22, colors: ["#e6f9ff", "#38bdf8", "#2563eb"] },
};

// Room around the card for flames to reach into; must match .tier-flame in
// index.css (the layer is inset by -this on every side).
const REACH = 32;

// `colors` overrides the tier palette (core, mid, outer) for themes with their
// own flame color, e.g. the skull theme's cyan; pass tierId "platinum" to get
// the bigger flame.
export default function TierFlame({ tierId, colors, scale }: { tierId: string; colors?: [string, string, string]; scale?: number }) {
  if (tierId !== "gold" && tierId !== "platinum") return null;
  const cfg = { ...FLAMES[tierId], colors: colors ?? FLAMES[tierId].colors, scale: scale ?? FLAMES[tierId].scale };
  const filterId = `tier-flame-${tierId}`;
  return (
    <div
      className={`tier-flame tier-flame-${tierId}`}
      aria-hidden="true"
      style={{
        inset: -REACH,
        filter: `url(#${filterId})`,
        "--flame-1": cfg.colors[0],
        "--flame-2": cfg.colors[1],
        "--flame-3": cfg.colors[2],
        "--flame-reach": `${REACH}px`,
      } as CSSProperties}
    >
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id={filterId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.025 0.01" numOctaves="2" seed="7" result="noise">
              <animate attributeName="baseFrequency" dur="4.5s" values="0.025 0.01;0.032 0.016;0.025 0.01" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={cfg.scale} xChannelSelector="R" yChannelSelector="G" result="warped" />
            <feGaussianBlur in="warped" stdDeviation="2.5" />
          </filter>
        </defs>
      </svg>
      <div className="tier-flame-ring" />
    </div>
  );
}
