# 학교 PC(Windows + WSL2 우분투) 운영 배포

지금 개발자 PC에서 `pnpm run dev:cloudflare`로 돌리는 서버를 학교 Windows PC의 WSL2 우분투로 옮기는 절차다.
구성은 그대로다. PostgreSQL(+OnlyOffice)은 Docker, API는 `scripts/dev-cloudflare.mjs`, 공개는 같은 Cloudflare Tunnel이다.
터널 토큰과 공개 주소(`api.teammates.website`)를 그대로 쓰므로 Vercel 환경변수와 `vercel.json`은 바꾸지 않는다.
비밀값(`server/.env`, 터널 토큰, 덤프)은 Git과 채팅에 넣지 않는다.

| 파일 | 용도 |
| --- | --- |
| `wsl.conf` | `/etc/wsl.conf`. systemd를 켠다 |
| `keep-wsl-running.ps1` | Windows 부팅 시 WSL을 띄우고 꺼지지 않게 하는 작업 스케줄러 등록 |
| `docker-compose.override.yml` | DB 비밀번호, 자동 재시작, healthcheck |
| `talju@.service` | 백엔드 + 터널 systemd 서비스 |

## 0. 학교 PC 조건 확인

- Windows 10 22H2 이상 또는 11, BIOS 가상화 켜짐, 관리자 권한.
- 메모리: DB + API 약 1GB, OnlyOffice를 쓰면 2~4GB 추가. WSL에 6~8GB를 줄 수 있으면 충분하다.
- 학교 방화벽이 Cloudflare로 나가는 443/7844 포트를 막지 않을 것. 들어오는 포트는 열 필요가 없다.
- 절전 모드 끄기(설정 > 시스템 > 전원 > 절전 "안 함"). Windows 업데이트 재부팅 후에는 4번 작업이 서버를 다시 띄운다.
- 학교에 외부 공개 서비스 운영 허가를 받는다.

## 1. WSL2 우분투 설치 (Windows, 관리자 PowerShell)

```powershell
wsl --install -d Ubuntu-24.04
wsl --set-default-version 2
```

재부팅 후 우분투 사용자 이름과 비밀번호를 만든다. 메모리 상한은 `%UserProfile%\.wslconfig`에 둔다.

```ini
[wsl2]
memory=8GB
```

## 2. 우분투 준비 (WSL 터미널)

```bash
sudo apt update && sudo apt install -y ca-certificates curl git tar
# systemd 켜기 (이 폴더의 wsl.conf와 같은 내용)
sudo tee /etc/wsl.conf <<'CONF'
[boot]
systemd=true
CONF
```

Windows에서 `wsl --shutdown` 후 다시 들어가 `systemctl is-system-running`이 `running` 또는 `degraded`인지 본다.

```bash
# Node 22, pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable && corepack prepare pnpm@10.34.3 --activate

# Docker Engine (Docker Desktop이 아니라 WSL 안에 직접 설치: 로그인 없이 부팅 때 뜬다)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker

# cloudflared
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

`usermod` 반영을 위해 WSL 터미널을 닫았다 다시 연다.

### Docker Desktop(Windows)을 이미 설치했다면

Docker Engine을 WSL 안에 또 설치하지 않는다(둘이 충돌한다). 대신 Docker Desktop에서 아래를 켠다.

- Settings > General: "Use the WSL 2 based engine", "Start Docker Desktop when you sign in to your computer".
- Settings > Resources > WSL integration: Ubuntu-24.04 켜기.
- WSL 터미널에서 `docker version`에 Server 항목이 나오면 된다.

Docker Desktop은 Windows에 **로그인해야** 켜진다. 학교 PC가 재부팅된 뒤 로그인하지 않으면 DB가 뜨지 않아 서비스가 멈춘다. 전용 PC라면 Windows 자동 로그인을 설정하고(`netplwiz`, 또는 Sysinternals Autologon) 화면 잠금만 건다. 자동 로그인을 쓸 수 없으면 Docker Desktop을 지우고 WSL 안에 Docker Engine을 설치한다.

## 3. 코드와 설정

운영 데이터는 반드시 리눅스 쪽에 둔다. `/mnt/c/...`(Windows 드라이브)는 느리고 권한 문제가 생긴다.

```bash
sudo mkdir -p /opt/talju_hajima && sudo chown $USER:$USER /opt/talju_hajima
git clone -b tobackend <저장소 URL> /opt/talju_hajima
cd /opt/talju_hajima/server
pnpm install --ignore-workspace --frozen-lockfile
pnpm run build
```

원래 PC의 `server/.env`를 USB 등으로 옮겨 `/opt/talju_hajima/server/.env`에 둔다(`chmod 600 .env`). 그대로 두고 아래만 바꾼다.

```ini
POSTGRES_PASSWORD=<새 비밀번호: openssl rand -hex 24>
DATABASE_URL=postgres://postgres:<위 비밀번호>@localhost:5432/talju
STORAGE_DIR=./storage-data
```

`JWT_SECRET`, `VAPID_*`, `ONLYOFFICE_JWT_SECRET`, `ODCLOUD_API_KEY`, SMTP, `TUNNEL_URL`, `FRONTEND_URL`, `CLOUDFLARE_TUNNEL_TOKEN`은 원래 값을 그대로 쓴다. 새로 만들면 로그인 풀림, 푸시 구독 무효 등이 생긴다.

DB와 OnlyOffice를 띄운다.

```bash
cd /opt/talju_hajima/server
docker compose -f docker-compose.yml -f deploy/wsl/docker-compose.override.yml --profile office up -d
docker compose ps    # db가 healthy
```

이후에도 컨테이너를 다시 만들 때는 항상 두 파일을 함께 지정한다(기본 파일만 쓰면 자동 재시작 설정이 빠진다). `pnpm run backup`은 기본 파일만으로도 같은 컨테이너를 찾는다.

## 4. 데이터 이전

1. **원래 PC**: Docker Desktop을 켜고 서버(`dev:cloudflare`)를 끈다. 이 시점부터 쓰기가 멈춘다. 그다음 백업한다.
   ```powershell
   cd server; npx.cmd --yes pnpm@10.34.3 run backup
   ```
   `server/backups`의 최신 `talju_<시각>.dump`(0바이트가 아닌지 확인)와 같은 시각 `storage_<시각>.tar.gz`를 학교 PC로 옮긴다. WSL에서는 `/mnt/c/Users/<이름>/Downloads/...`로 보인다.
2. **학교 PC(WSL)**: 빈 DB에 복원한다. `db:setup`은 실행하지 않는다.
   ```bash
   cd /opt/talju_hajima/server
   docker compose exec -T db psql -U postgres -d talju -c "DO \$\$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
   docker compose exec -T db psql -U postgres -d talju -c "DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
   docker compose exec -T db psql -U postgres -d talju -c "GRANT anon, authenticated TO postgres;"
   docker compose exec -T db pg_restore -U postgres -d talju --no-owner --single-transaction --exit-on-error < /mnt/c/경로/talju_<시각>.dump
   mkdir -p storage-data && tar -xzf /mnt/c/경로/storage_<시각>.tar.gz -C storage-data
   docker compose exec -T db psql -U postgres -d talju < ../supabase/verify_runtime.sql   # ready가 모두 t
   ```

## 5. 서비스 등록과 전환

원래 PC의 `dev:cloudflare`가 **꺼져 있는지 다시 확인**한다. 같은 터널 토큰으로 두 곳이 동시에 연결되면 Cloudflare가 요청을 양쪽에 나눠 보내 데이터가 갈라진다.

```bash
sudo cp /opt/talju_hajima/server/deploy/wsl/talju@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now talju@$USER
journalctl -u talju@$USER -f     # "[cloudflared] Registered tunnel connection" 이 보이면 연결됨
```

Windows 관리자 PowerShell에서 부팅 시 자동 실행을 등록한다(로그인하지 않아도 WSL이 뜬다).

```powershell
powershell -ExecutionPolicy Bypass -File \wsl$\Ubuntu-24.04\opt\talju_hajima\server\deploy\wsl\keep-wsl-running.ps1
```

확인 순서: `curl http://127.0.0.1:3000/api/health` → `https://api.teammates.website/api/health` → Vercel 사이트에서 기존 계정 로그인, 파일 다운로드·업로드, 채팅, 오피스 편집. 마지막으로 학교 PC를 재부팅하고 로그인하지 않은 상태에서 공개 health가 다시 응답하는지 본다.

## 운영

- 코드 업데이트: `cd /opt/talju_hajima && git pull && cd server && pnpm install --ignore-workspace --frozen-lockfile && pnpm run build && sudo systemctl restart talju@$USER`. 새 DB 마이그레이션은 `supabase/migrations/`의 새 파일만 순서대로 `psql`로 적용한다.
- 로그: `journalctl -u talju@$USER -n 200`.
- 백업: 매일 4시 cron. 사본을 Windows 쪽(OneDrive 등)에도 둔다. 학교 PC 하나에만 데이터가 있으면 안 된다.
  ```bash
  crontab -e
  0 4 * * * cd /opt/talju_hajima/server && BACKUP_DIR=/mnt/c/talju-backups /usr/bin/node --env-file=.env scripts/backup.mjs
  ```
- 롤백: 학교 서비스를 끄고(`sudo systemctl stop talju@$USER`) 그 시점 백업을 만든 뒤 원래 PC에 복원하고 `dev:cloudflare`를 켠다. 양쪽을 동시에 켜지 않는다.
