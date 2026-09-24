import { useEffect, useState } from "react";
import { usePerformanceMode } from "./performancePreferences";

const stills = new Map<string, string>();

// GIF handling per Settings > 그래픽: 고급 = plays; 기본 = frozen
// unless `animate` (profile view); 성능 우선 = always frozen. Non-GIF urls pass through.
export function useStillUrl(url: string | null | undefined, animate = false, forceFreeze = false): string | null | undefined {
  const [mode] = usePerformanceMode();
  const freeze = !!url && /\.gif(\?|$)/i.test(url) && (forceFreeze ? (!animate || mode === "performance") : mode === "performance" || (mode === "reduced-motion" && !animate));
  const [still, setStill] = useState<string | null>(null);

  useEffect(() => {
    if (!freeze || !url) return;
    const hit = stills.get(url);
    if (hit) { setStill(hit); return; }
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      let result = url; // ponytail: canvas taint/CORS failure falls back to the animated original
      try {
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        result = canvas.toDataURL("image/png");
        stills.set(url, result);
      } catch { /* keep fallback */ }
      if (live) setStill(result);
    };
    img.src = url;
    return () => { live = false; };
  }, [freeze, url]);

  if (!freeze) return url;
  return stills.get(url!) ?? still; // null while the first frame is extracted
}
