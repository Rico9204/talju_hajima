import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { ParticleKind } from "../lib/profileThemes";
import { mulberry32 } from "../lib/random";

// Profile-card particles. Colors come from --tier-c1 / --tier-c2 set on the
// card in Sidebar.tsx (custom properties inherit; a theme palette overrides
// them there), so shapes here are color-agnostic — a "layer" only says what
// shape, how many, how fast, how big. The default "tier" kind scales with the
// member's tier (silver twinkles; gold/platinum add rising motes); every
// other kind is a fixed set that belongs to one reward theme.
type Shape = "star" | "mote" | "leaf" | "bubble" | "heart" | "meteor" | "bolt";
interface Layer { shape: Shape; count: number; dur: [number, number]; size: [number, number] }

const TIER_LAYERS: Record<string, Layer[]> = {
  silver: [{ shape: "star", count: 12, dur: [2.6, 4.2], size: [9, 16] }],
  gold: [
    { shape: "star", count: 8, dur: [2.2, 3.6], size: [10, 18] },
    { shape: "mote", count: 16, dur: [5, 8], size: [4, 9] },
  ],
  platinum: [
    { shape: "star", count: 16, dur: [1.6, 2.8], size: [11, 20] },
    { shape: "mote", count: 26, dur: [3.6, 6], size: [4, 9] },
  ],
};

const THEME_LAYERS: Record<Exclude<ParticleKind, "tier">, Layer[]> = {
  leaf: [{ shape: "leaf", count: 14, dur: [7, 11], size: [10, 16] }],
  bubble: [{ shape: "bubble", count: 16, dur: [6, 10], size: [8, 22] }],
  heart: [{ shape: "heart", count: 13, dur: [6, 10], size: [10, 18] }],
  meteor: [
    { shape: "meteor", count: 7, dur: [3.5, 6], size: [70, 120] },
    { shape: "star", count: 9, dur: [2.4, 4], size: [8, 14] },
  ],
  spark: [{ shape: "bolt", count: 11, dur: [1.6, 3.4], size: [16, 28] }],
  // Undead: drifting soul-motes plus a few cold twinkles.
  ghost: [
    { shape: "mote", count: 24, dur: [5, 9], size: [4, 9] },
    { shape: "star", count: 5, dur: [3, 5], size: [8, 14] },
  ],
  // Drowsy night: slow pink motes rising among twinkling stars.
  dream: [
    { shape: "star", count: 9, dur: [2.8, 4.6], size: [8, 14] },
    { shape: "mote", count: 12, dur: [6, 10], size: [4, 9] },
  ],
};

interface Particle { shape: Shape; style: CSSProperties }

function buildParticles(layers: Layer[], seed: number): Particle[] {
  const rand = mulberry32(seed);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const particles: Particle[] = [];
  layers.forEach((layer) => {
    for (let i = 0; i < layer.count; i++) {
      const dur = between(...layer.dur);
      const vars: Record<string, string> = {
        "--x": `${between(2, 96)}%`,
        "--y": `${between(3, 94)}%`,
        "--size": `${between(...layer.size)}px`,
        "--dur": `${dur}s`,
        "--delay": `${-rand() * dur}s`,
        "--pc": i % 3 === 0 ? "var(--tier-c1)" : "var(--tier-c2)",
      };
      if (layer.shape === "mote" || layer.shape === "bubble" || layer.shape === "heart") {
        vars["--x"] = `${between(2, 98)}%`;
        vars["--y"] = "100%";
        vars["--rise"] = `${between(320, 640)}px`;
        vars["--drift"] = `${between(-40, 40)}px`;
        if (layer.shape === "mote") vars["--size"] = `${between(4, 9)}px`;
      } else if (layer.shape === "leaf") {
        vars["--x"] = `${between(2, 98)}%`;
        vars["--y"] = "-4%";
        vars["--rise"] = `${between(360, 680)}px`; // fall distance
        vars["--drift"] = `${between(-70, 70)}px`;
        vars["--rot"] = `${between(180, 540)}deg`;
      } else if (layer.shape === "meteor") {
        vars["--x"] = `${between(35, 100)}%`;
        vars["--y"] = `${between(-4, 45)}%`;
        vars["--ang"] = `${between(140, 155)}deg`;
        vars["--dist"] = `${between(380, 620)}px`;
        vars["--len"] = vars["--size"];
        vars["--size"] = "2px";
      } else if (layer.shape === "bolt") {
        vars["--rot"] = `${between(-40, 40)}deg`;
      }
      particles.push({ shape: layer.shape, style: vars as CSSProperties });
    }
  });
  return particles;
}

export default function TierParticles({ tierId, kind = "tier" }: { tierId: string; kind?: ParticleKind }) {
  const particles = useMemo(() => {
    const layers = kind === "tier" ? TIER_LAYERS[tierId] : THEME_LAYERS[kind];
    if (!layers) return [];
    const seed = [...`${kind}:${tierId}`].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7);
    return buildParticles(layers, seed);
  }, [tierId, kind]);
  if (particles.length === 0) return null;
  return (
    <div className="tier-particles" aria-hidden="true">
      {particles.map((p, i) => <span key={i} className={`tier-particle tier-particle-${p.shape}`} style={p.style} />)}
    </div>
  );
}
