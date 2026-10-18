import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscriptionsService } from './push-subscriptions.service.js';
import { PushSubscriptionsController } from './push-subscriptions.controller.js';
import { PushSubscription } from './push-subscription.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription]), AuthModule],
  providers: [PushSubscriptionsService],
  controllers: [PushSubscriptionsController],
})
export class PushSubscriptionsModule {}
