import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectAlertsService } from './project-alerts.service.js';
import { ProjectAlertsController } from './project-alerts.controller.js';
import { ProjectMember } from '../projects/project-member.entity.js';
import { Task } from '../tasks/task.entity.js';
import { CalendarEvent } from '../calendar/calendar-event.entity.js';
import { ProjectFile } from '../files/project-file.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectMember, Task, CalendarEvent, ProjectFile]), AuthModule, ChatModule],
  providers: [ProjectAlertsService],
  controllers: [ProjectAlertsController],
})
export class ProjectAlertsModule {}
