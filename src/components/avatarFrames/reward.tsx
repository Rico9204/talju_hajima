import type { FrameParts } from "./types";
import { BOLT_PATH, HEART_PATH, Leaf, Ring, Star } from "./shared";

// Avatar frames that go with the default tier theme and the five reward
// themes (profileThemes.ts). Each echoes its card theme: a ring in the theme
// palette plus the same motif — leaves, bubbles, hearts, a comet, bolts.

// 프로필1 (tier colors): a gradient ring with a twinkle.
export const tier: FrameParts = {
  front: ({ c1, c2 }) => (
    <>
      <defs>
        <linearGradient id="af-tier-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <Ring outline="rgba(15,18,53,.4)" stroke="url(#af-tier-g)" />
      <Star x={90} y={8} r={9} delay={0.6} />
    </>
  ),
  glow: "rgba(255,255,255,.35)",
};

// 새싹 숲: a green ring with a seedling on top and leaves along the side.
export const sprout: FrameParts = {
  front: ({ compact, c1, c2 }) => (
    <>
      <defs>
        <linearGradient id="af-sprout-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <Ring outline="#14532d" stroke="url(#af-sprout-g)" />
      <g className="af-sway">
        <path d="M50 0 Q49 -8 50 -13" fill="none" stroke="#14532d" strokeWidth="6" strokeLinecap="round" />
        <path d="M50 0 Q49 -8 50 -13" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" />
        <Leaf x={50} y={-11} rot={-152} s={0.95} fill="#4ade80" line="#14532d" />
        <Leaf x={50} y={-11} rot={-28} s={0.95} fill="#86efac" line="#14532d" />
      </g>
      {!compact && (
        <>
          <Leaf x={4} y={70} rot={150} s={0.7} fill="#4ade80" line="#14532d" />
          <Leaf x={97} y={72} rot={30} s={0.75} fill="#86efac" line="#14532d" />
          <Leaf x={22} y={100} rot={118} s={0.55} fill="#4ade80" line="#14532d" />
        </>
      )}
    </>
  ),
  glow: "rgba(74,222,128,.5)",
};

// 버블: a glassy ring with bubbles bobbing around it.
const BUBBLES = [
  { x: -6, y: 34, r: 9, d: 0 }, { x: 105, y: 28, r: 7, d: 1.1 }, { x: 108, y: 80, r: 11, d: 0.5 },
  { x: -3, y: 96, r: 6, d: 1.7 }, { x: 40, y: 113, r: 7, d: 0.9 },
];
export const bubble: FrameParts = {
  front: ({ compact, c1, c2 }) => (
    <>
      <defs>
        <linearGradient id="af-bubble-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <radialGradient id="af-bubble-b" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.5" stopColor={c1} stopOpacity="0.55" />
          <stop offset="1" stopColor={c2} stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <Ring outline="rgba(2,110,170,.55)" stroke="url(#af-bubble-g)" w={5} />
      <path d="M8.2 20.7 A51 51 0 0 1 32.6 2.1" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
      {BUBBLES.slice(0, compact ? 3 : BUBBLES.length).map((b, i) => (
        <g key={i} className="af-bob" style={{ animationDelay: `${-b.d}s` }}>
          <circle cx={b.x} cy={b.y} r={b.r} fill="url(#af-bubble-b)" stroke={c2} strokeWidth="2" />
          <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.32} r={b.r * 0.22} fill="#fff" opacity="0.9" />
        </g>
      ))}
    </>
  ),
  glow: "rgba(56,189,248,.5)",
};

// 러브: a pink ring with hearts that beat.
export const heart: FrameParts = {
  front: ({ compact, c1, c2 }) => (
    <>
      <defs>
        <linearGradient id="af-heart-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <Ring outline="#8a1f45" stroke="url(#af-heart-g)" />
      {[
        { x: 6, y: 8, s: 1.15, rot: -18, d: 0 },
        { x: 95, y: 2, s: 0.85, rot: 16, d: 0.5 },
        ...(compact ? [] : [{ x: 100, y: 92, s: 0.7, rot: 12, d: 0.9 }]),
      ].map((h, i) => (
        <g key={i} transform={`translate(${h.x - 12 * h.s} ${h.y - 12 * h.s}) scale(${h.s}) rotate(${h.rot} 12 12)`}>
          <g className="af-beat" style={{ animationDelay: `${-h.d}s` }}>
            <path d={HEART_PATH} fill="#f43f78" stroke="#8a1f45" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M6.6 8 Q7 5.6 10 5.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
          </g>
        </g>
      ))}
    </>
  ),
  glow: "rgba(244,63,120,.45)",
};

// 별똥별: a gold ring with a comet that keeps circling it.
export const meteor: FrameParts = {
  front: ({ compact, c1, c2 }) => (
    <>
      <defs>
        <linearGradient id="af-meteor-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <linearGradient id="af-meteor-t" gradientUnits="userSpaceOnUse" x1="-44" y1="-26" x2="0" y2="-51">
          <stop offset="0" stopColor={c1} stopOpacity="0" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <Ring outline="#7c4a03" stroke="url(#af-meteor-g)" w={5.5} />
      <g transform="translate(50 50)">
        <g className="af-orbit">
          <circle r="51" fill="none" stroke="none" />
          <path d="M-44.2 -25.5 A51 51 0 0 1 0 -51" fill="none" stroke="url(#af-meteor-t)" strokeWidth="6" strokeLinecap="round" />
          <circle cx="0" cy="-51" r="5.5" fill="#fff" />
          <circle cx="0" cy="-51" r="9" fill="#fff" opacity="0.3" />
        </g>
      </g>
      <Star x={-7} y={14} r={7} fill="#fde68a" delay={0.3} />
      {!compact && <Star x={108} y={22} r={9} fill="#fff" delay={1.2} />}
      {!compact && <Star x={104} y={100} r={6} fill="#fde68a" delay={2} />}
    </>
  ),
  glow: "rgba(251,191,36,.55)",
};

// 전기: a dashed ring that flickers, with bolts that keep flashing.
export const electric: FrameParts = {
  front: ({ compact, c1, c2 }) => (
    <>
      <Ring outline="#7c2d12" stroke={c2} dash="10 6" className="af-flicker" w={6} />
      <circle cx="50" cy="50" r="46" fill="none" stroke={c1} strokeWidth="1.6" opacity="0.7" />
      {[
        { x: 88, y: 8, rot: 18, d: 0 },
        ...(compact ? [] : [{ x: -4, y: 52, rot: -22, d: 0.8 }, { x: 94, y: 92, rot: 8, d: 1.6 }]),
      ].map((b, i) => (
        <g key={i} transform={`translate(${b.x - 14} ${b.y - 14}) rotate(${b.rot} 14 14) scale(.28)`}>
          <path className="af-bolt" d={BOLT_PATH} fill={c1} stroke="#7c2d12" strokeWidth="7" strokeLinejoin="round" style={{ animationDelay: `${-b.d}s` }} />
        </g>
      ))}
    </>
  ),
  glow: "rgba(249,115,22,.55)",
};
