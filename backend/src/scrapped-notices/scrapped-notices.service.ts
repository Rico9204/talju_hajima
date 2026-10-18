import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScrappedNotice } from './scrapped-notice.entity.js';
import { ToggleScrapDto } from './dto/toggle-scrap.dto.js';

@Injectable()
export class ScrappedNoticesService {
  constructor(
    @InjectRepository(ScrappedNotice)
    private readonly repository: Repository<ScrappedNotice>,
  ) {}

  list(userId: string): Promise<ScrappedNotice[]> {
    return this.repository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async toggle(userId: string, dto: ToggleScrapDto): Promise<boolean> {
    const existing = await this.repository.findOne({ where: { userId, noticeId: dto.id } });
    if (existing) {
      await this.repository.delete(existing.id);
      return false;
    }
    await this.repository.save(
      this.repository.create({
        userId,
        noticeId: dto.id,
        schoolCode: dto.schoolCode,
        schoolName: dto.schoolName,
        category: dto.category,
        title: dto.title,
        author: dto.author,
        postDate: dto.postDate,
        link: dto.link,
      }),
    );
    return true;
  }
}
