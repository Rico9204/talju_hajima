import { useState, type ImgHTMLAttributes } from "react";
import { useStillUrl } from "../lib/useStillUrl";

// hoverPlay: 설정과 무관하게 GIF를 첫 프레임으로 멈춰 두고, 마우스를 올렸을 때만 재생한다.
// 같은 GIF가 한 화면에 여러 번 나오는 곳(채팅 말풍선·읽음 표시)에서 재생이 겹쳐 빨라 보이는 것을 막는다.
export default function StillImg({ src, animate, hoverPlay, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null; animate?: boolean; hoverPlay?: boolean }) {
  const [hover, setHover] = useState(false);
  const url = useStillUrl(src, hoverPlay ? hover : animate, hoverPlay);
  return <img {...rest} src={url ?? undefined} onMouseEnter={hoverPlay ? () => setHover(true) : rest.onMouseEnter} onMouseLeave={hoverPlay ? () => setHover(false) : rest.onMouseLeave} />;
}
