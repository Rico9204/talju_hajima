import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TaskComment } from './task-comment.entity.js';
import { User } from '../users/user.entity.js';

@Entity('task_comment_reactions')
export class TaskCommentReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TaskComment)
  @JoinColumn({ name: 'comment_id' })
  comment: TaskComment;

  @Column({ name: 'comment_id' })
  commentId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  emoji: string;
}
