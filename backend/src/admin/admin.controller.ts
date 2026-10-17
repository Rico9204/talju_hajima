import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { AdminService } from './admin.service.js';
import { SubmitApplicationDto } from './dto/submit-application.dto.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('me/is-admin')
  async isAdmin(@CurrentUser() user: JwtPayload) {
    return { isAdmin: await this.adminService.isAdmin(user.sub) };
  }

  @Get('me/is-operator')
  async isOperator(@CurrentUser() user: JwtPayload) {
    return { isOperator: await this.adminService.isOperator(user.sub) };
  }

  @Get('me/admin-application')
  getMyApplication(@CurrentUser() user: JwtPayload) {
    return this.adminService.getMyApplication(user.sub);
  }

  @Post('admin-applications')
  async submitApplication(@CurrentUser() user: JwtPayload, @Body() dto: SubmitApplicationDto) {
    await this.adminService.submitApplication(user.sub, dto);
    return { ok: true };
  }

  @Get('admin-applications')
  listApplications(@CurrentUser() user: JwtPayload) {
    return this.adminService.listApplications(user.sub);
  }

  @Get('admin-applications/:id/document')
  async getDocument(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return { data: await this.adminService.getDocumentData(id, user.sub) };
  }

  @Patch('admin-applications/:id')
  async reviewApplication(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string },
  ) {
    await this.adminService.reviewApplication(id, user.sub, body.approve, body.note ?? '');
    return { ok: true };
  }

  @Post('admin-applications/:id/cleanup-document')
  async cleanupDocument(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.adminService.cleanupDocument(id, user.sub);
    return { ok: true };
  }

  @Get('admins')
  listAdmins(@CurrentUser() user: JwtPayload) {
    return this.adminService.listAdmins(user.sub);
  }

  @Post('admins/:userId/revoke')
  async revokeAdmin(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    await this.adminService.revokeAdmin(userId, user.sub);
    return { ok: true };
  }

  @Get('admins/search')
  searchAdmins(@Query('q') q: string) {
    return this.adminService.searchAdmins(q ?? '');
  }
}
