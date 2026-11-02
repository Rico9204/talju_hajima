---
version: alpha
name: talju-light-design
description: "talju_hajima의 밝은 기본 테마. 색의 기본값은 앱(src/index.css) 토큰이다: 연한 인디고 배경(#f3f5f9), 남색에 가까운 글자(#222a3a), 파란 포인트(#4a74b5), 보조 앰버(#f59e0b). 다만 파랑에 고정하지 않고, 섹션·맥락(시안 이미지)에 맞는 색을 그때그때 골라 쓸 수 있다. 구조와 형태는 사용자가 지정한 1순위 참고 사이트 Asana(asana.com/ko)와 Slack(slack.com/intl/ko-kr)을 따른다: 크고 가는 헤드라인, 알약형 주 버튼, 주/보조 버튼 위계, 히어로 정보 순서. 유료 글꼴은 쓰지 않고 무료 글꼴(Outfit + Noto Sans KR)만 쓴다. 사용자가 직접 바꾸는 테마(프로필 테마, 아바타 프레임, 계정 뒷배경, UI 테마, 다크 모드)는 이 토큰의 범위 밖이며 절대 덮어쓰지 않는다."

# 출처 표기 — [APP] 앱 src/index.css 값 그대로, [A] Asana 실측, [S] Slack 실측, [D] 위 값에서 파생(투명도/명도 조정만), [IMG] 시안 이미지에서 가져온 맥락별 색
# 아래 [APP] 값은 "기본값"이다. 파랑에 집중하지 않는다. 시안 이미지의 파랑은 프롬프트에 지정한 팔레트에서 나온 것이라 구속력이 없다(시안은 구조·배치 기준).
# 섹션·맥락에 맞는 색이 필요하면 직접 정해 이 목록에 [IMG]로 추가하고 쓴다.
colors:
  primary: "#4a74b5"            # [APP] --primary
  on-primary: "#ffffff"         # [APP] --primary-foreground
  primary-hover: "#4368a3"      # [APP] hero-banner 그라데이션 중간색
  primary-pressed: "#3b5d91"    # [APP] hero-banner 그라데이션 끝색
  primary-focus: "#4a74b5"      # [APP] --ring
  secondary: "#e6eefa"          # [APP] --secondary
  on-secondary: "#4a74b5"       # [APP] --secondary-foreground
  accent: "#f59e0b"             # [APP] --accent (앰버, 강조·배지 전용)
  on-accent: "#ffffff"          # [APP] --accent-foreground
  ink: "#222a3a"                # [APP] --foreground
  ink-muted: "#4b566b"          # [APP] --muted-foreground (보조 글자)
  ink-subtle: "#7b82a8"         # [APP] index.css 주석의 원래 muted 값 (placeholder·비활성 전용, 본문 금지)
  canvas: "#f3f5f9"             # [APP] --background (페이지 배경)
  surface: "#ffffff"            # [APP] --card / --surface-opaque
  surface-muted: "#eef2f8"      # [APP] --muted (입력창·옅은 면)
  hairline: "#e1e6ef"           # [APP] --border
  hairline-strong: "#7b82a8"    # [APP] ink-subtle 재사용 (보조 버튼 외곽선, Asana 방식)
  gradient-start: "#4a74b5"     # [APP] 헤드라인 한 줄 강조용 (Asana 방식, 앱 파랑으로 대체)
  gradient-end: "#3b5d91"       # [APP]
  inverse-canvas: "#121629"     # [APP] 다크 테마 --card (어두운 배너·제품 화면 프레임)
  inverse-surface: "#171c34"    # [APP] 다크 테마 --surface-opaque
  inverse-ink: "#f1f5f9"        # [APP] 다크 테마 --foreground
  status-inprogress: "#4a74b5"  # [APP] --status-inprogress
  status-inprogress-bg: "rgba(74, 116, 181, 0.4)"  # [APP]
  # --- 랜딩 시안에서 가져온 맥락별 색 [IMG] (src/components/Landing.tsx의 C 상수와 같음) ---
  ctx-purple: "#8b5cf6"         # [IMG] 팀 정보·동료 평가·2단계. 앱 달력 범례의 '기타'(보라)와 같은 계열
  ctx-purple-tint: "#efe9ff"    # [IMG]
  ctx-green: "#16a34a"          # [IMG] 과제 완료·3단계
  ctx-green-tint: "#e6f7ec"     # [IMG]
  ctx-red: "#ef4444"            # [IMG] 마감·D-DAY 칩 (앱 달력 범례의 '마감'과 같은 계열)
  ctx-red-tint: "#fde8e8"       # [IMG]
  ctx-amber-tint: "#fff3df"     # [IMG] 일정 아이콘 바탕 (글자·아이콘은 accent #f59e0b)
  night-top: "#111a47"          # [IMG] 어두운 제품 화면 섹션 그라데이션 위
  night-bottom: "#2a215f"       # [IMG] 아래
  night: "#121629"              # [IMG] 창 프레임 상단바·푸터 (앱 다크 카드와 같음)

typography:
  # 무료 글꼴만 사용. Outfit(앱 기본)은 한글 글리프가 없으므로 한글은 Noto Sans KR로 떨어진다.
  # Asana의 TWK Lausanne, Slack의 SeolSansHeavy는 유료/전용이라 쓰지 않는다. 수치(크기·굵기·자간)만 참고한다.
  display-xl:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 102px           # [A] 실측 H1
    fontWeight: 300           # [A]
    lineHeight: 1.0
    letterSpacing: -2.55px    # [A] (-2.5%)
  display-lg:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 64px
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: -1.6px     # [D] -2.5% 환산
  display-md:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 48px            # [S] 실측 H1
    fontWeight: 400
    lineHeight: 1.10
    letterSpacing: -1.2px     # [D] -2.5% 환산 (Slack 실측 -2.4px는 헤비 글꼴 기준이라 완화)
  headline:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.20
    letterSpacing: -0.8px
  card-title:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.4px
  subhead:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 26px            # [A] 실측 히어로 부제
    fontWeight: 300           # [A]
    lineHeight: 1.35
    letterSpacing: 0
  body-lg:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 16px            # [S] 실측
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 12px            # [A] 실측 텍스트 링크
    fontWeight: 500
    lineHeight: 1.40
    letterSpacing: 0
  button:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 14px            # [A][S] 실측
    fontWeight: 500           # [A] 500. 굵게가 필요한 보조 강조만 700
    lineHeight: 1.20
    letterSpacing: 0
  button-lg:
    fontFamily: Outfit, Noto Sans KR, sans-serif
    fontSize: 20px            # [A] 실측 히어로 CTA
    fontWeight: 400
    lineHeight: 1.20
    letterSpacing: 0
  eyebrow:
    fontFamily: JetBrains Mono, monospace   # [APP] 앱이 소제목 라벨에 이미 사용 중
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.30
    letterSpacing: 1.5px
  mono:
    fontFamily: JetBrains Mono, monospace   # [APP]
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0

rounded:
  xs: 6px
  input: 10px                 # [APP] 입력창에 인라인으로 쓰는 값
  sm: 12px                    # [APP] --radius - 4px
  md: 16px                    # [APP] --radius
  lg: 24px                    # [APP] --radius + 8px
  xl: 32px                    # [APP] --radius + 16px
  pill: 100px                 # [A] Asana 버튼
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px                    # [A] 네비 버튼 좌우
  lg: 24px
  xl: 32px                    # [A] 히어로 CTA 좌우
  xxl: 48px
  section: 96px

shadow:
  card: "0 2px 16px rgba(74, 116, 181, 0.07), 0 1px 4px rgba(15, 18, 53, 0.05)"    # [APP] --shadow-card
  hover: "0 8px 32px rgba(74, 116, 181, 0.13), 0 2px 8px rgba(15, 18, 53, 0.07)"   # [APP] --shadow-hover
  primary-glow: "0 8px 32px rgba(74, 116, 181, 0.3)"                               # [APP] hero-banner-shadow

components:
  button-primary:             # 기본 CTA — Asana 알약형 + 앱 파랑
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 0 16px
    height: 44px
  button-primary-lg:          # 히어로 CTA
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: 16px 32px
    height: 64px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
  button-secondary:           # 보조 — 흰 면 + 외곽선 알약 (Asana '데모 보기', Slack '플랜 찾기' 위계)
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: 1px solid {colors.hairline-strong}
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 0 16px
    height: 44px
  button-secondary-lg:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: 1px solid {colors.hairline-strong}
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: 16px 32px
    height: 64px
  button-soft:                # 앱의 secondary 면 (연한 파랑)
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 0 16px
    height: 44px
  button-tertiary:            # 텍스트 링크
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
  button-on-dark:             # 어두운 배너 위 (앱 hero-banner-btn 방식)
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 0 16px
    height: 44px
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: 1px solid {colors.hairline}
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
    shadow: "{shadow.card}"
  product-screenshot-card:    # Slack식 앱 창 프레임
    backgroundColor: "{colors.inverse-canvas}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 16px
  testimonial-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    padding: 32px
  customer-logo-tile:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 16px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: 2px solid {colors.hairline}
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    padding: 8px 12px
  text-input-focused:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: 2px solid {colors.primary-focus}
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    padding: 8px 12px
  tab-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 6px 14px
  tab-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 6px 14px
  cta-banner:                 # 앱 hero-banner와 동일 계열
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: 48px
  status-badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  accent-badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  top-nav:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 68px              # [A] 실측
  footer:
    backgroundColor: "{colors.inverse-canvas}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.caption}"
    padding: 64px 32px
---

## Priority References (사용자 지정 기준 — 최우선)

**Asana와 Slack이 이 프로젝트의 1순위 디자인 기준이다.** 단, 사용자가 정한 분리 원칙이 있다.

| 영역 | 따르는 기준 |
|---|---|
| **색** | **앱(`src/index.css`)의 토큰이 기본값이다.** 단, 파랑에 고정하지 않는다. 시안 이미지는 구조·배치 기준이고 그 안의 색(파랑)은 구속력이 없다. 섹션·맥락에 맞는 색을 정해 쓰고, 쓴 색은 YAML에 `[IMG]`로 기록한다. |
| **형태·구조** | Asana·Slack을 따른다: 알약형 주 버튼, 가는 대형 헤드라인, 주/보조 버튼 위계, 히어로 정보 순서, 앱 창 프레임. |
| **글꼴** | **무료 글꼴만 쓴다.** TWK Lausanne(Asana), SeolSansHeavy(Slack)는 쓰지 않는다. 크기·굵기·자간 수치만 참고한다. |

참고 사이트 (2026-11-02 agent-browser로 직접 측정):

| | Asana — https://asana.com/ko | Slack — https://slack.com/intl/ko-kr/ |
|---|---|---|
| 인상 | 가볍고 여백이 넓음, "AI 팀 OS" | 정돈된 정석 SaaS 랜딩 |
| H1 | 102px / 굵기 300 / 자간 -2.55px | 48px / 헤비 전용 글꼴 / 자간 -2.4px |
| 부제 | 26px / 300 | 16px / 400 |
| 주 버튼 | 알약 100px, 높이 44(큰 것 64), 14px/500 | 사각 4px, 높이 44(큰 것 59), 14px/700 |
| 보조 버튼 | 흰 면 + 1px 외곽선, 알약 | 흰 면 + 외곽선, 사각 |
| 네비 높이 | 68px | — |
| 포인트 | H1 한 줄만 그라데이션 | 버튼 위주 |

### 가져올 것
- **Asana:** 크고 가는(300) 헤드라인 + 한 줄만 그라데이션 강조, 알약형 버튼, 점 격자 배경, 카드·연결선으로 "작업이 흐르는" 히어로 일러스트, 말하듯 쓰는 섹션 제목.
- **Slack:** 히어로 정보 순서(제목 → 한 줄 설명 → 주/보조 버튼 → 신뢰 로고 줄 → 제품 화면 미리보기), 채움/외곽선으로 나뉘는 버튼 위계, 제품을 앱 창 프레임에 담아 보여주기.
- **공통:** 첫 화면에 제품 장면이나 신뢰 요소를 넣는다. 주 버튼은 "시작하기", 보조 버튼은 "데모/자세히" 구성. 상단 내비는 제품·솔루션·요금·로그인 중심.

### 피할 것
- 쿠키 배너처럼 화면 하단 20%를 가리는 요소는 작게 만든다.
- 포인트 색을 여러 곳에 흩뿌리지 않는다. 파란 `primary`는 CTA·포커스·선택 상태, 앰버 `accent`는 배지·알림 같은 소수 지점에만 쓴다.

### 충돌 시 적용 규칙
1. 색 → 앱 토큰이 기본, 맥락에 맞으면 시안 색 사용 가능. 형태·구조 → Asana·Slack. 글꼴 → 무료 글꼴.
2. 색 선택 가드레일(자유롭되 지킬 것): 한 섹션의 채도색은 한 계열을 중심으로 하고, 글자 대비는 읽을 수 있게(본문 4.5:1 이상) 유지하며, 근거 없이 즉흥으로 만든 색은 쓰지 않는다(시안에서 가져오거나 `[D]` 파생). **새 글꼴은 만들지 않는다.**
3. 참고 사이트가 추가되면 이 표에 열을 더한다. 우선순위는 사용자가 명시한 순서를 따른다.

### 커스텀 영역 (토큰이 건드리지 않는 것)
사용자가 직접 바꾸는 테마 옵션은 커스텀 영역이다. 이 문서의 토큰으로 덮어쓰거나 통일하지 않는다.
- 프로필 테마, 아바타 프레임, 계정 뒷배경(색·그라데이션·사진), 카드 투명도·블러, UI 테마 프리셋, 다크 모드(`data-theme="dark"`)
- 구현 위치(참고): `src/lib/uiThemes.ts`, `src/lib/profileThemes.ts`, `src/lib/useAccountBackground.ts`, `src/lib/useMyProfileTheme.ts`, `src/components/avatarFrames/`
- 적용 방법: 이 토큰은 **기본값(사용자가 아무것도 고르지 않았을 때)**과 고정 UI(버튼·카드·내비)에만 쓴다. 사용자가 고른 값이 있으면 항상 그 값이 이긴다. 코드에서는 하드코딩 대신 앱 CSS 변수(`var(--primary)`, `var(--card)` 등)를 통해 쓴다.

---

## Overview

밝고 가벼운 협업 도구의 얼굴이다. 앱의 연한 인디고 배경(`canvas`) 위에 흰 카드(`surface`)를 올리고, 파란 `primary` 하나로 행동을 이끈다. 헤드라인은 크고 가볍게(굵기 300) 두어 무겁지 않게 하고, 버튼은 알약형으로 둥글게 한다. 화면의 주인공은 제품 장면이며, 색은 장식이 아니라 "눌러야 할 곳"을 알려 주는 용도로만 쓴다.

**핵심 특징**
- 색의 기본값은 앱 토큰: 배경 `#f3f5f9`, 글자 `#222a3a`, 포인트 `#4a74b5`, 보조 `#f59e0b`. 파랑에 고정하지 않고 맥락에 맞는 색을 쓸 수 있다.
- 헤드라인은 가늘고 크게(300), 자간은 -2.5% 안팎으로 조인다.
- 주 버튼은 파란 알약, 보조 버튼은 흰 면 + 외곽선 알약으로 위계를 분명히 한다.
- 히어로는 제목 → 부제 → 주/보조 버튼 → 신뢰 요소 → 제품 화면 순서.
- 그림자는 앱의 연한 파란 그림자(`shadow.card`)만 쓴다.
- 사용자 커스텀 테마는 항상 우선한다.

## Colors

### Brand & Accent
- **primary** `#4a74b5` — CTA, 선택 상태, 포커스 링, 링크. 한 화면에서 면적이 가장 큰 채도색이어야 한다.
- **primary-hover** `#4368a3` / **primary-pressed** `#3b5d91` — 상태 변화 전용.
- **accent** `#f59e0b` — 배지·알림처럼 소수 지점. 버튼 기본색으로 쓰지 않는다.
- **gradient-start → gradient-end** (`#4a74b5` → `#3b5d91`) — 히어로 헤드라인 **한 줄**에만 적용한다(Asana 방식).

### Surface
- **canvas** `#f3f5f9` — 페이지 배경(사용자가 배경을 바꾸지 않았을 때의 기본값).
- **surface** `#ffffff` — 카드, 입력창, 모달.
- **surface-muted** `#eef2f8` — 입력창 면, 옅은 구획.
- **secondary** `#e6eefa` — 연한 파란 면(소프트 버튼, 상태 배지).
- **hairline** `#e1e6ef` — 카드·입력 테두리. **hairline-strong** `#7b82a8` — 보조 버튼 외곽선.
- **inverse-canvas / inverse-surface** `#121629` / `#171c34` — 제품 화면 프레임, 푸터 등 어두운 면.

### Text
- **ink** `#222a3a` — 제목·본문. **ink-muted** `#4b566b` — 보조 설명(본문 대비 확보). **ink-subtle** `#7b82a8` — placeholder·비활성 전용이며 본문에 쓰지 않는다.
- 어두운 면 위 글자는 **inverse-ink** `#f1f5f9`.

### Semantic
- 진행 중: `status-inprogress` `#4a74b5`.
- 성공·경고·오류 색은 `index.css`에 전용 변수가 없어 이 문서에서 정하지 않았다(아래 Known Gaps 참고). 임의로 만들지 않고, 화면에서 필요해지면 그때 정한다.

## Typography

### Font Family
- **Outfit** — 영문·숫자 본문과 제목(앱 기본, 무료). 한글 글리프가 없다.
- **Noto Sans KR** — 한글(무료). Outfit 뒤 폴백으로 둔다: `Outfit, 'Noto Sans KR', sans-serif`.
- **JetBrains Mono** — 소제목 라벨·코드(앱에서 이미 사용).
- 쓰지 않는 것: TWK Lausanne, SeolSansHeavy, Linear Display/Text (모두 유료 또는 전용).

### Hierarchy
| 토큰 | 크기 | 굵기 | 용도 |
|---|---|---|---|
| display-xl | 102px | 300 | 데스크톱 히어로 H1 |
| display-lg | 64px | 300 | 섹션 대제목, 태블릿 히어로 |
| display-md | 48px | 400 | 일반 페이지 H1 |
| headline | 32px | 400 | 섹션 제목 |
| card-title | 22px | 600 | 카드 제목 |
| subhead | 26px | 300 | 히어로 부제 |
| body-lg / body / body-sm | 18 / 16 / 14px | 400 | 본문 |
| button / button-lg | 14px / 20px | 500 / 400 | 버튼 |
| caption | 12px | 500 | 보조 링크, 배지 |

### Principles
- 큰 제목일수록 가늘게(300), 작은 글자일수록 두껍게 한다.
- 제목 자간은 -2.5% 안팎으로 조이고, 본문은 0으로 둔다.
- 한글은 자간을 지나치게 조이지 않는다. Noto Sans KR 구간에서는 `display-xl`도 -1.5px 이내로 완화한다.
- 헤드라인 한 줄만 그라데이션 강조를 쓴다.

### Note on Font Substitutes
Asana·Slack의 실제 글꼴은 유료/전용이라 쓰지 않는다. 형태는 같게 만들 수 있다: 가는 굵기(300)와 조인 자간은 Outfit으로 재현되고, 한글은 Noto Sans KR의 300/400/500으로 처리한다. 앱의 `index.css` Google Fonts 가져오기에는 현재 Outfit·Fraunces·JetBrains Mono만 있으므로, 구현할 때 **Noto Sans KR을 추가로 불러와야** 한다(이 문서 작성 단계에서는 코드를 바꾸지 않았다).

## Layout

### Spacing System
`xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48 · section 96`. 카드 안쪽 여백은 24px, 섹션 사이는 96px(모바일 64px).

### Grid & Container
- 콘텐츠 폭은 중앙 정렬 컨테이너. 히어로 텍스트는 중앙 정렬(Slack), 장식 요소는 좌우로 흩어 배치(Asana).
- 카드 격자는 데스크톱 3열 → 태블릿 2열 → 모바일 1열.

### Whitespace Philosophy
여백이 곧 고급스러움이다. 히어로는 제목 위아래로 넉넉히 비우고, 한 화면에 메시지 하나만 둔다. 섹션 제목 → 설명 → 시각 자료의 3단 리듬을 반복한다.

## Elevation & Depth

- 카드: `shadow.card`(연한 파란 그림자) + `hairline` 테두리.
- 호버: `shadow.hover`로 한 단계 올린다.
- 강조 배너: `shadow.primary-glow`.
- 그림자는 위 세 가지만 쓴다. 겹겹이 쌓은 카드(카드 안의 카드 안의 카드)는 피한다.
- 사용자가 카드 투명도·블러(유리 효과)를 커스텀한 경우 그 설정이 이 표를 덮어쓴다.

### Decorative Depth
- Asana식 점 격자 배경, 카드를 잇는 가는 연결선은 히어로 한 곳에만 쓴다.
- 장식에 새 색을 쓰지 않는다. `hairline`, `secondary`, `primary` 투명도 조정만 허용한다.

## Shapes

### Border Radius Scale
`xs 6 · input 10 · sm 12 · md 16 · lg 24 · xl 32 · pill 100`.
- 버튼·탭·배지: `pill`.
- 카드·배너: `lg`(24px). 앱 창 프레임: `lg`.
- 입력창: `input`(10px, 앱 현재 값).

### Photography & Illustration Geometry
- 제품 화면은 어두운 프레임(`inverse-canvas`) 안에 넣고 모서리를 둥글게 한다(Slack식).
- 아바타·프로필은 커스텀 영역이므로 이 토큰으로 모양을 바꾸지 않는다.

## Components

### Buttons
- **주 버튼** `button-primary`: 파란 알약, 높이 44px, 14px/500. 히어로는 `button-primary-lg`(높이 64px, 20px/400, 좌우 32px).
- **보조 버튼** `button-secondary`: 흰 면 + 1px 외곽선 알약. 주 버튼 옆에 항상 한 쌍으로 둔다.
- **소프트 버튼** `button-soft`: 연한 파란 면. 덜 중요한 동작.
- **텍스트 링크** `button-tertiary`: 12px/500.
- **어두운 면 위** `button-on-dark`: 흰 면 + 파란 글자(앱 hero-banner 방식).
- 한 화면에 주 버튼은 하나만 둔다.

### Tabs
`tab-default`는 투명 + 보조 글자, `tab-selected`는 파란 면 + 흰 글자. 모양은 알약.

### Cards & Containers
- `feature-card`: 흰 면, 24px 여백, `hairline` 테두리, `shadow.card`.
- `product-screenshot-card`: 어두운 프레임에 제품 화면.
- `testimonial-card`: 32px 여백, 본문은 `body-lg`.
- `cta-banner`: 앱 hero-banner와 같은 파란 그라데이션 계열, 안에 `button-on-dark`.

### Inputs & Forms
`text-input`은 흰 면 + 2px `hairline` 테두리 + 10px 모서리. 포커스는 2px `primary-focus` 테두리. placeholder는 `ink-subtle`.

### Badges
`status-badge`(연한 파랑), `accent-badge`(앰버)는 알약. 앰버는 개수를 제한한다.

### Navigation
높이 68px, 투명 배경, 왼쪽 로고 → 제품·솔루션·요금 메뉴, 오른쪽 로그인 + 보조 버튼 + 주 버튼. 현재 위치 표시는 앱의 `--nav-active-*` 변수를 그대로 쓴다.

### Footer
어두운 면(`inverse-canvas`) + `inverse-ink` 글자, 12px.

## Do's and Don'ts

### Do
- 기본 색은 앱 토큰(`var(--primary)` 등)에서 가져오되, 섹션 분위기에 더 맞는 색이 시안에 있으면 그 색을 쓴다.
- 큰 제목은 가는 굵기와 조인 자간으로 쓴다.
- 주 버튼 + 보조 버튼 쌍으로 위계를 만든다.
- 히어로 순서를 지킨다: 제목 → 부제 → 버튼 → 신뢰 요소 → 제품 화면.
- 사용자 커스텀(배경·프로필·다크 모드)이 있으면 그것을 우선한다.

### Don't
- 참고 사이트의 색을 근거 없이 통째로 베끼지 않는다. 쓰려면 시안 이미지에서 확인하고 YAML에 기록한다.
- 유료 글꼴(TWK Lausanne 등)을 쓰지 않는다.
- 한 화면에 파란 주 버튼을 여러 개 두지 않는다.
- `ink-subtle`을 본문 글자색으로 쓰지 않는다(대비 부족).
- 앰버를 버튼 기본색으로 쓰지 않는다.
- 카드 안에 카드를 겹겹이 넣지 않는다.
- 사용자 선택 테마를 토큰 값으로 강제로 덮어쓰지 않는다.

## Responsive Behavior

### Breakpoints
앱이 Tailwind v4를 쓰므로 기본 구간을 따른다: `sm 640 · md 768 · lg 1024 · xl 1280`.

### Touch Targets
버튼 높이는 모바일에서도 44px 이상을 유지한다(`button-primary` 기준).

### Collapsing Strategy
- 히어로 H1: 102px(xl) → 64px(lg) → 48px(md) → 36px(모바일) 순으로 줄인다.
- 카드 격자: 3열 → 2열 → 1열.
- 내비: md 미만에서 메뉴를 접고 주 버튼만 남긴다.
- 히어로 장식(연결선·떠 있는 카드)은 모바일에서 숨기거나 하단으로 내린다.

### Image Behavior
제품 화면은 프레임 폭에 맞춰 비율을 유지하며 줄어든다. 가로 스크롤이 생기지 않아야 한다.

## Iteration Guide

1. 새 화면은 먼저 히어로 순서와 주/보조 버튼 쌍을 잡는다.
2. 색은 앱 토큰을 기본으로 하되 파랑에 얽매이지 않는다. 시안은 구조·배치 기준으로만 읽고, 색은 맥락에 맞게 정해 YAML에 `[IMG]`로 기록한다.
3. 완성되면 사용자가 눈으로 확인하고 수정한다. 수정 요청은 이 문서의 YAML 토큰부터 고치고, 그 뒤에 화면에 반영한다.
4. 참고 사이트가 늘면 `Priority References` 표에 열을 추가한다.

## Known Gaps

- **성공·경고·오류 색:** 정의하지 않았다. `src/index.css`에 전용 변수가 없으며(확인함), 컴포넌트 안에 개별로 쓰인 값이 있을 수 있다. 필요해지면 사용자와 정한다.
- **Noto Sans KR 로딩:** `index.css`에 아직 없다. 구현 단계에서 추가해야 한다.
- **그라데이션 강조 색:** 앱의 파랑 두 톤(`#4a74b5` → `#3b5d91`)으로 대체했다. Asana처럼 눈에 띄는 대비를 원하면 사용자 확인 후 조정한다.
- **디자인 토큰의 다크 모드:** 앱에 다크 모드가 있으나 커스텀 영역이라 이 문서는 라이트 기본값만 정의한다.
- **측정하지 않은 값:** 위 YAML에서 `[D]`로 표시한 자간·크기(`display-lg` 등)는 실측이 아니라 환산값이다.
- **아이콘·일러스트:** 아직 정의하지 않았다.
