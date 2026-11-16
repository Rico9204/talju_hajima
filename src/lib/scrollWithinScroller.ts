// element.scrollIntoView()는 대상의 "모든" 상위 스크롤 가능 요소를 같이 움직인다 — 앱 최상위의
// overflow-hidden 래퍼처럼 사용자가 스크롤할 수 없게 막아 둔 요소도 코드로는 스크롤되기 때문에,
// inline: "center" 같은 옵션을 쓰면 화면 전체(사이드바 포함)가 옆으로 밀려 잘려 보인다.
// 이 함수는 사용자가 실제로 스크롤할 수 있는(overflow: auto | scroll) 가장 가까운 조상 하나만
// 움직이고, 그 바깥은 절대 건드리지 않는다.

function scrollerOf(el: HTMLElement, axis: "x" | "y"): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const style = getComputedStyle(p);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    const scrollable = axis === "x" ? p.scrollWidth > p.clientWidth : p.scrollHeight > p.clientHeight;
    if ((overflow === "auto" || overflow === "scroll") && scrollable) return p;
  }
  return null;
}

export function scrollIntoScroller(
  el: HTMLElement,
  { inline = "nearest", block = "nearest", behavior = "smooth" }: { inline?: "center" | "nearest"; block?: "center" | "nearest"; behavior?: ScrollBehavior } = {},
) {
  const rect = el.getBoundingClientRect();

  const sx = scrollerOf(el, "x");
  if (sx) {
    const c = sx.getBoundingClientRect();
    let delta = 0;
    if (inline === "center") delta = rect.left - c.left - (c.width - rect.width) / 2;
    else if (rect.left < c.left) delta = rect.left - c.left;
    else if (rect.right > c.right) delta = rect.right - c.right;
    if (delta) sx.scrollTo({ left: sx.scrollLeft + delta, behavior });
  }

  const sy = scrollerOf(el, "y");
  if (sy) {
    const c = sy.getBoundingClientRect();
    let delta = 0;
    if (block === "center") delta = rect.top - c.top - (c.height - rect.height) / 2;
    else if (rect.top < c.top) delta = rect.top - c.top;
    else if (rect.bottom > c.bottom) delta = rect.bottom - c.bottom;
    if (delta) sy.scrollTo({ top: sy.scrollTop + delta, behavior });
  }
}
