import { useState } from "react";

// "다른 팀원이 고친 내용 표시" 켜기/끄기. 편집기마다 따로 묻지 않게 이 브라우저에 기억한다(기본은 켜짐).
// 저장소를 쓸 수 없는 환경(사생활 보호 창 등)에서는 기억하지 못할 뿐 동작은 같다.
const KEY = "talju:workspace:showOtherEdits";

function readSaved(): boolean {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

export function useOtherEditMarks(): [boolean, () => void] {
  const [on, setOn] = useState(readSaved);
  const toggle = () => setOn((prev) => {
    const next = !prev;
    try { localStorage.setItem(KEY, String(next)); } catch { /* 기억하지 못해도 이번 화면에서는 바뀐다 */ }
    return next;
  });
  return [on, toggle];
}
