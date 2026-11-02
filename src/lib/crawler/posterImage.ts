// 포스터 원본은 수 MB까지 있어, 카드·목록·크게 보기에는 Vercel 이미지 최적화(vercel.json의 images)로 줄인 것을 쓴다.
// 개발 서버에는 이 경로가 없어 원본을 쓴다. 허용 목록에 없는 사이트나 사용량 초과로 실패하면 화면이 원본으로 다시 받는다.
export const POSTER_WIDTH = { card: 640, list: 96, preview: 1280 } as const;

export function optimizedPosterUrl(url: string, width: number, production = !!import.meta.env?.PROD): string {
  return production ? `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=75` : url;
}

// 같은 줄의 다른 카드에 이미지가 있을 때만 자리표시를 넣어 카드의 공백을 메운다. 한 줄에 카드 하나면 맞출 옆 카드가 없다.
export function needsPosterPlaceholder(notices: { thumbnail?: string }[], index: number, columns: number): boolean {
  if (columns < 2 || notices[index]?.thumbnail) return false;
  const rowStart = index - (index % columns);
  return notices.slice(rowStart, rowStart + columns).some((notice) => notice.thumbnail);
}
