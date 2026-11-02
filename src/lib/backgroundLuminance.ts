// 적응형 테마용: 계정 배경이 얼마나 밝은지(0~1, 상대 휘도)를 재고, 다크/라이트 모드 중 어느 쪽이 맞는지 고른다.

const OVERLAY = [15, 18, 53] as const; // useAccountBackground가 배경 사진 위에 깔아 주는 어두운 막(알파 0.28)
const OVERLAY_ALPHA = 0.28;
const LIGHT_BG = 0.93; // 기본 라이트 배경(#f3f5f9)의 휘도

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (r: number, g: number, b: number) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

// "#abc", "#aabbcc", "rgb(...)", "rgba(...)" 색을 모두 찾아 평균 휘도를 낸다. 못 찾으면 null.
export function luminanceOfCss(css: string): number | null {
  const values: number[] = [];
  for (const m of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
    const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
    values.push(luminance(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)));
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) values.push(luminance(+m[1], +m[2], +m[3]));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// 사진을 작게 줄여 평균 휘도를 잰다(어두운 막을 깐 뒤 기준). 서버가 CORS를 허용하지 않아 읽을 수 없으면 null.
export function luminanceOfImage(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const mix = (c: number, o: number) => c * (1 - OVERLAY_ALPHA) + o * OVERLAY_ALPHA;
          sum += luminance(mix(data[i], OVERLAY[0]), mix(data[i + 1], OVERLAY[1]), mix(data[i + 2], OVERLAY[2]));
        }
        resolve(sum / (data.length / 4));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function backgroundLuminance(bg: { imageUrl?: string | null; gradient?: string | null; color?: string | null }): Promise<number | null> {
  if (bg.imageUrl) return luminanceOfImage(bg.imageUrl);
  if (bg.gradient) return luminanceOfCss(bg.gradient);
  if (bg.color) return luminanceOfCss(bg.color);
  return LIGHT_BG;
}

// 배경이 어두우면 true(다크 모드), 밝으면 false(라이트 모드). 0.18은 어두운 글자와 밝은 글자의 대비가 같아지는 휘도다.
export function backgroundIsDark(bgLuminance: number): boolean {
  return bgLuminance < 0.18;
}

// 라이트 모드에서 흰 반투명 창(사용자가 정한 반투명도 glassAlpha, 0~1)이 어두운 배경 위에 얹히면 회색이 된다.
// 어두운 글자(#222a3a)와 밝은 글자(#f1f5f9) 중 대비가 더 큰 쪽이 밝은 글자면 true. 반투명도는 읽기만 한다.
export function glassWantsLightText(bgLuminance: number, glassAlpha: number): boolean {
  const toSrgb = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055); // 색 섞임은 화면 색 값 기준
  const blended = toSrgb(bgLuminance) * (1 - glassAlpha) + glassAlpha;
  const lum = blended <= 0.03928 ? blended / 12.92 : ((blended + 0.055) / 1.055) ** 2.4;
  return (0.95 / (lum + 0.05)) > 1.15 * ((lum + 0.05) / 0.073);
}
