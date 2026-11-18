# 학교 PC(Windows + Docker Desktop) 운영 배포

Node, WSL 설정, systemd 없이 Docker만으로 서버 전체를 띄운다. 명령은 모두 Windows PowerShell에서 `server` 폴더 기준으로 실행한다.

| 컨테이너 | 내용 |
| --- | --- |
| `db` | PostgreSQL 17 (데이터는 Docker 볼륨) |
| `onlyoffice` | 오피스 편집 문서 서버 |
| `api` | API 서버 + Cloudflare Tunnel (`pnpm run dev:cloudflare`와 같은 동작) |

터널 토큰과 공개 주소를 그대로 쓰므로 Vercel 설정, `vercel.json`, Cloudflare 대시보드는 바꾸지 않는다.

## 1. 준비

- Docker Desktop: Settings > General에서 "Start Docker Desktop when you sign in"을 켠다.
- Docker Desktop은 Windows에 로그인해야 켜진다. 서버 전용 PC라면 `netplwiz`로 자동 로그인을 설정하고, 절전 모드를 끈다.
- 코드: `git clone -b tobackend <저장소 URL> C:\talju_hajima` (Git이 없으면 `winget install Git.Git`). OneDrive 폴더 밖에 둔다.
- 원래 PC의 `server\.env`를 USB 등으로 `C:\talju_hajima\server\.env`에 복사하고, 아래 한 줄만 추가한다. 나머지 값(JWT, VAPID, SMTP, 터널 토큰 등)은 그대로 둔다.
  ```ini
  POSTGRES_PASSWORD=<임의의 긴 영문·숫자>
  ```
  `DATABASE_URL`, `ONLYOFFICE_URL`, `STORAGE_DIR`은 compose 파일이 컨테이너용 값으로 덮어쓰므로 고치지 않아도 된다.

## 2. DB 먼저 띄우기

```powershell
cd C:\talju_hajima\server
docker compose up -d db
docker compose ps        # db가 healthy
```

## 3. 데이터 옮기기

1. **원래 PC**: `dev:cloudflare`를 끄고(이때부터 쓰기 중단) Docker Desktop을 켠 뒤 백업한다.
   ```powershell
   cd server; npx.cmd --yes pnpm@10.34.3 run backup
   ```
   `server\backups`의 최신 `talju_<시각>.dump`(0바이트가 아닌지 확인)와 같은 시각 `storage_<시각>.tar.gz`를 학교 PC의 `C:\talju_hajima\server\`로 옮긴다.
2. **학교 PC**: 빈 DB에 복원한다.
   ```powershell
   docker compose exec -T db psql -U postgres -d talju -c "create role anon nologin; create role authenticated nologin; grant anon, authenticated to postgres;"
   docker compose cp talju_<시각>.dump db:/tmp/restore.dump
   docker compose exec -T db pg_restore -U postgres -d talju --no-owner --single-transaction --exit-on-error /tmp/restore.dump
   mkdir storage-data -Force; tar -xzf storage_<시각>.tar.gz -C storage-data
   docker compose cp ..\supabase\verify_runtime.sql db:/tmp/verify.sql
   docker compose exec -T db psql -U postgres -d talju -f /tmp/verify.sql
   ```
   마지막 결과의 `ready`가 모두 `t`여야 한다.

## 4. 서버 켜기

원래 PC의 `dev:cloudflare`가 **꺼져 있는지 다시 확인**한다. 같은 터널에 두 곳이 붙으면 요청이 양쪽으로 나뉘어 데이터가 갈라진다.

```powershell
docker compose --profile office --profile server up -d --build
docker compose logs -f api      # "[cloudflared] Registered tunnel connection"이 보이면 연결됨
```

확인: `https://api.teammates.website/api/health` → Vercel 사이트에서 기존 계정 로그인, 파일, 채팅, 오피스 편집. 마지막으로 PC를 재부팅해서 저절로 다시 뜨는지 본다.

## 운영

- 상태·로그: `docker compose ps`, `docker compose logs --tail 200 api`.
- 코드 업데이트: `git pull` 후 `docker compose --profile office --profile server up -d --build`. DB 마이그레이션은 `supabase\migrations\`의 새 파일만 3번처럼 `cp` 후 `psql -f`로 적용한다.
- 끄기: `docker compose --profile office --profile server stop`.
- 백업: `server\README.md`의 "백업과 복구"와 같다(Node 필요: `winget install OpenJS.NodeJS.LTS`). 백업 사본은 학교 PC 밖(OneDrive 등)에도 둔다.
- 되돌리기: 학교 PC 서버를 끄고 그 시점 백업을 만든 뒤, 원래 PC에 복원하고 `dev:cloudflare`를 켠다. 양쪽을 동시에 켜지 않는다.
