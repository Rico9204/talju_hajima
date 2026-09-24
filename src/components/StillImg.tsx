import type { ImgHTMLAttributes } from "react";
import { useStillUrl } from "../lib/useStillUrl";

export default function StillImg({ src, animate, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null; animate?: boolean }) {
  return <img {...rest} src={useStillUrl(src, animate) ?? undefined} />;
}
