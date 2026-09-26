# API 서버 (server/) — Supabase 없이 직접 구현하는 백엔드

로그인·DB 접근·권한을 이 서버가 직접 맡는다. DB는 **일반 PostgreSQL**(Supabase 불필요).
1단계: 토대(로그인 포함) + 대표 기능 API 8개.

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

## API (1단계)
| 경로 | 설명 |
|---|---|
| `POST /api/auth/signup` `{email, password(8~72자), displayName, org?}` | 가입 → `{user, accessToken, refreshToken}` (프로필은 DB 트리거가 생성) |
| `POST /api/auth/login` `{email, password}` | 로그인 → 같은 모양 |
| `POST /api/auth/refresh` `{refreshToken}` | 새 토큰 한 쌍(이전 리프레시 토큰은 폐기) |
| `POST /api/auth/logout` `{refreshToken}` | 리프레시 토큰 폐기 |
| `GET /api/auth/me` | 내 계정 |
| `GET /api/projects/:projectId/chat/:channelId/messages` | 채팅 메시지(읽음·반응 포함) |
| `GET/POST /api/projects/:projectId/chat-groups` | 단체방 목록 / 만들기(`create_chat_group`) |
| `POST /api/chat-groups/:groupId/members` | 단체방 초대(`add_chat_group_members`) |
| `GET /api/me/project-alerts` | 메인 화면 알림이 있는 프로젝트 id(`my_project_alerts`) |
| `POST /api/projects/:projectId/sections/:section/viewed` | 과제·일정·워크스페이스 확인 시각(`mark_section_viewed`) |
| `POST /api/workspace/files/:fileId/move` | 파일 이동(`move_workspace_file`) |
| `DELETE /api/workspace/folders/:folderId` | 폴더 삭제(`delete_workspace_folder`) |
| `GET /api/health` | 상태 확인(로그인 없이) |

## ⛔ 운영 전환 전 필수: 이메일 인증
지금은 가입 확인 메일이 없어 **남의 이메일로도 가입할 수 있다**(`auth.users.email_confirmed_at`은 모두 null =
운영자 화면의 관리자 신청 목록에 "미인증"으로 표시됨). 메일 발송(다음 단계 4)을 붙이기 전에는 운영 DB·운영 사용자에게 열지 않는다.

## 프론트 전환 조건
서버가 자체 토큰을 쓰므로 "일부만 서버, 일부는 Supabase" 혼합이 불가능하다. 아래가 끝나면 프론트의
`DataRepository` 구현(`src/api/`)과 로그인 화면(`AuthContext`)을 한 번에 이 서버로 바꾼다.

## 다음 단계
1. 나머지 `DataRepository` 메서드(약 86개) API화 — DB 함수 호출은 한 줄, 직접 읽기·쓰기는 RLS 그대로.
2. 파일 저장소: 디스크/S3 호환 저장소 + `storage.objects` 목록 기록, 다운로드는 서버가 서명 URL 발급.
3. 실시간(채팅·읽음·반응·과제·일정·파일·접속 상태·동시 편집): WebSocket. Temporary_Merge의
   "업그레이드 수락 전에 인증" 방식을 옮긴다.
4. 메일(가입 확인·비밀번호 재설정) — 도입 시 중복 가입 응답도 가입 여부가 드러나지 않게 바꾼다.
5. 기존 Supabase 데이터 이전: `auth.users`(id·email·encrypted_password·raw_user_meta_data) + public 스키마 덤프·복원.
6. 배포(서버·DB 위치). 프록시 뒤라면 `TRUST_PROXY` 설정(로그인 실패 제한이 실제 접속 IP 기준으로 걸리도록).
