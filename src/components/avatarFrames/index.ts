import type { AvatarFrameKind } from "../../lib/profileThemes";
import type { FrameParts } from "./types";
import { bubble, electric, heart, meteor, sprout, tier } from "./reward";
import { cat, pinkdog, planet, roseBlack, roseWhite, skull, thorn } from "./decor";

// One frame per profile-card theme (`avatarFrame` in profileThemes.ts).
export const FRAMES: Record<AvatarFrameKind, FrameParts> = {
  tier,
  sprout,
  bubble,
  heart,
  meteor,
  electric,
  planet,
  skull,
  thorn,
  cat,
  "rose-white": roseWhite,
  "rose-black": roseBlack,
  pinkdog,
};
