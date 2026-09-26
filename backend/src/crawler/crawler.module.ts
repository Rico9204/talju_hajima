import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrawlerService } from './crawler.service.js';
import { CrawlerController } from './crawler.controller.js';
import { CrawledItem } from './crawled-item.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([CrawledItem])],
  providers: [CrawlerService],
  controllers: [CrawlerController],
  exports: [TypeOrmModule],
})
export class CrawlerModule {}
