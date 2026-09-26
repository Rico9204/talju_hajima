import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CollabService } from './collab.service.js';
import { CollabController } from './collab.controller.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { UsersModule } from '../users/users.module.js';
import { FilesModule } from '../files/files.module.js';

@Module({
  imports: [
    // AuthModule을 그대로 import하면 순환 참조가 생길 수 있어(UsersModule과 같은 이유),
    // CollabController의 JwtAuthGuard가 필요로 하는 PassportModule만 직접 등록한다.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // AuthModule이 JwtModule을 밖으로 내보내지 않아서(PassportModule만 export), 같은 설정으로
    // 여기서 다시 등록한다 — 토큰 검증만 필요하고 로그인 발급 로직은 필요 없어서 문제 없음.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'dev-secret-change-me'),
      }),
    }),
    ProjectsModule,
    UsersModule,
    FilesModule,
  ],
  providers: [CollabService],
  controllers: [CollabController],
  exports: [CollabService],
})
export class CollabModule {}
