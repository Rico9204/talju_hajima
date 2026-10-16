// Geometry for decorations that run along the profile card's rounded-rect
// border (thorn vines, gold rose vines). The card's real pixel size is
// measured at runtime, so everything is generated for the actual w/h instead
// of stretching an SVG (which would squash thorns and roses).
export interface PerimeterPoint {
  x: number;
  y: number;
  nx: number; // outward unit normal
  ny: number;
  s: number; // distance travelled clockwise from the top edge's start
}

// Clockwise from the start of the top edge (just after the top-left corner).
export function perimeterPoints(w: number, h: number, r: number, step: number): PerimeterPoint[] {
  const radius = Math.min(r, w / 2, h / 2);
  type Seg = { len: number; at: (t: number) => { x: number; y: number; nx: number; ny: number } };
  const arc = (cx: number, cy: number, a0: number): Seg => ({
    len: (Math.PI / 2) * radius,
    at: (t) => {
      const a = a0 + t * (Math.PI / 2);
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) };
    },
  });
  const line = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): Seg => ({
    len: Math.hypot(x1 - x0, y1 - y0),
    at: (t) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny }),
  });
  const segs: Seg[] = [
    line(radius, 0, w - radius, 0, 0, -1),
    arc(w - radius, radius, -Math.PI / 2),
    line(w, radius, w, h - radius, 1, 0),
    arc(w - radius, h - radius, 0),
    line(w - radius, h, radius, h, 0, 1),
    arc(radius, h - radius, Math.PI / 2),
    line(0, h - radius, 0, radius, -1, 0),
    arc(radius, radius, Math.PI),
  ];
  const points: PerimeterPoint[] = [];
  let travelled = 0;
  for (const seg of segs) {
    const n = Math.max(1, Math.round(seg.len / step));
    for (let i = 0; i < n; i++) {
      const p = seg.at(i / n);
      points.push({ ...p, s: travelled + (i / n) * seg.len });
    }
    travelled += seg.len;
  }
  return points;
}

// A closed polyline offset along the outward normal by amp*sin(wave), i.e. a
// wobbling strand hugging the border. Two strands with opposite phase read as
// a twisted vine.
export function wobblePath(points: PerimeterPoint[], amp: number, wavelength: number, phase: number, bias = 0): string {
  const parts = points.map((p, i) => {
    const off = bias + amp * Math.sin((p.s / wavelength) * Math.PI * 2 + phase);
    return `${i === 0 ? "M" : "L"}${(p.x + p.nx * off).toFixed(1)} ${(p.y + p.ny * off).toFixed(1)}`;
  });
  return `${parts.join(" ")} Z`;
}

// Tangent (clockwise travel direction) at a point: the normal rotated 90°.
export const tangentOf = (p: PerimeterPoint) => ({ tx: -p.ny, ty: p.nx });
