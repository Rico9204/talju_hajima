// Small drawing helpers shared by the avatar frames. Coordinates: the avatar
// circle is centered at (50,50) with radius 50.

// An outlined ring hugging the avatar's edge: a wider dark stroke with the
// colored stroke on top, so it reads as a sticker-style border.
export function Ring({ r = 51, outline, outlineW = 11, stroke, w = 6.5, dash, className }: {
  r?: number; outline: string; outlineW?: number; stroke: string; w?: number; dash?: string; className?: string;
}) {
  return (
    <>
      <circle cx="50" cy="50" r={r} fill="none" stroke={outline} strokeWidth={outlineW} />
      <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth={w} strokeDasharray={dash} className={className} />
    </>
  );
}

// Four-point sparkle centered on (x,y); animate with class "af-twinkle".
export function Star({ x, y, r, fill = "#fff", delay = 0 }: { x: number; y: number; r: number; fill?: string; delay?: number }) {
  return (
    // Placement/size live on the outer group; the CSS twinkle animation runs on
    // the path (an animated CSS transform would override a transform attribute).
    <g transform={`translate(${x} ${y}) scale(${r})`}>
      <path
        className="af-twinkle"
        d="M0 -1 L.26 -.26 L1 0 L.26 .26 L0 1 L-.26 .26 L-1 0 L-.26 -.26 Z"
        fill={fill}
        style={{ animationDelay: `${-delay}s` }}
      />
    </g>
  );
}

// Material-style heart in a 24x24 box.
export const HEART_PATH = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

// Lightning bolt in a 100x100 box.
export const BOLT_PATH = "M55 0 L15 56 L45 56 L30 100 L85 38 L52 38 Z";

// A leaf pointing along +x from its base at the origin (about 34 long).
export function Leaf({ x, y, rot, s = 1, fill, line, vein }: { x: number; y: number; rot: number; s?: number; fill: string; line: string; vein?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 0 C10 -14 26 -14 34 0 C26 14 10 14 0 0 Z" fill={fill} stroke={line} strokeWidth={3 / s} strokeLinejoin="round" />
      <path d="M3 0 H28" stroke={vein ?? line} strokeWidth={1.6 / s} strokeLinecap="round" opacity="0.6" />
    </g>
  );
}
