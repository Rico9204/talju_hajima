import type { DecoProps } from "./types";

// Undead frame: a railing of bones along the card's top edge with a crown of
// nine skulls whose eyes glow cyan, crossed bones on the bottom corners, a cold
// mist creeping up the bottom, and a sickly cyan haze inside the card's edge.
// The cyan flame around it is the theme's `flame` (TierFlame) and the rising
// souls are its `aura`/`particles` ("ghost"). Front layer only.
const SKULLS: { size: number; rot: number }[] = [
  { size: 36, rot: -12 }, { size: 46, rot: -8 }, { size: 58, rot: -5 }, { size: 72, rot: -2 }, { size: 90, rot: 0 },
  { size: 72, rot: 2 }, { size: 58, rot: 5 }, { size: 46, rot: 8 }, { size: 36, rot: 12 },
];

function Skull({ size, rot, delay }: { size: number; rot: number; delay: number }) {
  return (
    <svg width={size} height={size * 1.13} viewBox="0 0 60 68" style={{ transform: `rotate(${rot}deg)`, marginLeft: -size * 0.12, overflow: "visible" }}>
      <defs>
        <linearGradient id="deco-skull-bone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b7c8d1" />
          <stop offset="1" stopColor="#56676f" />
        </linearGradient>
      </defs>
      <path
        d="M30 4 C14 4 6 16 8 30 C9 38 13 42 15 46 L15 56 C15 59 17 61 20 61 L40 61 C43 61 45 59 45 56 L45 46 C47 42 51 38 52 30 C54 16 46 4 30 4 Z"
        fill="url(#deco-skull-bone)"
        stroke="#1c2226"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 10 Q28 6 36 8" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="21" cy="32" rx="7.5" ry="8.5" fill="#081014" />
      <ellipse cx="39" cy="32" rx="7.5" ry="8.5" fill="#081014" />
      <circle cx="21" cy="33" r="3.2" fill="#7ff5ff" className="deco-eye" style={{ animationDelay: `${-delay}s` }} />
      <circle cx="39" cy="33" r="3.2" fill="#7ff5ff" className="deco-eye" style={{ animationDelay: `${-delay}s` }} />
      <path d="M30 40 L25.5 49 L34.5 49 Z" fill="#081014" />
      <path d="M22 54 V60 M27 54 V61 M33 54 V61 M38 54 V60" stroke="#1c2226" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M44 14 L39 22 L43 27" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Two crossed bones, each a shaft with a pair of knobs at both ends.
function CrossedBones({ left, top }: { left: number; top: number }) {
  const bone = (angle: number) => (
    <g transform={`rotate(${angle} 32 32)`} fill="url(#deco-bone-shaft)" stroke="#1c2226" strokeWidth="1.4">
      <rect x="9" y="28" width="46" height="8" rx="4" />
      {[[9, 26.5], [9, 37.5], [55, 26.5], [55, 37.5]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="5" />)}
    </g>
  );
  return (
    <svg width="66" height="66" viewBox="0 0 64 64" style={{ position: "absolute", left, top, overflow: "visible", filter: "drop-shadow(0 0 5px rgba(34,211,238,.6))" }}>
      <defs>
        <linearGradient id="deco-bone-shaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef4f6" />
          <stop offset="1" stopColor="#9db0ba" />
        </linearGradient>
      </defs>
      {bone(38)}
      {bone(-38)}
    </svg>
  );
}

// A railing of horizontal bones laid end to end along the card's top edge,
// their knobbed ends interlocking; each bone is nudged a little so it reads as
// a pile of real bones rather than a ruler. The count and spacing are fitted to
// the card's measured width so the first and last bones end right at the
// corners instead of overhanging. The skull crown sits on top.
const BONE_LEN = 60;
const BONE_TARGET_PITCH = 50;

function BoneRail({ w }: { w: number }) {
  const count = Math.max(2, Math.round((w - BONE_LEN) / BONE_TARGET_PITCH) + 1);
  const pitch = (w - BONE_LEN + 2) / (count - 1); // first bone at x=-1, last ends at w+1
  return (
    <svg
      width={w}
      height="34"
      viewBox={`0 0 ${w} 34`}
      style={{ position: "absolute", left: 0, top: -17, overflow: "visible", filter: "drop-shadow(0 0 5px rgba(34,211,238,.6)) drop-shadow(0 2px 2px rgba(0,0,0,.45))" }}
    >
      <defs>
        <linearGradient id="deco-rail-bone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f6f8" />
          <stop offset="1" stopColor="#9fb2bc" />
        </linearGradient>
      </defs>
      {Array.from({ length: count }, (_, i) => {
        const x = -1 + i * pitch;
        const end = i === 0 || i === count - 1; // keep the end bones level and flush
        const tilt = end ? 0 : ((i * 7) % 5 - 2) * 0.8;
        const dy = end ? 0 : ((i * 5) % 4 - 1.5) * 1.1;
        return (
          <g key={i} transform={`translate(${x} ${17 + dy}) rotate(${tilt} ${BONE_LEN / 2} 0)`} fill="url(#deco-rail-bone)" stroke="#1c2226" strokeWidth="1.3">
            <rect x="5" y="-5.5" width={BONE_LEN - 10} height="11" rx="5.5" />
            {[[5, -6], [5, 6], [BONE_LEN - 5, -6], [BONE_LEN - 5, 6]].map(([cx, cy], k) => <circle key={k} cx={cx} cy={cy} r="6.3" />)}
          </g>
        );
      })}
    </svg>
  );
}

function Mist({ w, h }: { w: number; h: number }) {
  return (
    <>
      <svg width={w * 0.7} height="120" viewBox="0 0 700 120" preserveAspectRatio="none" className="deco-drift" style={{ position: "absolute", left: -30, top: h - 70, overflow: "visible" }}>
        <defs><filter id="deco-mist-blur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="16" /></filter></defs>
        <g filter="url(#deco-mist-blur)" fill="#22d3ee" opacity="0.42">
          <ellipse cx="140" cy="70" rx="150" ry="26" /><ellipse cx="360" cy="80" rx="170" ry="22" /><ellipse cx="560" cy="66" rx="130" ry="26" />
        </g>
      </svg>
      <svg width={w * 0.6} height="120" viewBox="0 0 600 120" preserveAspectRatio="none" className="deco-drift deco-drift-rev" style={{ position: "absolute", left: w * 0.42, top: h - 64, overflow: "visible" }}>
        <g filter="url(#deco-mist-blur)" fill="#67e8f9" opacity="0.36">
          <ellipse cx="120" cy="72" rx="130" ry="24" /><ellipse cx="330" cy="82" rx="160" ry="20" /><ellipse cx="520" cy="68" rx="110" ry="26" />
        </g>
      </svg>
    </>
  );
}

export default function Skulls({ w, h, layer }: DecoProps) {
  if (layer !== "front") return null;
  return (
    <>
      {/* Sickly haze pooling just inside the card's edge. */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius)", boxShadow: "inset 0 0 60px rgba(8,145,178,.3), inset 0 0 14px rgba(34,211,238,.38)" }} />
      <Mist w={w} h={h} />
      <BoneRail w={w} />
      <div
        className="deco-skull-crown"
        style={{ position: "absolute", left: "50%", top: -100, transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", filter: "drop-shadow(0 0 7px rgba(34,211,238,.7))" }}
      >
        {SKULLS.map((skull, i) => <Skull key={i} size={skull.size} rot={skull.rot} delay={i * 0.35} />)}
      </div>
      <CrossedBones left={-26} top={h - 40} />
      <CrossedBones left={w - 40} top={h - 40} />
    </>
  );
}
