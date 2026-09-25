// 워크스페이스에 있는 "이 앱 자체 문서/슬라이드"(진짜 .docx/.pptx가 아니라, Yjs 문서를
// 그대로 base64로 저장하는 이 앱만의 파일 형식) 판별 + 인코딩 헬퍼.

export function isRichDocPath(path: string): boolean {
  return path.endsWith(".rtdoc");
}

export function isSlidesPath(path: string): boolean {
  return path.endsWith(".slides");
}

export function isCollabDocPath(path: string): boolean {
  return isRichDocPath(path) || isSlidesPath(path);
}

// 백엔드가 저장한 content가 (일반 텍스트가 아니라) Yjs 문서 스냅샷인지 — 파일 경로를 몰라도
// content 자체로 판별 가능하게 붙인 접두사(backend/src/collab/collab.service.ts의
// SNAPSHOT_PREFIX와 동일). 버전 diff 화면처럼 경로 없이 content만 보는 곳에서 쓴다.
export const SNAPSHOT_PREFIX = "yjs-snapshot:";

export function isSnapshotContent(content: string): boolean {
  return content.startsWith(SNAPSHOT_PREFIX);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
