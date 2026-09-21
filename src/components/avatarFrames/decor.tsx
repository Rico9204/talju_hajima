import type { CSSProperties } from "react";
import type { FrameParts } from "./types";
import { Leaf, Ring, Star } from "./shared";

// Avatar frames that go with the illustrated card decorations
// (components/decorations): planet, skull, thorn vine, cat, the two rose
// frames and 우핑강. Each keeps to the card decoration's art style and
// palette rather than the theme's generic c1/c2.

const LINE = "#7b2c47";

// ---- 우핑강 -----------------------------------------------------------
// Floppy ears behind the avatar, an outlined pink ring with a ribbon bow,
// front paws holding the bottom edge and Zzz drifting up. Small sizes skip
// the paws and Zzz.
const PINK_FILL = "#f9a8b8";
const EAR_PATH = "M26 12 C-8 0 -36 42 -22 76 C-14 94 14 90 24 64 C30 42 40 18 26 12 Z";
const EAR_DETAIL = "M0 34 Q-12 56 -6 76";

function DogEar({ mirror }: { mirror?: boolean }) {
  const ear = (
    <g className={mirror ? "af-ear af-ear-r" : "af-ear"}>
      <path d={EAR_PATH} fill="#f07f9a" stroke={LINE} strokeWidth="4" strokeLinejoin="round" />
      <path d={EAR_DETAIL} fill="none" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" opacity="0.35" />
    </g>
  );
  return mirror ? <g transform="translate(100 0) scale(-1 1)">{ear}</g> : ear;
}

export const pinkdog: FrameParts = {
  back: () => (
    <>
      <DogEar />
      <DogEar mirror />
    </>
  ),
  front: ({ compact }) => (
    <>
      <defs>
        <linearGradient id="af-dog-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbcfe8" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <Ring outline={LINE} stroke="url(#af-dog-ring)" />
      <g>
        <path d="M50 -1 L25 -14 L29 11 Z" fill="#f43f78" stroke="#8a1f45" strokeWidth="3.2" strokeLinejoin="round" />
        <path d="M50 -1 L75 -14 L71 11 Z" fill="#f43f78" stroke="#8a1f45" strokeWidth="3.2" strokeLinejoin="round" />
        <circle cx="50" cy="-1" r="7.5" fill="#fb6b98" stroke="#8a1f45" strokeWidth="3.2" />
      </g>
      {!compact && [30, 70].map((x) => (
        <g key={x} transform={`translate(${x} 99)`}>
          <path d="M-12 4 Q-12 -7 0 -7 Q12 -7 12 4 L12 17 Q12 28 0 28 Q-12 28 -12 17 Z" fill={PINK_FILL} stroke={LINE} strokeWidth="3.6" strokeLinejoin="round" />
          <path d="M-4.5 14 V22 M4.5 14 V22" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ))}
    </>
  ),
  html: ({ compact, size }) =>
    compact ? null : (
      <>
        {[
          { ch: "z", scale: 0.2, delay: 0, dx: 0 },
          { ch: "Z", scale: 0.26, delay: 1.4, dx: size * 0.1 },
          { ch: "Z", scale: 0.32, delay: 2.8, dx: size * 0.22 },
        ].map((z, i) => (
          <span
            key={i}
            className="deco-zzz"
            aria-hidden="true"
            style={{ left: size * 0.92 + z.dx, top: -size * 0.16, fontSize: size * z.scale, animationDelay: `${-z.delay}s`, pointerEvents: "none" } as CSSProperties}
          >
            {z.ch}
          </span>
        ))}
      </>
    ),
};

// ---- 행성 -------------------------------------------------------------
// A silver ring, with a Saturn-style planet ring tilted across the avatar
// (its far half behind the photo, its near half over it) and a small moon.
export const planet: FrameParts = {
  back: () => (
    <g transform="rotate(-18 50 50)">
      <path d="M-24 50 A74 20 0 0 1 124 50" fill="none" stroke="url(#af-planet-r)" strokeWidth="7" opacity="0.85" />
    </g>
  ),
  front: ({ compact }) => (
    <>
      <defs>
        <linearGradient id="af-planet-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b8c99" />
          <stop offset="0.5" stopColor="#f0f0f6" />
          <stop offset="1" stopColor="#8b8c99" />
        </linearGradient>
        <linearGradient id="af-planet-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0f0f6" />
          <stop offset="1" stopColor="#8b8fa3" />
        </linearGradient>
        <radialGradient id="af-planet-m" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.5" stopColor="#c7c8d3" />
          <stop offset="1" stopColor="#62636f" />
        </radialGradient>
      </defs>
      <Ring outline="#3f3f4d" outlineW={9} stroke="url(#af-planet-g)" w={4.5} />
      <g transform="rotate(-18 50 50)">
        <path d="M-24 50 A74 20 0 0 0 124 50" fill="none" stroke="url(#af-planet-r)" strokeWidth="7" />
      </g>
      <circle cx="98" cy="4" r="11" fill="url(#af-planet-m)" />
      <circle cx="94" cy="1" r="2.4" fill="rgba(0,0,0,.12)" />
      <circle cx="101" cy="8" r="3" fill="rgba(0,0,0,.1)" />
      <Star x={-6} y={8} r={7} delay={0.4} />
      {!compact && <Star x={110} y={60} r={6} delay={1.4} />}
    </>
  ),
  glow: "rgba(200,205,240,.5)",
};

// ---- 해골 불꽃 --------------------------------------------------------
// A bone-white ring under a small skull with glowing cyan eyes, cyan wisps
// rising off the ring.
export const skull: FrameParts = {
  front: ({ compact }) => (
    <>
      <defs>
        <linearGradient id="af-skull-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbe6ea" />
          <stop offset="1" stopColor="#6a7c85" />
        </linearGradient>
        <linearGradient id="af-skull-bone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b7c8d1" />
          <stop offset="1" stopColor="#56676f" />
        </linearGradient>
      </defs>
      <Ring outline="#0e1a1f" stroke="url(#af-skull-ring)" />
      {!compact && [12, 88].map((x, i) => (
        <ellipse key={x} className="af-wisp" cx={x} cy="8" rx="4" ry="7" fill="#67e8f9" opacity="0.8" style={{ animationDelay: `${-i * 1.3}s` }} />
      ))}
      <g transform="translate(34 -35) scale(.53)">
        <path
          d="M30 4 C14 4 6 16 8 30 C9 38 13 42 15 46 L15 56 C15 59 17 61 20 61 L40 61 C43 61 45 59 45 56 L45 46 C47 42 51 38 52 30 C54 16 46 4 30 4 Z"
          fill="url(#af-skull-bone)"
          stroke="#1c2226"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        <ellipse cx="21" cy="32" rx="7.5" ry="8.5" fill="#081014" />
        <ellipse cx="39" cy="32" rx="7.5" ry="8.5" fill="#081014" />
        <circle cx="21" cy="33" r="3.4" fill="#7ff5ff" className="deco-eye" />
        <circle cx="39" cy="33" r="3.4" fill="#7ff5ff" className="deco-eye" />
        <path d="M30 40 L25.5 49 L34.5 49 Z" fill="#081014" />
        <path d="M22 54 V60 M27 54 V61 M33 54 V61 M38 54 V60" stroke="#1c2226" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </>
  ),
  glow: "rgba(34,211,238,.6)",
};

// ---- 가시덩굴 ---------------------------------------------------------
// Two twisted dark vines circling the avatar with thorns pointing out.
const THORN = (() => {
  const N = 200;
  const wave = (theta: number, phase: number) => 52 + 3 * Math.sin(9 * theta + phase);
  const strand = (phase: number) => {
    let d = "";
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      const r = wave(t, phase);
      d += `${i === 0 ? "M" : "L"}${(50 + r * Math.cos(t)).toFixed(1)} ${(50 + r * Math.sin(t)).toFixed(1)} `;
    }
    return `${d}Z`;
  };
  let spikes = "";
  const K = 16;
  for (let k = 0; k < K; k++) {
    const t = (k / K) * Math.PI * 2;
    const out = k % 4 !== 3 ? 1 : -1;
    const len = (out === 1 ? 12 : 7) + (k % 3);
    const b = (a: number, r: number) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
    const [x1, y1] = b(t - 0.075, 52);
    const [x2, y2] = b(t + 0.075, 52);
    const [tx, ty] = b(t + 0.05 * (k % 2 ? 1 : -1), 52 + len * out);
    spikes += `M${x1.toFixed(1)} ${y1.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z `;
  }
  return { a: strand(0), b: strand(Math.PI), spikes };
})();

export const thorn: FrameParts = {
  front: () => (
    <>
      <path d={THORN.b} fill="none" stroke="#26343b" strokeWidth="6" strokeLinejoin="round" />
      <path d={THORN.a} fill="none" stroke="#3c4f59" strokeWidth="6" strokeLinejoin="round" />
      <path d={THORN.a} fill="none" stroke="#86a6b3" strokeWidth="1.4" opacity="0.65" />
      <path d={THORN.spikes} fill="#1c272d" stroke="#6b8794" strokeWidth="0.9" strokeLinejoin="round" />
    </>
  ),
  glow: "rgba(0,0,0,.4)",
};

// ---- 고양이 -----------------------------------------------------------
// A cream ring with pointy cat ears on top, paws hooked over the bottom and
// a tail curling up at the side.
const CAT_CREAM = "#fff4ee";
const CAT_LINE = "#dfb0aa";
const CAT_PINK = "#f3a7b8";

function CatEar({ mirror }: { mirror?: boolean }) {
  const ear = (
    <>
      <path d="M10 26 Q1 -6 12 -18 Q17 -19 44 6 Z" fill={CAT_CREAM} stroke={CAT_LINE} strokeWidth="4" strokeLinejoin="round" />
      <path d="M17 14 Q13 0 18 -8 L35 7 Z" fill={CAT_PINK} />
    </>
  );
  return mirror ? <g transform="translate(100 0) scale(-1 1)">{ear}</g> : ear;
}

export const cat: FrameParts = {
  back: () => (
    <>
      <CatEar />
      <CatEar mirror />
    </>
  ),
  front: ({ compact }) => (
    <>
      <Ring outline={CAT_LINE} stroke={CAT_CREAM} w={6.5} />
      {!compact && (
        <>
          <path d="M97 72 Q124 70 118 42" fill="none" stroke={CAT_LINE} strokeWidth="13" strokeLinecap="round" />
          <path d="M97 72 Q124 70 118 42" fill="none" stroke={CAT_CREAM} strokeWidth="8" strokeLinecap="round" />
          <path d="M119 52 Q122 46 118 42" fill="none" stroke={CAT_PINK} strokeWidth="8" strokeLinecap="round" />
          {[30, 70].map((x) => (
            <g key={x} transform={`translate(${x} 99)`}>
              <path d="M-12 4 Q-12 -7 0 -7 Q12 -7 12 4 L12 17 Q12 28 0 28 Q-12 28 -12 17 Z" fill={CAT_CREAM} stroke={CAT_LINE} strokeWidth="3.6" strokeLinejoin="round" />
              <ellipse cx="0" cy="17" rx="4.5" ry="3.6" fill={CAT_PINK} />
            </g>
          ))}
        </>
      )}
      <Star x={-6} y={10} r={7} fill="#ffe58a" delay={0.5} />
    </>
  ),
  glow: "rgba(236,143,168,.4)",
};

// ---- 장미 -------------------------------------------------------------
// Flat layered-petal roses (colors via --rose-a/-b/-c on the group).
function RoseDefs({ id }: { id: string }) {
  return (
    <defs>
      <symbol id={id} viewBox="-46 -46 92 92" overflow="visible">
        <g stroke="var(--rose-c)" strokeWidth="1.9" strokeLinejoin="round">
          {[0, 1, 2, 3, 4, 5].map((k) => <ellipse key={`o${k}`} cx="0" cy="-22" rx="17" ry="20" transform={`rotate(${k * 60})`} fill="var(--rose-b)" />)}
          {[0, 1, 2, 3, 4].map((k) => <ellipse key={`m${k}`} cx="0" cy="-12" rx="13" ry="14" transform={`rotate(${k * 72 + 20})`} fill="var(--rose-a)" />)}
          <circle r="11" fill="var(--rose-b)" />
          <path d="M0 0 c3 -3 8 0 6 5 c-2 5 -10 3 -11 -3 c-1 -8 8 -12 14 -7" fill="none" />
        </g>
        <ellipse cx="-9" cy="-14" rx="6" ry="3.5" fill="#fff" opacity="0.3" transform="rotate(-30 -9 -14)" />
      </symbol>
    </defs>
  );
}

interface Bloom { x: number; y: number; r: number; rot?: number }
interface RoseLeaf { x: number; y: number; rot: number; s: number }

function RoseFrame({ id, vars, blooms, leaves, leafFill, leafLine }: {
  id: string; vars: CSSProperties; blooms: Bloom[]; leaves: RoseLeaf[]; leafFill: string; leafLine: string;
}) {
  return (
    <g style={vars}>
      <RoseDefs id={id} />
      {leaves.map((l, i) => <Leaf key={i} x={l.x} y={l.y} rot={l.rot} s={l.s} fill={leafFill} line={leafLine} />)}
      {blooms.map((b, i) => (
        <use key={i} href={`#${id}`} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} transform={b.rot ? `rotate(${b.rot} ${b.x} ${b.y})` : undefined} />
      ))}
    </g>
  );
}

export const roseWhite: FrameParts = {
  front: ({ compact }) => {
    const blooms: Bloom[] = [{ x: 10, y: 8, r: 21 }, { x: 93, y: 4, r: 17, rot: 40 }];
    const leaves: RoseLeaf[] = [{ x: 30, y: -10, rot: -160, s: 0.7 }, { x: 70, y: -12, rot: -20, s: 0.7 }];
    if (!compact) {
      blooms.push({ x: 3, y: 88, r: 15, rot: 20 }, { x: 98, y: 92, r: 19, rot: 70 });
      leaves.push({ x: -8, y: 66, rot: 130, s: 0.6 }, { x: 108, y: 70, rot: 50, s: 0.6 });
    }
    return (
      <>
        <Ring outline="#b7abd0" stroke="#e6c98d" w={5} />
        <RoseFrame id="af-rose-w" vars={{ "--rose-a": "#fdfaf5", "--rose-b": "#e7e0f2", "--rose-c": "#b7abd0" } as CSSProperties} blooms={blooms} leaves={leaves} leafFill="#d8d3ec" leafLine="#b7abd0" />
      </>
    );
  },
  glow: "rgba(196,181,253,.6)",
};

export const roseBlack: FrameParts = {
  front: ({ compact }) => {
    const blooms: Bloom[] = [{ x: 8, y: 6, r: 24, rot: 10 }, { x: 36, y: -8, r: 16, rot: 50 }, { x: -8, y: 36, r: 15, rot: 80 }];
    const leaves: RoseLeaf[] = [{ x: 28, y: -16, rot: -150, s: 0.7 }, { x: -14, y: 14, rot: 170, s: 0.65 }];
    if (!compact) {
      blooms.push({ x: 97, y: 6, r: 14, rot: 40 });
      leaves.push({ x: 108, y: 14, rot: 40, s: 0.6 });
    }
    return (
      <>
        <Ring outline="#0c0c10" stroke="#3b3b45" w={6} />
        <RoseFrame id="af-rose-b" vars={{ "--rose-a": "#565662", "--rose-b": "#2b2b33", "--rose-c": "#0c0c10" } as CSSProperties} blooms={blooms} leaves={leaves} leafFill="#26332f" leafLine="#0c0c10" />
      </>
    );
  },
  glow: "rgba(0,0,0,.45)",
};
