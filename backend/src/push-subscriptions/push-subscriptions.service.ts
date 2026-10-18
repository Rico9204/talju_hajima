import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscription } from './push-subscription.entity.js';
import { SaveSubscriptionDto } from './dto/save-subscription.dto.js';

@Injectable()
export class PushSubscriptionsService {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly repository: Repository<PushSubscription>,
  ) {}

  async save(userId: string, dto: SaveSubscriptionDto): Promise<void> {
    const existing = await this.repository.findOne({ where: { endpoint: dto.endpoint } });
    if (existing) {
      await this.repository.update(existing.id, { userId, p256dh: dto.p256dh, auth: dto.auth });
      return;
    }
    await this.repository.save(this.repository.create({ userId, ...dto }));
  }

  async delete(userId: string, endpoint: string): Promise<void> {
    await this.repository.delete({ userId, endpoint });
  }
}
