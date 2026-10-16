import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DecoProps } from "./types";
import Sparkle from "./Sparkle";

// 우핑강 (우아한 핑크 강아지): a pink dachshund-style pup, drawn after the
// character card in docs/epd.png (flat pink fill, deep-plum outline), worn out
// from an all-nighter — half-lidded eyes that keep drooping shut and jerking
// awake, dark eyebags, a drooping ear, a sleep bubble at the nose, and Zzz
// drifting up. It keeps its elegance with a heart-pendant necklace and a
// ribbon bow.
// It lies along the card's top edge with its chin on its front paws, next to
// a heart-print coffee cup, under a crescent moon. Moon is the back layer;
// the rest is front.
//
// Click the dog and it startles awake: a hop, wide shocked eyes, a perked ear,
// a wagging tail and a shout bubble ("헉!" / "줴줴이야~", alternating per
// click), then it dozes off again after a few seconds. Only the painted dog shapes take clicks (pointer-events), so the
// card's edit/close buttons next to it stay clickable.
const S = 1.15; // scale of the 420x150 dog box
const BODY_BOTTOM = 112; // y in the dog box that lands on the card's top edge
const AWAKE_MS = 3400;
// What the startled pup shouts; each click shows the next line in turn.
const SHOUTS = ["헉!", "줴줴이야~"];
const FILL = "#f9a8b8";
const SHADE = "#ef8ba3";
const DEEP = "#e26f8c";
const LINE = "#7b2c47";

function Paw({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 6 Q0 -6 17 -6 Q34 -6 34 6 L34 30 Q34 44 17 44 Q0 44 0 30 Z" fill={FILL} stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
      <path d="M12 27 V39 M22 27 V39" stroke={LINE} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

// A thin gold chain that goes around the neck and a small heart pendant that
// swings gently. It's drawn first inside the head group, i.e. *behind* the
// head, so only the loop under the jaw shows — the chain reads as passing
// round the back of the neck instead of being pasted across the face — and it
// moves with the head as it nods.
const HEART_PATH = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
const CHAIN_PATH = "M298 96 Q336 158 374 100";

function HeartPendant() {
  return (
    <g>
      <path d={CHAIN_PATH} fill="none" stroke="#b8893f" strokeWidth="3.4" strokeLinecap="round" />
      <path d={CHAIN_PATH} fill="none" stroke="#f3d38a" strokeWidth="1.8" strokeLinecap="round" />
      <g className="deco-swing" style={{ transformOrigin: "336px 127px" }}>
        <circle cx="336" cy="128" r="2.4" fill="none" stroke="#b8893f" strokeWidth="1.6" />
        <g transform="translate(325.6 125) scale(.87)">
          <path d={HEART_PATH} fill="#f43f78" stroke="#8a1f45" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6.5 8 Q7 5.6 10 5.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
        </g>
      </g>
    </g>
  );
}

function Dog({ awake, wake, onWake }: { awake: boolean; wake: number; onWake: () => void }) {
  return (
    <svg
      key={wake}
      className={awake ? "deco-startle" : undefined}
      width={420 * S}
      height={150 * S}
      viewBox="0 0 420 150"
      style={{ position: "absolute", overflow: "visible", transformOrigin: "62% 78%" }}
    >
      <g onClick={onWake} style={{ pointerEvents: "auto", cursor: "pointer" }}>
        {/* Tail (wags when startled), then body with its slow breathing */}
        <g className={awake ? "deco-wag" : undefined} style={{ transformOrigin: "34px 98px" }}>
          <path d="M34 98 C4 94 -2 60 24 46" fill="none" stroke={LINE} strokeWidth="17" strokeLinecap="round" />
          <path d="M34 98 C4 94 -2 60 24 46" fill="none" stroke={FILL} strokeWidth="11" strokeLinecap="round" />
        </g>
        <g className="deco-breathe" style={{ transformOrigin: "180px 112px" }}>
          <path d="M26 112 C8 112 6 80 38 66 C90 46 190 42 252 54 C300 62 336 80 336 112 Z" fill={FILL} stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 112 C100 104 240 104 330 112 Z" fill={SHADE} opacity="0.5" />
          <ellipse cx="76" cy="94" rx="36" ry="24" fill={SHADE} stroke={LINE} strokeWidth="3" />
          <ellipse cx="102" cy="112" rx="22" ry="8" fill={DEEP} stroke={LINE} strokeWidth="3" />
        </g>
        <Paw x={296} y={100} />
        <Paw x={334} y={104} />

        {/* Head: nodding off while asleep, snapped upright when awake */}
        <g
          className={awake ? undefined : "deco-nod"}
          style={{ transformOrigin: "336px 102px", transform: awake ? "rotate(-7deg)" : undefined, transition: "transform .16s ease-out" }}
        >
          <HeartPendant />
          <ellipse cx="338" cy="80" rx="42" ry="38" fill={FILL} stroke={LINE} strokeWidth="3" />
          <ellipse cx="382" cy="92" rx="30" ry="19" fill={FILL} stroke={LINE} strokeWidth="3" />
          <ellipse cx="366" cy="86" rx="26" ry="26" fill={FILL} />
          {awake
            ? <ellipse cx="392" cy="103" rx="6.5" ry="6" fill={LINE} />
            : <path d="M396 100 Q388 108 376 104" fill="none" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />}
          <ellipse cx="410" cy="88" rx="8" ry="6.5" fill="#4a1830" />
          <circle cx="407.5" cy="86" r="2" fill="#fff" opacity="0.85" />
          {!awake && (
            // the sleep bubble that swells and shrinks at the nose
            <g className="deco-snot" style={{ transformOrigin: "416px 90px" }}>
              <circle cx="426" cy="90" r="11" fill="rgba(255,255,255,.55)" stroke="#f472b6" strokeWidth="1.8" />
              <path d="M420 85 Q422 81 427 81" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}
          <ellipse cx="354" cy="93" rx="9" ry="5" fill="#f472b6" opacity={awake ? 0.8 : 0.55} />
          {awake ? (
            // shocked awake: brow shot up, big round eye, tiny pupil
            <>
              <path d="M384 52 Q371 46 358 55" fill="none" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="372" cy="75" r="9" fill="#fff" stroke={LINE} strokeWidth="2.6" />
              <circle cx="373" cy="76" r="3.8" fill="#2b1020" />
              <circle cx="371.6" cy="74.2" r="1.3" fill="#fff" />
            </>
          ) : (
            // tired: drooping brow, soft eyebag shadow and a half-moon eye — the
            // round dot eye with its top half hidden behind a flat lid line
            <>
              <path d="M385 62 Q372 57 358 67" fill="none" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />
              <ellipse cx="372" cy="89" rx="9.5" ry="3.2" fill="#a45aa6" opacity="0.3" />
              {/* The half-moon collapses upward into the lid line as the eye shuts, and swells a touch when it jerks awake */}
              <g className="deco-eye-half" style={{ transformOrigin: "372px 77px" }}>
                <path d="M363 77 A9 9 0 0 0 381 77 Z" fill="#2b1020" />
                <circle cx="369.5" cy="80.5" r="1.6" fill="#fff" opacity="0.9" />
              </g>
              <path className="deco-eye-open" d="M361.5 77 H382.5" fill="none" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
              {/* the shut eye: a downward-curved sleeping line, shown only while the eye is closed */}
              <path className="deco-eye-shut" d="M363 77.5 Q372 84 381 77.5" fill="none" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />
            </>
          )}
          {/* floppy ear (flicks up when startled) */}
          <g style={{ transformOrigin: "316px 56px", transform: awake ? "rotate(-24deg)" : undefined, transition: "transform .16s ease-out" }}>
            <path d="M316 54 C296 56 288 92 300 118 C306 128 326 124 330 108 C336 86 332 60 316 54 Z" fill="#f07f9a" stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
            <path d="M310 70 Q304 92 310 108" fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" opacity="0.35" />
          </g>
          {/* ribbon bow */}
          <path d="M340 42 L318 30 L321 53 Z" fill="#f43f78" stroke="#8a1f45" strokeWidth="2" strokeLinejoin="round" />
          <path d="M340 42 L362 30 L359 53 Z" fill="#f43f78" stroke="#8a1f45" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="340" cy="42" r="5.5" fill="#fb6b98" stroke="#8a1f45" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}

function CoffeeCup() {
  return (
    <svg width="64" height="76" viewBox="0 0 64 76" style={{ overflow: "visible" }}>
      {[0, 1, 2].map((i) => (
        <path key={i} className="deco-steam" d={`M${22 + i * 10} 26 q-6 -6 0 -12 q6 -6 0 -12`} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.4" strokeLinecap="round" style={{ animationDelay: `${-i * 0.9}s` }} />
      ))}
      <path d="M8 34 L46 34 L42 64 Q27 70 12 64 Z" fill="#fffafc" stroke={LINE} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M46 40 Q60 42 56 54 Q52 60 43 58" fill="none" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="27" cy="34" rx="19" ry="4.5" fill="#8b5a3c" stroke={LINE} strokeWidth="2.2" />
      <path d="M27 58 C17 51 19 44 24 46 C26 47 27 49 27 49 C27 49 28 47 30 46 C35 44 37 51 27 58 Z" fill="#f472b6" />
      <ellipse cx="27" cy="68" rx="27" ry="5.5" fill="#fbd0dc" stroke={LINE} strokeWidth="2.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" style={{ overflow: "visible", filter: "drop-shadow(0 0 10px rgba(255,236,160,.85))" }}>
      <defs>
        <mask id="deco-dog-moon-mask">
          <rect width="80" height="80" fill="#fff" />
          <circle cx="50" cy="34" r="26" fill="#000" />
        </mask>
      </defs>
      <circle cx="36" cy="42" r="30" fill="#fff2b3" mask="url(#deco-dog-moon-mask)" />
    </svg>
  );
}

function Zzz({ x, y }: { x: number; y: number }) {
  const letters: { ch: string; size: number; delay: number; dx: number }[] = [
    { ch: "z", size: 16, delay: 0, dx: 0 },
    { ch: "Z", size: 22, delay: 1.4, dx: 10 },
    { ch: "Z", size: 28, delay: 2.8, dx: 22 },
  ];
  return (
    <>
      {letters.map((l, i) => (
        <span
          key={i}
          className="deco-zzz"
          style={{ left: x + l.dx, top: y, fontSize: l.size, animationDelay: `${-l.delay}s` } as CSSProperties}
        >
          {l.ch}
        </span>
      ))}
    </>
  );
}

export default function PinkDog({ w, layer }: DecoProps) {
  const [awake, setAwake] = useState(false);
  const [wake, setWake] = useState(0); // bumped per click so the startle animation restarts
  const timer = useRef<number | undefined>(undefined);
  const startle = () => {
    setWake((n) => n + 1);
    setAwake(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), AWAKE_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const dogLeft = Math.max(w * 0.3, w - 420 * S - 20);
  const dogTop = -BODY_BOTTOM * S;
  if (layer === "back") {
    return (
      <>
        <div style={{ position: "absolute", left: w * 0.05, top: -104 }}><Moon /></div>
        <Sparkle x={w * 0.05 + 96} y={-94} size={10} color="#fff3b0" delay={0.4} />
        <Sparkle x={w * 0.17} y={-108} size={8} color="#fbcfe8" delay={1.3} />
        <Sparkle x={w * 0.1} y={-30} size={9} color="#fff3b0" delay={2.1} />
      </>
    );
  }
  return (
    <>
      {/* Warm, sleepy haze inside the card's edge */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius)", boxShadow: "inset 0 0 50px rgba(244,114,182,.22), inset 0 0 12px rgba(249,168,184,.4)" }} />
      <div style={{ position: "absolute", left: w * 0.16, top: -72 }}><CoffeeCup /></div>
      <div style={{ position: "absolute", left: dogLeft, top: dogTop }}><Dog awake={awake} wake={wake} onWake={startle} /></div>
      {awake
        ? (
          // Centered over the head (the bubble's tail sits at 62% of its width) so a longer line doesn't run off the card's right side.
          <div style={{ position: "absolute", left: dogLeft + 372 * S, top: dogTop - 8, transform: "translateX(-62%)" }}>
            <div key={wake} className="deco-shout">{SHOUTS[(wake - 1) % SHOUTS.length]}</div>
          </div>
        )
        : <Zzz x={dogLeft + 388 * S} y={dogTop + 46 * S} />}
      <Sparkle x={dogLeft + 40} y={-150} size={9} color="#fbcfe8" delay={0.8} />
      <Sparkle x={dogLeft + 470} y={-80} size={11} color="#fff3b0" delay={1.6} />
    </>
  );
}
