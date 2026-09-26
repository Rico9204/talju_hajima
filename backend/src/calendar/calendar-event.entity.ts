import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity.js';
import { User } from '../users/user.entity.js';

export enum CalendarEventSource {
  CRAWLED = 'crawled',
  SYSTEM = 'system',
  MANUAL = 'manual',
}

// 알림은 별도 채널 없이 이 엔티티를 통해 프로젝트 일정표에 노출된다.
@Entity('calendar_events')
export class CalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({ type: 'enum', enum: CalendarEventSource })
  source: CalendarEventSource;

  @Column()
  title: string;

  @Column({ type: 'timestamptz' })
  date: Date;

  // 기간이 있는 일정(예: 프로젝트 진행 기간)일 때만 채워짐. 없으면 하루짜리 일정.
  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate: Date | null;

  // 지정하지 않으면 프론트에서 refType(마감/회의/발표/기타) 기준 기본 색을 쓴다.
  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @Column({ name: 'ref_type', type: 'varchar', nullable: true })
  refType: string | null;

  @Column({ name: 'ref_id', type: 'varchar', nullable: true })
  refId: string | null;

  // crawled/system 출처는 만든 사람이 없어서 null. "일정 참여자별 필터"(Schedule.tsx)에 씀.
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;
}
