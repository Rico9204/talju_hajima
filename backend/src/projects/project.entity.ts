import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // main 쪽 승인 워크플로우용 — 기본은 승인됨 취급(이 백엔드는 지금까지 승인 절차 없이 프로젝트가
  // 바로 쓰였으므로, 기존 프로젝트/새 프로젝트 모두 기본값으로 바로 쓸 수 있게 둔다). 운영자가
  // approveProject/rejectProject로 직접 바꿀 때만 pending/rejected가 된다.
  @Column({ default: 'approved' })
  approvalStatus: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
