import type { Achievement, AchievementIconId } from "../lib/achievements";

// Shield badge with a gold name ribbon draped near the bottom point,
// styled after the "Badges Design Vol.1" Figma kit's shield badges. The
// outline below is the exact path exported from that kit ("Copy as SVG"),
// so the silhouette matches pixel-for-pixel — everything else (per-
// achievement gradient, diagonal shading, icon, ribbon) is layered on top
// since the kit's own fill/icon/text are fixed to one specific badge.
// A lighter-tone copy of the same outline sits behind a smaller inset
// copy, forming a visible border ring (not just an outline stroke) like
// the kit's inset bezel. Earned badges show the achievement's own color;
// locked ones go flat gray with a small lock mark instead of the usual
// dim-opacity treatment other icons in this app use, since a whole grid of
// half-transparent shields reads as muddy rather than "not yet".
const SHIELD_PATH =
  "M50.7261 87.3522C50.4776 80.5339 50.3533 77.1247 51.6569 73.4937C52.775 70.3793 54.8315 67.3654 57.3237 65.1886C60.2293 62.6507 64.4488 61.1731 72.8878 58.2179C90.844 51.9299 108.167 43.497 124.5 33.6987C131.923 29.2451 135.635 27.0183 138.83 26.3168C142.002 25.6203 144.237 25.6203 147.409 26.3168C150.603 27.0183 154.315 29.2451 161.739 33.6987C178.072 43.497 195.395 51.9299 213.351 58.2179C221.79 61.1731 226.009 62.6507 228.915 65.1886C231.407 67.3654 233.464 70.3793 234.582 73.4937C235.885 77.1247 235.761 80.5339 235.513 87.3522C234.805 106.756 231.303 135.593 218.503 161.621C201.622 195.945 173.429 218.459 156.722 229.549C153.055 231.984 151.221 233.201 147.765 234.027C145.369 234.599 140.87 234.599 138.474 234.027C135.018 233.201 133.184 231.984 129.517 229.549C112.81 218.459 84.6166 195.945 67.7363 161.621C54.9356 135.593 51.4333 106.756 50.7261 87.3522Z";
// Tight crop around the path's bounding box (roughly x:50-236, y:26-234)
// with a small margin, so the badge fills its box instead of sitting in a
// mostly-empty 286x350 canvas (the kit's canvas also reserves room below
// for its drop-shadow blur, which this component does differently).
const SHIELD_VIEWBOX = "40 15 206 229";
const SHIELD_CENTER = { x: 143, y: 130 };
const LOCKED_COLORS = ["#c7ccd6", "#98a0af"] as const;
const RIBBON_COLORS = ["#f7c04a", "#d68a12"] as const;
const INNER_SHIELD_TRANSFORM = `translate(${SHIELD_CENTER.x} ${SHIELD_CENTER.y}) scale(0.88) translate(${-SHIELD_CENTER.x} ${-SHIELD_CENTER.y})`;

function IconGlyph({ icon }: { icon: AchievementIconId }) {
  switch (icon) {
    case "flag":
      return (
        <g fill="#fff">
          <rect x="4" y="2" width="2.2" height="20" rx="1.1" />
          <path d="M6.2 3h13l-3.2 4.3 3.2 4.3h-13V3Z" />
        </g>
      );
    case "people":
      // Two heads over one shared shoulder mound — reads as "people"
      // clearly at a glance, unlike two plain overlapping circles (which
      // just blend into a blob at small sizes).
      return (
        <g fill="#fff">
          <path d="M4.5 20c0-4.1 3-6.8 7.5-6.8s7.5 2.7 7.5 6.8H4.5Z" />
          <circle cx="8.7" cy="8.2" r="3.3" />
          <circle cx="15.3" cy="8.2" r="3.3" />
        </g>
      );
    case "heart":
      return <path d="M12 21c-.3 0-.6-.1-.8-.3C7 17 4 13.9 4 9.9 4 6.9 6.3 4.5 9.2 4.5c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.9 0 5.2 2.4 5.2 5.4 0 4-3 7.1-7.2 10.8-.2.2-.5.3-.8.3Z" fill="#fff" />;
    case "star":
      return <path d="M12 2 L14.9 8.6 L22 9.3 L16.7 14.1 L18.2 21 L12 17.3 L5.8 21 L7.3 14.1 L2 9.3 L9.1 8.6 Z" fill="#fff" />;
    case "check":
      return <path d="M4 13l5 5L20 6" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
    case "clock":
      return (
        <g fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </g>
      );
    case "chat":
      return <path d="M4 6c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3v6c0 1.7-1.3 3-3 3h-6l-4 3.5V15H7c-1.7 0-3-1.3-3-3Z" fill="#fff" />;
    case "link":
      // Two interlocking rounded links — "협업/연결", and much less likely
      // to misread as a flower or gear at small sizes than a puzzle piece.
      return (
        <g fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
          <rect x="2.2" y="8.2" width="10" height="7.6" rx="3.8" transform="rotate(-28 7.2 12)" />
          <rect x="11.8" y="8.2" width="10" height="7.6" rx="3.8" transform="rotate(28 16.8 12)" />
        </g>
      );
    case "sparkle":
      return <path d="M12 2c.6 6 3 8.4 9 9-6 .6-8.4 3-9 9-.6-6-3-8.4-9-9 6-.6 8.4-3 9-9Z" fill="#fff" />;
  }
}

export default function AchievementBadge({
  achievement, earned, label, size = 72, className = "",
}: {
  achievement: Achievement;
  earned: boolean;
  // Ribbon banner draped across the shield's bottom edge, like the
  // reference kit — omit at small sizes (e.g. next to an avatar) where
  // text wouldn't fit.
  label?: string;
  size?: number;
  className?: string;
}) {
  const colors = earned ? achievement.colors : LOCKED_COLORS;
  const ribbonColors = earned ? RIBBON_COLORS : LOCKED_COLORS;
  const uid = `${achievement.id}-${earned ? "on" : "off"}`;
  const gradId = `ach-base-${uid}`;
  const shadeId = `ach-shade-${uid}`;
  const glossId = `ach-gloss-${uid}`;
  const tailSize = Math.max(3, size * 0.06);
  const svgHeight = size * (229 / 206);
  const ribbonFontSize = Math.max(7, size * 0.145);
  const ribbonPadX = Math.max(3, size * 0.13);
  const ribbonPadY = Math.max(1.5, size * 0.053);
  return (
    <div className={`relative inline-flex flex-col items-center shrink-0 ${className}`} style={{ width: size }}>
      <svg viewBox={SHIELD_VIEWBOX} width={size} height={svgHeight} style={{ filter: earned ? "drop-shadow(0 3px 5px rgba(15,18,53,.35))" : "none", flexShrink: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
          {/* Diagonal fold shadow — the reference shields read as two flat
              panels (bright left, darker right) rather than a soft glass
              gloss, so this layers a plain dark diagonal over the base
              gradient instead of a blurred radial highlight. */}
          <linearGradient id={shadeId} x1="0%" y1="0%" x2="100%" y2="70%">
            <stop offset="45%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.22} />
          </linearGradient>
          <radialGradient id={glossId} cx="34%" cy="18%" r="35%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>
        {/* Outer border shield — a flat, lighter-tone copy of the same
            kite, full size, showing as a visible ring around the smaller
            inset shield drawn on top. This is the "border inside the
            shape" from the reference, not a stroke outline. */}
        <path d={SHIELD_PATH} fill={colors[0]} />
        <g transform={INNER_SHIELD_TRANSFORM}>
          <path d={SHIELD_PATH} fill={`url(#${gradId})`} />
          <path d={SHIELD_PATH} fill={`url(#${shadeId})`} />
          <path d={SHIELD_PATH} fill={`url(#${glossId})`} />
        </g>
        <g transform="translate(105 71) scale(3.2)">
          <IconGlyph icon={achievement.icon} />
        </g>
        {!earned && (
          <g transform="translate(203 188)">
            <circle r="24" fill="rgba(15,18,53,0.6)" />
            <path d="M-6 -3.4 v-5.2 a6 6 0 0 1 12 0 v5.2" fill="none" stroke="#fff" strokeWidth={2.6} />
            <rect x="-8.6" y="-3.4" width="17.2" height="13" rx="2.2" fill="#fff" />
          </g>
        )}
      </svg>
      {label && (
        <div className="relative flex items-center justify-center text-center" style={{ marginTop: -svgHeight * 0.36, minWidth: "82%", maxWidth: "132%" }}>
          <span
            className="relative font-800 text-white leading-none whitespace-nowrap"
            style={{
              padding: `${ribbonPadY}px ${ribbonPadX}px`,
              fontSize: ribbonFontSize,
              background: `linear-gradient(135deg, ${ribbonColors[0]}, ${ribbonColors[1]})`,
              borderRadius: 3,
              boxShadow: "0 2px 4px rgba(15,18,53,.35)",
            }}
          >
            • {label} •
            <span
              className="absolute bottom-0"
              style={{ left: -tailSize, width: 0, height: 0, borderTop: `${tailSize}px solid ${ribbonColors[1]}`, borderLeft: `${tailSize}px solid transparent` }}
            />
            <span
              className="absolute bottom-0"
              style={{ right: -tailSize, width: 0, height: 0, borderTop: `${tailSize}px solid ${ribbonColors[1]}`, borderRight: `${tailSize}px solid transparent` }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
