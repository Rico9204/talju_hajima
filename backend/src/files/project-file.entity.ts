import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity.js';

// content/currentVersionId는 "지금 현재"인 버전의 내용을 캐시해둔 값이고,
// 실제 변경 이력은 전부 FileVersion에 쌓인다.
@Entity('project_files')
@Unique(['projectId', 'path'])
export class ProjectFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column()
  path: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId: string | null;

  // 현재 버전(currentVersionId)을 실제로 작성한 사람. 목록 화면에 매번 버전을 조인하지 않고
  // 바로 보여주기 위한 비정규화 필드.
  @Column({ name: 'last_editor_id', type: 'uuid', nullable: true })
  lastEditorId: string | null;

  @Column({ type: 'varchar', nullable: true })
  tag: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
