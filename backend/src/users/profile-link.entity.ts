import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity.js';

export enum ProfileLinkType {
  GITHUB = 'github',
  INSTAGRAM = 'instagram',
  NOTION = 'notion',
  X = 'x',
  LINKEDIN = 'linkedin',
  BEHANCE = 'behance',
  OTHER = 'other',
}

// 프로필 카드의 링크 칩(GitHub, Instagram, 포트폴리오 등). type은 URL의 도메인을 보고
// 프론트에서 자동으로 판별해 저장한다(src/lib/links.ts의 detectLink).
@Entity('profile_links')
export class ProfileLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: ProfileLinkType })
  type: ProfileLinkType;

  @Column()
  url: string;

  @Column()
  label: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
