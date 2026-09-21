import type { CSSProperties } from "react";
import { useProject } from "../context/ProjectContext";

// Shared by every top-level page shell (Layout in App.tsx, Home.tsx) so the
// signed-in account's background/glass-intensity choice — set in the
// profile editor (ProfileModal.tsx) — applies everywhere, not just inside
// the Sidebar-wrapped pages.
export function useAccountBackground() {
  const { currentMember } = useProject();

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
  const glassStyle = {
    "--glass-alpha": String((currentMember?.glassOpacity ?? 32) / 100),
    "--panel-blur-px": `${currentMember?.glassBlur ?? 2}px`,
    // Every `var(--card)` usage (not just the ones wired to --card-glass)
    // picks up the account's translucency once logged in — index.css keeps
    // --card opaque by default for pre-login screens (Login/ResetPassword).
    "--card": "rgba(255, 255, 255, var(--glass-alpha))",
    // A var() inside a custom property is resolved where the property is
    // *declared* and the result is inherited, so --card-glass / --panel-blur
    // declared on :root in index.css stay frozen at the defaults (0.32 / 2px)
    // and ignore the values above. Re-declare them here so the account's
    // sliders actually reach every glass card.
    "--card-glass": "rgba(255, 255, 255, var(--glass-alpha))",
    "--panel-blur": "blur(var(--panel-blur-px)) saturate(1.7) brightness(1.05)",
  } as CSSProperties;

  return { backgroundStyle, glassStyle };
}
