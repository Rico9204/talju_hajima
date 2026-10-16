import type { DecoProps } from "./types";
import Sparkle from "./Sparkle";

// A ringed planet and a small moon peeking over the card's top edge, with
// soft cloud puffs drifting along the edge. Planet and moon are the back
// layer (the card covers their lower halves); clouds are the front layer so
// they overlap the card's edge.
const CLOUD_LEFT: [number, number, number][] = [
  [30, 62, 30], [64, 50, 36], [104, 58, 32], [142, 46, 28], [176, 60, 30], [214, 54, 24], [70, 70, 26], [124, 70, 24],
];
const CLOUD_RIGHT: [number, number, number][] = [
  [40, 58, 26], [76, 48, 32], [112, 58, 28], [146, 52, 22], [92, 70, 24],
];

function Clouds({ puffs, id }: { puffs: [number, number, number][]; id: string }) {
  return (
    <>
      <defs>
        <filter id={id} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <radialGradient id={`${id}-g`} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfd2e2" />
        </radialGradient>
      </defs>
      <g filter={`url(#${id})`} fill={`url(#${id}-g)`}>
        {puffs.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} opacity={0.92} />)}
      </g>
    </>
  );
}

export default function Planet({ w, layer }: DecoProps) {
  if (layer === "back") {
    return (
      <>
        {/* Planet: viewBox y=142 lands on the card's top edge (top: -142), so its lower part hides behind the card. */}
        <svg width="300" height="170" viewBox="0 0 300 170" className="deco-float" style={{ position: "absolute", left: w * 0.24, top: -142, overflow: "visible" }}>
          <defs>
            <radialGradient id="deco-planet-body" cx="35%" cy="30%" r="80%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#c9cad4" />
              <stop offset="1" stopColor="#585966" />
            </radialGradient>
            <linearGradient id="deco-planet-ring" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8b8c99" />
              <stop offset="0.5" stopColor="#f0f0f6" />
              <stop offset="1" stopColor="#8b8c99" />
            </linearGradient>
          </defs>
          <g transform="rotate(-16 150 100)">
            <path d="M 40 100 A 110 26 0 0 1 260 100" fill="none" stroke="url(#deco-planet-ring)" strokeWidth="10" opacity="0.85" />
            <path d="M 62 100 A 88 20 0 0 1 238 100" fill="none" stroke="url(#deco-planet-ring)" strokeWidth="3" opacity="0.7" />
            <circle cx="150" cy="100" r="56" fill="url(#deco-planet-body)" />
            <path d="M 98 84 Q 150 70 202 84" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="5" />
            <path d="M 94 106 Q 150 92 206 106" fill="none" stroke="rgba(0,0,0,.07)" strokeWidth="4" />
            <path d="M 40 100 A 110 26 0 0 0 260 100" fill="none" stroke="url(#deco-planet-ring)" strokeWidth="10" />
            <path d="M 62 100 A 88 20 0 0 0 238 100" fill="none" stroke="url(#deco-planet-ring)" strokeWidth="3" opacity="0.8" />
          </g>
        </svg>
        <svg width="84" height="84" viewBox="0 0 84 84" className="deco-float deco-float-slow" style={{ position: "absolute", left: w * 0.87 - 42, top: -76, overflow: "visible" }}>
          <defs>
            <radialGradient id="deco-moon-body" cx="35%" cy="30%" r="80%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#c7c8d3" />
              <stop offset="1" stopColor="#62636f" />
            </radialGradient>
          </defs>
          <circle cx="42" cy="42" r="28" fill="url(#deco-moon-body)" />
          <circle cx="32" cy="36" r="5" fill="rgba(0,0,0,.09)" />
          <circle cx="50" cy="48" r="7" fill="rgba(0,0,0,.08)" />
          <circle cx="46" cy="30" r="3" fill="rgba(0,0,0,.08)" />
        </svg>
        <Sparkle x={w * 0.56} y={-100} size={10} color="#ffffff" delay={0.4} />
        <Sparkle x={w * 0.66} y={-44} size={7} color="#dfe3ff" delay={1.2} />
        <Sparkle x={w * 0.16} y={-96} size={8} color="#ffffff" delay={2} />
        <Sparkle x={w * 0.78} y={-104} size={9} color="#dfe3ff" delay={0.9} />
      </>
    );
  }
  return (
    <>
      <svg width="270" height="100" viewBox="0 0 270 100" className="deco-drift" style={{ position: "absolute", left: -66, top: -64, overflow: "visible" }}>
        <Clouds puffs={CLOUD_LEFT} id="deco-cloud-l" />
      </svg>
      <svg width="190" height="100" viewBox="0 0 190 100" className="deco-drift deco-drift-rev" style={{ position: "absolute", left: w * 0.87 - 110, top: -62, overflow: "visible" }}>
        <Clouds puffs={CLOUD_RIGHT} id="deco-cloud-r" />
      </svg>
    </>
  );
}
