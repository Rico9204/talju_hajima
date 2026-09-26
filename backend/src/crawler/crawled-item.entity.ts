import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// 기초 구현: 수집 대상 소스와 매칭 조건은 이후 확장
@Entity('crawled_items')
export class CrawledItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  source: string;

  @Column()
  title: string;

  @Column()
  url: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
