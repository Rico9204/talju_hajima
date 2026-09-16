/** Coordinates are relative to the chart center, with screen Y increasing downward. */
export function radarAxisAt(dx: number, dy: number, axes: number): number {
  const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(angle / (Math.PI * 2 / axes)) % axes;
}

/** Polygon contours, including the space between spokes, map to the same score. */
export function radarScoreAt(dx: number, dy: number, axis: number, axes: number, radius: number): number {
  if (radius <= 0 || axes < 3) return 1;
  const angle = axis * Math.PI * 2 / axes;
  const forward = dx * Math.sin(angle) - dy * Math.cos(angle);
  const sideways = dx * Math.cos(angle) + dy * Math.sin(angle);
  const slope = Math.tan(Math.PI / axes);
  // Keep a drag on its starting axis even when the pointer crosses another sector.
  const lateral = Math.min(Math.abs(sideways), Math.max(0, forward) * slope);
  return Math.max(1, Math.min(10, Math.round((forward + lateral * slope) / radius * 10)));
}
