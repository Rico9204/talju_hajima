import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ProjectsService } from '../projects/projects.service.js';
import { CollabService } from './collab.service.js';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/collab')
export class CollabController {
  constructor(
    private readonly collabService: CollabService,
    private readonly projectsService: ProjectsService,
  ) {}

  // "바로 수정" 파일 목록에 참여자 배지를 띄우기 위한 폴링용 — 실시간 소켓과 별개로 가볍게 조회.
  @Get('active')
  async listActive(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    await this.projectsService.assertMembership(projectId, user.sub);
    return this.collabService.listActiveUsers(projectId);
  }
}
