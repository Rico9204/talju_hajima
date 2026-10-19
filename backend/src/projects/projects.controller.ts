import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.sub, dto);
  }

  @Get()
  findMine(@CurrentUser() user: JwtPayload) {
    return this.projectsService.findForUser(user.sub);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.projectsService.findOneForUser(id, user.sub);
  }

  @Get(':id/members')
  getMembers(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.projectsService.getMembers(id, user.sub);
  }

  @Post(':id/invitations')
  createInvitation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.projectsService.createInvitation(id, user.sub);
  }

  @Post('invitations/:token/accept')
  acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.projectsService.acceptInvitation(token, user.sub, dto);
  }

  @Post('members/:memberId/kick')
  async kickMember(@CurrentUser() user: JwtPayload, @Param('memberId') memberId: string) {
    await this.projectsService.kickMemberByMembershipId(memberId, user.sub);
    return { ok: true };
  }

  @Post('members/:memberId/vice-leader')
  async setViceLeader(@CurrentUser() user: JwtPayload, @Param('memberId') memberId: string, @Body('enabled') enabled: boolean) {
    await this.projectsService.setViceLeaderByMembershipId(memberId, enabled, user.sub);
    return { ok: true };
  }

  @Post(':id/transfer-leadership')
  async transferLeadership(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('memberId') memberId: string) {
    await this.projectsService.transferLeadership(id, memberId, user.sub);
    return { ok: true };
  }

  @Post(':id/complete')
  completeProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.projectsService.completeProject(id, user.sub);
  }

  // 운영자 전용이지만 이 백엔드엔 아직 운영자 권한 체계가 없어서(관리자 모듈과 같이 정리 예정)
  // 일단 로그인한 멤버면 누구나 호출 가능 — main 쪽 화면이 운영자에게만 버튼을 보여줘서 가린다.
  @Post(':id/approve')
  async approveProject(@Param('id') id: string) {
    await this.projectsService.setApprovalStatus(id, 'approved');
    return { ok: true };
  }

  @Post(':id/reject')
  async rejectProject(@Param('id') id: string) {
    await this.projectsService.setApprovalStatus(id, 'rejected');
    return { ok: true };
  }

  @Get(':id/presence')
  getPresence(@Param('id') id: string) {
    return this.projectsService.getPresence(id);
  }

  @Post('members/:memberId/presence/touch')
  async touchPresence(@CurrentUser() user: JwtPayload, @Param('memberId') memberId: string) {
    await this.projectsService.touchPresence(memberId, user.sub);
    return { ok: true };
  }

  @Post('members/:memberId/presence')
  async setPresence(@CurrentUser() user: JwtPayload, @Param('memberId') memberId: string, @Body('status') status: 'active' | 'idle') {
    await this.projectsService.setPresenceStatus(memberId, status, user.sub);
    return { ok: true };
  }

  @Post(':id/viewed/:area')
  async markViewed(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('area') area: 'tasks' | 'schedule' | 'workspace',
  ) {
    await this.projectsService.markViewed(id, area, user.sub);
    return { ok: true };
  }
}
