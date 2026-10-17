import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../users/user.entity.js';
import { BoardPost } from './board-post.entity.js';

@Entity('board_likes')
@Unique(['postId', 'userId'])
export class BoardLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BoardPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BoardPost;

  @Column({ name: 'post_id' })
  postId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
