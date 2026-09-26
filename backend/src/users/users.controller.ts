import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { CreateLinkDto } from './dto/create-link.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const found = await this.usersService.findById(user.sub);
    if (!found) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const { passwordHash: _passwordHash, ...safe } = found;
    return safe;
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    const updated = await this.usersService.updateProfile(user.sub, dto);
    const { passwordHash: _passwordHash, ...safe } = updated;
    return safe;
  }

  @Get('me/links')
  listMyLinks(@CurrentUser() user: JwtPayload) {
    return this.usersService.listLinks(user.sub);
  }

  @Post('me/links')
  addLink(@CurrentUser() user: JwtPayload, @Body() dto: CreateLinkDto) {
    return this.usersService.addLink(user.sub, dto);
  }

  @Delete('me/links/:linkId')
  async deleteLink(@CurrentUser() user: JwtPayload, @Param('linkId') linkId: string) {
    await this.usersService.deleteLink(user.sub, linkId);
    return { ok: true };
  }
}
