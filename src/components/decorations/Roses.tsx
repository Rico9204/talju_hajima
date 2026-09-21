import { useMemo, type CSSProperties } from "react";
import { perimeterPoints, wobblePath } from "../../lib/perimeter";
import type { DecoProps } from "./types";
import Sparkle from "./Sparkle";

// Two rose frames drawn from one flat, layered-petal rose glyph:
//  - white: pale roses at the corners and along the edges, joined by a gold
//    vine hugging the whole border (the ornate frame),
//  - black: a heavy cluster of dark roses in the top-left corner with thorny
//    tendrils trailing along the top edge and a small spray top-right.
// Front layer only. Colors come from --rose-a (lit petals), --rose-b (shaded
// petals) and --rose-c (outline) set on each SVG.
const PAD = 60;
const RADIUS = 16;

interface Bloom { x: number; y: number; r: number; rot?: number }
interface Leaf { x: number; y: number; len: number; rot?: number }

function RoseDefs({ id }: { id: string }) {
  return (
    <defs>
      <symbol id={id} viewBox="-46 -46 92 92" overflow="visible">
        <g stroke="var(--rose-c)" strokeWidth="1.7" strokeLinejoin="round">
          {[0, 1, 2, 3, 4, 5].map((k) => <ellipse key={`o${k}`} cx="0" cy="-22" rx="17" ry="20" transform={`rotate(${k * 60})`} fill="var(--rose-b)" />)}
          {[0, 1, 2, 3, 4].map((k) => <ellipse key={`m${k}`} cx="0" cy="-12" rx="13" ry="14" transform={`rotate(${k * 72 + 20})`} fill="var(--rose-a)" />)}
          <circle r="11" fill="var(--rose-b)" />
          <path d="M0 0 c3 -3 8 0 6 5 c-2 5 -10 3 -11 -3 c-1 -8 8 -12 14 -7" fill="none" />
        </g>
        <ellipse cx="-9" cy="-14" rx="6" ry="3.5" fill="#fff" opacity="0.3" transform="rotate(-30 -9 -14)" />
      </symbol>
      <symbol id={`${id}-leaf`} viewBox="-16 -8 32 16" overflow="visible">
        <path d="M-15 0 C-8 -9 8 -9 15 0 C8 9 -8 9 -15 0 Z" fill="var(--leaf-fill)" stroke="var(--rose-c)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M-13 0 H12" stroke="var(--rose-c)" strokeWidth="0.9" opacity="0.7" />
      </symbol>
    </defs>
  );
}

function Blooms({ id, blooms, leaves }: { id: string; blooms: Bloom[]; leaves: Leaf[] }) {
  return (
    <>
      {leaves.map((l, i) => (
        <use key={`l${i}`} href={`#${id}-leaf`} x={l.x - l.len / 2} y={l.y - l.len / 4} width={l.len} height={l.len / 2} transform={`rotate(${l.rot ?? 0} ${l.x} ${l.y})`} />
      ))}
      {blooms.map((b, i) => (
        <use key={`b${i}`} href={`#${id}`} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} transform={b.rot ? `rotate(${b.rot} ${b.x} ${b.y})` : undefined} />
      ))}
    </>
  );
}

function WhiteRoses({ w, h }: { w: number; h: number }) {
  const id = "deco-rose-w";
  const vine = useMemo(() => {
    const pts = perimeterPoints(w, h, RADIUS, 3).map((p) => ({ ...p, x: p.x + PAD, y: p.y + PAD }));
    return { a: wobblePath(pts, 5, 90, 0), b: wobblePath(pts, 5, 90, Math.PI) };
  }, [w, h]);
  const o = PAD;
  const blooms: Bloom[] = [
    { x: o + 10, y: o + 4, r: 50 }, { x: o + w + 10, y: o - 10, r: 44, rot: 40 },
    { x: o + 4, y: o + h - 6, r: 42, rot: 20 }, { x: o + w + 6, y: o + h - 2, r: 46, rot: 70 },
    { x: o + w * 0.5, y: o - 4, r: 28, rot: 15 }, { x: o + w * 0.27, y: o - 2, r: 20 }, { x: o + w * 0.74, y: o - 2, r: 22, rot: 30 },
    { x: o + w * 0.5, y: o + h + 3, r: 24 }, { x: o - 2, y: o + h * 0.5, r: 18 }, { x: o + w + 2, y: o + h * 0.48, r: 18, rot: 50 },
  ];
  const leaves: Leaf[] = [
    { x: o + 62, y: o - 16, len: 38, rot: -20 }, { x: o - 14, y: o + 60, len: 36, rot: 70 }, { x: o + w - 60, y: o - 14, len: 36, rot: 200 },
    { x: o + w + 14, y: o + 58, len: 34, rot: 110 }, { x: o + 44, y: o + h + 12, len: 34, rot: 20 }, { x: o + w - 46, y: o + h + 14, len: 34, rot: 160 },
    { x: o + w * 0.4, y: o - 12, len: 26, rot: -10 }, { x: o + w * 0.62, y: o - 12, len: 26, rot: 190 },
  ];
  return (
    <svg
      width={w + PAD * 2}
      height={h + PAD * 2}
      style={{ position: "absolute", left: -PAD, top: -PAD, overflow: "visible", filter: "drop-shadow(0 0 5px rgba(196,181,253,.7))", "--rose-a": "#fdfaf5", "--rose-b": "#e7e0f2", "--rose-c": "#b7abd0", "--leaf-fill": "#d8d3ec" } as CSSProperties}
    >
      <RoseDefs id={id} />
      <path d={vine.b} fill="none" stroke="#f3e3b7" strokeWidth="3" opacity="0.7" />
      <path d={vine.a} fill="none" stroke="#e6c98d" strokeWidth="2.4" />
      <Blooms id={id} blooms={blooms} leaves={leaves} />
    </svg>
  );
}

function BlackRoses({ w, h }: { w: number; h: number }) {
  const id = "deco-rose-b";
  const vine = useMemo(() => {
    const pts = perimeterPoints(w, h, RADIUS, 3).map((p) => ({ ...p, x: p.x + PAD, y: p.y + PAD }));
    // Only the top edge and the top of the left side, trailing off from the
    // top-left corner. On the closed loop that stretch wraps around the array
    // end (left edge + corner arc come last, the top edge first), so stitch
    // the two runs together or the line would jump across the card.
    const inRange = (p: { x: number; y: number }) => p.y < PAD + 70 && p.x < PAD + w * 0.62;
    const first = pts.findIndex((p) => !inRange(p));
    const last = pts.length - 1 - [...pts].reverse().findIndex((p) => !inRange(p));
    const run = first <= 0 || last >= pts.length - 1 ? [] : [...pts.slice(last + 1), ...pts.slice(0, first)];
    return run.length > 1 ? wobblePath(run, 4, 70, 0).replace(/ Z$/, "") : "";
  }, [w, h]);
  const o = PAD;
  const blooms: Bloom[] = [
    { x: o + 8, y: o + 6, r: 54, rot: 10 }, { x: o + 70, y: o - 12, r: 40, rot: 50 }, { x: o - 14, y: o + 66, r: 34, rot: 80 },
    { x: o + 116, y: o + 2, r: 30, rot: 20 }, { x: o + 38, y: o + 42, r: 26, rot: 30 }, { x: o + 160, y: o - 4, r: 20 },
    { x: o + w + 8, y: o - 8, r: 32, rot: 40 }, { x: o + w + 12, y: o + 30, r: 18 },
  ];
  const leaves: Leaf[] = [
    { x: o + 84, y: o - 30, len: 40, rot: -25 }, { x: o - 30, y: o + 20, len: 38, rot: 60 }, { x: o + 44, y: o + 66, len: 34, rot: 110 },
    { x: o + w - 34, y: o - 12, len: 32, rot: 200 }, { x: o + w + 18, y: o + 4, len: 30, rot: 100 },
  ];
  return (
    <svg
      width={w + PAD * 2}
      height={h + PAD * 2}
      style={{ position: "absolute", left: -PAD, top: -PAD, overflow: "visible", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.55))", "--rose-a": "#565662", "--rose-b": "#2b2b33", "--rose-c": "#0c0c10", "--leaf-fill": "#26332f" } as CSSProperties}
    >
      <RoseDefs id={id} />
      {vine && <path d={vine} fill="none" stroke="#1d2a2a" strokeWidth="4" strokeLinecap="round" />}
      {vine && <path d={vine} fill="none" stroke="#5b7a74" strokeWidth="1" strokeLinecap="round" opacity="0.6" />}
      <Blooms id={id} blooms={blooms} leaves={leaves} />
    </svg>
  );
}

export default function Roses({ w, h, layer, tone }: DecoProps & { tone: "white" | "black" }) {
  if (layer !== "front") return null;
  return (
    <>
      {tone === "white" ? <WhiteRoses w={w} h={h} /> : <BlackRoses w={w} h={h} />}
      {tone === "white" && (
        <>
          <Sparkle x={w * 0.18} y={-30} size={10} color="#ffffff" delay={0.2} />
          <Sparkle x={w * 0.82} y={-26} size={12} color="#fff3d1" delay={1.1} />
          <Sparkle x={-22} y={h * 0.4} size={9} color="#ffffff" delay={1.8} />
          <Sparkle x={w + 22} y={h * 0.62} size={10} color="#fff3d1" delay={0.6} />
        </>
      )}
    </>
  );
}
