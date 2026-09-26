import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service.js';
import { TasksController } from './tasks.controller.js';
import { Task } from './task.entity.js';
import { TaskChecklistItem } from './task-checklist-item.entity.js';
import { TaskComment } from './task-comment.entity.js';
import { TaskCommentReaction } from './task-comment-reaction.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskChecklistItem, TaskComment, TaskCommentReaction]),
    AuthModule,
    ProjectsModule,
  ],
  providers: [TasksService],
  controllers: [TasksController],
})
export class TasksModule {}
