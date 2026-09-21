import type { DecoProps } from "./types";
import Sparkle from "./Sparkle";

// A cream cat lounging along the card's top edge, front paws hanging over the
// front and its tail trailing down the left side and curling under. Front
// layer only. The cat is drawn in a 360x132 box (body bottom at y=98, which
// lands on the card's top edge) scaled by SCALE; the tail is a second SVG
// laid out on the card's measured size.
const SCALE = 1.33;
const CAT_LEFT = 18;
const OUTLINE = "#dfb0aa";
const CREAM = "#fff4ee";
const PINK = "#f3a7b8";
const INK = "#5a3a3a";
const PAD = 40;

function Paw({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 88)`}>
      <path d="M0 4 Q0 -6 19 -6 Q38 -6 38 4 L38 26 Q38 40 19 40 Q0 40 0 26 Z" fill={CREAM} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      <path d="M13 24 V35 M25 24 V35" stroke={OUTLINE} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

export default function Cat({ w, h, layer }: DecoProps) {
  if (layer !== "front") return null;
  const tailBottom = PAD + h * 0.8;
  const tailMid = PAD + h * 0.64;
  const tailD = `M ${CAT_LEFT + 30 + PAD} ${PAD + 8} C ${CAT_LEFT + PAD - 14} ${PAD + 2} ${PAD - 8} ${PAD + 22} ${PAD - 10} ${PAD + 76} L ${PAD - 10} ${tailMid} C ${PAD - 10} ${tailMid + 50} ${PAD + 6} ${tailBottom} ${PAD + 60} ${tailBottom + 2}`;
  const tipD = `M ${PAD - 10} ${tailMid} C ${PAD - 10} ${tailMid + 50} ${PAD + 6} ${tailBottom} ${PAD + 60} ${tailBottom + 2}`;
  return (
    <>
      <svg className="deco-sway" width={w + PAD * 2} height={h + PAD * 2} style={{ position: "absolute", left: -PAD, top: -PAD, overflow: "visible", transformOrigin: `${CAT_LEFT + 30 + PAD}px ${PAD}px` }}>
        <path d={tailD} fill="none" stroke={OUTLINE} strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
        <path d={tailD} fill="none" stroke={CREAM} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
        <path d={tipD} fill="none" stroke={PINK} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg className="deco-breathe" width={360 * SCALE} height={132 * SCALE} viewBox="0 0 360 132" style={{ position: "absolute", left: CAT_LEFT, top: -98 * SCALE, overflow: "visible", transformOrigin: "50% 100%" }}>
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? "translate(360 0) scale(-1 1)" : undefined}>
            <path d="M46 52 Q42 12 64 4 Q72 2 78 8 L114 36 Z" fill={CREAM} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
            <path d="M58 42 Q57 22 66 15 L92 35 Z" fill={PINK} />
          </g>
        ))}
        <path d="M26 98 C8 98 6 60 34 48 C64 36 110 30 180 30 C250 30 296 36 326 48 C354 60 352 98 334 98 Z" fill={CREAM} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
        <path d="M130 62 Q142 72 154 62 M206 62 Q218 72 230 62" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="112" cy="76" rx="11" ry="6" fill="#f7b6c2" opacity="0.85" />
        <ellipse cx="248" cy="76" rx="11" ry="6" fill="#f7b6c2" opacity="0.85" />
        <path d="M174 66 L186 66 L180 74 Z" fill="#e58f9b" />
        <path d="M180 74 Q174 83 166 78 M180 74 Q186 83 194 78" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <Paw x={98} />
        <Paw x={224} />
      </svg>
      <Sparkle x={CAT_LEFT + 360 * SCALE + 18} y={-92} size={14} color="#ffe58a" delay={0.3} />
      <Sparkle x={CAT_LEFT + 360 * SCALE - 30} y={-138} size={9} color="#fff3b0" delay={1.4} />
      <Sparkle x={CAT_LEFT - 10} y={-108} size={10} color="#ffe58a" delay={2.1} />
      <Sparkle x={CAT_LEFT + 12} y={h * 0.7} size={11} color="#ffe58a" delay={0.9} />
    </>
  );
}
