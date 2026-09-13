import { useEffect, useRef, useState } from "react";

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
}

export default function PentagonChart({
  data,
  size = 340,
  gridColor = "var(--border)",
  fillColor = "var(--primary)",
  labelColor = "var(--foreground)",
  valueColor = "var(--primary)",
}: PentagonChartProps) {
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
  const dataPoints = animatedValues.map((v, i) => polarPoint(cx, cy, maxR * (v / MAX_VALUE), angles[i]));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={fillColor} />
      ))}

      {/* scale markers, placed in the gap between two axes so they never cross the grid lines */}
      {(() => {
        const scaleAngle = -angleStep / 2;
        const outerLabelPos = polarPoint(cx, cy, maxR + 10, scaleAngle);
        const midLabelPos = polarPoint(cx, cy, maxR * (MID_VALUE / MAX_VALUE) + 10, scaleAngle);
        return (
          <>
            <text x={outerLabelPos.x} y={outerLabelPos.y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={gridColor}>
              10
            </text>
            <text x={midLabelPos.x} y={midLabelPos.y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={gridColor}>
              5
            </text>
          </>
        );
      })()}

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
              {animatedValues[i].toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
