import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Project } from './project.entity.js';
import { User } from '../users/user.entity.js';

export enum ProjectRole {
  OWNER = 'owner',
  // 팀장과 거의 같은 일상 운영 권한이 있지만 팀원 제외/프로젝트 종료/팀장 위임은 못 함.
  VICE_LEADER = 'vice_leader',
  MEMBER = 'member',
}

@Entity('project_members')
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: ProjectRole, default: ProjectRole.MEMBER })
  role: ProjectRole;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
