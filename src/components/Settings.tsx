import { type PerformanceMode, usePerformanceMode } from "../lib/performancePreferences";

const options: Array<{ value: PerformanceMode; icon: string; title: string; description: string; detail: string }> = [
  {
    value: "default",
    icon: "🎨",
    title: "기본",
    description: "현재 디자인과 움직임을 그대로 사용합니다.",
    detail: "배경 효과와 프로필 장식 애니메이션을 유지합니다.",
  },
  {
    value: "reduced-motion",
    icon: "🍃",
    title: "애니메이션 최소화",
    description: "움직이는 장식과 전환 효과를 줄여 편안하게 봅니다.",
    detail: "배경·카드 디자인은 유지하고 반복 애니메이션만 멈춥니다.",
  },
  {
    value: "performance",
    icon: "⚡",
    title: "성능 우선",
    description: "버벅임이 있는 환경을 위해 시각 효과를 가장 적게 사용합니다.",
    detail: "애니메이션·블러·큰 그림자와 GIF 재생을 줄여 CPU·GPU 사용량을 낮춥니다.",
  },
];

export default function Settings() {
  const [mode, setMode] = usePerformanceMode();

  return (
    <div className="max-w-3xl mx-auto">
      <section className="p-5 md:p-8" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
        <div className="flex items-center gap-3 mb-1">
          <span className="w-10 h-10 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--muted)", borderRadius: "10px" }}>⚙</span>
          <div>
            <h1 className="text-lg font-800 leading-tight">화면 및 성능</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              이 브라우저에서만 적용됩니다 · 하드웨어 가속 자체는 브라우저에서 관리
            </p>
          </div>
        </div>

        <div className="my-5 border-t" style={{ borderColor: "var(--border)" }} />

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700">시각 효과</h2>
          <span className="text-xs px-1.5 py-0.5 font-700" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}>자동 저장됨</span>
        </div>
        <div className="grid gap-2.5">
          {options.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className="w-full text-left p-3.5 transition-colors"
                style={{ borderRadius: "12px", border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", background: selected ? "color-mix(in srgb, var(--primary) 8%, var(--card-glass))" : "var(--card)" }}
                aria-pressed={selected}
              >
                <div className="flex gap-3 items-start">
                  <span className="w-9 h-9 shrink-0 flex items-center justify-center text-base" style={{ borderRadius: "9px", background: selected ? "var(--primary)" : "var(--muted)" }}>
                    {option.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-700 text-sm">{option.title}</span>
                      {selected && <span className="text-xs px-1.5 py-0.5 font-700" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>사용 중</span>}
                    </span>
                    <span className="block text-sm mt-1" style={{ color: "var(--foreground)" }}>{option.description}</span>
                    <span className="block text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>{option.detail}</span>
                  </span>
                  <span
                    className="mt-1 w-5 h-5 shrink-0 flex items-center justify-center"
                    style={{ borderRadius: "999px", border: selected ? "5px solid var(--primary)" : "1px solid var(--border)" }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
