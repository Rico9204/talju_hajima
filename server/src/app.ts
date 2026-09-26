import "reflect-metadata";
import { Module, ValidationPipe, type DynamicModule, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AdminController } from "./admin.js";
import { AuthController, AuthGuard, AuthLimits, MailSettings, TokenService } from "./auth.js";
import { Mailer } from "./mail.js";
import { MajorsController, MajorsService } from "./majors.js";
import { BoardController } from "./board.js";
import { ChatController } from "./chat.js";
import { Db } from "./db.js";
import { ApiErrorFilter } from "./errors.js";
import { HealthController, ProjectsController } from "./projects.js";
import { RealtimeHub } from "./realtime.js";
import { FileStore, StorageController, StorageUrls, registerFileRoutes } from "./storage.js";
import { TasksController } from "./tasks.js";
import { WorkspaceController } from "./workspace.js";

export interface AppDeps {
  db: Db;
  jwtSecret: string;
  corsOrigins: string[];
  store: FileStore;
  publicBaseUrl: string; // 공개 파일 주소의 앞부분
  mailer: Mailer;
  appUrl: string; // 메일 링크가 가리킬 화면 주소
  odcloudApiKey?: string;
  majorsFetch?: typeof fetch;
  trustProxy?: number | boolean | string;
  authLimits?: AuthLimits; // 테스트에서 작은 한도를 넣을 때만
}

@Module({})
class AppModule {
  static register(deps: AppDeps, urls: StorageUrls, tokens: TokenService, hub: RealtimeHub): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController, AuthController, ProjectsController, AdminController, ChatController, WorkspaceController, TasksController, BoardController, MajorsController,
        StorageController,
      ],
      providers: [
        { provide: Db, useValue: deps.db },
        { provide: TokenService, useValue: tokens },
        { provide: RealtimeHub, useValue: hub }, // app.close() 때 onModuleDestroy로 연결·알림 수신을 정리
        { provide: AuthLimits, useValue: deps.authLimits ?? new AuthLimits() },
        { provide: FileStore, useValue: deps.store },
        { provide: Mailer, useValue: deps.mailer },
        { provide: MailSettings, useValue: new MailSettings(deps.appUrl) },
        { provide: MajorsService, useValue: new MajorsService(deps.odcloudApiKey, deps.majorsFetch) },
        { provide: StorageUrls, useValue: urls },
        AuthGuard,
      ],
    };
  }
}

// main.ts와 테스트가 같은 조립 과정을 쓴다(테스트는 DB·파일 저장소만 바꿔 끼운다).
export async function createApp(deps: AppDeps): Promise<INestApplication> {
  const urls = new StorageUrls(deps.publicBaseUrl, deps.jwtSecret);
  const tokens = new TokenService(deps.jwtSecret);
  const hub = new RealtimeHub(deps.db, tokens, deps.corsOrigins);
  const app = await NestFactory.create(AppModule.register(deps, urls, tokens, hub), { logger: ["error", "warn", "log"] });
  await hub.start(app.getHttpServer()); // WebSocket /realtime
  const http = app.getHttpAdapter().getInstance();
  http.disable("x-powered-by"); // 서버 종류를 응답 헤더로 알리지 않는다
  if (deps.trustProxy !== undefined) http.set("trust proxy", deps.trustProxy);
  // 공개 파일·서명 주소(/storage/v1/object/...)는 /api 밖, 로그인 없이(<img src>로 쓰이므로).
  registerFileRoutes(http, { db: deps.db, store: deps.store, urls });
  app.setGlobalPrefix("api");
  // 공유 브랜치의 전역 검증을 옮기되, 정의하지 않은 필드는 조용히 버리지 않고 거부한다.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableCors({ origin: deps.corsOrigins });
  return app;
}
