import { apiClient, getAccessToken } from "../api/backend/client";

// apiClient의 baseURL("/api" 또는 "https://xxx.ngrok-free.dev/api")로부터 "바로 수정"
// 웹소켓이 붙을 오리진만 뽑아낸다. 백엔드는 /api REST와 별개로 /collab 경로에 직접 웹소켓을
// 붙여두었으므로(collab.service.ts), 여기서는 오리진까지만 만들고 경로("collab")는
// WebsocketProvider의 roomName 인자로 넘긴다.
export function buildCollabWsOrigin(): string {
  const base = apiClient.defaults.baseURL || "/api";
  if (base.startsWith("http")) {
    return base.replace(/^http/, "ws").replace(/\/api\/?$/, "");
  }
  // 로컬 개발("/api" 상대경로, vite 프록시 사용) — 지금 페이지와 같은 오리진의 ws(s)로 접속하면
  // vite.config.ts의 /collab 프록시가 실제 백엔드로 넘겨준다.
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

export function collabAuthToken(): string {
  return getAccessToken() ?? "";
}

// textarea의 onChange에서 "이전 값 -> 새 값"만 보고, 실제로 바뀐 구간(공통 접두사/접미사를
// 뺀 가운데 부분)만 Y.Text에 반영한다. 매번 전체를 지우고 다시 쓰면 다른 사람 화면의 커서가
// 계속 튀고, 동시 편집 시 병합도 지저분해지므로 최소 diff로 반영하는 게 중요하다.
export function applyTextareaDelta(
  ytext: import("yjs").Text,
  oldValue: string,
  newValue: string,
): void {
  if (oldValue === newValue) return;
  let start = 0;
  const maxStart = Math.min(oldValue.length, newValue.length);
  while (start < maxStart && oldValue[start] === newValue[start]) start++;

  let oldEnd = oldValue.length;
  let newEnd = newValue.length;
  while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const doc = ytext.doc;
  const apply = () => {
    if (oldEnd > start) ytext.delete(start, oldEnd - start);
    if (newEnd > start) ytext.insert(start, newValue.slice(start, newEnd));
  };
  if (doc) doc.transact(apply, "local-textarea");
  else apply();
}

export const AWARENESS_COLORS = ["#2563eb", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AWARENESS_COLORS[hash % AWARENESS_COLORS.length];
}

// textarea는 특정 글자 위치가 화면 어디에 그려지는지 알려주는 API가 없다 — 그래서 textarea와
// 똑같은 폰트/여백/줄바꿈으로 숨겨진 <div>를 하나 만들어 같은 글자를 넣어보고, 그 글자 바로
// 뒤에 심은 표식(span)의 위치를 읽어서 "이 글자는 화면의 이 좌표"를 역산한다(잘 알려진
// textarea-caret 기법). 남의 커서를 텍스트 위에 색깔로 그려주는 데만 쓴다.
export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = style.width;
  mirror.style.paddingTop = style.paddingTop;
  mirror.style.paddingRight = style.paddingRight;
  mirror.style.paddingBottom = style.paddingBottom;
  mirror.style.paddingLeft = style.paddingLeft;
  mirror.style.borderTopWidth = style.borderTopWidth;
  mirror.style.borderRightWidth = style.borderRightWidth;
  mirror.style.borderBottomWidth = style.borderBottomWidth;
  mirror.style.borderLeftWidth = style.borderLeftWidth;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  document.body.appendChild(mirror);

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position) || ".";
  mirror.appendChild(marker);

  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  const height = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 16;

  document.body.removeChild(mirror);
  return { top, left, height };
}
