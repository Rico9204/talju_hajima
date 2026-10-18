import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ScrappedNoticesService } from './scrapped-notices.service.js';
import { ToggleScrapDto } from './dto/toggle-scrap.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('me/scrapped-notices')
export class ScrappedNoticesController {
  constructor(private readonly service: ScrappedNoticesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.sub);
  }

  @Post('toggle')
  async toggle(@CurrentUser() user: JwtPayload, @Body() dto: ToggleScrapDto) {
    const scrapped = await this.service.toggle(user.sub, dto);
    return { scrapped };
  }
}
