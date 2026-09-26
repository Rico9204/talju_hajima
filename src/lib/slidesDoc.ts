import * as Y from "yjs";
import { textHash } from "./collabCore.ts";

// 워크스페이스 "슬라이드"(.slides): 이 앱에서 여러 명이 함께 만드는 발표 자료. 파일 내용은 Yjs 문서 상태 그대로다.
// 구조: slides(Y.Array) → 슬라이드(Y.Map: id, elements(Y.Array)) → 글상자(Y.Map: id, type "text", x·y·w·h(슬라이드
// 크기의 %), text(Y.Text)). 위치를 %로 두어 화면 크기와 무관하게 같은 자리에 보인다.
// 원본: Temporary_Merge a068d15. 이미지는 이번 판에서 넣지 않았다(문서에 이미지를 통째로 넣으면 실시간 전송 한도를
// 넘을 수 있다).

export const SLIDES_EXT = "slides";
export const SLIDES_MIME = "application/x-talju-slides";
export const SLIDES_FIELD = "slides";

export type YMapAny = Y.Map<unknown>;

export function isSlidesName(name: string): boolean {
  return name.toLowerCase().endsWith(`.${SLIDES_EXT}`);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createTextElement(text = "텍스트를 입력하세요", x = 10, y = 40, w = 80, h = 20): YMapAny {
  const el = new Y.Map<unknown>();
  el.set("id", newId());
  el.set("type", "text");
  el.set("x", x);
  el.set("y", y);
  el.set("w", w);
  el.set("h", h);
  el.set("text", new Y.Text(text));
  return el;
}

export function createSlide(withTitle = false): YMapAny {
  const slide = new Y.Map<unknown>();
  slide.set("id", newId());
  const elements = new Y.Array<YMapAny>();
  if (withTitle) elements.push([createTextElement("제목을 입력하세요", 8, 38, 84, 20)]);
  slide.set("elements", elements);
  return slide;
}

// 새 슬라이드 파일의 첫 상태: 제목 글상자가 있는 슬라이드 한 장. 고정 clientID로 만들어, 여러 명이 동시에 처음
// 열어도 각자 빈 슬라이드를 만들어 넣는 일(슬라이드 중복)이 없게 한다.
export function newSlidesBytes(): Uint8Array {
  const seed = new Y.Doc();
  seed.clientID = 1;
  seed.getArray<YMapAny>(SLIDES_FIELD).push([createSlide(true)]);
  return Y.encodeStateAsUpdate(seed);
}

export function slideElements(slide: YMapAny): Y.Array<YMapAny> {
  return slide.get("elements") as Y.Array<YMapAny>;
}

// 검색·버전 비교(페이지 보기)용 글자: 슬라이드마다 "[n]" 머리글과 글상자 글자를 줄로 나열한다.
export function slidesText(doc: Y.Doc): string {
  return doc.getArray<YMapAny>(SLIDES_FIELD).toArray().map((slide, i) => {
    const texts = slideElements(slide).toArray().map((el) => (el.get("text") as Y.Text | undefined)?.toString() ?? "").filter((t) => t.trim());
    return [`[${i + 1}]`, ...texts].join("\n");
  }).join("\n");
}

// "마지막으로 저장한 내용과 같은지" 비교하는 값(글자·위치·크기 포함).
export function slidesKey(doc: Y.Doc): string {
  return textHash(JSON.stringify(doc.getArray(SLIDES_FIELD).toJSON()));
}
