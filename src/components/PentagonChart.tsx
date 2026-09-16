import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { radarAxisAt, radarScoreAt } from "../lib/radarInput";

interface RadarAxis {
  label: string;
  value: number;
}

const MAX_VALUE = 10;
const MID_VALUE = 5;
const ANIMATION_MS = 400;

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (Math.PI / 180) * angleDeg;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function toPolygon(points: { x: number; y: number }[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// Smoothly tweens each value toward its latest target instead of snapping,
// so the pentagon fills in with motion when scores change.
function useAnimatedValues(values: number[]): number[] {
  const [display, setDisplay] = useState<number[]>(values);
  const displayRef = useRef<number[]>(values);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayRef.current.length === values.length ? displayRef.current : values;
    const to = values;
    const start = performance.now();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const t = Math.min((now - start) / ANIMATION_MS, 1);
      const eased = easeOutCubic(t);
      const next = from.map((v, i) => v + (to[i] - v) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join(",")]);

  return display;
}

interface PentagonChartProps {
  data: RadarAxis[];
  size?: number;
  gridColor?: string;
  fillColor?: string;
  labelColor?: string;
  valueColor?: string;
  onValueChange?: (index: number, value: number) => void;
  limits?: number[];
  disabled?: boolean;
}

export default function PentagonChart({
  data,
  size = 340,
  gridColor = "var(--border)",
  fillColor = "var(--primary)",
  labelColor = "var(--foreground)",
  valueColor = "var(--primary)",
  onValueChange, limits, disabled = false,
}: PentagonChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ axis: number; pointerId: number } | null>(null);
  const editable = !!onValueChange && !disabled;
  const n = data.length;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 76;
  const angleStep = 360 / n;
  const angles = data.map((_, i) => i * angleStep);

  const targetValues = data.map((d) => Math.min(Math.max(d.value, 0), MAX_VALUE));
  const animatedValues = useAnimatedValues(targetValues);

  const outerPoints = angles.map((a) => polarPoint(cx, cy, maxR, a));
  const midPoints = angles.map((a) => polarPoint(cx, cy, maxR * (MID_VALUE / MAX_VALUE), a));
  const displayValues = onValueChange ? targetValues : animatedValues;
  const dataPoints = displayValues.map((v, i) => polarPoint(cx, cy, maxR * (v / MAX_VALUE), angles[i]));

  function limitFor(index: number) { return Math.max(1, Math.min(MAX_VALUE, limits?.[index] ?? MAX_VALUE)); }
  function updatePointer(event: ReactPointerEvent<SVGElement>, axis: number) {
    const matrix = svgRef.current?.getScreenCTM();
    if (!editable || !matrix || maxR <= 0) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const score = radarScoreAt(point.x - cx, point.y - cy, axis, n, maxR);
    onValueChange?.(axis, Math.min(limitFor(axis), score));
  }
  function startDrag(event: ReactPointerEvent<SVGElement>, axis: number) {
    if (!editable || dragging.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.current = { axis, pointerId: event.pointerId };
    svgRef.current?.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    updatePointer(event, axis);
  }
  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragging.current?.pointerId !== event.pointerId) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <svg ref={svgRef} width={size} height={size} viewBox={[0, 0, size, size].join(" ")}
      style={{ maxWidth: "100%", height: "auto", touchAction: editable ? "none" : "auto" }}
      onPointerMove={(event) => {
        if (dragging.current?.pointerId === event.pointerId) updatePointer(event, dragging.current.axis);
      }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { dragging.current = null; }}>
      <g onPointerDown={(event) => {
        const matrix = svgRef.current?.getScreenCTM();
        if (!editable || !matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        startDrag(event, radarAxisAt(point.x - cx, point.y - cy, n));
      }} style={{ cursor: editable ? "crosshair" : "default" }}>
      {/* Transparent fill makes the entire grid clickable, including empty areas. */}
      <polygon points={toPolygon(outerPoints)} fill="transparent" />
      {/* scale markers sit just inside each polygon side and behind the grid/data */}
      {[10, 5].map((score) => {
        const sideRadius = maxR * (score / MAX_VALUE) * Math.cos(Math.PI / n);
        const position = polarPoint(cx, cy, Math.max(0, sideRadius - 8), -angleStep / 2);
        return <text key={score} x={position.x} y={position.y} textAnchor="middle"
          dominantBaseline="middle" fontSize={10} fontWeight={700} fill={gridColor} pointerEvents="none">{score}</text>;
      })}
      {/* spokes */}
      {outerPoints.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={gridColor} strokeWidth={1} />
      ))}

      {/* outer grid: 10점 */}
      <polygon points={toPolygon(outerPoints)} fill="none" stroke={gridColor} strokeWidth={1.5} />

      {/* mid grid: 5점, 점선 */}
      <polygon points={toPolygon(midPoints)} fill="none" stroke={gridColor} strokeWidth={1.25} strokeDasharray="4 4" />

      {/* data polygon */}
      <polygon points={toPolygon(dataPoints)} fill={fillColor} fillOpacity={0.2} stroke={fillColor} strokeWidth={2} />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={onValueChange ? 6 : 3.5} fill={fillColor}
          stroke={onValueChange ? "var(--card)" : undefined} strokeWidth={2}
          role={onValueChange ? "slider" : undefined}
          aria-label={onValueChange ? data[i].label + " 오각형 점수" : undefined}
          aria-valuemin={onValueChange ? 1 : undefined} aria-valuemax={onValueChange ? limitFor(i) : undefined}
          aria-valuenow={onValueChange ? targetValues[i] : undefined} aria-disabled={onValueChange ? disabled : undefined}
          tabIndex={editable ? 0 : undefined} style={{ cursor: editable ? "grab" : "default" }}
          onPointerDown={(event) => startDrag(event, i)}
          onKeyDown={(event) => {
            if (!editable) return;
            const value = event.key === "Home" ? 1 : event.key === "End" ? limitFor(i)
              : ["ArrowUp", "ArrowRight"].includes(event.key) ? targetValues[i] + 1
              : ["ArrowDown", "ArrowLeft"].includes(event.key) ? targetValues[i] - 1 : null;
            if (value !== null) {
              event.preventDefault();
              onValueChange?.(i, Math.max(1, Math.min(limitFor(i), value)));
            }
          }} />
      ))}

      </g>

      {/* axis labels + values — stacked on two short lines, always centered
          on the anchor point so long Korean labels grow evenly on both
          sides instead of overflowing one direction and getting clipped */}
      {data.map((d, i) => {
        const p = polarPoint(cx, cy, maxR + 22, angles[i]);
        const topSide = p.y < cy - 4;
        const bottomSide = p.y > cy + 4;
        const labelDy = topSide ? -6 : bottomSide ? 14 : 4;
        const valueDy = topSide ? 8 : bottomSide ? 28 : 18;
        return (
          <g key={i}>
            <text x={p.x} y={p.y + labelDy} textAnchor="middle" fontSize={11} fontWeight={700} fill={labelColor}>
              {d.label}
            </text>
            <text x={p.x} y={p.y + valueDy} textAnchor="middle" fontSize={10} fontWeight={700} fill={valueColor} fontFamily="var(--font-jetbrains)">
              {displayValues[i].toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
