import type { CSSProperties, ReactNode } from "react";
import type { AvatarFrameKind } from "../lib/profileThemes";
import { FRAMES } from "./avatarFrames";

// Decorative frame around a round avatar — the matching piece to a profile
// card theme (its card-side counterpart is the theme's decoration/effects).
// Wraps the avatar (`children`, a circle of diameter `size`) with an SVG
// behind it and one in front, both non-interactive and overflowing the box,
// so the wrapper takes no more layout space than the avatar itself. The
// drawings live in ./avatarFrames, one entry per theme; `c1`/`c2` carry the
// theme palette for the frames that use it (the tier and reward themes).
//
// Drawing coordinates: the avatar circle is centered at (50,50) with radius
// 50, so 1 unit = size/100 px. Small sizes (the sidebar's 36px avatar) get
// `compact`, which frames use to drop fine detail that would turn to mush.
const PAD = 0.4; // the overlay extends this fraction of `size` beyond the avatar

const overlayStyle = (size: number, glow?: string): CSSProperties => ({
  position: "absolute",
  left: -size * PAD,
  top: -size * PAD,
  width: size * (1 + PAD * 2),
  height: size * (1 + PAD * 2),
  overflow: "visible",
  pointerEvents: "none",
  filter: glow ? `drop-shadow(0 0 3px ${glow})` : undefined,
});
const VIEWBOX = `${-PAD * 100} ${-PAD * 100} ${(1 + PAD * 2) * 100} ${(1 + PAD * 2) * 100}`;

export default function AvatarFrame({ kind, size, children, c1, c2 }: {
  kind: AvatarFrameKind;
  size: number;
  children: ReactNode;
  c1?: string;
  c2?: string;
}) {
  const parts = FRAMES[kind];
  if (!parts) return <>{children}</>;
  const props = { compact: size < 48, c1: c1 ?? "#f472b6", c2: c2 ?? "#db2777" };
  return (
    <span className="avatar-frame relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {parts.back && <svg viewBox={VIEWBOX} style={overlayStyle(size, parts.glow)} aria-hidden="true">{parts.back(props)}</svg>}
      <span className="relative inline-flex">{children}</span>
      {parts.front && <svg viewBox={VIEWBOX} style={overlayStyle(size, parts.glow)} aria-hidden="true">{parts.front(props)}</svg>}
      {parts.html?.({ ...props, size })}
    </span>
  );
}
