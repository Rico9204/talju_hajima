import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectFile } from './project-file.entity.js';
import { User } from '../users/user.entity.js';

// parentVersionId가 가리키는 버전을 기준으로 저장된 시점의 파일 내용 스냅샷.
// 어떤 버전의 parent도 아니고 파일의 currentVersionId도 아니면 "해소되지 않은 분기"다.
@Entity('file_versions')
export class FileVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProjectFile)
  @JoinColumn({ name: 'file_id' })
  file: ProjectFile;

  @Column({ name: 'file_id' })
  fileId: string;

  @Column({ name: 'parent_version_id', type: 'uuid', nullable: true })
  parentVersionId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
