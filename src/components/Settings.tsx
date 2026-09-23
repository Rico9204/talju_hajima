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

// Category rail: only "그래픽" has settings today. Structured as a list so
// more categories (계정, 알림 등) can slot in later without reshaping the page.
const categories = [{ id: "graphics", icon: "🖥️", label: "그래픽" }] as const;

export default function Settings() {
  const [mode, setMode] = usePerformanceMode();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row gap-4">
        <nav className="flex md:flex-col gap-1.5 md:w-44 shrink-0 overflow-x-auto md:overflow-visible pb-1">
          <div className="hidden md:block text-xs font-600 uppercase tracking-widest px-2 mb-1" style={{ color: "var(--muted-foreground)" }}>
            분야
          </div>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="flex items-center gap-2.5 px-3 py-2.5 text-left shrink-0"
              style={{ borderRadius: "10px", background: "var(--primary)", color: "#fff" }}
              aria-current="true"
            >
              <span className="text-sm w-6 h-6 flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.2)", borderRadius: "7px" }}>
                {category.icon}
              </span>
              <span className="text-sm font-700 whitespace-nowrap">{category.label}</span>
            </button>
          ))}
        </nav>

        <section className="flex-1 min-w-0 p-5 md:p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-base font-800 leading-tight">그래픽 및 화면 효과</h1>
              <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                이 브라우저에서만 적용됩니다 · 하드웨어 가속 자체는 브라우저에서 관리
              </p>
            </div>
            <span className="text-xs px-1.5 py-0.5 font-700 shrink-0" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}>자동 저장됨</span>
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
    </div>
  );
}
