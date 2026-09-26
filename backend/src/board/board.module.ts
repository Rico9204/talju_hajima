import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardService } from './board.service.js';
import { BoardController } from './board.controller.js';
import { BoardPost } from './board-post.entity.js';
import { BoardApplication } from './board-application.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([BoardPost, BoardApplication]), AuthModule, ProjectsModule],
  providers: [BoardService],
  controllers: [BoardController],
})
export class BoardModule {}
