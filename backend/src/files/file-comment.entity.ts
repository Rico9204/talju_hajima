import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectFile } from './project-file.entity.js';
import { FileVersion } from './file-version.entity.js';
import { User } from '../users/user.entity.js';

@Entity('file_comments')
export class FileComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProjectFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: ProjectFile;

  @Column({ name: 'file_id' })
  fileId: string;

  // 특정 버전(페이지)에 남긴 댓글이면 그 버전을 가리킴 — null이면 파일 전체에 대한 일반 댓글.
  // 버전이 지워지면(파일 삭제로 인한 cascade) 댓글 자체는 남기고 그 연결만 끊는다.
  @ManyToOne(() => FileVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'version_id' })
  version: FileVersion | null;

  @Column({ name: 'version_id', type: 'uuid', nullable: true })
  versionId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
