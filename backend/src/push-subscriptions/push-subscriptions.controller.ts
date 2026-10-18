import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { PushSubscriptionsService } from './push-subscriptions.service.js';
import { SaveSubscriptionDto } from './dto/save-subscription.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('me/push-subscriptions')
export class PushSubscriptionsController {
  constructor(private readonly service: PushSubscriptionsService) {}

  @Post()
  async save(@CurrentUser() user: JwtPayload, @Body() dto: SaveSubscriptionDto) {
    await this.service.save(user.sub, dto);
    return { ok: true };
  }

  @Post('delete')
  async delete(@CurrentUser() user: JwtPayload, @Body() body: { endpoint: string }) {
    await this.service.delete(user.sub, body.endpoint);
    return { ok: true };
  }
}
