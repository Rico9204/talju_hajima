import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScrappedNoticesService } from './scrapped-notices.service.js';
import { ScrappedNoticesController } from './scrapped-notices.controller.js';
import { ScrappedNotice } from './scrapped-notice.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ScrappedNotice]), AuthModule],
  providers: [ScrappedNoticesService],
  controllers: [ScrappedNoticesController],
})
export class ScrappedNoticesModule {}
