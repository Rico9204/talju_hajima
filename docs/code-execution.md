# 코드 실행 (워크스페이스 "바로 수정" 창)

코드 파일을 열었을 때 **파일을 만들거나 설치하지 않고, 결과(출력)만 바로** 보는 기능이다.
화면은 `src/components/CodeRunPanel.tsx`·`QuickEditModal.tsx`, 실행기는 `src/lib/codeRunner.ts`(브라우저)와 `server/src/coderun.ts`(서버).

## 실행할 수 있는 언어

| 언어 | 파일 확장자 | 어디서 실행하나 | 비고 |
|---|---|---|---|
| JavaScript | `.js` `.mjs` `.cjs` | 내 브라우저(Web Worker) | top-level `await` 가능, `import`/`export`(모듈)는 불가 |
| Python 3.12 | `.py` | 내 브라우저(Pyodide, WebAssembly) | 표준 라이브러리만. 처음 한 번 실행 환경(약 10MB)을 CDN에서 받아 몇 초 걸린다 |
| C | `.c` | **서버**의 일회용 Docker 컨테이너 | gcc(C17), `-lm` 포함. 파일 하나(`main.c`)로 컴파일 |
| Java 21 | `.java` | **서버**의 일회용 Docker 컨테이너 | 공개 클래스 이름으로 파일을 만든다. 공개 클래스가 없으면 `main`이 있는 클래스, 그것도 없으면 `Main` |

## 실행할 수 없는 언어 (색칠(하이라이트)만 되고 실행 버튼은 없다)

TypeScript(`.ts` `.tsx`), JSX(`.jsx`), C++, C#, Kotlin, Go, Rust, Swift, PHP, Ruby, Shell, SQL, HTML·CSS·XML, JSON·YAML·Markdown·텍스트.
(C++ 등은 컨테이너 이미지에 컴파일러를 추가하면 같은 방식으로 늘릴 수 있다.)

## 사용법

- 코드 파일을 더블클릭해 "바로 수정" 창을 열고, 위쪽 초록색 **▶ 실행** 버튼(또는 `Ctrl/⌘ + Enter`)을 누른다.
- **저장하지 않은 편집 내용 그대로** 실행한다. 결과는 같은 창 아래 "실행 결과" 패널에 나오고, 오류는 빨간 글씨로 나온다.
- C·Java는 컴파일 오류가 나면 "✗ 컴파일 오류"와 컴파일러 메시지를 보여 준다.
- 실행 중에는 **중지** 버튼으로 끊을 수 있고, **다시 실행 / 지우기 / 닫기**가 있다.

## 출력과 제한

| 항목 | JavaScript·Python | C·Java |
|---|---|---|
| 출력 | `console.log/info/debug`·`print` → 일반, `console.warn/error`·`sys.stderr`·예외 → 오류(빨간색) | `stdout` → 일반, `stderr`(컴파일 오류·예외 포함) → 오류(빨간색). 실행이 끝난 뒤 한꺼번에 보여 준다(실시간 아님) |
| 실행 시간 | JavaScript 10초, Python 20초 | 프로그램 실행 10초(컴파일 제외), 컴파일 포함 전체 C 25초·Java 40초 |
| 메모리 | 브라우저 제한 | C 128MB, Java 512MB(힙 128MB) |
| 출력 길이 | 약 20만 글자까지 | 약 20만 글자까지(넘으면 중단) |
| 입력 | 지원하지 않음 | 지원하지 않음(표준입력은 비어 있어 `scanf`·`Scanner`는 바로 끝을 읽는다) |
| 상태 | 실행할 때마다 새 환경 | 실행할 때마다 새 컨테이너 |
| 모듈 | JS는 `import`/`export` 불가, Python은 표준 라이브러리만 | C는 표준 라이브러리, Java는 JDK 기본 클래스 |

## 서버 실행(C·Java) 설정

C·Java는 임의의 코드를 서버에서 실행하는 기능이라 **기본은 꺼져 있다**. 켜려면:

1. 서버 PC에 Docker가 실행 중이어야 한다.
2. 실행용 이미지를 한 번 준비한다.
   ```bash
   docker build -t talju-run-c -f server/sandbox/c.Dockerfile server/sandbox
   docker pull eclipse-temurin:21-jdk-alpine
   ```
3. `server/.env`에 `CODE_RUNNER=docker`를 넣고 서버를 다시 시작한다(이미지 이름을 바꾸려면 `CODE_RUNNER_IMAGE_C`, `CODE_RUNNER_IMAGE_JAVA`).

꺼져 있거나 Docker·이미지가 없으면 실행 버튼은 보이지만, 누르면 서버가 안내 메시지를 돌려준다.
`GET /api/code/status`로 켜져 있는지 확인할 수 있다.

## 보안

**JavaScript·Python (브라우저)**
- 코드는 `sandbox="allow-scripts"` iframe 안의 Worker에서 실행한다. 출처가 고유해서 **이 사이트의 쿠키·저장소·로그인 정보에 접근할 수 없다**.
- JavaScript는 `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `Worker` 등을 막는다.
- Python은 실행 환경을 내려받아야 해서 네트워크 API를 막지 않았다(로그인 정보는 위 샌드박스 때문에 어차피 쓸 수 없다).
- 시간 초과·중지·출력 초과 시 iframe 전체를 제거해 실행 중인 코드를 확실히 멈춘다.

**C·Java (서버, Docker 컨테이너)** — 임의 코드를 돌리는 만큼 겹겹이 막는다.
- 컨테이너: **네트워크 없음**, 메모리·프로세스 수(C 64, Java 256)·파일 크기(32MB)·CPU 제한, **읽기 전용 파일시스템**(작업 폴더만 쓰기, 48MB),
  모든 권한 제거, 일반(비루트) 사용자, 새 권한 획득 금지, 호스트 폴더 연결 없음, 끝나면 컨테이너 삭제. 이미지는 내려받지 않는다(`--pull never`).
- 코드는 명령줄이 아니라 **표준입력**으로만 전달한다. 클래스 이름은 식별자 규칙에 맞는 값만 환경변수로 넘긴다(셸에 끼어들 수 없다).
- 컴파일 오류 판별용 표시(marker)는 실행마다 무작위이고 실행되는 프로그램이 읽을 수 없어, 출력으로 흉내 낼 수 없다.
- 로그인한 사용자만, **사용자당 동시 1개·분당 20번, 서버 전체 동시 3개**. 시간 초과·중지·연결 끊김·출력 초과면 컨테이너를 강제 종료한다.
- 남는 위험: 컨테이너 격리는 완벽하지 않다(커널 취약점 등). 서버 PC에는 중요한 개인 파일을 두지 않는 것이 안전하고, 필요 없으면 `CODE_RUNNER`를 끄면 된다.

## 확인한 내용

- 브라우저 시나리오: JS·Python·C·Java 출력, 컴파일 오류, 저장 전 편집 내용 실행(`Ctrl+Enter`), 무한 루프 시간 초과, 중지 버튼(서버 컨테이너까지 종료), 자동 들여쓰기.
- 실제 Docker 공격 시험: 포크 폭탄(프로세스 수 제한), 메모리 폭탄, 무한 루프, 네트워크 접속(차단), 루트 파일시스템 쓰기(차단), 32MB 초과 파일 쓰기(차단),
  환경변수 엿보기(불가), 과도한 출력(중단), 스택 오버플로, 비루트 사용자 확인. 실행 뒤 남은 컨테이너 없음.
- 서버 테스트(`server/test/code-run.test.mjs`): 가짜 Docker로 안전 옵션, 인증·검증, 컴파일 오류 구분, 한도, 중지, 동시·횟수 제한.

## 확장하려면

- 언어 추가: 브라우저 언어는 `RUNNABLE_BY_EXT`와 Worker 코드를, 서버 언어는 `server/src/coderun.ts`의 `SCRIPTS`·이미지·확장자 목록을 늘린다.
  (예: C++는 이미지에 `g++`를 추가하고 `SCRIPTS`에 컴파일 명령을 넣는다. TypeScript는 타입을 제거하는 변환기를 브라우저에 추가하면 된다.)
- Python 패키지: Pyodide의 `loadPackage`로 `numpy` 같은 패키지를 불러오도록 Worker를 확장한다(크기가 커서 첫 실행이 느려진다).
