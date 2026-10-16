// Flat-gem ranking badges — shield/diamond/pentagon/hexagon shapes with a
// tier-colored gradient, a glossy highlight, and a sparkle glyph in the
// middle. Styled after the "Ranking Badges" Figma community kit (bronze/
// silver/gold/platinum, one shape per tier) rather than a plain emoji medal,
// which also sidesteps inconsistent emoji-font rendering across platforms.
export type MedalShape = "shield" | "diamond" | "pentagon" | "hexagon";

const SHIELD_PATH = "M50 4 L91 18 L91 50 C91 77 74 91 50 97 C26 91 9 77 9 50 L9 18 Z";
const SPARKLE_PATH = "M50 22 C52.5 39 61 47.5 78 50 C61 52.5 52.5 61 50 78 C47.5 61 39 52.5 22 50 C39 47.5 47.5 39 50 22 Z";

function polygonPoints(sides: number, cx: number, cy: number, r: number, rotationDeg: number) {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI / 180) * (rotationDeg + (360 / sides) * i);
    pts.push(`${(cx + r * Math.sin(angle)).toFixed(1)},${(cy - r * Math.cos(angle)).toFixed(1)}`);
  }
  return pts.join(" ");
}

export default function MedalIcon({
  shape, colors, size = 24, className = "",
}: {
  shape: MedalShape;
  colors: readonly [string, string];
  size?: number;
  className?: string;
}) {
  const gradId = `medal-${shape}-${colors[0].replace("#", "")}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ filter: "drop-shadow(0 1px 2px rgba(15,18,53,.35))", flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="15%" y1="5%" x2="90%" y2="95%">
          <stop offset="0%" stopColor={colors[0]} />
          <stop offset="100%" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      {shape === "shield" && <path d={SHIELD_PATH} fill={`url(#${gradId})`} />}
      {shape === "diamond" && <rect x="21" y="21" width="58" height="58" rx="9" transform="rotate(45 50 50)" fill={`url(#${gradId})`} />}
      {shape === "pentagon" && <polygon points={polygonPoints(5, 50, 52, 47, 0)} fill={`url(#${gradId})`} />}
      {shape === "hexagon" && <polygon points={polygonPoints(6, 50, 50, 47, 0)} fill={`url(#${gradId})`} />}
      <ellipse cx="37" cy="28" rx="17" ry="9" fill="rgba(255,255,255,0.32)" />
      <path d={SPARKLE_PATH} fill="#fff" />
    </svg>
  );
}
