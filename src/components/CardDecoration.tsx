import { useEffect, useRef, useState, type ReactElement } from "react";
import type { DecorationKind } from "../lib/profileThemes";
import type { DecoProps } from "./decorations/types";
import Planet from "./decorations/Planet";
import Skulls from "./decorations/Skulls";
import ThornVine from "./decorations/ThornVine";
import Cat from "./decorations/Cat";
import Roses from "./decorations/Roses";
import PinkDog from "./decorations/PinkDog";

// Illustrated frame decorations for the profile card (admin-only themes in
// profileThemes.ts). Rendered twice by Sidebar.tsx — layer "back" before the
// card (behind it) and layer "front" after it (over it) — inside the
// card wrapper, so this layer is exactly card-sized; the measured size is
// handed to the drawings so they can lay out along the real border. Drawings
// live in ./decorations, one file per kind.
const RENDERERS: Record<DecorationKind, (props: DecoProps) => ReactElement | null> = {
  planet: Planet,
  skull: Skulls,
  thorn: ThornVine,
  cat: Cat,
  "rose-white": (props) => <Roses {...props} tone="white" />,
  "rose-black": (props) => <Roses {...props} tone="black" />,
  pinkdog: PinkDog,
};

export default function CardDecoration({ kind, layer }: { kind: DecorationKind; layer: "back" | "front" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Render = RENDERERS[kind];
  return (
    <div ref={ref} className={`card-deco card-deco-${layer}`} aria-hidden="true">
      {size && <Render w={size.w} h={size.h} layer={layer} />}
    </div>
  );
}
