// 게시글 이미지 미리보기의 높이(이미지 190px + 아래 제목 줄 + 간격).
const PREVIEW_HEIGHT = 240;

// 게시글 아래에 띄울 자리가 없고 위에는 있을 때만 위로 띄운다. 양쪽 다 모자라면 아래에 둔다.
export function previewOpensAbove(row: { top: number; bottom: number }, viewportHeight: number): boolean {
  return row.bottom + PREVIEW_HEIGHT > viewportHeight && row.top >= PREVIEW_HEIGHT;
}
