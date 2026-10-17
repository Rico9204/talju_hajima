import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BoardPost } from './board-post.entity.js';

@Entity('board_polls')
export class BoardPoll {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => BoardPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BoardPost;

  @Column({ name: 'post_id' })
  postId: string;

  @Column()
  question: string;

  @Column({ name: 'allow_multiple', default: false })
  allowMultiple: boolean;

  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @Column({ default: false })
  closed: boolean;

  @Column({ name: 'closes_at', type: 'timestamptz', nullable: true })
  closesAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
