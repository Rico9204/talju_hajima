import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardService } from './board.service.js';
import { BoardController } from './board.controller.js';
import { BoardPost } from './board-post.entity.js';
import { BoardApplication } from './board-application.entity.js';
import { BoardComment } from './board-comment.entity.js';
import { BoardLike } from './board-like.entity.js';
import { BoardAttachment } from './board-attachment.entity.js';
import { BoardPoll } from './board-poll.entity.js';
import { BoardPollOption } from './board-poll-option.entity.js';
import { BoardPollVote } from './board-poll-vote.entity.js';
import { BoardPostReport } from './board-post-report.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BoardPost,
      BoardApplication,
      BoardComment,
      BoardLike,
      BoardAttachment,
      BoardPoll,
      BoardPollOption,
      BoardPollVote,
      BoardPostReport,
    ]),
    AuthModule,
    ProjectsModule,
  ],
  providers: [BoardService],
  controllers: [BoardController],
})
export class BoardModule {}
