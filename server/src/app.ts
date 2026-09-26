import "reflect-metadata";
import { Module, ValidationPipe, type DynamicModule, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthController, AuthGuard, AuthLimits, TokenService } from "./auth.js";
import { ChatController } from "./chat.js";
import { Db } from "./db.js";
import { ApiErrorFilter } from "./errors.js";
import { HealthController, ProjectsController } from "./projects.js";
import { WorkspaceController } from "./workspace.js";

export interface AppDeps {
  db: Db;
  jwtSecret: string;
  corsOrigins: string[];
  trustProxy?: number | boolean | string;
  authLimits?: AuthLimits; // 테스트에서 작은 한도를 넣을 때만
}

@Module({})
class AppModule {
  static register(deps: AppDeps): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AuthController, ProjectsController, ChatController, WorkspaceController],
      providers: [
        { provide: Db, useValue: deps.db },
        { provide: TokenService, useValue: new TokenService(deps.jwtSecret) },
        { provide: AuthLimits, useValue: deps.authLimits ?? new AuthLimits() },
        AuthGuard,
      ],
    };
  }
}

// main.ts와 테스트가 같은 조립 과정을 쓴다(테스트는 DB만 PGlite로 바꿔 끼운다).
export async function createApp(deps: AppDeps): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(deps), { logger: ["error", "warn", "log"] });
  const http = app.getHttpAdapter().getInstance();
  http.disable("x-powered-by"); // 서버 종류를 응답 헤더로 알리지 않는다
  if (deps.trustProxy !== undefined) http.set("trust proxy", deps.trustProxy);
  app.setGlobalPrefix("api");
  // 공유 브랜치의 전역 검증을 옮기되, 정의하지 않은 필드는 조용히 버리지 않고 거부한다.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableCors({ origin: deps.corsOrigins });
  return app;
}
