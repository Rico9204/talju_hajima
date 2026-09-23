import type { CSSProperties } from "react";
import { useProject } from "../context/ProjectContext";

// Shared by every top-level page shell (Layout in App.tsx, Home.tsx) so the
// signed-in account's background/glass-intensity choice — set in the
// profile editor (ProfileModal.tsx) — applies everywhere, not just inside
// the Sidebar-wrapped pages.
export function useAccountBackground() {
  const { currentMember } = useProject();
  const hasCustomBackground = !!(currentMember?.backgroundImageUrl || currentMember?.backgroundGradient || currentMember?.backgroundColor);
  const needsBackgroundFilter = !!(currentMember?.backgroundImageUrl || currentMember?.backgroundGradient);
  const backgroundBlur = Math.min(40, Math.max(0, currentMember?.glassBlur ?? 2));

  // Priority: custom background image > gradient preset > solid color preset > default.
  // A dark overlay is blended into the image so the glass cards above it stay legible.
  const backgroundStyle = currentMember?.backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(15,18,53,0.28), rgba(15,18,53,0.28)), url(${currentMember.backgroundImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : currentMember?.backgroundGradient
      ? { background: currentMember.backgroundGradient }
      : currentMember?.backgroundColor
        ? { background: currentMember.backgroundColor }
        : { background: "var(--background)" };

  // Blur the stationary background once. Translucent cards reveal that
  // result without re-filtering scrolling content behind every panel.
  //
  // Deliberately does NOT redeclare `--card` here (only `--card-glass`).
  // `--card` is a widely shared variable used by dozens of surfaces that
  // were never designed to be translucent (avatar rings, badges, unconverted
  // modals in other pages) — earlier this override made every one of those
  // pick up the account's transparency too, which read as "readability
  // dropped in a bunch of places" once someone picked a low opacity. Only
  // the ~20 surfaces explicitly wired to --card-glass should follow the
  // account's slider; everything else stays index.css's opaque --card.
  const glassStyle = {
    "--glass-alpha": String((currentMember?.glassOpacity ?? 32) / 100),
    "--panel-blur-px": `${backgroundBlur}px`,
    // Re-declare here so the account opacity resolves in this scope.
    "--card-glass": "rgba(255, 255, 255, var(--glass-alpha))",
    "--panel-blur": "none",
  } as CSSProperties;

  // Same idea for borders (dashed empty-state boxes, divider lines) — these
  // don't inherit like text-shadow does, so callers apply this directly
  // where a border/line is drawn without a card behind it.
  const lineSafeStyle: CSSProperties = hasCustomBackground
    ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }
    : {};

  return {
    backgroundStyle: {
      ...backgroundStyle,
      filter: needsBackgroundFilter && backgroundBlur > 0
        ? `blur(${backgroundBlur}px)`
        : "none",
    },
    glassStyle, hasCustomBackground, lineSafeStyle,
  };
}
