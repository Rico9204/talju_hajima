import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { radarAxisAt, radarScoreAt } from "../lib/radarInput";

interface RadarAxis {
  label: string;
  value: number;
  note?: string; // 점수 옆에 붙는 짧은 설명(예: "상위 12%")
  display?: string; // 숫자 대신 보여 줄 글자(예: 아직 고르지 않은 항목은 "—")
}

const MAX_VALUE = 10;
const MID_VALUE = 5;
const ANIMATION_MS = 450;
const EFFECT_MS = 700;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

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

// 점수가 바뀌면 바로 튀지 않고 새 값까지 부드럽게 이어 그려, 오각형이 차오르거나 줄어드는 것처럼 보이게 한다.
// snapIndex: 끌고 있는 꼭짓점은 손가락을 그대로 따라가게(움직임 없이) 바로 맞춘다.
function useAnimatedValues(values: number[], snapIndex: number | null = null): number[] {
  const [display, setDisplay] = useState<number[]>(values);
  const displayRef = useRef<number[]>(values);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // The initial display is already at its target; don't render ~24 identical
    // frames on every chart mount. Also update axis-count changes immediately.
    if (displayRef.current.length !== values.length) {
      displayRef.current = values;
      setDisplay(values);
      return;
    }
    if (displayRef.current.every((value, index) => value === values[index])) return;
    if (prefersReducedMotion()) {
      displayRef.current = values;
      setDisplay(values);
      return;
    }
    const from = displayRef.current.map((v, i) => (i === snapIndex ? values[i] : v));
    const to = values;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min((now - start) / ANIMATION_MS, 1);
      const eased = easeOutCubic(t);
      const next = from.map((v, i) => v + (to[i] - v) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join(",")]);

  return display.map((v, i) => (i === snapIndex ? values[i] : v));
}

// 바뀐 방향에 따른 효과: 올라가면 채움이 잠깐 밝아지고 바뀐 꼭짓점에서 물결이 퍼진다(차오름),
// 내려가면 예전 모양이 옅은 테두리로 남았다가 사라진다(빠져나감).
interface RadarEffect { key: number; dir: "up" | "down"; axes: number[]; from: number[] }

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
  // 바뀌면(예: 평가할 동료를 바꿈) 모양만 이어 그리고 차오름·빠져나감 효과는 내지 않는다.
  resetKey?: string | number;
}

export default function PentagonChart({
  data,
  size = 340,
  gridColor = "var(--border)",
  fillColor = "var(--primary)",
  labelColor = "var(--foreground)",
  valueColor = "var(--primary-text)",
  onValueChange, limits, disabled = false, resetKey,
}: PentagonChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ axis: number; pointerId: number; startValues: number[] } | null>(null);
  const [dragAxis, setDragAxis] = useState<number | null>(null);
  const [effect, setEffect] = useState<RadarEffect | null>(null);
  const effectKey = useRef(0);
  const editable = !!onValueChange && !disabled;
  const n = data.length;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 76;
  const angleStep = 360 / n;
  const angles = data.map((_, i) => i * angleStep);

  const targetValues = data.map((d) => Math.min(Math.max(d.value, 0), MAX_VALUE));
  const animatedValues = useAnimatedValues(targetValues, dragAxis);

  // 점수가 바뀐 방향을 보고 효과를 고른다(끄는 중에는 매 움직임마다가 아니라 놓을 때 한 번).
  const prevTargets = useRef(targetValues);
  const prevResetKey = useRef(resetKey);
  function fireEffect(from: number[], to: number[]) {
    if (prefersReducedMotion() || from.length !== to.length) return;
    const axes = to.map((v, i) => (Math.abs(v - from[i]) > 1e-9 ? i : -1)).filter((i) => i >= 0);
    if (!axes.length) return;
    const delta = axes.reduce((sum, i) => sum + to[i] - from[i], 0);
    if (Math.abs(delta) < 1e-9) return;
    effectKey.current += 1;
    setEffect({ key: effectKey.current, dir: delta > 0 ? "up" : "down", axes, from });
  }
  useEffect(() => {
    const from = prevTargets.current;
    prevTargets.current = targetValues;
    if (prevResetKey.current !== resetKey) { prevResetKey.current = resetKey; setEffect(null); return; }
    if (!dragging.current) fireEffect(from, targetValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValues.join(","), resetKey]);
  useEffect(() => {
    if (!effect) return;
    const timer = window.setTimeout(() => setEffect((cur) => (cur?.key === effect.key ? null : cur)), EFFECT_MS);
    return () => window.clearTimeout(timer);
  }, [effect]);

  const outerPoints = angles.map((a) => polarPoint(cx, cy, maxR, a));
  const midPoints = angles.map((a) => polarPoint(cx, cy, maxR * (MID_VALUE / MAX_VALUE), a));
  const displayValues = animatedValues;
  const ghostPoints = effect?.dir === "down" ? effect.from.map((v, i) => polarPoint(cx, cy, maxR * (v / MAX_VALUE), angles[i])) : null;
  const dataPoints = displayValues.map((v, i) => polarPoint(cx, cy, maxR * (v / MAX_VALUE), angles[i]));

  function limitFor(index: number) { return Math.max(0, Math.min(MAX_VALUE, limits?.[index] ?? MAX_VALUE)); }
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
    dragging.current = { axis, pointerId: event.pointerId, startValues: targetValues };
    setDragAxis(axis);
    svgRef.current?.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    updatePointer(event, axis);
  }
  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragging.current?.pointerId !== event.pointerId) return;
    const { startValues } = dragging.current;
    dragging.current = null;
    setDragAxis(null);
    fireEffect(startValues, targetValues);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <svg ref={svgRef} width={size} height={size} viewBox={[0, 0, size, size].join(" ")}
      style={{ maxWidth: "100%", height: "auto", touchAction: editable ? "none" : "auto" }}
      onPointerMove={(event) => {
        if (dragging.current?.pointerId === event.pointerId) updatePointer(event, dragging.current.axis);
      }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { if (dragging.current) { const { startValues } = dragging.current; dragging.current = null; setDragAxis(null); fireEffect(startValues, targetValues); } }}>
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

      {/* 빠져나감: 줄어들기 전 모양이 옅게 남았다가 사라진다 */}
      {ghostPoints && (
        <polygon key={`ghost-${effect!.key}`} className="radar-ghost-out" points={toPolygon(ghostPoints)}
          fill={fillColor} fillOpacity={0.12} stroke={fillColor} strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
      )}

      {/* data polygon (차오를 때는 잠깐 밝아진다) */}
      <polygon key={effect?.dir === "up" ? `fill-${effect.key}` : "fill"} className={effect?.dir === "up" ? "radar-fill-up" : undefined}
        points={toPolygon(dataPoints)} fill={fillColor} fillOpacity={0.2} stroke={fillColor} strokeWidth={2} />
      {/* 바뀐 꼭짓점의 물결: 올라가면 밖으로 퍼지고, 내려가면 안으로 모인다 */}
      {effect?.axes.map((i) => dataPoints[i] && (
        <circle key={`ripple-${effect.key}-${i}`} className={effect.dir === "up" ? "radar-ripple-out" : "radar-ripple-in"}
          cx={dataPoints[i].x} cy={dataPoints[i].y} r={7} fill="none" stroke={fillColor} strokeWidth={2} pointerEvents="none"
          style={{ transformOrigin: `${dataPoints[i].x}px ${dataPoints[i].y}px`, transformBox: "view-box" }} />
      ))}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={onValueChange ? 6 : 3.5} fill={fillColor}
          stroke={onValueChange ? "var(--card)" : undefined} strokeWidth={2}
          role={onValueChange ? "slider" : undefined}
          aria-label={onValueChange ? data[i].label + " 오각형 점수" : undefined}
          aria-valuemin={onValueChange ? 0 : undefined} aria-valuemax={onValueChange ? limitFor(i) : undefined}
          aria-valuenow={onValueChange ? targetValues[i] : undefined} aria-disabled={onValueChange ? disabled : undefined}
          tabIndex={editable ? 0 : undefined} style={{ cursor: editable ? "grab" : "default" }}
          onPointerDown={(event) => startDrag(event, i)}
          onKeyDown={(event) => {
            if (!editable) return;
            const value = event.key === "Home" ? 0 : event.key === "End" ? limitFor(i)
              : ["ArrowUp", "ArrowRight"].includes(event.key) ? targetValues[i] + 1
              : ["ArrowDown", "ArrowLeft"].includes(event.key) ? targetValues[i] - 1 : null;
            if (value !== null) {
              event.preventDefault();
              onValueChange?.(i, Math.max(0, Math.min(limitFor(i), value)));
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
              {d.display ?? displayValues[i].toFixed(2)}
              {d.note && <tspan fontFamily="inherit" fontWeight={600} fill={labelColor} fillOpacity={0.65}>{" · " + d.note}</tspan>}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
