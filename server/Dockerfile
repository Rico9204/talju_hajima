# API 서버 + Cloudflare Tunnel을 한 컨테이너에서 실행한다(pnpm run dev:cloudflare와 같은 동작).
# 빌드 컨텍스트는 저장소 루트다. server/ 폴더에서: docker compose --profile server up -d --build
FROM cloudflare/cloudflared:latest AS cloudflared

FROM node:22-bookworm-slim
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --ignore-workspace --frozen-lockfile
COPY server/ ./
RUN pnpm run build
# dev-cloudflare.mjs가 터널 주소 확인에 읽는다. supabase/는 마이그레이션 적용용.
COPY vercel.json /app/vercel.json
COPY supabase/ /app/supabase/
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "scripts/dev-cloudflare.mjs"]
