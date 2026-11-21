# 의존성·외부 도구 주소

버전은 `package.json`, `server/package.json`에 적힌 범위 기준이다. 패키지 페이지는 `https://www.npmjs.com/package/<이름>` 형식이다.

## 프런트엔드 (`package.json`)

| 패키지 | 용도 | 주소 |
|---|---|---|
| react, react-dom (^19) | 화면 | https://react.dev |
| react-router-dom (^7) | 라우팅 | https://reactrouter.com |
| vite (^8), @vitejs/plugin-react | 개발 서버·빌드 | https://vite.dev |
| tailwindcss, @tailwindcss/vite (^4) | 스타일 | https://tailwindcss.com |
| typescript (^5) | 타입 검사 | https://www.typescriptlang.org |
| yjs (^13), y-protocols | 공동 편집 동기화 | https://yjs.dev |
| @tiptap/* (^3) | 문서 편집기 | https://tiptap.dev |
| pdfjs-dist (6.3.289) | PDF 보기 | https://mozilla.github.io/pdf.js |
| docx, pptxgenjs, jspdf, html2canvas, officeparser, cheerio | 문서 변환·내보내기 | https://www.npmjs.com/package/docx · /pptxgenjs · /jspdf · /html2canvas · /officeparser · /cheerio |
| @electric-sql/pglite (^0.5, 개발용) | 테스트용 DB | https://pglite.dev |

## 서버 (`server/package.json`)

| 패키지 | 용도 | 주소 |
|---|---|---|
| @nestjs/common, core, platform-express (^12) | 서버 프레임워크 | https://nestjs.com |
| pg (^8) | PostgreSQL 연결 | https://node-postgres.com |
| jose, bcryptjs | 로그인 토큰·비밀번호 해시 | https://www.npmjs.com/package/jose · /bcryptjs |
| ws | 실시간(WebSocket) | https://www.npmjs.com/package/ws |
| web-push | 웹 푸시(VAPID) | https://www.npmjs.com/package/web-push |
| nodemailer, sanitize-html, class-validator, class-transformer, rxjs, reflect-metadata, http-proxy-middleware | 메일·검증·기타 | https://www.npmjs.com/package/<이름> |

## 코드 실행·배포 도구

| 도구 | 용도 | 주소 |
|---|---|---|
| Pyodide 0.26.4 | 브라우저 Python 실행 | https://pyodide.org · CDN `https://cdn.jsdelivr.net/pyodide/v0.26.4/full/` |
| Docker | C·C++·Java 실행 샌드박스 | https://docs.docker.com |
| alpine:3.20 + gcc, g++, musl-dev | C·C++ 이미지(`talju-run-native`) | https://hub.docker.com/_/alpine |
| eclipse-temurin:21-jdk-alpine | Java 이미지 | https://hub.docker.com/_/eclipse-temurin |
| PostgreSQL | 데이터베이스 | https://www.postgresql.org |
| pnpm | 패키지 관리(npm install 금지) | https://pnpm.io |
| Vercel | 프런트 배포 | https://vercel.com/docs |
| Cloudflare quick tunnel | 서버 공개 주소(임시) | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/ |
| Playwright | 브라우저 시험 | https://playwright.dev |

주소는 각 프로젝트의 공식 사이트를 기준으로 적었고, 이번에 하나씩 열어 확인하지는 않았다.
