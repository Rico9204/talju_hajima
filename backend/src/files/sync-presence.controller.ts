import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SyncPresenceService } from './sync-presence.service.js';
import { PingPresenceDto } from './dto/ping-presence.dto.js';

@Controller('projects/:projectId/sync-presence')
@UseGuards(JwtAuthGuard)
export class SyncPresenceController {
  constructor(
    private readonly presenceService: SyncPresenceService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  async ping(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: PingPresenceDto,
  ) {
    await this.projectsService.assertMembership(projectId, user.sub);
    this.presenceService.ping(projectId, dto.root, user.sub);
    return { ok: true };
  }

  @Get('all')
  async listAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    await this.projectsService.assertMembership(projectId, user.sub);
    return { active: this.presenceService.listAllActive(projectId) };
  }

  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query('root') root: string | undefined,
  ) {
    await this.projectsService.assertMembership(projectId, user.sub);
    return { active: this.presenceService.listActive(projectId, root ?? '', user.sub) };
  }
}
