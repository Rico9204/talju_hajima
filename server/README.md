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
| 프로젝트 | `GET/POST projects` · `GET/DELETE projects/:id` · `POST projects/:id/{approve,reject,complete,join,transfer-leadership}` · `GET projects/:id/team?admin=true` · `POST projects/:id/sections/:section/viewed` |
| 팀원 | `PUT members/:id/vice-leader` · `DELETE members/:id`(제외) · `POST members/:id/presence` · `GET users/:userId/participation-stats` |
| 평가 | `GET/PUT evaluation-mode` · `GET/POST projects/:id/evaluations/:phase` |
| 관리자·운영자 | `GET admins/search?q=` · `GET admin/applications` · `POST admin/applications/:id/review` · `GET admin/accounts` · `DELETE admin/accounts/:userId` |
| 워크스페이스 | `GET/POST projects/:id/folders` · `DELETE workspace/folders/:id` · `GET projects/:id/files` · `DELETE workspace/files/:id` · `POST workspace/files/:id/move` · `PUT workspace/files/:id/tags` · `POST workspace/files/:id/versions/:vid/promote` · `PUT workspace/files/:id/versions/:vid/pinned` · `PUT workspace/versions/:vid/text` · `POST workspace/files/:id/comments` · `PUT workspace/comments/:id/reaction` · `GET projects/:id/workspace-cleanup` |
| 과제 | `GET/POST projects/:id/tasks` · `PUT tasks/:id/status` · `PATCH/DELETE tasks/:id` · `PUT tasks/:id/schedule-link` · `POST tasks/:id/checklist` · `PUT checklist/:itemId` · `POST tasks/:id/comments` · `PUT task-comments/:id/reaction` |
| 일정 | `GET/POST projects/:id/schedule` · `PATCH/DELETE schedule/:id` |
| 채팅 | `GET/POST projects/:id/chat/:channel/messages` · `POST projects/:id/chat/read` · `PUT projects/:id/chat/messages/:mid/reaction` · `GET/POST projects/:id/chat-groups` · `POST chat-groups/:gid/members` · `POST projects/:id/chat/:channel/tools` · `POST chat/messages/:mid/tool-actions` · `GET projects/:id/chat-tool-events` |
| 게시판 | `GET/POST board/posts` · `PATCH/DELETE board/posts/:id` · `POST board/posts/:id/views` · `PUT board/posts/:id/like` · `GET board/posts/:id/content` · `GET/POST board/posts/:id/comments` · `DELETE board/comments/:id` · `POST board/polls/:id/{votes,close}` · `GET/POST board/posts/:id/reports` · `GET board/reports` · `POST board/reports/:id/review` |
| 전공 조회 | `GET majors?school=` |
| 기타 | `GET health` |

파일은 서버 디스크(`STORAGE_DIR`)에 저장한다. 서버를 여러 대로 늘릴 때만 공유 파일 저장소로 바꾸면 된다. 실시간은 `/realtime` WebSocket으로 제공하며, 채팅·읽음·반응·과제·일정·파일·접속 상태·동시 편집을 전달한다.

**기존 동작 그대로 둔 알려진 문제**(서버가 같은 DB 함수·권한 규칙을 쓰므로 동일, 테스트에 명시):
- 팀장 위임은 팀원 행에 저장된 참여 당시 이름(`members.name`)으로 찾아서, 참여 뒤 프로필 이름을 바꾼 팀원에게는 새 이름으로 위임되지 않는다.
- 프로필은 본인·같은 프로젝트 팀원·관리자만 읽을 수 있어, 게시판에서 프로젝트를 함께하지 않는 사람의 글·댓글·신고 작성자가 "탈퇴한 사용자"/"알 수 없음"으로 보인다.

## 이메일
가입 확인과 비밀번호 재설정은 메일러를 통해 처리한다. 개발에서는 콘솔에 링크를 출력하고, 운영에서는 SMTP 설정이 필수다.

프런트에는 `VITE_API_URL=https://서버주소/api`를 설정한다. 공개 주소가 ngrok라면 `PUBLIC_BASE_URL`에도 같은 ngrok 주소를 넣고 `CORS_ORIGIN`에는 프런트 주소를 넣는다.

## 다음 단계
1. 새 PostgreSQL에 `pnpm run db:setup`을 한 번 실행한다.
2. 기존 데이터를 옮길 경우 `auth.users`와 public 스키마를 덤프·복원한다.
3. `CORS_ORIGIN`, `PUBLIC_BASE_URL`, `APP_URL`, SMTP, 프런트의 `VITE_API_URL`을 실제 주소로 설정한다.
