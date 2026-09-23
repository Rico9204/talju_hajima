import type { CSSProperties } from "react";
import { useProject } from "../context/ProjectContext";

// Shared by every top-level page shell (Layout in App.tsx, Home.tsx) so the
// signed-in account's background/glass-intensity choice — set in the
// profile editor (ProfileModal.tsx) — applies everywhere, not just inside
// the Sidebar-wrapped pages.
export function useAccountBackground() {
  const { currentMember } = useProject();
  const hasCustomBackground = !!(currentMember?.backgroundImageUrl || currentMember?.backgroundGradient || currentMember?.backgroundColor);

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

  // Glass-card intensity, adjustable per account; falls back to a light,
  // barely-there frosting (crisp background, faint white veil) when unset.
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
    "--panel-blur-px": `${currentMember?.glassBlur ?? 2}px`,
    // A var() inside a custom property is resolved where the property is
    // *declared* and the result is inherited, so --card-glass / --panel-blur
    // declared on :root in index.css stay frozen at the defaults (0.32 / 2px)
    // and ignore --glass-alpha/--panel-blur-px above. Re-declare them here
    // so the account's sliders actually reach every glass card.
    "--card-glass": "rgba(255, 255, 255, var(--glass-alpha))",
    // Blurring a flat single-color backdrop is visually a no-op — it just
    // burns a backdrop-filter compositing pass on every one of the ~50 glass
    // surfaces for every account that hasn't picked a custom background.
    // Only turn the filter on when there's an actual image/gradient/color
    // behind it for the frosting to be visible.
    "--panel-blur": hasCustomBackground ? "blur(var(--panel-blur-px)) saturate(1.7) brightness(1.05)" : "none",
  } as CSSProperties;

  // Same idea for borders (dashed empty-state boxes, divider lines) — these
  // don't inherit like text-shadow does, so callers apply this directly
  // where a border/line is drawn without a card behind it.
  const lineSafeStyle: CSSProperties = hasCustomBackground
    ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }
    : {};

  return { backgroundStyle, glassStyle, hasCustomBackground, lineSafeStyle };
}
