import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BoardPost } from './board-post.entity.js';
import { User } from '../users/user.entity.js';

export enum BoardApplicationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

// 모집 공고(BoardPost)에 대한 팀원 지원 한 건. 수락되면 board.service.ts가
// ProjectsService.addMember를 불러 실제로 그 프로젝트 멤버가 된다.
@Entity('board_applications')
export class BoardApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BoardPost)
  @JoinColumn({ name: 'post_id' })
  post: BoardPost;

  @Column({ name: 'post_id' })
  postId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'applicant_id' })
  applicant: User;

  @Column({ name: 'applicant_id' })
  applicantId: string;

  @Column({ type: 'text', default: '' })
  message: string;

  @Column({ type: 'enum', enum: BoardApplicationStatus, default: BoardApplicationStatus.PENDING })
  status: BoardApplicationStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
