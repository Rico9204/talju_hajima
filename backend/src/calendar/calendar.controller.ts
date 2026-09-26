import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { CalendarService } from './calendar.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.calendarService.listForProject(projectId, user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.create(projectId, user.sub, dto);
  }

  @Patch(':eventId')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.update(projectId, eventId, user.sub, dto);
  }

  @Delete(':eventId')
  async remove(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('eventId') eventId: string) {
    await this.calendarService.delete(projectId, eventId, user.sub);
    return { ok: true };
  }
}
