import { type PerformanceMode, usePerformanceMode } from "../lib/performancePreferences";

const options: Array<{ value: PerformanceMode; title: string; description: string; detail: string }> = [
  {
    value: "default",
    title: "기본",
    description: "현재 디자인과 움직임을 그대로 사용합니다.",
    detail: "배경 효과와 프로필 장식 애니메이션을 유지합니다.",
  },
  {
    value: "reduced-motion",
    title: "애니메이션 최소화",
    description: "움직이는 장식과 전환 효과를 줄여 편안하게 봅니다.",
    detail: "배경·카드 디자인은 유지하고 반복 애니메이션만 멈춥니다.",
  },
  {
    value: "performance",
    title: "성능 우선",
    description: "버벅임이 있는 환경을 위해 시각 효과를 가장 적게 사용합니다.",
    detail: "애니메이션·블러·큰 그림자와 GIF 재생을 줄여 CPU·GPU 사용량을 낮춥니다.",
  },
];

export default function Settings() {
  const [mode, setMode] = usePerformanceMode();

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 md:px-8 md:py-10">
      <div className="mb-7">
        <div className="text-xs font-700 tracking-widest uppercase mb-2" style={{ color: "var(--primary)" }}>설정</div>
        <h1 className="text-2xl font-800">화면 및 성능</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          이 브라우저에서만 적용됩니다. 하드웨어 가속 설정 자체는 브라우저에서 관리합니다.
        </p>
      </div>

      <section className="p-5 md:p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
        <div className="mb-4">
          <h2 className="font-700">시각 효과</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>내 환경에 맞는 표시 방식을 선택하세요.</p>
        </div>
        <div className="grid gap-3">
          {options.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className="w-full text-left p-4 transition-colors"
                style={{ borderRadius: "12px", border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", background: selected ? "color-mix(in srgb, var(--primary) 8%, var(--card-glass))" : "transparent" }}
                aria-pressed={selected}
              >
                <div className="flex gap-3 items-start">
                  <span className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center text-xs" style={{ borderRadius: "999px", border: selected ? "5px solid var(--primary)" : "1px solid var(--border)", color: "var(--primary)" }}>{selected ? "●" : ""}</span>
                  <span>
                    <span className="block font-700">{option.title}</span>
                    <span className="block text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{option.description}</span>
                    <span className="block text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>{option.detail}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
