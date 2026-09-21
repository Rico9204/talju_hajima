import { useMemo } from "react";
import { perimeterPoints, tangentOf, wobblePath } from "../../lib/perimeter";
import type { DecoProps } from "./types";

// Two twisted dark vines wrapped around the whole card border, with thorns
// jutting out (and a few in) every ~26px. Front layer only. The SVG is laid
// out on the card's measured size plus PAD on every side so thorns aren't
// clipped.
const PAD = 24;
const RADIUS = 16; // matches --radius in index.css
const STEP = 3;
const THORN_EVERY = 9; // sample points (≈ 27px)

export default function ThornVine({ w, h, layer }: DecoProps) {
  const { vineA, vineB, thorns } = useMemo(() => {
    const points = perimeterPoints(w, h, RADIUS, STEP);
    let thornPath = "";
    points.forEach((p, i) => {
      if (i % THORN_EVERY !== 0) return;
      const k = i / THORN_EVERY;
      const { tx, ty } = tangentOf(p);
      const outward = k % 4 !== 3; // every 4th thorn points in over the card
      const dir = outward ? 1 : -1;
      const len = (outward ? 13 : 8) + (k % 3) * 2;
      const skew = k % 2 === 0 ? 4 : -4;
      const bx = p.x + PAD;
      const by = p.y + PAD;
      const tipX = bx + p.nx * len * dir + tx * skew;
      const tipY = by + p.ny * len * dir + ty * skew;
      thornPath += `M${(bx - tx * 3.6).toFixed(1)} ${(by - ty * 3.6).toFixed(1)} L${tipX.toFixed(1)} ${tipY.toFixed(1)} L${(bx + tx * 3.6).toFixed(1)} ${(by + ty * 3.6).toFixed(1)} Z `;
    });
    const shift = points.map((p) => ({ ...p, x: p.x + PAD, y: p.y + PAD }));
    return {
      vineA: wobblePath(shift, 5.5, 84, 0),
      vineB: wobblePath(shift, 5.5, 84, Math.PI),
      thorns: thornPath,
    };
  }, [w, h]);

  if (layer !== "front") return null;
  return (
    <svg width={w + PAD * 2} height={h + PAD * 2} style={{ position: "absolute", left: -PAD, top: -PAD, overflow: "visible", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }}>
      <path d={vineB} fill="none" stroke="#26343b" strokeWidth="6" strokeLinejoin="round" />
      <path d={vineA} fill="none" stroke="#3c4f59" strokeWidth="6" strokeLinejoin="round" />
      <path d={vineA} fill="none" stroke="#86a6b3" strokeWidth="1.3" strokeLinejoin="round" opacity="0.65" />
      <path d={thorns} fill="#1c272d" stroke="#6b8794" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}
