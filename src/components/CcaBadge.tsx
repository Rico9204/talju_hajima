import EvaluationInfoButton from "./EvaluationInfoButton";

// 공식 점수 방식이 CCA일 때 평점 옆에 붙는 작은 표시. 설명은 ⓘ의 안내 창에서 본다.
export default function CcaBadge({ light = false }: { light?: boolean }) {
  return <span className="inline-flex items-center gap-1 align-middle">
    <span className="px-1.5 py-px text-[10px] font-800 leading-tight rounded-full"
      style={{ background: light ? "rgba(255,255,255,0.18)" : "color-mix(in srgb, var(--primary) 14%, transparent)", color: light ? "#fff" : "var(--primary)" }}>CCA</span>
    <EvaluationInfoButton section="cca" light={light} />
  </span>;
}
