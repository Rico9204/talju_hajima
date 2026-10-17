import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity.js';
import { BoardPost } from './board-post.entity.js';

// 게시글 댓글 — parentCommentId가 있으면 그 댓글의 답글(1단계만 지원, 답글의 답글은 없음).
@Entity('board_comments')
export class BoardComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BoardPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BoardPost;

  @Column({ name: 'post_id' })
  postId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'parent_comment_id', type: 'uuid', nullable: true })
  parentCommentId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
