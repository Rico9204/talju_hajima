# 코드 실행 (워크스페이스 "바로 수정" 창)

코드 파일을 열었을 때 **파일을 만들거나 설치하지 않고, 결과(출력)만 바로** 보는 기능이다. 코드는 서버나 외부 서비스로 보내지 않고
**내 브라우저 안**에서 실행한다. 구현은 `src/lib/codeRunner.ts`, 화면은 `src/components/CodeRunPanel.tsx`와 `QuickEditModal.tsx`.

## 실행할 수 있는 언어

| 언어 | 파일 확장자 | 실행 환경 | 비고 |
|---|---|---|---|
| JavaScript | `.js` `.mjs` `.cjs` | 브라우저 Web Worker | top-level `await` 가능, `import`/`export`(모듈)는 불가 |
| Python 3.12 | `.py` | Pyodide 0.26.4 (WebAssembly) | 표준 라이브러리만. 처음 한 번 실행 환경(약 10MB)을 CDN에서 받아 몇 초 걸린다 |

## 실행할 수 없는 언어 (색칠(하이라이트)만 되고 실행 버튼은 없다)

TypeScript(`.ts` `.tsx`), JSX(`.jsx`), Java, C, C++, C#, Kotlin, Go, Rust, Swift, PHP, Ruby, Shell(`.sh` `.bash`), SQL,
HTML·CSS·XML(실행 대신 미리보기도 없음), JSON·YAML·Markdown·텍스트.

> 컴파일이 필요한 언어(Java, C 계열, Go, Rust 등)는 브라우저 안에서 돌릴 수 없어, 지원하려면 코드를 실행하는 별도 서버나
> 외부 실행 서비스가 필요하다. 임의 코드를 서버에서 실행하는 것은 보안 부담이 커서 지금은 하지 않았다.

## 사용법

- 코드 파일을 더블클릭해 "바로 수정" 창을 열고, 위쪽 초록색 **▶ 실행** 버튼(또는 `Ctrl/⌘ + Enter`)을 누른다.
- **저장하지 않은 편집 내용 그대로** 실행한다. 결과는 같은 창 아래 "실행 결과" 패널에 나오고, 오류는 빨간 글씨로 나온다.
- 실행 중에는 **중지** 버튼으로 끊을 수 있고, **다시 실행 / 지우기 / 닫기**가 있다.

## 출력과 제한

| 항목 | 내용 |
|---|---|
| 출력 | JavaScript: `console.log/info/debug` → 일반 출력, `console.warn/error` → 오류(빨간색). Python: `print` → 일반 출력, `sys.stderr`·예외 → 오류 |
| 실행 시간 | JavaScript 10초, Python 20초를 넘기면 중단("시간 초과"). 무한 루프도 이때 끊기고 화면은 멈추지 않는다 |
| 실행 환경 준비 | Python 첫 실행의 내려받기는 최대 90초까지 기다린다(인터넷 필요) |
| 출력 길이 | 약 20만 글자를 넘으면 잘라서 중단한다 |
| 입력 | 지원하지 않는다(`input()`은 바로 EOF 오류) |
| 상태 | 실행할 때마다 새 환경이다(Python은 전역 변수를 새로 만들고, 이전 실행의 변수는 남지 않는다) |
| 모듈 | JavaScript는 `import`/`export` 불가. Python은 표준 라이브러리만(설치형 패키지 `numpy` 등은 현재 불가) |

## 보안

- 코드는 `sandbox="allow-scripts"` iframe 안의 Worker에서 실행한다. 출처가 고유해서 **이 사이트의 쿠키·저장소·로그인 정보에 접근할 수 없다**.
- JavaScript는 `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `Worker` 등을 막는다(네트워크 접근 불가).
- Python은 실행 환경을 내려받아야 해서 네트워크 API를 막지 않았다(로그인 정보는 위 샌드박스 때문에 어차피 쓸 수 없다).
  외부로 요청을 보내는 코드를 막으려면 Python 쪽에도 네트워크 차단을 추가해야 한다.
- 시간 초과·중지·출력 초과 시 iframe 전체를 제거해 실행 중인 코드를 확실히 멈춘다.

## 확인한 내용

브라우저 시나리오 점검: JS 출력/오류 구분, 저장 전 편집 내용 실행(`Ctrl+Enter`), 무한 루프 시간 초과, Python 출력과 예외,
JS 샌드박스(`fetch`·`document`·`localStorage`·`window`가 정의되지 않음), 운영 빌드(압축된 번들)와 배포 사이트에서의 동작.

## 확장하려면

- 언어 추가: `RUNNABLE_BY_EXT`에 확장자를 넣고, 해당 언어의 Worker 실행 코드를 추가한다(예: TypeScript는 타입을 제거하는 변환기를 추가하면 JavaScript로 실행 가능).
- Python 패키지: Pyodide의 `loadPackage`로 `numpy` 같은 패키지를 불러오도록 Worker를 확장한다(크기가 커서 실행 시작이 느려진다).
