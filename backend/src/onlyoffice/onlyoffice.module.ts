import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlyofficeService } from './onlyoffice.service.js';
import { OnlyofficeController } from './onlyoffice.controller.js';
import { FilesModule } from '../files/files.module.js';
import { User } from '../users/user.entity.js';

@Module({
  imports: [
    // getConfig 엔드포인트만 로그인 토큰(JwtAuthGuard)이 필요 — CollabModule과 같은 이유로
    // AuthModule 대신 PassportModule/JwtModule을 여기서 다시 등록한다.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'dev-secret-change-me'),
      }),
    }),
    TypeOrmModule.forFeature([User]),
    FilesModule,
  ],
  providers: [OnlyofficeService],
  controllers: [OnlyofficeController],
  exports: [OnlyofficeService],
})
export class OnlyofficeModule {}
