import { useEffect, useState } from "react";
import { dataRepository } from "../api";

// 공식 점수 방식이 CCA인지(관리자 설정). 평점 옆에 "CCA 보정" 표시를 붙일 때만 쓰므로, 실패하면 표시 없이 지나간다.
// 화면마다 따로 묻지 않도록 한 번 받은 값을 함께 쓴다. 관리자가 이 브라우저에서 바꾸면 다시 묻고, 다른 사람은 새로고침 뒤 반영.
let cached: Promise<boolean> | null = null;

export function forgetEvaluationScoreCca() { cached = null; }

export function useEvaluationScoreCca(): boolean {
  const [cca, setCca] = useState(false);
  useEffect(() => {
    let active = true;
    cached ??= dataRepository.getEvaluationScoreCca().catch(() => { cached = null; return false; });
    cached.then((value) => { if (active) setCca(value); });
    return () => { active = false; };
  }, []);
  return cca;
}
