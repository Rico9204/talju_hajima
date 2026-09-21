import type { ReactNode } from "react";

// Every avatar frame (see AvatarFrame.tsx) is described by up to three layers,
// all drawn in one shared coordinate space: the avatar circle is centered at
// (50,50) with radius 50, so 1 unit = size/100 px, and the overlay extends
// 40 units beyond the circle on every side.
export interface FrameProps {
  compact: boolean; // small avatars (the 36px sidebar one) drop fine detail
  c1: string; // theme palette (light → main)
  c2: string; // theme palette (dark → accent)
}

export interface FrameParts {
  back?: (p: FrameProps) => ReactNode; // SVG content behind the avatar (ears, the far half of a planet ring)
  front?: (p: FrameProps) => ReactNode; // SVG content over the avatar (ring, bow, paws)
  html?: (p: FrameProps & { size: number }) => ReactNode; // absolutely-positioned extras (Zzz)
  glow?: string; // color of a soft drop-shadow around the SVG layers
}
