import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ProjectAlertsService } from './project-alerts.service.js';

@UseGuards(JwtAuthGuard)
@Controller('me/project-alerts')
export class ProjectAlertsController {
  constructor(private readonly projectAlertsService: ProjectAlertsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.projectAlertsService.listAlertProjectIds(user.sub);
  }
}
