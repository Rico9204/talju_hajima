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
}
