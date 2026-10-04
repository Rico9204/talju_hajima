// 문서·슬라이드에 넣는 이미지. 이미지를 문서 안에 통째로 넣으면 실시간 전송 한도(2MB)를 넘을 수 있어서,
// 이미지는 워크스페이스 파일로 따로 올리고 문서에는 그 버전 번호(versionId)만 둔다. 보여 줄 때는 원본 내려받기
// (권한 규칙 그대로 — 그 프로젝트 팀원만)로 받아 이 창 안에서만 쓰는 blob 주소로 그린다.

export const COLLAB_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MAX_COLLAB_IMAGE_BYTES = 10 * 1024 * 1024;

// 편집기에 넘기는 이미지 기능: upload = 워크스페이스에 올리고 버전 번호를 돌려줌, load = 그 버전의 원본.
export interface CollabImageStore {
  upload: (file: File) => Promise<number>;
  load: (versionId: number) => Promise<Blob>;
}

export function collabImageError(file: File): string | null {
  if (!COLLAB_IMAGE_TYPES.includes(file.type)) return "PNG, JPG, GIF, WebP 이미지만 넣을 수 있어요.";
  if (file.size > MAX_COLLAB_IMAGE_BYTES) return "이미지는 10MB까지 넣을 수 있어요.";
  return null;
}

// 원본 내려받기는 형식을 application/octet-stream으로 보내므로, 파일 앞부분으로 이미지 형식을 다시 붙인다
// (형식 없는 blob을 이미지로 안 그리는 브라우저가 있다).
async function asImageBlob(blob: Blob): Promise<Blob> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  const type = head[0] === 0x89 && text(1, 4) === "PNG" ? "image/png"
    : head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg"
    : text(0, 4) === "GIF8" ? "image/gif"
    : text(0, 4) === "RIFF" && text(8, 12) === "WEBP" ? "image/webp"
    : null;
  if (!type) throw new Error("이미지 파일이 아닙니다.");
  return blob.type === type ? blob : new Blob([blob], { type });
}

// 같은 이미지를 여러 번 그려도 한 번만 받는다. 편집기를 닫을 때 dispose로 blob 주소를 정리한다.
export interface CollabImageLoader { url: (versionId: number) => Promise<string>; dispose: () => void; }
export function createCollabImageLoader(load: (versionId: number) => Promise<Blob>): CollabImageLoader {
  const cache = new Map<number, Promise<string>>();
  const made: string[] = [];
  return {
    url: (versionId) => {
      let found = cache.get(versionId);
      if (!found) {
        found = load(versionId).then(asImageBlob).then((blob) => { const url = URL.createObjectURL(blob); made.push(url); return url; });
        found.catch(() => cache.delete(versionId)); // 실패하면 다음에 다시 시도
        cache.set(versionId, found);
      }
      return found;
    },
    dispose: () => { made.forEach((url) => URL.revokeObjectURL(url)); made.length = 0; cache.clear(); },
  };
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

// 내보내기용: 어떤 형식이든 PNG로 바꾼다(Word는 WebP를, PowerPoint 라이브러리는 blob 주소를 못 받는다).
export async function imageAsPng(src: string): Promise<{ dataUrl: string; bytes: Uint8Array; width: number; height: number }> {
  const img = await loadImageElement(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 1;
  canvas.height = img.naturalHeight || 1;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  return { dataUrl, bytes, width: canvas.width, height: canvas.height };
}

// 올릴 파일 이름: 붙여 넣은 이미지는 모두 "image.png"라서 어느 문서에 넣은 것인지 알 수 있게 바꾼다.
export function collabImageName(docName: string, file: File): string {
  const base = docName.replace(/\.[^.]+$/, "") || "문서";
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[file.type] ?? "png";
  const d = new Date(); // 내 컴퓨터 시각(한국 시간)으로 — toISOString은 UTC라 9시간 어긋난다
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  return `${base} 이미지 ${stamp}.${ext}`;
}
