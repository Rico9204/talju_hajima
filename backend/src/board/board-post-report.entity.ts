import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// postId를 외래키로 걸지 않는다 — 신고된 글이 나중에 삭제돼도 신고 기록(제목/작성자 등 스냅샷)은
// 그대로 남아야 운영자가 처리 이력을 볼 수 있다.
@Entity('board_post_reports')
export class BoardPostReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid', nullable: true })
  postId: string | null;

  @Column({ name: 'post_title' })
  postTitle: string;

  @Column({ name: 'post_excerpt' })
  postExcerpt: string;

  @Column({ name: 'post_author_name' })
  postAuthorName: string;

  @Column({ name: 'reporter_id' })
  reporterId: string;

  @Column()
  reason: string;

  @Column({ type: 'text' })
  detail: string;

  @Column({ default: 'open' })
  status: 'open' | 'resolved' | 'dismissed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
