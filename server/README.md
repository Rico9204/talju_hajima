# API 서버 (server/) — Supabase 없이 직접 구현하는 백엔드

로그인·DB 접근·권한을 이 서버가 직접 맡는다. DB는 **일반 PostgreSQL**(Supabase 불필요).
현재: 인증·파일 저장소·실시간을 포함한 모든 `DataRepository` 기능을 자체 서버가 제공한다.

## 구조
```
브라우저 ──(이 서버가 발급한 토큰)──▶ API 서버(NestJS) ──(요청마다 그 사용자로: set local role authenticated + auth.uid())──▶ PostgreSQL
```
- **DB**: `db/bootstrap.sql`이 Supabase가 제공하던 최소 기반(역할, `auth.users`, `auth.uid()`, storage·realtime 표)을
  우리 것으로 만들고, 그 위에 기존 `supabase/schema.sql`을 그대로 올린다 → 표·DB 함수 111개·권한 규칙(RLS) 114개를 재사용.
- **권한**: 서버 코드에 다시 짜지 않는다. 트랜잭션마다 역할을 `authenticated`로 내리고 `auth.uid()`를 채우므로
  권한 규칙과 DB 함수의 검사·한국어 안내가 그대로 적용된다(`src/db.ts`).
- **로그인**(`src/auth.ts`): 가입·로그인·토큰 갱신·로그아웃을 직접 한다. bcrypt 해시(Supabase `auth.users`와 같은 형식이라
  기존 계정을 비밀번호 그대로 옮길 수 있음), 액세스 토큰 1시간 + 리프레시 토큰 30일(해시로만 저장, 1회용).
  리프레시 토큰은 응답 본문이 아니라 **httpOnly 쿠키**(`talju_refresh`, `Path=/api/auth`)로만 주고, 화면은 액세스 토큰을 메모리에만 둔다.
  쿠키를 쓰거나 심는 요청(login·refresh·logout)은 `CORS_ORIGIN`의 출처만 받는다(CSRF).
  화면과 서버가 다른 사이트면 `COOKIE_SAMESITE=none` — Safari처럼 제3자 쿠키를 막는 브라우저에서는 새로 고침마다 다시 로그인해야 하므로,
  운영에서는 같은 사이트(예: `app.example.com` ↔ `api.example.com`)로 두는 것을 권장.
  남용 제한은 계정을 잠그지 않고: 같은 IP+이메일 실패 15분 5회, 같은 IP 실패 15분 30회, 같은 IP 가입 1시간 10회.
  비밀번호는 bcrypt 한계인 72**바이트** 기준으로 검사(한글 약 24자). 프록시 뒤라면 `TRUST_PROXY` 설정.
- **응답 형식**: 행을 DB에서 JSON으로 만들어 돌려준다(지금 프론트가 받는 PostgREST 응답과 같은 모양).

## Temporary_Merge(zsx12 님 NestJS)에서 가져온 것 / 고친 것
| 가져옴 | 고침 |
|---|---|
| NestJS 모듈·컨트롤러 구조 | — |
| bcrypt 가입·로그인, `JwtAuthGuard`·`@CurrentUser` 패턴(→ `AuthGuard`·`@UserId`) | 서명 키 기본값 없음(32자 미만이면 시작 거부), 토큰 1일 → 1시간 + 1회용 리프레시 토큰 |
| 로그인 실패 제한 | 계정 잠금(남이 일부러 잠글 수 있음) → IP+이메일 단위 제한, 없는 이메일도 같은 시간 소요 |
| 전역 `ValidationPipe(whitelist)` | 정의하지 않은 필드는 **거부**(`forbidNonWhitelisted`) |
| 프로젝트 참여자 검사(`assertMembership`) | 서버 코드 대신 기존 권한 규칙(RLS)·DB 함수가 검사(한 곳에서만 관리) |
| — | `synchronize`·자체 표 정의 없음, 표는 `schema.sql`·`migrations/`로만 관리 |
| — | 운영에서 CORS 전체 허용 금지, DB 오류 내용은 응답에 노출하지 않음 |

## 실행
```bash
docker compose -f server/docker-compose.yml up -d     # 로컬 PostgreSQL (또는 아무 PostgreSQL 16+)
cd server
pnpm install --ignore-workspace                       # pnpm만 사용
cp .env.example .env                                  # JWT_SECRET 채우기
pnpm run db:setup                                     # 새 DB에 bootstrap.sql + schema.sql (한 번)
pnpm run dev                                          # http://localhost:3000/api/health
```

## 테스트

초기화가 `app_settings does not exist`로 중단된 이전 버전의 빈 DB는 `pnpm run db:setup --resume-empty`로 복구한다. 이 모드는 사용자·public 테이블에 데이터가 있거나 `app_text_settings`가 이미 존재하면 중단한다. 기존 운영 DB에는 사용하지 않는다. 초기화 연결은 함수의 전방 참조를 허용하며 스키마 자체의 트랜잭션 구간을 사용한다.
`pnpm test` — PGlite(PostgreSQL)에 `bootstrap.sql` → `schema.sql`을 올리고 실제 Nest 앱을 HTTP로 호출한다.
토큰은 실제 가입·로그인 API로 받는다(가짜 없음). 바꿔 끼우는 것은 DB 연결뿐.

## API
모든 경로 앞에 `/api`. `health`와 `auth/signup·login·refresh·logout`만 로그인 없이, 나머지는 `Authorization: Bearer <accessToken>`.
응답은 화면이 쓰는 객체 모양 그대로(`src/api/types.ts`의 `Project`·`Member`·`Task`… — 변환 함수는 `src/mappers.ts`).
오류는 `{ message }`(DB 함수의 한국어 안내 그대로). 작성자·팀원 신원(이름·아바타·팀원 id)은 요청 값이 아니라 로그인한 사용자로 서버가 정한다.

| 영역 | 경로 (→ `DataRepository` 메서드) |
|---|---|
| 로그인 | `POST auth/signup` · `POST auth/login` · `POST auth/refresh` · `POST auth/logout` · `GET auth/me` |
| 내 계정 | `GET me/is-admin` · `GET me/is-operator` · `GET me/project-ids` · `GET me/project-alerts` · `GET me/evaluation-summary` · `PATCH me/profile` · `GET me/admin-application` · `GET me/workspace-cleanup-projects` |
| 프로젝트 | `GET/POST projects` · `GET/DELETE projects/:id` · `POST projects/:id/{approve,reject,complete,transfer-leadership}` · `POST projects/:id/join`(본문에 참여 코드 필수) · `GET projects/:id/team?admin=true` · `POST projects/:id/sections/:section/viewed` |
| 참여 코드 | `GET projects/:id/join-code`(팀원만, 6시간 지나면 새로 발급) · `POST projects/:id/join-code/rotate`(팀장·부팀장) · `GET join-codes/:code`(참여 전 확인, 프로젝트 id로는 찾지 않음) |
| 팀원 | `PUT members/:id/vice-leader` · `DELETE members/:id`(제외) · `POST members/:id/presence` · `GET users/:userId/participation-stats` |
| 평가 | `GET/PUT evaluation-mode` · `GET/POST projects/:id/evaluations/:phase` |
| 관리자·운영자 | `GET admins/search?q=` · `GET admin/applications` · `POST admin/applications/:id/review` · `GET admin/accounts` · `DELETE admin/accounts/:userId` |
| 워크스페이스 | `GET/POST projects/:id/folders` · `DELETE workspace/folders/:id` · `GET projects/:id/files` · `DELETE workspace/files/:id` · `POST workspace/files/:id/move` · `PUT workspace/files/:id/tags` · `POST workspace/files/:id/versions/:vid/promote` · `PUT workspace/files/:id/versions/:vid/pinned` · `PUT workspace/versions/:vid/text` · `POST workspace/files/:id/comments` · `PUT workspace/comments/:id/reaction` · `GET projects/:id/workspace-cleanup` |
| 과제 | `GET/POST projects/:id/tasks` · `PUT tasks/:id/status` · `PATCH/DELETE tasks/:id` · `PUT tasks/:id/schedule-link` · `POST tasks/:id/checklist` · `PUT checklist/:itemId` · `POST tasks/:id/comments` · `PUT task-comments/:id/reaction` |
| 일정 | `GET/POST projects/:id/schedule` · `PATCH/DELETE schedule/:id` · `GET me/upcoming-events`(메인 화면: 내 모든 프로젝트의 오늘 이후 일정) |
| 채팅 | `GET/POST projects/:id/chat/:channel/messages` · `POST projects/:id/chat/read` · `PUT projects/:id/chat/messages/:mid/reaction` · `GET/POST projects/:id/chat-groups` · `POST chat-groups/:gid/members` · `POST projects/:id/chat/:channel/tools` · `POST chat/messages/:mid/tool-actions` · `GET projects/:id/chat-tool-events` |
| 게시판 | `GET/POST board/posts` · `PATCH/DELETE board/posts/:id` · `POST board/posts/:id/views` · `PUT board/posts/:id/like` · `GET board/posts/:id/content` · `GET/POST board/posts/:id/comments` · `DELETE board/comments/:id` · `POST board/polls/:id/{votes,close}` · `GET/POST board/posts/:id/reports` · `GET board/reports` · `POST board/reports/:id/review` |
| 전공 조회 | `GET majors?school=` |
| 평가 상위 % | `GET me/evaluation-percentiles?projectId=&memberId=` |
| 캠퍼스 소식 스크랩 | `GET me/scrapped-notices` · `POST me/scrapped-notices/toggle` (소식 목록은 로그인 없이 쓰는 Vercel 함수 `api/campus-notices.js`, 개발 서버는 `vite.config.ts`) |
| 오피스 편집 | `GET onlyoffice/status` · `GET workspace/files/:id/onlyoffice`(편집기 설정, 서버 서명) · `GET onlyoffice/raw?token=`·`POST onlyoffice/callback?token=`(문서 서버 전용) · `/onlyoffice/*`(문서 서버 중계, /api 밖) |
| 웹 푸시 구독 | `POST me/push-subscriptions` · `POST me/push-subscriptions/delete` |
| 기타 | `GET health` |

파일은 서버 디스크(`STORAGE_DIR`)에 저장한다. 서버를 여러 대로 늘릴 때만 공유 파일 저장소로 바꾸면 된다. 실시간은 `/realtime` WebSocket으로 제공하며, 채팅·읽음·반응·과제·일정·파일·접속 상태·동시 편집을 전달한다.

**기존 동작 그대로 둔 알려진 문제**(서버가 같은 DB 함수·권한 규칙을 쓰므로 동일, 테스트에 명시):
- (해결) 팀장 위임은 이제 팀원 id(`targetMemberId`, DB 함수 `transfer_leadership_to_member`)로 찾는다. 예전 방식 `targetName`(참여 당시 이름 `members.name`으로 찾음)은 예전 화면을 위해 남겨 두었다.
- 프로필은 본인·같은 프로젝트 팀원·관리자만 읽을 수 있어, 게시판에서 프로젝트를 함께하지 않는 사람의 글·댓글·신고 작성자가 "탈퇴한 사용자"/"알 수 없음"으로 보인다.

## 웹 푸시(브라우저를 닫아도 알림)
DB 트리거(`push_to_members`)는 Supabase에서 pg_net으로 Vercel 함수에 보내던 것을, 이 서버에서는 `db/realtime.sql`의 같은 이름 함수 `net.http_post`가 `net.push_outbox`에 쌓고 `pg_notify('talju_push')`로 알린다.
서버(`src/push.ts`)가 받아 브라우저 푸시 서비스로 보내고, 끊긴 구독은 지운다. `server/.env`에 `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`를, 프런트에 같은 공개키를 `VITE_VAPID_PUBLIC_KEY`로 넣는다.
키가 없으면 서버가 `push_config`를 비워 트리거가 아무것도 하지 않는다(사이트를 열어 둔 동안의 알림은 그대로).

**이미 쓰던 서버 DB**에는 `supabase/migrations/`의 새 파일(`2609262310_campus_notices.sql`, `2610011200_evaluation_percentiles.sql`, `2610011300_web_push.sql`)을 순서대로 적용한 뒤 `server/db/realtime.sql`을 다시 실행한다(여러 번 실행해도 안전).

## 오피스 편집(OnlyOffice, 선택)
워드·엑셀·PPT(docx·xlsx·pptx)를 앱 안에서 여러 명이 함께 편집한다. 공동편집은 OnlyOffice 문서 서버가 하고, 이 서버(`src/onlyoffice.ts`)는
편집기 설정 서명, 원본 제공(링크 토큰), 저장 콜백(문서 서버 서명 확인 → 워크스페이스 새 버전, 검색용 글자도 추출)만 한다.
문서 서버는 이 서버의 `/onlyoffice/` 아래로 중계해 ngrok 주소 하나로 쓴다(`X-Forwarded-Host: <공개 주소>/onlyoffice`).

1. `server/.env`에 `ONLYOFFICE_URL=http://127.0.0.1:8080`, `ONLYOFFICE_JWT_SECRET=<32자 이상>`
2. `docker compose -f server/docker-compose.yml --profile office up -d` (문서 서버, 메모리 2~4GB)
3. 서버 재시작. 화면은 버전 패널에 "오피스에서 편집" 버튼이 생긴다(설정이 없으면 안 보임).

문서 서버는 원본·저장을 `PUBLIC_BASE_URL`(ngrok)로 이 서버에 요청한다(다르게 하려면 `ONLYOFFICE_CALLBACK_BASE_URL`).
무료 ngrok은 브라우저에 경고 페이지를 먼저 보여 줘서, 편집 화면(iframe)에 경고가 보이면 사용자가 **Visit Site**를 한 번 눌러야 한다
(편집기 스크립트는 서비스 워커가 우회). Safari처럼 다른 사이트 쿠키를 막는 브라우저에서는 열리지 않을 수 있다 — 고정 도메인을 쓰면 사라지는 제약.
자동 저장 중에 새로 연 사람이 같은 세션에 합류하도록 세션 키를 서버 메모리에 둔다(서버를 다시 켜면 새 세션으로 열림, 저장 내용은 모두 버전으로 남음).

## 이메일
가입 확인과 비밀번호 재설정은 메일러를 통해 처리한다. 개발에서는 콘솔에 링크를 출력하고, 운영에서는 SMTP 설정이 필수다.

프런트에는 `VITE_API_URL=https://서버주소/api`를 설정한다. 공개 주소가 ngrok라면 `PUBLIC_BASE_URL`에도 같은 ngrok 주소를 넣고 `CORS_ORIGIN`에는 프런트 주소를 넣는다.

## 백업과 복구

운영 데이터는 이 PC의 Docker 볼륨(DB)과 `STORAGE_DIR`(업로드 파일)에만 있다. 정기적으로 백업한다.

```bash
cd server
pnpm run backup        # 또는: node --env-file-if-exists=.env scripts/backup.mjs
```
- DB: `db` 컨테이너 안에서 `pg_dump`(PC에 PostgreSQL 설치 불필요) → `backups/talju_<시각>.dump`. 받은 파일을 `pg_restore --list`로 다시 읽어 확인한다.
- 업로드 파일: `backups/storage_<시각>.tar.gz`.
- 최근 `BACKUP_KEEP`(기본 14)번만 남기고, 결과는 `backups/backup.log`에 남는다. 실패하면 종료 코드 1.
- 기본 위치 `server/backups`는 OneDrive 폴더 안이라 클라우드에도 사본이 생긴다(PC가 고장 나도 남음). 다른 곳에 두려면 `BACKUP_DIR`.
- Docker Desktop과 DB 컨테이너가 켜져 있어야 한다.

**매일 자동 실행(Windows 작업 스케줄러)**: 예) 매일 새벽 4시
```powershell
schtasks /Create /TN "Slackerspace DB 백업" /SC DAILY /ST 04:00 /TR "cmd /c cd /d \"<server 폴더>\" && node --env-file-if-exists=.env scripts\backup.mjs"
```
PC가 켜져 있고 로그인한 상태에서만 실행된다(꺼져 있던 날은 건너뜀). 결과는 `backup.log`로 확인한다.

**복구**(새 DB에 먼저 풀어 보고 확인한 뒤 바꾸는 것을 권장):
```bash
# 1) 서버를 끈다(Ctrl+C)
# 2) DB: 기존 talju DB를 지우고 백업으로 다시 만든다
docker compose -f server/docker-compose.yml exec -T db dropdb -U postgres talju
docker compose -f server/docker-compose.yml exec -T db createdb -U postgres talju
docker compose -f server/docker-compose.yml exec -T db pg_restore -U postgres -d talju --no-owner < server/backups/talju_<시각>.dump
# 3) 업로드 파일: STORAGE_DIR 내용을 백업으로 바꾼다
tar -xzf server/backups/storage_<시각>.tar.gz -C server/storage-data
# 4) 서버를 다시 켠다
```

## 다음 단계
1. 새 PostgreSQL에 `pnpm run db:setup`을 한 번 실행한다.
2. 기존 데이터를 옮길 경우 `auth.users`와 public 스키마를 덤프·복원한다.
3. `CORS_ORIGIN`, `PUBLIC_BASE_URL`, `APP_URL`, SMTP, 프런트의 `VITE_API_URL`을 실제 주소로 설정한다.

## Vercel 프론트 + 로컬 백엔드 + 고정 ngrok 도메인

최초 설정:

1. ngrok을 설치하고 계정 대시보드의 인증 토큰을 `ngrok config add-authtoken <토큰>`으로 등록한다. 토큰을 저장소에 넣지 않는다.
2. ngrok 계정의 고정 개발 도메인을 확인한다.
3. Vercel에서 이 저장소의 `tobackend` 브랜치를 배포한다. Root Directory는 프로젝트 루트, Framework는 Vite, Build Command는 `pnpm run build`, Output Directory는 `dist`다. Install Command는 `npx --yes pnpm@10.34.3 install --frozen-lockfile`로 지정한다.
4. 루트 `vercel.json`의 `/api/:path*` 전달 주소를 고정 ngrok 도메인으로 맞춰 커밋한다. 화면이 Vercel 주소의 `/api`로 요청하면 Vercel이 ngrok으로 넘기므로,
   로그인 유지 쿠키(httpOnly)가 **같은 사이트 쿠키**가 되어 Safari에서도 새로 고침 후 로그인이 유지된다.
   Vercel 환경변수에 `VITE_API_URL=/api`, `VITE_BACKEND_URL=https://고정-ngrok-도메인`을 등록한다. Vercel은 WebSocket을 전달하지 못하므로
   실시간·동시 편집과 공개 파일 주소는 `VITE_BACKEND_URL`로 직접 간다(쿠키가 아니라 액세스 토큰으로 인증). 환경변수를 배포 후 변경했다면 Redeploy한다. DB 주소·JWT·ngrok 인증 토큰은 Vercel 프론트 환경변수에 넣지 않는다.
5. 생성된 Vercel 사이트 주소와 ngrok 주소를 `server/.env`에 입력한다:

```dotenv
# 쉼표로 여러 주소(운영·미리보기). 메일 링크에는 첫 주소를 쓴다.
FRONTEND_URL=https://내사이트.vercel.app,https://내사이트-git-브랜치-팀.vercel.app
NGROK_URL=https://내고정도메인.ngrok-free.dev
```

두 주소는 예시다. 실제 계정의 주소로 바꾸고 `/api` 같은 경로는 붙이지 않는다. `DATABASE_URL`과 `JWT_SECRET` 등 기존 서버 설정도 필요하다.

매번 실행할 때 Windows PowerShell의 **프로젝트 루트**에서:

```powershell
docker compose -f server/docker-compose.yml up -d
cd server
# 새 DB에서 최초 한 번만: npx.cmd --yes pnpm@10.34.3 run db:setup
npx.cmd --yes pnpm@10.34.3 run dev:ngrok
```

이 명령은 빌드 후 DB의 `storage_host`를 고정 도메인으로 맞추고, `PUBLIC_BASE_URL`, `APP_URL`, `CORS_ORIGIN`, `TRUST_PROXY`, `COOKIE_SAMESITE=lax`를 해당 실행의 환경변수로 자동 설정하고, `vercel.json`의 전달 주소가 `NGROK_URL`과 다르면 경고한다.
요청이 Vercel을 거쳐 오므로 로그인 실패 제한의 "같은 IP"는 Vercel 서버 주소 기준이다(직접 보낸 `X-Forwarded-For`로 제한을 피하지 못하게 더 믿지 않음). `.env` 파일을 덮어쓰지 않는다. 백엔드는 루프백에서만 수신하며 준비가 끝나면 ngrok을 실행한다. 기존 백엔드가 포트를 사용하면 먼저 종료해야 한다. Ctrl+C로 이 명령이 시작한 백엔드와 터널을 함께 종료한다. DB 컨테이너는 계속 실행된다.

Vercel의 주소를 바꾸면 `FRONTEND_URL` 수정 후 명령을 재실행한다. API 도메인을 바꾸면 `vercel.json`과 Vercel의 `VITE_BACKEND_URL`도 수정하고 재배포해야 하며, 이전 도메인으로 저장된 파일 링크가 영향을 받을 수 있으므로 같은 고정 도메인을 유지한다. 이 명령이 Vercel 설정이나 배포를 자동 변경하지는 않는다.

확인: `https://고정-ngrok-도메인/api/health`와 Vercel 사이트에서 로그인·파일 업로드·채팅을 확인한다. `MAIL_TRANSPORT=console`이면 가입 확인 링크는 백엔드 터미널에 출력된다. 팀원이 직접 메일을 받아야 한다면 SMTP를 설정한다. PC·PostgreSQL·백엔드·ngrok이 실행 중이어야 서비스를 이용할 수 있다.
