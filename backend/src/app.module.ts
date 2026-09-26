import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { FilesModule } from './files/files.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { CrawlerModule } from './crawler/crawler.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { ChatModule } from './chat/chat.module.js';
import { MajorsModule } from './majors/majors.module.js';
import { EvaluationsModule } from './evaluations/evaluations.module.js';
import { BoardModule } from './board/board.module.js';
import { CollabModule } from './collab/collab.module.js';
import { OnlyofficeModule } from './onlyoffice/onlyoffice.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'collab_dev'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV', 'development') !== 'production',
        // Supabase 등 외부 호스팅 Postgres는 SSL 연결이 필수 — 로컬 Docker Postgres는 지원하지
        // 않으므로 DB_SSL=true일 때만 켠다. rejectUnauthorized:false는 Supabase가 자체 서명한
        // 중간 인증서를 쓰기 때문(로컬 개발/테스트 용도라 허용).
        ssl: config.get('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    FilesModule,
    CalendarModule,
    CrawlerModule,
    TasksModule,
    ChatModule,
    MajorsModule,
    EvaluationsModule,
    BoardModule,
    CollabModule,
    OnlyofficeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
