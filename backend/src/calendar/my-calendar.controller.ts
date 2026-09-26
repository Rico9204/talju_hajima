import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { CalendarService } from './calendar.service.js';

@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class MyCalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('me')
  listMine(@CurrentUser() user: JwtPayload) {
    return this.calendarService.listForUser(user.sub);
  }
}
