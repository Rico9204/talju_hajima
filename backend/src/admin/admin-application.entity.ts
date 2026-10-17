import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity.js';

// 소속 학과/부서 admin 권한 신청 — 신청서 자체에 재직/재학 증빙 문서를 첨부한다(base64로 그대로
// 저장, board_attachments와 같은 방식). 처리가 끝나면 문서는 지울 수 있다(docDeleted=true).
@Entity('admin_applications')
export class AdminApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  org: string;

  @Column({ name: 'job_title' })
  jobTitle: string;

  @Column()
  contact: string;

  @Column({ name: 'doc_type' })
  docType: string;

  @Column({ name: 'doc_name' })
  docName: string;

  @Column({ name: 'doc_size' })
  docSize: number;

  @Column({ name: 'doc_data', type: 'text', nullable: true })
  docData: string | null;

  @Column({ name: 'doc_deleted', default: false })
  docDeleted: boolean;

  @Column({ default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
