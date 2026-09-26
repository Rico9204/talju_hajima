import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarService } from './calendar.service.js';
import { CalendarController } from './calendar.controller.js';
import { MyCalendarController } from './my-calendar.controller.js';
import { CalendarEvent } from './calendar-event.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarEvent]), AuthModule, ProjectsModule],
  providers: [CalendarService],
  controllers: [CalendarController, MyCalendarController],
  exports: [TypeOrmModule],
})
export class CalendarModule {}
