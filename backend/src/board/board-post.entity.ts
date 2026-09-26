import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Project } from '../projects/project.entity.js';

// "메인화면" 게시판 글 한 건. projectId가 있으면 그 프로젝트의 팀원 모집 공고(지원 가능),
// 없으면 일반 게시글(공지/자유글, 지원 불가)이다.
@Entity('board_posts')
export class BoardPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  // 모집 공고일 때만 의미 있음 — 글쓴이가 마감/충원 완료 후 신청을 더 안 받으려고 끔.
  @Column({ name: 'recruiting', default: true })
  recruiting: boolean;

  // 진짜 Postgres 배열 컬럼(simple-array 아님) — board.service.ts에서 "= ANY(tags)"로 태그
  // 검색을 해야 해서, 쉼표로 합친 문자열이 아니라 조회 가능한 배열이 필요함.
  @Column('text', { array: true, default: () => "'{}'" })
  tags: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
