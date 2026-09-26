import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity.js';
import { User } from '../users/user.entity.js';
import { CalendarEvent } from '../calendar/calendar-event.entity.js';

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
}

export enum TaskPriority {
  HIGH = 'high',
  MID = 'mid',
  LOW = 'low',
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column()
  title: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MID })
  priority: TaskPriority;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO })
  status: TaskStatus;

  // talju_hajima-main의 과제-일정 연동 UI용 — frontend(제품개발/frontend)는 쓰지 않는다.
  // "개인 일정" 링크도 실제로는 팀 전체 공개 일정에 걸린다(개인 일정 개념 자체가 백엔드에 없음,
  // talju_hajima_이식기록.txt 설계 결정 7번 참고).
  // onDelete: 'SET NULL' — 이 일정을 "전체 일정" 화면에서 직접 삭제해도 과제 쪽 FK 제약으로
  // 막히지 않고, 연결만 조용히 풀리게 함(과제 자체는 안 지워짐).
  @ManyToOne(() => CalendarEvent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_schedule_event_id' })
  teamScheduleEvent: CalendarEvent | null;

  @Column({ name: 'team_schedule_event_id', type: 'uuid', nullable: true })
  teamScheduleEventId: string | null;

  @ManyToOne(() => CalendarEvent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'personal_schedule_event_id' })
  personalScheduleEvent: CalendarEvent | null;

  @Column({ name: 'personal_schedule_event_id', type: 'uuid', nullable: true })
  personalScheduleEventId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
