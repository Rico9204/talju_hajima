import { useMemo } from "react";
import type { CSSProperties } from "react";
import { mulberry32 } from "../lib/random";
import type { AuraKind } from "../lib/profileThemes";

// Reward-theme effects that burst out of the profile card's border and drift
// away from it (the reward themes' take on TierFlame). Like the flame this
// sits behind the card in a layer larger than the card by REACH on every side
// (so the card's overflow-hidden doesn't clip it). Each item is born on one
// of the four edges, then travels outward: bubbles float and pop, leaves
// sprout and sway, hearts drift up, meteor streaks shoot off, bolts flash, souls rise.
// Shapes/animations are .edge-out-* in index.css; colors come in as props
// because this layer is a sibling of the card and can't inherit its --tier-*
// custom properties.
const REACH = 56; // must match .edge-aura's inset in index.css
type Side = "top" | "right" | "bottom" | "left";
// Outward unit vector per side (screen coords, y grows downward).
const OUT: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

interface AuraConfig {
  horizontal: number; // items along each of the top/bottom edges
  vertical: number; // items along each of the left/right edges
  bottom?: number; // override for the bottom edge (default: horizontal)
  size: [number, number];
  dist: [number, number]; // how far they travel outward, px
  dur: [number, number]; // seconds per cycle
  lift: number; // extra upward drift, px (buoyancy)
}

const CONFIG: Record<AuraKind, AuraConfig> = {
  bubble: { horizontal: 16, vertical: 11, size: [6, 22], dist: [24, 50], dur: [2.6, 4.6], lift: 8 },
  leaf: { horizontal: 12, vertical: 8, size: [11, 19], dist: [28, 52], dur: [3.4, 5.4], lift: 6 },
  heart: { horizontal: 10, vertical: 7, size: [10, 20], dist: [26, 50], dur: [3.2, 5], lift: 16 },
  meteor: { horizontal: 7, vertical: 5, size: [18, 36], dist: [30, 54], dur: [2.2, 3.8], lift: 0 },
  spark: { horizontal: 8, vertical: 5, size: [16, 30], dist: [18, 40], dur: [1.6, 3], lift: 0 },
  // Souls rise off the top and sides; only a few hover under the bottom edge.
  ghost: { horizontal: 12, vertical: 9, bottom: 4, size: [12, 24], dist: [30, 54], dur: [3.6, 6], lift: 34 },
};

function buildItems(kind: AuraKind): CSSProperties[] {
  const cfg = CONFIG[kind];
  const rand = mulberry32(90210 + kind.length * 131);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const items: CSSProperties[] = [];
  (Object.keys(OUT) as Side[]).forEach((side) => {
    const count = side === "bottom" ? cfg.bottom ?? cfg.horizontal : side === "top" ? cfg.horizontal : cfg.vertical;
    for (let i = 0; i < count; i++) {
      const frac = between(0.04, 0.96); // position along the edge
      const dist = between(...cfg.dist);
      const [ox, oy] = OUT[side];
      const dur = between(...cfg.dur);
      // The layer is the card plus REACH on every side, so the card's edge
      // runs REACH in from the layer's edge.
      const alongCard = `calc(${REACH}px + (100% - ${REACH * 2}px) * ${frac})`;
      const pos: CSSProperties =
        side === "top" ? { left: alongCard, top: REACH }
        : side === "bottom" ? { left: alongCard, top: `calc(100% - ${REACH}px)` }
        : side === "left" ? { left: REACH, top: alongCard }
        : { left: `calc(100% - ${REACH}px)`, top: alongCard };
      const jitter = between(-10, 10);
      // Direction of travel (a little off-axis), used to aim streaks/bolts.
      const angle = (Math.atan2(oy * dist + jitter * ox, ox * dist + jitter * oy) * 180) / Math.PI;
      items.push({
        ...pos,
        "--size": `${between(...cfg.size)}px`,
        "--dx": `${ox * dist + jitter * oy}px`,
        "--dy": `${oy * dist + jitter * ox - cfg.lift}px`,
        "--dist": `${dist}px`,
        "--ang": `${angle}deg`,
        "--dur": `${dur}s`,
        "--delay": `${-rand() * dur}s`,
        "--pc": i % 3 === 0 ? "var(--tier-c1)" : "var(--tier-c2)",
      } as CSSProperties);
    }
  });
  return items;
}

export default function EdgeAura({ kind, c1, c2, glow }: { kind: AuraKind; c1: string; c2: string; glow: string }) {
  const items = useMemo(() => buildItems(kind), [kind]);
  return (
    <div className="edge-aura" aria-hidden="true" style={{ "--tier-c1": c1, "--tier-c2": c2, "--tier-glow": glow } as CSSProperties}>
      {items.map((style, i) => <span key={i} className={`edge-out edge-out-${kind}`} style={style} />)}
    </div>
  );
}
