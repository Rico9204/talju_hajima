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

  // 프레즌스 — 탭이 열려있는 동안 클라이언트가 주기적으로(최소 2분 간격) touch하거나 유휴
  // 전환 시 status를 바꾼다. "온라인" 여부는 이 lastActiveAt이 최근(3분 이내)인지로 판단한다
  // (별도 접속/해제 이벤트 없이 touch의 최신성만으로 접속 여부를 추정하는 polling 방식).
  @Column({ name: 'presence_status', default: 'active' })
  presenceStatus: 'active' | 'idle';

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  lastActiveAt: Date | null;

  // 각 영역(과제/일정/워크스페이스)을 마지막으로 본 시각 — getMyProjectAlerts가 이 시각
  // 이후에 생긴 항목이 있는지로 "다른 프로젝트에 새 소식" 뱃지를 계산한다. null이면 한 번도
  // 안 본 것으로 취급(그 영역의 모든 항목이 "새 것").
  @Column({ name: 'tasks_viewed_at', type: 'timestamptz', nullable: true })
  tasksViewedAt: Date | null;

  @Column({ name: 'schedule_viewed_at', type: 'timestamptz', nullable: true })
  scheduleViewedAt: Date | null;

  @Column({ name: 'workspace_viewed_at', type: 'timestamptz', nullable: true })
  workspaceViewedAt: Date | null;
}
