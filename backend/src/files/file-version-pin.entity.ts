import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectFile } from './project-file.entity.js';
import { FileVersion } from './file-version.entity.js';

// 프로젝트의 "현재 버전"과 별개로, 여러 사람이 특정 버전 위에서 계속 이어서 작업하고 싶을 때 쓰는
// 움직이는 표식(named ref, 깃 브랜치와 비슷). 같은 핀을 기준으로 올리면 서로 이어붙고(빨리감기),
// 다른 핀/버전을 기준으로 하면 각자 다른 가지에 쌓인다.
@Entity('file_version_pins')
export class FileVersionPin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProjectFile)
  @JoinColumn({ name: 'file_id' })
  file: ProjectFile;

  @Column({ name: 'file_id' })
  fileId: string;

  @Column()
  label: string;

  @ManyToOne(() => FileVersion)
  @JoinColumn({ name: 'version_id' })
  version: FileVersion;

  @Column({ name: 'version_id' })
  versionId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
