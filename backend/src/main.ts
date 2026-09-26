import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { CollabService } from './collab/collab.service.js';
import { createOnlyofficeProxyMiddleware } from './onlyoffice/onlyoffice-proxy.middleware.js';

// 파일 동기화(sync)는 여러 파일의 내용을 한 번에 JSON으로 보내므로,
// Express 기본 바디 크기 제한(100kb)을 넉넉하게 늘려야 함.
const BODY_SIZE_LIMIT = '20mb';

// 콤마로 구분된 허용 출처 목록. 비워두면(테스트 단계) 전부 허용 — Vercel 등 외부에서 접속하는
// 프론트를 붙여볼 때 필요. 실제 운영 단계에서는 반드시 실 도메인으로 좁혀야 함.
const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true, credentials: true });
  // OnlyOffice(워드/엑셀/PPT 인앱 편집 서버) 프록시 — /api, /collab이 아닌 모든 요청을 로컬
  // OnlyOffice 컨테이너로 그대로 넘긴다. 우리 라우팅(setGlobalPrefix('api')) 전에 붙여야
  // "/api가 아닌 경로는 Nest가 404 내기 전에" 먼저 가로챌 수 있다.
  const onlyofficeUrl = app.get(ConfigService).get<string>('ONLYOFFICE_INTERNAL_URL', 'http://localhost:8080');
  app.use(createOnlyofficeProxyMiddleware(onlyofficeUrl));
  app.use(json({ limit: BODY_SIZE_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_SIZE_LIMIT }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
  // "바로 수정"(실시간 공동편집) 웹소켓 — Express 라우팅과 별개로 같은 HTTP 서버의 업그레이드
  // 요청만 가로채므로 REST API 포트/경로와 그대로 공존한다.
  app.get(CollabService).attach(app.getHttpServer());
}
await bootstrap();
