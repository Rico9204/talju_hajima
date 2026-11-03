import type { CSSProperties, ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TIERS } from "../lib/achievements";

// 서비스명·로고는 바뀔 예정이라 여기 한 곳에서만 고친다.
const BRAND = { name: "Slackerspace", icon: "/slackerspace_icon.png", tagline: "팀 프로젝트를 위한 온라인 협업 플랫폼" };

// 시안(tm/)에서 가져온 맥락별 색. DESIGN.md의 [IMG] 항목과 같다. 나머지 색은 앱 CSS 변수를 쓴다.
const C = {
  purple: "#8b5cf6", purpleTint: "#efe9ff",
  green: "#16a34a", greenTint: "#e6f7ec",
  red: "#ef4444", redTint: "#fde8e8",
  amberTint: "#fff3df",
  night: "#121629", nightTop: "#111a47", nightBottom: "#2a215f",
};

const FONT = "'Outfit', 'Noto Sans KR', sans-serif";
const heading = (min: number, max: number): CSSProperties => ({ fontSize: `clamp(${min}px, ${max / 14.4}vw, ${max}px)`, lineHeight: 1.05, letterSpacing: "-0.025em" });

function Pill({ variant, large, onClick, children }: { variant: "primary" | "secondary" | "light"; large?: boolean; onClick: () => void; children: ReactNode }) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--primary-foreground)", boxShadow: "0 8px 24px var(--primary-glow)" },
    secondary: { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)" },
    light: { background: "#fff", color: "var(--primary)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" },
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-full font-500 transition-transform hover:-translate-y-0.5 ${large ? "h-14 px-8 text-lg" : "h-11 px-4 text-sm"}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

function Mock({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[24px] p-5 ${className}`} style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      {children}
    </div>
  );
}

const Chip = ({ bg, color, children }: { bg: string; color: string; children: ReactNode }) => (
  <span className="rounded-full px-2 py-0.5 text-xs font-500" style={{ background: bg, color, fontFamily: "var(--font-jetbrains)" }}>{children}</span>
);

const Bubble = ({ mine, children }: { mine?: boolean; children: ReactNode }) => (
  <div
    className={`w-fit max-w-full rounded-2xl px-3 py-2 text-sm ${mine ? "ml-auto font-500" : ""}`}
    style={mine ? { background: "var(--primary)", color: "var(--primary-foreground)" } : { background: "var(--muted)" }}
  >
    {children}
  </div>
);

const Avatars = () => (
  <div className="flex -space-x-2">
    {["정", "황", "홍"].map((n) => (
      <span key={n} className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-600" style={{ background: "var(--secondary)", color: "var(--primary-text)", border: "2px solid var(--card)" }}>{n}</span>
    ))}
  </div>
);

// 왼쪽·오른쪽 조각마다 아래로 가는 가는 연결선(Asana 방식)
const Line = ({ color }: { color: string }) => (
  <div className="ml-6 flex flex-col items-center" aria-hidden>
    <div className="h-14 w-px" style={{ background: "var(--border)" }} />
    <div className="h-2 w-2 rounded-full" style={{ background: color }} />
  </div>
);

function Dashboard() {
  const nav = ["대시보드", "팀 정보", "팀 채팅", "과제 보드", "일정", "워크스페이스", "동료 평가"];
  const stats = [
    { n: "6", t: "완료 과제", s: "전체 9개 중", bg: C.greenTint, c: C.green, i: "✓" },
    { n: "2", t: "남은 마감", s: "마감일 있는 미완료 과제", bg: C.redTint, c: C.red, i: "◷" },
    { n: "대기", t: "내 평가", s: "프로토타입 검증", bg: "var(--secondary)", c: "var(--primary)", i: "◎" },
  ];
  const tasks = ["중간 발표 자료 만들기", "화면 설계 문서 정리", "API 명세서 작성", "사용자 테스트 계획"];
  return (
    <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-[28px] text-left" style={{ background: "var(--muted)", boxShadow: "0 30px 80px rgba(17,26,71,0.35)" }} aria-hidden>
      <div className="flex items-center gap-3 px-6 py-3" style={{ background: C.night }}>
        <div className="flex gap-2">
          {["#ff5f57", "#febc2e", "#28c840"].map((color) => <span key={color} className="h-3 w-3 rounded-full" style={{ background: color }} />)}
        </div>
        <span className="hidden gap-2 text-sm sm:flex" style={{ color: "rgba(255,255,255,0.45)" }}><span>‹</span><span>›</span></span>
        <div className="mx-auto hidden w-full max-w-[360px] rounded-lg px-3 py-1 text-xs sm:block" style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>{BRAND.name} 검색</div>
      </div>
      <div className="flex gap-4 p-4 md:p-5">
        <div className="hidden w-[170px] shrink-0 rounded-2xl p-3 md:block" style={{ background: "var(--card)" }}>
          <div className="mb-3 flex items-center gap-2 px-1">
            <img src={BRAND.icon} alt="" className="h-7 w-7" style={{ borderRadius: "20%" }} />
            <span className="text-sm font-600">{BRAND.name}</span>
          </div>
          {nav.map((n, i) => (
            <div key={n} className="mb-1 rounded-lg px-3 py-2 text-xs" style={i === 0 ? { background: "var(--primary)", color: "var(--primary-foreground)" } : { color: "var(--muted-foreground)" }}>{n}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-500">안녕하세요, 김민준님</div>
          <div className="mb-3 text-xs" style={{ color: "var(--muted-foreground)" }}>이번 주 마감 2건이 남았어요. 팀 현황을 한눈에 확인해 보세요.</div>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 flex items-center justify-between rounded-2xl p-4 md:col-span-1" style={{ background: "var(--hero-banner-bg)", color: "#fff" }}>
              <div>
                <div className="text-xs opacity-80">전체 진행률</div>
                <div className="text-3xl font-300">67<span className="text-sm">%</span></div>
              </div>
              <svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="5" /><circle cx="22" cy="22" r="18" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="76 113" strokeLinecap="round" transform="rotate(-90 22 22)" /></svg>
            </div>
            {stats.map((s, i) => (
              <div key={s.t} className={`rounded-2xl p-3 ${i === 2 ? "col-span-2 md:col-span-1" : ""}`} style={{ background: "var(--card)" }}>
                <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-lg text-xs" style={{ background: s.bg, color: s.c }}>{s.i}</span>
                <div className="text-xl font-500">{s.n}</div>
                <div className="text-xs font-500">{s.t}</div>
                <div className="truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>{s.s}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl p-4" style={{ background: "var(--card)" }}>
              <div className="mb-2 text-sm font-500">현황판</div>
              {tasks.map((t) => <div key={t} className="mb-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--muted)" }}>{t}</div>)}
            </div>
            <div className="hidden rounded-2xl p-4 md:block" style={{ background: "var(--card)" }}>
              <div className="mb-2 text-sm font-500">다가오는 마감</div>
              {[["중간 발표", "D-2", C.red], ["팀 회의", "D-4", "var(--primary)"], ["최종 발표", "D-46", "var(--accent)"]].map(([t, d, c]) => (
                <div key={t} className="mb-1.5 flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: "var(--muted)" }}>
                  <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{t}</span>
                  <span style={{ color: c, fontFamily: "var(--font-jetbrains)" }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ glyph, color, tint, title, desc, className = "", children }: { glyph: string; color: string; tint: string; title: string; desc: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`flex flex-col rounded-[24px] p-6 ${className}`} style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full text-lg" style={{ background: tint, color }} aria-hidden>{glyph}</span>
      <h3 className="text-xl font-600">{title}</h3>
      <p className="mb-4 text-sm" style={{ color: "var(--muted-foreground)" }}>{desc}</p>
      <div className="mt-auto" aria-hidden>{children}</div>
    </div>
  );
}

const pentagon = (r: number) => [0, 1, 2, 3, 4].map((i) => `${60 + r * Math.cos(((-90 + 72 * i) * Math.PI) / 180)},${60 + r * Math.sin(((-90 + 72 * i) * Math.PI) / 180)}`).join(" ");

const Step = ({ n, color, title, desc, children }: { n: number; color: string; title: string; desc: string; children: ReactNode }) => (
  <div className="flex flex-col items-center text-center">
    <div className="mb-8 hidden w-full items-center md:flex" aria-hidden>
      <div className="h-px flex-1" style={{ background: n === 1 ? "transparent" : "var(--border)" }} />
      <div className="px-6 text-[64px] font-300 leading-none" style={{ color }}>{n}</div>
      <div className="h-px flex-1" style={{ background: n === 3 ? "transparent" : "var(--border)" }} />
    </div>
    <div className="mb-6 min-h-[232px] w-full max-w-[320px] rounded-[24px] p-5 text-left" style={{ background: "var(--card)", boxShadow: "0 16px 40px rgba(15,18,53,0.10)" }} aria-hidden>{children}</div>
    <h3 className="mb-1 text-xl font-600"><span className="md:hidden" style={{ color }}>{n}. </span>{title}</h3>
    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{desc}</p>
  </div>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="mb-3">
    <div className="mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
    <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--secondary)", border: "2px solid var(--border)" }}>{value}</div>
  </div>
);

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/home" replace />;

  const signup = () => navigate("/login?mode=signup");
  const login = () => navigate("/login");
  const section = "mx-auto w-full max-w-[1200px] px-6";

  return (
    <div className="h-full w-full scroll-smooth overflow-y-auto overflow-x-hidden" style={{ background: "var(--background)", color: "var(--foreground)", fontFamily: FONT }}>
      {/* 내비 + 히어로 */}
      <header
        className="relative"
        style={{ background: "radial-gradient(600px 400px at 8% 8%, #dedbfb 0%, transparent 70%), radial-gradient(520px 440px at 95% 55%, #d9e8ec 0%, transparent 70%)" }}
      >
        <nav className={`${section} flex h-[68px] items-center justify-between`}>
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2">
              <img src={BRAND.icon} alt="" className="h-9 w-9" style={{ borderRadius: "20%" }} />
              <span className="text-lg font-600">{BRAND.name}</span>
            </div>
            <div className="hidden gap-6 text-sm sm:flex" style={{ color: "var(--muted-foreground)" }}>
              <a href="#features">기능</a>
              <a href="#steps">시작 방법</a>
            </div>
          </div>
          <div className="flex gap-2">
            <Pill variant="secondary" onClick={login}>로그인</Pill>
            <Pill variant="primary" onClick={signup}>시작하기</Pill>
          </div>
        </nav>

        <div className={`${section} relative pb-16 pt-12 text-center md:pt-20`}>
          <h1 className="font-300" style={heading(48, 100)}>
            <span style={{ color: "var(--primary-text)" }}>팀플,</span>
            <br />
            한곳에서 끝내요
          </h1>
          <p className="mx-auto mt-6 max-w-[760px] font-300" style={{ fontSize: "clamp(16px, 1.7vw, 24px)", color: "var(--muted-foreground)" }}>
            채팅, 과제, 일정, 파일, 동료 평가까지. 흩어진 팀 프로젝트를 한 화면으로.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Pill variant="primary" large onClick={signup}>무료로 시작하기</Pill>
            <Pill variant="secondary" large onClick={login}>로그인</Pill>
          </div>

          {/* 떠 있는 조각: 넓은 화면에서만 */}
          <div className="absolute left-0 top-[90px] hidden min-[1280px]:block" aria-hidden>
            <Mock className="w-[260px] !p-4 text-left">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full text-xs" style={{ background: C.greenTint, color: C.green }}>✓</span>발표 자료 만들기</span>
                <Chip bg={C.redTint} color={C.red}>D-3</Chip>
              </div>
              <div className="mt-3 h-1.5 rounded-full" style={{ background: "var(--secondary)" }}><div className="h-full w-[65%] rounded-full" style={{ background: "var(--primary)" }} /></div>
            </Mock>
            <Line color={C.purple} />
            <div className="ml-2 mt-1"><Avatars /></div>
          </div>
          <div className="absolute right-0 top-[110px] hidden min-[1280px]:block" aria-hidden>
            <div className="ml-auto w-[230px] rounded-2xl px-4 py-3 text-left text-sm" style={{ background: "var(--card)", boxShadow: "var(--shadow-card)" }}>내일 회의 몇 시?</div>
            <div className="mt-1 w-fit rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--card)", boxShadow: "var(--shadow-card)" }}>👀 1</div>
            <div className="mr-8 flex justify-end"><Line color={C.green} /></div>
            <div className="ml-auto mt-1 w-fit rounded-full px-5 py-3 text-base font-500" style={{ background: C.greenTint, color: C.green }}>✓ 완료!</div>
          </div>
        </div>
      </header>

      {/* 제품 화면: 프레임이 밝은/어두운 경계에 걸친다(위 120px만 밝은 면) */}
      <section style={{ background: `linear-gradient(180deg, transparent 0 120px, ${C.nightTop} 120px, ${C.nightBottom} 100%)` }}>
        <div className={`${section} pb-24`}>
          <Dashboard />
          <div className="mt-16 text-center" style={{ color: "#fff" }}>
            <h2 className="font-300" style={heading(30, 56)}>팀의 모든 일이, 한 화면에</h2>
            <p className="mt-3" style={{ color: "rgba(255,255,255,0.65)" }}>대시보드에서 진행 상황을 바로 확인하세요.</p>
          </div>
        </div>
      </section>

      {/* 기능 벤토 */}
      <section id="features" className={`${section} py-24`}>
        <h2 className="mb-12 text-center font-300" style={heading(30, 56)}>프로젝트에 필요한 건 다 있어요</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Tile glyph="◎" color={C.purple} tint={C.purpleTint} title="팀 정보" desc="팀원과 역할을 한눈에" className="lg:col-span-2">
            {[["김", "김민준", "팀장"], ["이", "이서연", "팀원"], ["박", "박지후", "팀원"]].map(([i, n, r]) => (
              <div key={n} className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--muted)" }}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs" style={{ background: "var(--secondary)", color: "var(--primary-text)" }}>{i}</span>
                {n}<span className="ml-auto text-xs" style={{ color: "var(--primary-text)" }}>{r}</span>
              </div>
            ))}
          </Tile>
          <Tile glyph="◐" color="var(--primary)" tint="var(--secondary)" title="채팅" desc="팀 채널과 그룹 대화" className="lg:row-span-2">
            <div className="space-y-2">
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>황성환</div>
              <Bubble>회의 자료 올렸어요</Bubble>
              <Bubble mine>확인했어요!</Bubble>
              <Bubble>내일 회의 몇 시?</Bubble>
              <Bubble mine>오후 3시에 해요!</Bubble>
              {/* 앱의 채팅 도구(투표·사다리·룰렛·추첨) 중 투표 */}
              <div className="rounded-2xl p-3 text-xs" style={{ background: "var(--muted)" }}>
                <div className="mb-2 font-600">회식 메뉴 투표</div>
                {[["고기", 62, "var(--primary)"], ["파스타", 38, C.purple]].map(([l, p, c]) => (
                  <div key={l} className="mb-1.5 flex items-center gap-2">
                    <span className="w-10">{l}</span>
                    <div className="h-2 flex-1 rounded-full" style={{ background: "var(--card)" }}><div className="h-full rounded-full" style={{ width: `${p}%`, background: c as string }} /></div>
                  </div>
                ))}
                <div className="mt-2 flex gap-1.5" style={{ color: "var(--muted-foreground)" }}>{["투표", "사다리", "룰렛", "추첨"].map((t) => <span key={t} className="rounded-full px-2 py-0.5" style={{ background: "var(--card)" }}>{t}</span>)}</div>
              </div>
              <div className="rounded-full px-4 py-2 text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>팀 전체에게 메시지 보내기…</div>
            </div>
          </Tile>
          <Tile glyph="≡" color={C.green} tint={C.greenTint} title="과제 보드" desc="해야 할 일을 카드로 정리">
            <div className="mb-1 text-xs" style={{ color: "var(--primary-text)" }}>진행 · 4개</div>
            {["화면 설계", "발표 자료"].map((t) => <div key={t} className="mb-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--muted)" }}>{t}</div>)}
          </Tile>
          <Tile glyph="▤" color="var(--accent)" tint={C.amberTint} title="일정" desc="마감과 회의를 한 달력에">
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["월", "화", "수", "목", "금", "토", "일"].map((d) => <span key={d} style={{ color: "var(--muted-foreground)" }}>{d}</span>)}
              {[13, 14, 15, 16, 17, 18, 19].map((d) => (
                <span key={d} className="rounded-lg py-1" style={d === 17 ? { background: "var(--primary)", color: "var(--primary-foreground)" } : {}}>{d}</span>
              ))}
            </div>
          </Tile>
          <Tile glyph="⬡" color="var(--primary)" tint="var(--secondary)" title="워크스페이스" desc="문서와 파일을 함께 편집">
            <div className="rounded-xl border border-dashed p-3 text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              <div style={{ color: "var(--foreground)" }}>드래그하거나 클릭해서 업로드</div>
              PDF, DOCX, XLSX, 이미지 지원
            </div>
          </Tile>
          <Tile glyph="★" color={C.purple} tint={C.purpleTint} title="동료 평가" desc="기여도를 공정하게 확인">
            <svg viewBox="0 0 120 120" className="mx-auto mb-3 h-28 w-28">
              <polygon points={pentagon(48)} fill="none" stroke="var(--border)" strokeWidth="1.5" />
              <polygon points={pentagon(30)} fill="var(--secondary)" stroke="var(--primary)" strokeWidth="2" />
            </svg>
            <div className="flex justify-center gap-2">
              {TIERS.map((t) => <span key={t.id} className="h-3 w-3 rounded-full" title={t.label} style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }} />)}
            </div>
          </Tile>
        </div>
      </section>

      {/* 시작 3단계 */}
      <section id="steps" className="py-24" style={{ background: "var(--card)" }}>
        <div className={section}>
          <h2 className="mb-14 text-center font-300" style={heading(30, 56)}>3단계면 시작할 수 있어요</h2>
          <div className="grid gap-12 md:grid-cols-3 md:gap-x-0">
            <Step n={1} color="var(--primary)" title="프로젝트 만들기" desc="팀 이름과 기간만 정하면 준비 끝">
              <Field label="프로젝트 이름" value="캡스톤 디자인" />
              <Field label="마감일" value="2026. 12. 20." />
              <div className="rounded-full py-2.5 text-center text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>프로젝트 만들기</div>
            </Step>
            <Step n={2} color={C.purple} title="참여 코드로 합류" desc="받은 코드를 입력하면 바로 입장">
              <div className="mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>참여 코드</div>
              <div className="mb-3 flex gap-1.5">
                {["A", "7", "K", "9", "Q", "X"].map((c) => <span key={c} className="flex h-9 w-9 items-center justify-center rounded-lg text-sm" style={{ background: "var(--secondary)", color: "var(--primary-text)", fontFamily: "var(--font-jetbrains)" }}>{c}</span>)}
              </div>
              <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--muted)" }}>발급 후 6시간 유효</div>
              <div className="rounded-full py-2.5 text-center text-sm font-600" style={{ background: C.purple, color: "#fff" }}>참여하기</div>
            </Step>
            <Step n={3} color={C.green} title="바로 협업" desc="채팅, 과제, 일정을 한곳에서">
              <div className="mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>황성환</div>
              <Bubble>회의 자료 올렸어요</Bubble>
              <div className="mt-2"><Bubble mine>확인했어요!</Bubble></div>
              <div className="my-3 flex gap-2"><Chip bg={C.greenTint} color={C.green}>✓ 제출 완료</Chip><Chip bg={C.redTint} color={C.red}>D-DAY</Chip></div>
              <Avatars />
            </Step>
          </div>
        </div>
      </section>

      {/* CTA 배너 */}
      <section className={`${section} py-24`}>
        <div className="relative grid items-center gap-10 rounded-[32px] px-8 py-14 md:px-16 lg:grid-cols-2" style={{ background: "var(--hero-banner-bg)", boxShadow: "var(--hero-banner-shadow)", color: "#fff" }}>
          <div>
            <h2 className="font-300" style={heading(32, 56)}>지금 팀플을<br />시작해 보세요</h2>
            <p className="mb-8 mt-4" style={{ color: "rgba(255,255,255,0.8)" }}>참여 코드만 있으면 바로 합류할 수 있어요.</p>
            <Pill variant="light" large onClick={signup}>무료로 시작하기</Pill>
          </div>
          <div className="relative hidden h-[260px] lg:block" aria-hidden>
            <Mock className="absolute -top-24 left-0 w-[240px] !p-4 text-left">
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>전체 진행률</div>
              <div className="text-3xl font-300" style={{ color: "var(--primary-text)" }}>67<span className="text-sm">%</span></div>
              <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--secondary)" }}><div className="h-full w-[67%] rounded-full" style={{ background: "var(--primary)" }} /></div>
            </Mock>
            <div className="absolute right-0 top-0 rounded-2xl px-4 py-2 text-sm" style={{ background: "#fff", color: "#0f1235" }}>내일 회의 몇 시?</div>
            <div className="absolute right-0 top-14 rounded-2xl px-4 py-2 text-sm" style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.4)" }}>오후 3시에 해요!</div>
            <div className="absolute left-10 top-[120px] flex items-center gap-3 rounded-2xl px-4 py-3 text-sm" style={{ background: "#fff", color: "#0f1235" }}>
              <span style={{ color: C.green }}>✓</span>발표 자료 만들기<Chip bg={C.redTint} color={C.red}>D-3</Chip>
            </div>
            <div className="absolute bottom-6 right-4 rounded-full px-5 py-3 font-500" style={{ background: C.greenTint, color: C.green }}>✓ 제출 완료</div>
          </div>
        </div>
      </section>

      {/* 푸터 */}
      <footer style={{ background: C.night, color: "#f1f5f9" }}>
        <div className={`${section} py-12`}>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <img src={BRAND.icon} alt="" className="h-9 w-9" style={{ borderRadius: "20%" }} />
                <span className="text-lg font-600">{BRAND.name}</span>
              </div>
              <p className="mt-3 text-sm" style={{ color: "rgba(241,245,249,0.6)" }}>{BRAND.tagline}</p>
            </div>
            <div className="flex gap-6 text-sm">
              <a href="#features">기능</a>
              <a href="#steps">시작 방법</a>
              <button onClick={login}>로그인</button>
              <button onClick={signup}>회원가입</button>
            </div>
          </div>
          <div className="mt-10 border-t pt-6 text-xs" style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(241,245,249,0.45)" }}>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
